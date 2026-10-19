import csv

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import CashSession
from .permissions import IsAdminRole, IsPosUser
from .serializers import (
    CashSessionSerializer,
    CloseCashSessionSerializer,
    OpenCashSessionSerializer,
)
from .services import (
    CashSessionError,
    close_cash_session,
    get_pending_session,
    get_today_session,
    open_cash_session,
    summarize_sales,
)


class CashBoxViewSet(viewsets.GenericViewSet):
    """Apertura, consulta y cierre de la jornada de caja."""

    queryset = CashSession.objects.select_related('opened_by', 'closed_by')
    serializer_class = CashSessionSerializer
    ADMIN_ACTIONS = ('closings', 'export_closings')

    def get_permissions(self):
        if self.action in self.ADMIN_ACTIONS:
            return [IsAdminRole()]
        return [IsPosUser()]

    def get_serializer_class(self):
        # El formulario de la API navegable muestra los campos que se envían.
        if self.action == 'open':
            return OpenCashSessionSerializer
        if self.action == 'close':
            return CloseCashSessionSerializer
        return CashSessionSerializer

    @action(detail=False, methods=['get'], url_path='actual', name='Caja actual')
    def current(self, request):
        """Estado de la jornada de hoy: sin_abrir, abierta o cerrada."""
        session = get_today_session()
        pending = get_pending_session()
        data = {
            'status': session.status if session else 'sin_abrir',
            'session': CashSessionSerializer(session).data if session else None,
            'sales_today': None,
            'pending_session': CashSessionSerializer(pending).data if pending else None,
        }
        if session:
            summary = summarize_sales(session)
            data['sales_today'] = {
                'count': summary['count'],
                'total': str(summary['total']),
            }
        return Response(data)

    @action(detail=False, methods=['post'], url_path='abrir', name='Abrir caja')
    def open(self, request):
        serializer = OpenCashSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = open_cash_session(serializer.validated_data['opening_amount'], request.user)
        except CashSessionError as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
        return Response(CashSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='cerrar', name='Cerrar caja')
    def close(self, request):
        serializer = CloseCashSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = close_cash_session(request.user, **serializer.validated_data)
        except CashSessionError as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
        return Response(CashSessionSerializer(session).data)

    @action(detail=False, methods=['get'], url_path='cierres', name='Cierres de caja')
    def closings(self, request):
        sessions = self.get_queryset().filter(status=CashSession.Status.CLOSED)
        return Response(CashSessionSerializer(sessions, many=True).data)

    @action(detail=False, methods=['get'], url_path='cierres/exportar', name='Exportar cierres')
    def export_closings(self, request):
        sessions = self.get_queryset().filter(status=CashSession.Status.CLOSED)
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="cierres_de_caja.csv"'
        response.write('﻿')  # BOM para que Excel respete los acentos.
        writer = csv.writer(response)
        writer.writerow([
            'Fecha', 'Fondo inicial', 'Ventas', 'Total ventas',
            'Gastos menores', 'Efectivo esperado', 'Efectivo contado', 'Diferencia',
            'Fondo retenido', 'Abrió', 'Cerró', 'Hora de cierre',
        ])
        for session in sessions:
            writer.writerow([
                session.business_date.isoformat(),
                session.opening_amount,
                session.sales_count,
                session.sales_total,
                session.minor_expenses,
                session.expected_cash,
                session.counted_cash,
                session.difference,
                session.retained_fund,
                session.opened_by.username,
                session.closed_by.username if session.closed_by else '',
                (
                    timezone.localtime(session.closed_at).strftime('%Y-%m-%d %H:%M')
                    if session.closed_at else ''
                ),
            ])
        return response
