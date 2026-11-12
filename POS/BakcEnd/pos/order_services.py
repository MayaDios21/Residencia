"""
Lógica de las comandas por mesa, separada de las vistas.

El mesero abre la comanda de una mesa y le agrega o quita productos; el cajero
la cobra o la cancela. Mientras está abierta no es venta: precio, IVA y stock se
toman al cobrarla con ``create_sale()``, en la jornada donde se abrió. Cada
cambio de productos queda en la bitácora (``OrderEvent``) con quién lo hizo.

Todas las escrituras son atómicas y bloquean la fila de la comanda, para que dos
dispositivos no la modifiquen ni la cobren al mismo tiempo.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import CashSession, Order, OrderEvent, OrderItem, Product, SystemSettings, UserProfile
from .services import (
    CashSessionError,
    InsufficientStockError,
    _merge_quantities,
    create_sale,
    to_money,
)


class OrderConflictError(Exception):
    """Regla del negocio que impide la operación (mesa ocupada, comanda cerrada…). La API responde 409."""


class OrderValidationError(Exception):
    """Datos inválidos (mesa que no existe, producto desactivado…). La API responde 400."""


class OrderPermissionError(Exception):
    """El rol no puede hacer esta operación sobre esta comanda. La API responde 403."""


def _lock_open_order(order_id):
    """Bloquea la comanda y verifica que siga abierta.

    Lanza ``Order.DoesNotExist`` si no existe (la vista ya respondió 404 antes).
    """
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status != Order.Status.OPEN:
        raise OrderConflictError(
            f'La comanda de la mesa {order.table_number} ya fue '
            f'{order.get_status_display().lower()}.'
        )
    return order


def _load_products(quantities):
    """Trae los productos pedidos y rechaza los que no existen o están desactivados."""
    if not quantities:
        raise OrderValidationError('La comanda necesita al menos un producto.')
    products = Product.objects.in_bulk(quantities.keys())
    missing = [product_id for product_id in quantities if product_id not in products]
    if missing:
        raise OrderValidationError(f'Productos no encontrados: {missing}.')
    inactive = [products[pid].name for pid in quantities if not products[pid].is_active]
    if inactive:
        raise OrderValidationError(f'Productos no disponibles: {", ".join(inactive)}.')
    return products


def _add_items(order, quantities, products, user):
    """Suma los productos a la comanda y deja un evento por cada uno.

    Si un producto lleva existencias y la cantidad total en la comanda las
    supera, avisa antes de guardar nada. No aparta stock: se descuenta al cobrar.
    """
    current = {item.product_id: item for item in order.items.all()}
    for product_id, quantity in quantities.items():
        product = products[product_id]
        item = current.get(product_id)
        total = quantity + (item.quantity if item else 0)
        if product.stock is not None and total > product.stock:
            raise InsufficientStockError(product, product.stock, total)

    for product_id, quantity in quantities.items():
        product = products[product_id]
        item = current.get(product_id)
        if item:
            item.quantity += quantity
            item.save(update_fields=['quantity'])
        else:
            OrderItem.objects.create(order=order, product=product, quantity=quantity)
        OrderEvent.objects.create(
            order=order,
            user=user,
            action=OrderEvent.Action.ADD,
            product=product,
            product_name=product.name,
            quantity=quantity,
        )


@transaction.atomic
def open_order(table_number, items, user):
    """Abre la comanda de una mesa libre con sus primeros productos.

    Exige la caja de hoy abierta; la comanda queda ligada a esa jornada.
    """
    table_count = SystemSettings.load().table_count
    if not 1 <= table_number <= table_count:
        raise OrderValidationError(
            f'La mesa {table_number} no existe; hay mesas de la 1 a la {table_count}.'
        )

    session = (
        CashSession.objects
        .select_for_update()
        .filter(business_date=timezone.localdate())
        .first()
    )
    if session is None:
        raise CashSessionError('La caja de hoy no está abierta. Pide al cajero que la abra.')
    if session.status != CashSession.Status.OPEN:
        raise CashSessionError('La jornada de hoy ya fue cerrada. No se pueden abrir comandas.')

    quantities = _merge_quantities(items)
    products = _load_products(quantities)

    occupied_message = f'La mesa {table_number} ya tiene una comanda abierta.'
    if Order.objects.filter(table_number=table_number, status=Order.Status.OPEN).exists():
        raise OrderConflictError(occupied_message)
    try:
        # Si otro mesero la abrió en el mismo instante, la restricción única lo detecta.
        with transaction.atomic():
            order = Order.objects.create(
                table_number=table_number,
                opened_by=user,
                cash_session=session,
            )
    except IntegrityError:
        raise OrderConflictError(occupied_message)

    _add_items(order, quantities, products, user)
    return order


@transaction.atomic
def add_order_items(order_id, items, user):
    """Agrega productos a una comanda abierta; si ya estaban, suma la cantidad."""
    order = _lock_open_order(order_id)
    quantities = _merge_quantities(items)
    products = _load_products(quantities)
    _add_items(order, quantities, products, user)
    return order


@transaction.atomic
def remove_order_item(order_id, product_id, quantity, user):
    """Resta cantidad a un producto de la comanda; en cero quita el renglón."""
    order = _lock_open_order(order_id)
    item = order.items.select_related('product').filter(product_id=product_id).first()
    if item is None:
        raise OrderValidationError('Ese producto no está en la comanda.')
    if quantity < 1 or quantity > item.quantity:
        raise OrderValidationError(
            f'Solo puedes quitar de 1 a {item.quantity} de {item.product.name}.'
        )

    if quantity == item.quantity:
        item.delete()
    else:
        item.quantity -= quantity
        item.save(update_fields=['quantity'])
    OrderEvent.objects.create(
        order=order,
        user=user,
        action=OrderEvent.Action.REMOVE,
        product=item.product,
        product_name=item.product.name,
        quantity=quantity,
    )
    return order


@transaction.atomic
def charge_order(order_id, user):
    """Cobra la comanda: registra la venta en su jornada y libera la mesa.

    Si la venta falla (sin stock, producto desactivado) no se guarda nada y la
    comanda sigue abierta.
    """
    order = _lock_open_order(order_id)
    items = [
        {'product_id': item.product_id, 'quantity': item.quantity}
        for item in order.items.all()
    ]
    if not items:
        raise OrderConflictError('La comanda no tiene productos para cobrar.')

    sale = create_sale(items, user, session=order.cash_session)

    order.status = Order.Status.CHARGED
    order.sale = sale
    order.closed_at = timezone.now()
    order.save(update_fields=['status', 'sale', 'closed_at'])
    return sale


@transaction.atomic
def cancel_order(order_id, user, reason=''):
    """Cancela la comanda y libera la mesa sin registrar venta.

    Con productos, solo caja la cancela y con motivo. Vacía (por ejemplo, se
    abrió la mesa equivocada), también la libera el mesero y sin motivo.
    """
    order = _lock_open_order(order_id)
    reason = (reason or '').strip()
    if order.items.exists():
        role = getattr(getattr(user, 'profile', None), 'role', None)
        if role == UserProfile.Role.WAITER:
            raise OrderPermissionError(
                'Solo caja puede cancelar una comanda con productos. Quítalos primero o pide al cajero.'
            )
        if not reason:
            raise OrderValidationError('Escribe el motivo de la cancelación.')

    order.status = Order.Status.CANCELLED
    order.cancelled_by = user
    order.cancel_reason = reason
    order.closed_at = timezone.now()
    order.save(update_fields=['status', 'cancelled_by', 'cancel_reason', 'closed_at'])
    return order


def summarize_order(order):
    """Subtotal, IVA y total de la comanda con los precios y el IVA vigentes.

    Redondea igual que ``create_sale()``, así lo que ve el cajero es lo que se cobra.
    """
    subtotal = to_money(sum(
        (to_money(item.product.price * item.quantity) for item in order.items.all()),
        to_money(0),
    ))
    tax = to_money(subtotal * SystemSettings.load().tax_rate)
    return {'subtotal': subtotal, 'tax': tax, 'total': subtotal + tax}


def get_tables_overview():
    """Estado de cada mesa (1..numero_mesas) para la cuadrícula del mesero y del cajero.

    Las ocupadas traen su comanda resumida: id, piezas, subtotal estimado, quién
    la abrió y cuándo.
    """
    table_count = SystemSettings.load().table_count
    open_orders = {
        order.table_number: order
        for order in (
            Order.objects
            .filter(status=Order.Status.OPEN)
            .select_related('opened_by')
            .prefetch_related('items__product')
        )
    }
    tables = []
    for table_number in range(1, table_count + 1):
        order = open_orders.get(table_number)
        summary = None
        if order:
            summary = {
                'id': order.id,
                'items_count': sum(item.quantity for item in order.items.all()),
                'subtotal': summarize_order(order)['subtotal'],
                'opened_by': order.opened_by.username,
                'opened_at': order.opened_at,
            }
        tables.append({'mesa': table_number, 'comanda': summary})
    return {'numero_mesas': table_count, 'mesas': tables}
