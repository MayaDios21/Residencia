"""
Pruebas de la lógica de comandas: abrir, agregar, quitar, cobrar y cancelar,
con sus reglas (caja abierta, mesa libre, stock, quién puede cancelar) y el
cobro de una comanda que quedó abierta de un día para otro.
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from ..models import CashSession, Order, OrderEvent, OrderItem, Product, Sale, SystemSettings
from ..order_services import (
    OrderConflictError,
    OrderPermissionError,
    OrderValidationError,
    add_order_items,
    cancel_order,
    charge_order,
    get_tables_overview,
    open_order,
    remove_order_item,
    summarize_order,
)
from ..services import (
    CashSessionError,
    InsufficientStockError,
    SaleValidationError,
    close_cash_session,
    open_cash_session,
)
from .helpers import create_admin, create_cashier, create_waiter


class OrderServiceTests(TestCase):
    def setUp(self):
        """Caja de hoy abierta, usuarios de cada rol y tres productos."""
        self.admin = create_admin()
        self.cashier = create_cashier()
        self.waiter = create_waiter()
        self.other_waiter = create_waiter('waiter2')
        self.session = CashSession.objects.create(
            business_date=timezone.localdate(),
            opening_amount='500.00',
            opened_by=self.cashier,
        )
        self.taco = Product.objects.create(name='Taco de Birria', price='25.00')
        self.coke = Product.objects.create(
            name='Coca Cola', price='20.00', stock=5, track_inventory=True,
        )
        self.consome = Product.objects.create(name='Consomé', price='30.00')

    def items(self, *pairs):
        """Arma la lista de partidas [(producto, cantidad), ...] como la recibe la API."""
        return [{'product_id': product.id, 'quantity': quantity} for product, quantity in pairs]

    def quantities(self, order):
        """Cantidades actuales de la comanda por nombre de producto."""
        return {item.product.name: item.quantity for item in order.items.all()}

    # --- Abrir ---------------------------------------------------------------

    def test_open_links_today_session_and_opened_by(self):
        """La comanda queda ligada a la jornada de hoy y a quien la abrió."""
        order = open_order(3, self.items((self.taco, 2)), self.waiter)

        self.assertEqual(order.status, Order.Status.OPEN)
        self.assertEqual(order.table_number, 3)
        self.assertEqual(order.cash_session, self.session)
        self.assertEqual(order.opened_by, self.waiter)
        self.assertEqual(self.quantities(order), {'Taco de Birria': 2})

    def test_open_requires_today_cash_session(self):
        """Sin caja de hoy no se abren comandas, aunque haya una de ayer abierta."""
        self.session.business_date = timezone.localdate() - timedelta(days=1)
        self.session.save()

        with self.assertRaises(CashSessionError):
            open_order(3, self.items((self.taco, 1)), self.waiter)

        self.session.delete()
        with self.assertRaises(CashSessionError):
            open_order(3, self.items((self.taco, 1)), self.waiter)

    def test_open_rejects_closed_cash_session(self):
        """Con la jornada de hoy ya cerrada tampoco se abren comandas."""
        self.session.status = CashSession.Status.CLOSED
        self.session.save()

        with self.assertRaises(CashSessionError):
            open_order(3, self.items((self.taco, 1)), self.waiter)

    def test_open_rejects_table_out_of_range(self):
        """Solo existen las mesas 1 a numero_mesas (10 por defecto)."""
        for table in (0, 11):
            with self.assertRaises(OrderValidationError):
                open_order(table, self.items((self.taco, 1)), self.waiter)
        self.assertFalse(Order.objects.exists())

    def test_open_on_occupied_table_conflicts(self):
        """Una mesa ocupada no se puede volver a abrir."""
        open_order(3, self.items((self.taco, 1)), self.waiter)

        with self.assertRaises(OrderConflictError):
            open_order(3, self.items((self.consome, 1)), self.other_waiter)
        self.assertEqual(Order.objects.count(), 1)

    def test_waiter_can_have_several_tables(self):
        """Un mesero puede tener varias mesas abiertas a la vez."""
        open_order(2, self.items((self.taco, 1)), self.waiter)
        open_order(5, self.items((self.taco, 1)), self.waiter)

        self.assertEqual(Order.objects.filter(status=Order.Status.OPEN).count(), 2)

    # --- Agregar y quitar ----------------------------------------------------

    def test_add_merges_quantities_and_logs_event(self):
        """Volver a pedir un producto suma la cantidad y queda en la bitácora."""
        order = open_order(3, self.items((self.taco, 2)), self.waiter)

        add_order_items(order.id, self.items((self.taco, 1), (self.consome, 1)), self.waiter)

        self.assertEqual(self.quantities(order), {'Taco de Birria': 3, 'Consomé': 1})
        adds = list(order.events.filter(action=OrderEvent.Action.ADD).values_list(
            'product_name', 'quantity', 'user__username',
        ))
        self.assertEqual(adds, [
            ('Taco de Birria', 2, 'waiter'),
            ('Taco de Birria', 1, 'waiter'),
            ('Consomé', 1, 'waiter'),
        ])

    def test_any_waiter_can_add_to_any_table(self):
        """Otro mesero agrega a la mesa y la bitácora lo nombra a él."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)

        add_order_items(order.id, self.items((self.consome, 1)), self.other_waiter)

        last = order.events.last()
        self.assertEqual(last.user, self.other_waiter)
        self.assertEqual(last.product_name, 'Consomé')

    def test_duplicate_lines_in_one_request_are_merged(self):
        """El mismo producto dos veces en un envío queda en un solo renglón."""
        order = open_order(3, self.items((self.taco, 1), (self.taco, 2)), self.waiter)

        self.assertEqual(OrderItem.objects.filter(order=order).count(), 1)
        self.assertEqual(self.quantities(order), {'Taco de Birria': 3})

    def test_add_rejects_inactive_and_missing_product(self):
        """No se piden productos desactivados ni inexistentes."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)
        self.consome.is_active = False
        self.consome.save()

        with self.assertRaisesMessage(OrderValidationError, 'Consomé'):
            add_order_items(order.id, self.items((self.consome, 1)), self.waiter)
        with self.assertRaisesMessage(OrderValidationError, '9999'):
            add_order_items(order.id, [{'product_id': 9999, 'quantity': 1}], self.waiter)
        self.assertEqual(self.quantities(order), {'Taco de Birria': 1})

    def test_add_over_stock_conflicts(self):
        """Pedir más de lo que hay en existencia avisa a tiempo; sin stock registrado no valida."""
        order = open_order(3, self.items((self.coke, 4)), self.waiter)

        with self.assertRaises(InsufficientStockError):
            add_order_items(order.id, self.items((self.coke, 2)), self.waiter)
        add_order_items(order.id, self.items((self.taco, 50)), self.waiter)

        self.assertEqual(self.quantities(order), {'Coca Cola': 4, 'Taco de Birria': 50})

    def test_remove_decrements_then_deletes(self):
        """Quitar resta la cantidad; en cero desaparece el renglón. Queda en la bitácora."""
        order = open_order(3, self.items((self.taco, 2), (self.consome, 1)), self.waiter)

        remove_order_item(order.id, self.taco.id, 1, self.cashier)
        remove_order_item(order.id, self.consome.id, 1, self.waiter)

        self.assertEqual(self.quantities(order), {'Taco de Birria': 1})
        removes = list(order.events.filter(action=OrderEvent.Action.REMOVE).values_list(
            'product_name', 'quantity', 'user__username',
        ))
        self.assertEqual(removes, [('Taco de Birria', 1, 'cashier'), ('Consomé', 1, 'waiter')])

    def test_remove_more_than_present_rejected(self):
        """No se quita más de lo pedido ni un producto que no está en la comanda."""
        order = open_order(3, self.items((self.taco, 2)), self.waiter)

        with self.assertRaises(OrderValidationError):
            remove_order_item(order.id, self.taco.id, 3, self.waiter)
        with self.assertRaises(OrderValidationError):
            remove_order_item(order.id, self.consome.id, 1, self.waiter)
        self.assertEqual(self.quantities(order), {'Taco de Birria': 2})

    def test_add_to_charged_order_conflicts(self):
        """Una comanda cobrada ya no acepta cambios, cobros ni cancelaciones."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)
        charge_order(order.id, self.cashier)

        with self.assertRaises(OrderConflictError):
            add_order_items(order.id, self.items((self.taco, 1)), self.waiter)
        with self.assertRaises(OrderConflictError):
            remove_order_item(order.id, self.taco.id, 1, self.waiter)
        with self.assertRaises(OrderConflictError):
            charge_order(order.id, self.cashier)
        with self.assertRaises(OrderConflictError):
            cancel_order(order.id, self.cashier, 'error')

    def test_stock_is_not_touched_until_charge(self):
        """Pedir no descuenta existencias; cobrar sí."""
        order = open_order(3, self.items((self.coke, 2)), self.waiter)
        add_order_items(order.id, self.items((self.coke, 1)), self.waiter)
        self.coke.refresh_from_db()
        self.assertEqual(self.coke.stock, 5)

        charge_order(order.id, self.cashier)

        self.coke.refresh_from_db()
        self.assertEqual(self.coke.stock, 2)

    # --- Cobrar --------------------------------------------------------------

    def test_charge_creates_sale_and_frees_table(self):
        """Cobrar registra la venta a nombre del cajero y deja la mesa libre."""
        order = open_order(3, self.items((self.taco, 2)), self.waiter)

        sale = charge_order(order.id, self.cashier)

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CHARGED)
        self.assertEqual(order.sale, sale)
        self.assertEqual(sale.cashier, self.cashier)
        self.assertEqual(sale.total, Decimal('54.00'))
        self.assertIsNotNone(order.closed_at)
        open_order(3, self.items((self.taco, 1)), self.waiter)

    def test_charge_without_stock_rolls_back(self):
        """Si al cobrar ya no alcanza el stock, no se guarda nada y la comanda sigue abierta."""
        order = open_order(3, self.items((self.coke, 2)), self.waiter)
        Product.objects.filter(pk=self.coke.pk).update(stock=1)

        with self.assertRaises(InsufficientStockError):
            charge_order(order.id, self.cashier)

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.OPEN)
        self.assertIsNone(order.sale)
        self.assertEqual(Sale.objects.count(), 0)

    def test_charge_with_inactive_product_rolls_back(self):
        """Un producto desactivado impide cobrar; al quitarlo, la comanda se cobra."""
        order = open_order(3, self.items((self.taco, 1), (self.consome, 1)), self.waiter)
        Product.objects.filter(pk=self.consome.pk).update(is_active=False)

        with self.assertRaisesMessage(SaleValidationError, 'Consomé'):
            charge_order(order.id, self.cashier)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.OPEN)

        remove_order_item(order.id, self.consome.id, 1, self.cashier)
        sale = charge_order(order.id, self.cashier)
        self.assertEqual(sale.total, Decimal('27.00'))

    def test_charge_empty_order_conflicts(self):
        """Una comanda sin productos no se cobra."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)
        remove_order_item(order.id, self.taco.id, 1, self.waiter)

        with self.assertRaises(OrderConflictError):
            charge_order(order.id, self.cashier)

    def test_charge_twice_conflicts(self):
        """La segunda vez que se intenta cobrar falla y solo existe una venta."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)
        charge_order(order.id, self.cashier)

        with self.assertRaises(OrderConflictError):
            charge_order(order.id, self.cashier)
        self.assertEqual(Sale.objects.count(), 1)

    def test_order_from_yesterday_charges_into_its_own_session(self):
        """Una mesa abierta antes de medianoche se cobra en su jornada y deja cerrar y abrir caja."""
        order = open_order(3, self.items((self.taco, 2)), self.waiter)
        self.session.business_date = timezone.localdate() - timedelta(days=1)
        self.session.save()

        sale = charge_order(order.id, self.cashier)

        self.assertEqual(sale.cash_session, self.session)
        closed = close_cash_session(self.cashier)
        self.assertEqual(closed.sales_count, 1)
        today = open_cash_session(Decimal('500'), self.cashier)
        self.assertEqual(today.business_date, timezone.localdate())

    # --- Cancelar ------------------------------------------------------------

    def test_cancel_requires_reason_when_it_has_items(self):
        """Cancelar una comanda con productos exige motivo."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)

        with self.assertRaises(OrderValidationError):
            cancel_order(order.id, self.cashier, '   ')
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.OPEN)

    def test_waiter_cannot_cancel_with_items(self):
        """El mesero no cancela comandas con productos: eso lo decide caja."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)

        with self.assertRaises(OrderPermissionError):
            cancel_order(order.id, self.waiter, 'se fueron')
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.OPEN)

    def test_waiter_can_cancel_empty_order_without_reason(self):
        """Si abrió la mesa equivocada y la vació, el mesero la libera sin motivo."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)
        remove_order_item(order.id, self.taco.id, 1, self.waiter)

        cancelled = cancel_order(order.id, self.waiter)

        self.assertEqual(cancelled.status, Order.Status.CANCELLED)
        open_order(3, self.items((self.taco, 1)), self.waiter)

    def test_cancel_records_who_and_when(self):
        """La cancelación guarda quién, por qué y cuándo, y no crea venta."""
        order = open_order(3, self.items((self.taco, 1)), self.waiter)

        cancelled = cancel_order(order.id, self.cashier, 'Se fueron sin pedir')

        self.assertEqual(cancelled.cancelled_by, self.cashier)
        self.assertEqual(cancelled.cancel_reason, 'Se fueron sin pedir')
        self.assertIsNotNone(cancelled.closed_at)
        self.assertEqual(Sale.objects.count(), 0)

    # --- Caja, resumen y cuadrícula ------------------------------------------

    def test_close_is_blocked_by_open_orders(self):
        """No se cierra caja con mesas sin cobrar; el aviso dice cuáles."""
        open_order(3, self.items((self.taco, 1)), self.waiter)
        open_order(7, self.items((self.taco, 1)), self.waiter)

        with self.assertRaisesMessage(CashSessionError, '3, 7'):
            close_cash_session(self.cashier)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, CashSession.Status.OPEN)

    def test_summary_uses_current_price_and_tax(self):
        """El total de la comanda usa el precio y el IVA vigentes."""
        order = open_order(3, self.items((self.taco, 2)), self.waiter)

        self.assertEqual(summarize_order(order), {
            'subtotal': Decimal('50.00'),
            'tax': Decimal('4.00'),
            'total': Decimal('54.00'),
        })
        Product.objects.filter(pk=self.taco.pk).update(price='30.00')
        self.assertEqual(summarize_order(order)['subtotal'], Decimal('60.00'))

    def test_tables_overview_marks_free_and_occupied(self):
        """La cuadrícula trae una entrada por mesa; solo las ocupadas traen comanda."""
        settings = SystemSettings.load()
        settings.table_count = 4
        settings.save()
        order = open_order(2, self.items((self.taco, 3)), self.waiter)

        overview = get_tables_overview()

        self.assertEqual(overview['numero_mesas'], 4)
        self.assertEqual([table['mesa'] for table in overview['mesas']], [1, 2, 3, 4])
        occupied = overview['mesas'][1]['comanda']
        self.assertEqual(occupied['id'], order.id)
        self.assertEqual(occupied['items_count'], 3)
        self.assertEqual(occupied['subtotal'], Decimal('75.00'))
        self.assertEqual(occupied['opened_by'], 'waiter')
        self.assertIsNone(overview['mesas'][0]['comanda'])
