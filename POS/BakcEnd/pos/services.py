from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from .models import (
    CashSession,
    InventoryMovement,
    Product,
    Sale,
    SaleItem,
    SystemSettings,
)

CENTS = Decimal('0.01')


def to_money(value):
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_UP)


class InsufficientStockError(Exception):
    def __init__(self, product, available, requested):
        self.product = product
        self.available = available
        self.requested = requested
        super().__init__(
            f'No hay existencias suficientes de {product.name} '
            f'(disponible: {available}, solicitado: {requested}).'
        )


class CashSessionError(Exception):
    """Operación de caja o venta que no es válida en el estado actual de la jornada."""


class SaleValidationError(Exception):
    """Datos de la venta inválidos (producto inexistente o inactivo)."""


# ---------------------------------------------------------------------------
# Inventario
# ---------------------------------------------------------------------------

def calculate_new_stock(movement_type, current_stock, quantity):
    """Devuelve el stock resultante de aplicar un movimiento.

    Un producto sin stock registrado (None) se trata como 0 para entradas y
    ajustes; un ajuste fija el stock al valor indicado.
    """
    current = current_stock or 0
    if movement_type == InventoryMovement.Type.ENTRY:
        return current + quantity
    if movement_type == InventoryMovement.Type.ADJUSTMENT:
        return quantity
    return current - quantity


@transaction.atomic
def apply_stock_movement(product_id, movement_type, quantity, user, reason='', sale=None):
    """Registra un movimiento y actualiza el stock del producto de forma atómica.

    Bloquea la fila del producto para evitar que dos movimientos simultáneos
    calculen el stock a partir del mismo valor. Lanza InsufficientStockError si
    el resultado quedaría negativo.
    """
    product = Product.objects.select_for_update().get(pk=product_id)
    stock_before = product.stock or 0
    stock_after = calculate_new_stock(movement_type, product.stock, quantity)

    if stock_after < 0:
        raise InsufficientStockError(product, stock_before, quantity)

    product.stock = stock_after
    product.save(update_fields=['stock'])

    return InventoryMovement.objects.create(
        product=product,
        type=movement_type,
        quantity=quantity,
        reason=reason,
        stock_before=stock_before,
        stock_after=stock_after,
        user=user,
        sale=sale,
    )


# ---------------------------------------------------------------------------
# Caja
# ---------------------------------------------------------------------------

def get_today_session():
    return CashSession.objects.filter(business_date=timezone.localdate()).first()


def get_pending_session():
    """Jornada de un día anterior que se quedó abierta sin cierre."""
    return (
        CashSession.objects
        .filter(status=CashSession.Status.OPEN, business_date__lt=timezone.localdate())
        .order_by('business_date')
        .first()
    )


def summarize_sales(session):
    """Totales de las ventas no canceladas de una jornada."""
    totals = session.sales.exclude(status=Sale.Status.CANCELLED).aggregate(
        sales_count=Count('id'),
        sales_sum=Sum('total'),
    )
    return {
        'count': totals['sales_count'],
        'total': to_money(totals['sales_sum'] or 0),
    }


@transaction.atomic
def open_cash_session(opening_amount, user):
    pending = get_pending_session()
    if pending:
        raise CashSessionError(
            f'La caja del {pending.business_date:%d/%m/%Y} sigue abierta. '
            'Ciérrala antes de abrir una nueva jornada.'
        )

    today = timezone.localdate()
    existing = CashSession.objects.select_for_update().filter(business_date=today).first()
    if existing:
        if existing.status == CashSession.Status.CLOSED:
            raise CashSessionError(
                'La jornada de hoy ya fue cerrada. No se puede abrir una nueva caja.'
            )
        raise CashSessionError('La caja de hoy ya está abierta.')

    return CashSession.objects.create(
        business_date=today,
        opening_amount=to_money(opening_amount),
        opened_by=user,
    )


@transaction.atomic
def close_cash_session(user, counted_cash=None, minor_expenses=0, retained_fund=None):
    """Cierra la jornada abierta (la de hoy o una pendiente de un día anterior).

    El efectivo esperado es fondo inicial + ventas del día − gastos menores.
    Si no se indica el efectivo contado, se asume igual al esperado (diferencia 0),
    que es lo que hace hoy el frontend.
    """
    session = (
        CashSession.objects
        .select_for_update()
        .filter(status=CashSession.Status.OPEN)
        .order_by('business_date')
        .first()
    )
    if session is None:
        raise CashSessionError('No hay una caja abierta para cerrar.')

    summary = summarize_sales(session)
    minor_expenses = to_money(minor_expenses or 0)
    expected_cash = session.opening_amount + summary['total'] - minor_expenses
    counted_cash = expected_cash if counted_cash is None else to_money(counted_cash)

    session.status = CashSession.Status.CLOSED
    session.sales_count = summary['count']
    session.sales_total = summary['total']
    session.minor_expenses = minor_expenses
    session.expected_cash = expected_cash
    session.counted_cash = counted_cash
    session.difference = counted_cash - expected_cash
    session.retained_fund = (
        session.opening_amount if retained_fund is None else to_money(retained_fund)
    )
    session.closed_by = user
    session.closed_at = timezone.now()
    session.save()

    # El cierre de caja también cierra todas las ventas de esa jornada.
    session.sales.filter(status=Sale.Status.OPEN).update(status=Sale.Status.CLOSED)
    return session


# ---------------------------------------------------------------------------
# Ventas
# ---------------------------------------------------------------------------

def _merge_quantities(items):
    """Agrupa líneas repetidas del mismo producto conservando el orden."""
    merged = {}
    for item in items:
        merged[item['product_id']] = merged.get(item['product_id'], 0) + item['quantity']
    return merged


@transaction.atomic
def create_sale(items, user, payment_method=Sale.PaymentMethod.CASH):
    """Registra una venta calculando precios, IVA y total en el servidor.

    Exige la caja de hoy abierta, descuenta el stock de los productos que lo
    controlan y deshace todo si algún producto no tiene existencias suficientes.
    """
    session = (
        CashSession.objects
        .select_for_update()
        .filter(business_date=timezone.localdate())
        .first()
    )
    if session is None:
        raise CashSessionError('La caja no está abierta. Registra el fondo inicial para vender.')
    if session.status == CashSession.Status.CLOSED:
        raise CashSessionError('La jornada de hoy ya fue cerrada. No se pueden registrar ventas.')

    quantities = _merge_quantities(items)
    products = Product.objects.in_bulk(quantities.keys())
    missing = [product_id for product_id in quantities if product_id not in products]
    if missing:
        raise SaleValidationError(f'Productos no encontrados: {missing}.')
    inactive = [products[pid].name for pid in quantities if not products[pid].is_active]
    if inactive:
        raise SaleValidationError(f'Productos no disponibles para venta: {", ".join(inactive)}.')

    settings = SystemSettings.load()
    lines = []
    for product_id, quantity in quantities.items():
        product = products[product_id]
        lines.append((product, quantity, to_money(product.price * quantity)))

    subtotal = to_money(sum((line_total for _, _, line_total in lines), Decimal('0')))
    tax = to_money(subtotal * settings.tax_rate)

    sale = Sale.objects.create(
        cash_session=session,
        cashier=user,
        payment_method=payment_method,
        tax_rate=settings.tax_rate,
        exchange_rate=settings.exchange_rate,
        subtotal=subtotal,
        tax=tax,
        total=subtotal + tax,
    )

    # Partidas recién creadas con su stock restante, para la respuesta de la API.
    sale.created_items = []
    for product, quantity, line_total in lines:
        item = SaleItem.objects.create(
            sale=sale,
            product=product,
            product_name=product.name,
            unit_price=product.price,
            quantity=quantity,
            line_total=line_total,
        )
        item.stock_remaining = None
        # Solo se descuentan los productos que controlan existencias.
        if product.stock is not None:
            movement = apply_stock_movement(
                product.pk,
                InventoryMovement.Type.SALE,
                quantity,
                user,
                reason=f'Venta #{sale.pk}',
                sale=sale,
            )
            item.stock_remaining = movement.stock_after
        sale.created_items.append(item)

    return sale
