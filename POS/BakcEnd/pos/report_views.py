"""
API de reportes (/api/reportes/), solo para el administrador. Alimenta el panel.

- resumen/: total vendido, transacciones, ticket promedio, artículos e IVA.
- ventas-por-dia/: total y transacciones de cada día (días sin ventas en 0).
- productos-top/: productos más vendidos por unidades.
- por-categoria/: ventas agrupadas por categoría.

Todos aceptan ?desde=AAAA-MM-DD y ?hasta=AAAA-MM-DD (fecha de la jornada de caja)
y no cuentan las ventas canceladas.
"""

from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .inventory_views import parse_positive_int
from .models import Sale, SaleItem
from .permissions import IsAdminRole
from .sales_views import parse_date_param
from .services import to_money

# Límite de días para la gráfica por día, para no generar respuestas enormes.
MAX_CHART_DAYS = 366
NO_CATEGORY = 'Sin categoría'


class ReportViewSet(viewsets.GenericViewSet):
    permission_classes = (IsAdminRole,)
    name = 'Reportes'

    def get_date_range(self):
        params = self.request.query_params
        since = parse_date_param(params, 'desde')
        until = parse_date_param(params, 'hasta')
        if since and until and since > until:
            raise ValidationError({'desde': 'La fecha inicial no puede ser posterior a la final.'})
        return since, until

    def get_sales(self):
        """Ventas no canceladas dentro del rango pedido."""
        since, until = self.get_date_range()
        sales = Sale.objects.exclude(status=Sale.Status.CANCELLED)
        if since:
            sales = sales.filter(cash_session__business_date__gte=since)
        if until:
            sales = sales.filter(cash_session__business_date__lte=until)
        return sales

    def get_items(self):
        return SaleItem.objects.filter(sale__in=self.get_sales().values('pk'))

    @action(detail=False, methods=['get'], url_path='resumen', name='Resumen')
    def summary(self, request):
        since, until = self.get_date_range()
        totals = self.get_sales().aggregate(
            transactions=Count('pk'),
            sales_sum=Sum('total'),
            tax_sum=Sum('tax'),
        )
        units = self.get_items().aggregate(units=Sum('quantity'))['units'] or 0
        transactions = totals['transactions']
        total = to_money(totals['sales_sum'] or 0)
        return Response({
            'desde': since.isoformat() if since else None,
            'hasta': until.isoformat() if until else None,
            'total_sales': str(total),
            'tax_total': str(to_money(totals['tax_sum'] or 0)),
            'transactions': transactions,
            'items': units,
            'average_sale': str(to_money(total / transactions) if transactions else to_money(0)),
        })

    @action(detail=False, methods=['get'], url_path='ventas-por-dia', name='Ventas por día')
    def sales_by_day(self, request):
        since, until = self.get_date_range()
        # Sin rango se muestran los últimos 7 días, como el panel por defecto.
        until = until or timezone.localdate()
        since = since or until - timedelta(days=6)
        if (until - since).days + 1 > MAX_CHART_DAYS:
            raise ValidationError({'desde': f'El rango no puede pasar de {MAX_CHART_DAYS} días.'})

        rows = (
            Sale.objects
            .exclude(status=Sale.Status.CANCELLED)
            .filter(cash_session__business_date__range=(since, until))
            .values('cash_session__business_date')
            .annotate(total=Sum('total'), transactions=Count('pk'))
        )
        by_day = {row['cash_session__business_date']: row for row in rows}
        days = []
        for offset in range((until - since).days + 1):
            day = since + timedelta(days=offset)
            row = by_day.get(day)
            days.append({
                'date': day.isoformat(),
                'total': str(to_money(row['total'])) if row else '0.00',
                'transactions': row['transactions'] if row else 0,
            })
        return Response({'desde': since.isoformat(), 'hasta': until.isoformat(), 'days': days})

    @action(detail=False, methods=['get'], url_path='productos-top', name='Productos más vendidos')
    def top_products(self, request):
        limit = parse_positive_int(request.query_params, 'limite', 10, 1, 100)
        rows = (
            self.get_items()
            .values('product_name')
            .annotate(units=Sum('quantity'), total=Sum('line_total'))
            .order_by('-units', '-total', 'product_name')[:limit]
        )
        return Response([
            {'product_name': row['product_name'], 'units': row['units'], 'total': str(to_money(row['total']))}
            for row in rows
        ])

    @action(detail=False, methods=['get'], url_path='por-categoria', name='Ventas por categoría')
    def by_category(self, request):
        rows = (
            self.get_items()
            .values('product__category__name')
            .annotate(units=Sum('quantity'), total=Sum('line_total'))
        )
        # Productos borrados o sin categoría se juntan en "Sin categoría".
        grouped = {}
        for row in rows:
            name = row['product__category__name'] or NO_CATEGORY
            entry = grouped.setdefault(name, {'units': 0, 'total': 0})
            entry['units'] += row['units']
            entry['total'] += row['total']
        result = [
            {'category': name, 'units': data['units'], 'total': str(to_money(data['total']))}
            for name, data in grouped.items()
        ]
        result.sort(key=lambda row: (-float(row['total']), row['category']))
        return Response(result)
