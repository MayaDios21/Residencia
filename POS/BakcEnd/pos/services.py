from django.db import transaction

from .models import InventoryMovement, Product


class InsufficientStockError(Exception):
    def __init__(self, product, available, requested):
        self.product = product
        self.available = available
        self.requested = requested
        super().__init__(
            f'No hay existencias suficientes de {product.name} '
            f'(disponible: {available}, solicitado: {requested}).'
        )


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
def apply_stock_movement(product_id, movement_type, quantity, user, reason=''):
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
    )
