import csv
from datetime import date

from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Sale, SaleItem, UserProfile
from .permissions import IsAdminRole, IsPosUser
from .serializers import CancelSaleSerializer, SaleCreateSerializer, SaleSerializer
from .services import (
    CashSessionError,
    InsufficientStockError,
    SaleValidationError,
    cancel_sale,
    create_sale,
    to_money,
    verify_sales,
)


def parse_date_param(params, name):
    value = params.get(name)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise ValidationError({name: 'Usa el formato AAAA-MM-DD.'}) from error


class SaleViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Registro e historial de ventas.

    Filtros: ?desde=AAAA-MM-DD, ?hasta=AAAA-MM-DD, ?q=<id o producto>,
    ?estado=abierta|cerrada|cancelada. El cajero solo ve la jornada de hoy.
    """

    permission_classes = (IsPosUser,)
    serializer_class = SaleSerializer
    name = 'Ventas'
    ADMIN_ACTIONS = ('verify', 'cancel')

    def get_permissions(self):
        if self.action in self.ADMIN_ACTIONS:
            return [IsAdminRole()]
        return [IsPosUser()]

    def get_serializer_class(self):
        # El formulario de la API navegable muestra los campos que se envían.
        if self.action == 'create':
            return SaleCreateSerializer
        if self.action == 'cancel':
            return CancelSaleSerializer
        return SaleSerializer

    def get_queryset(self):
        queryset = (
            Sale.objects
            .select_related('cash_session', 'cashier', 'cancelled_by')
            .prefetch_related('items')
        )
        if self.request.user.profile.role != UserProfile.Role.ADMIN:
            queryset = queryset.filter(cash_session__business_date=timezone.localdate())
        return queryset

    def filter_queryset(self, queryset):
        params = self.request.query_params
        since = parse_date_param(params, 'desde')
        until = parse_date_param(params, 'hasta')
        if since:
            queryset = queryset.filter(cash_session__business_date__gte=since)
        if until:
            queryset = queryset.filter(cash_session__business_date__lte=until)

        status_filter = params.get('estado')
        if status_filter:
            if status_filter not in Sale.Status.values:
                raise ValidationError({'estado': f'Usa uno de: {", ".join(Sale.Status.values)}.'})
            queryset = queryset.filter(status=status_filter)

        search = params.get('q', '').strip().lstrip('#')
        if search:
            condition = Q(items__product_name__icontains=search)
            if search.isdigit():
                condition |= Q(pk=int(search))
            queryset = queryset.filter(condition).distinct()
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = SaleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            sale = create_sale(
                serializer.validated_data['items'],
                request.user,
                payment_method=serializer.validated_data['payment'],
            )
        except CashSessionError as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
        except InsufficientStockError as error:
            return Response(
                {
                    'detail': str(error),
                    'product_id': error.product.pk,
                    'available': error.available,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except SaleValidationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='resumen', name='Resumen de ventas')
    def summary(self, request):
        """Totales para las tarjetas del historial; no cuenta ventas canceladas."""
        sale_ids = (
            self.filter_queryset(self.get_queryset())
            .exclude(status=Sale.Status.CANCELLED)
            .values('pk')
        )
        totals = Sale.objects.filter(pk__in=sale_ids).aggregate(
            transactions=Count('pk'),
            sales_sum=Sum('total'),
        )
        items = SaleItem.objects.filter(sale__in=sale_ids).aggregate(units=Sum('quantity'))
        transactions = totals['transactions']
        total = to_money(totals['sales_sum'] or 0)
        return Response({
            'total_sales': str(total),
            'transactions': transactions,
            'items': items['units'] or 0,
            'average_sale': str(to_money(total / transactions) if transactions else to_money(0)),
        })

    @action(detail=False, methods=['get'], url_path='exportar', name='Exportar ventas')
    def export(self, request):
        sales = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="ventas.csv"'
        response.write('﻿')  # BOM para que Excel respete los acentos.
        writer = csv.writer(response)
        writer.writerow([
            'Venta', 'Fecha', 'Hora', 'Jornada', 'Cajero', 'Estado', 'Productos',
            'Artículos', 'Subtotal', 'IVA', 'Total', 'Pago',
        ])
        for sale in sales:
            created = timezone.localtime(sale.created_at)
            items = list(sale.items.all())
            writer.writerow([
                sale.pk,
                created.strftime('%Y-%m-%d'),
                created.strftime('%H:%M'),
                sale.cash_session.business_date.isoformat(),
                sale.cashier.username,
                sale.get_status_display(),
                ', '.join(f'{item.quantity}x {item.product_name}' for item in items),
                sum(item.quantity for item in items),
                sale.subtotal,
                sale.tax,
                sale.total,
                sale.payment_method,
            ])
        return response

    @action(detail=False, methods=['get'], url_path='verificar', name='Verificar ventas')
    def verify(self, request):
        return Response(verify_sales(self.filter_queryset(self.get_queryset())))

    @action(detail=True, methods=['post'], url_path='cancelar', name='Cancelar venta')
    def cancel(self, request, pk=None):
        sale = self.get_object()
        serializer = CancelSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            sale = cancel_sale(sale.pk, request.user, serializer.validated_data['reason'])
        except CashSessionError as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
        return Response(SaleSerializer(self.get_queryset().get(pk=sale.pk)).data)
