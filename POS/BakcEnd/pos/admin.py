"""
Panel de Django (/admin/): registro de los modelos para consultarlos.

Ventas, jornadas de caja y movimientos de inventario son de solo lectura, y el
stock de los productos no se edita aquí: todo eso se registra por la API para
que los totales y las existencias siempre se calculen bien.
"""

from django.contrib import admin

from .models import (
    CashSession,
    Category,
    InventoryMovement,
    Product,
    Sale,
    SaleItem,
    Supply,
    SystemSettings,
    UserProfile,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
    list_filter = ('role',)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'color', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'category', 'price', 'track_inventory', 'stock', 'minimum_stock', 'is_active',
    )
    list_filter = ('is_active', 'track_inventory', 'category')
    search_fields = ('name',)
    # El stock solo cambia con movimientos de inventario o ventas.
    readonly_fields = ('stock',)


@admin.register(Supply)
class SupplyAdmin(admin.ModelAdmin):
    list_display = ('name', 'stock', 'minimum_stock', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)
    # El stock solo cambia con movimientos de inventario.
    readonly_fields = ('stock',)


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'item', 'type', 'quantity', 'stock_before', 'stock_after', 'user')
    list_filter = ('type',)
    search_fields = ('product__name', 'supply__name', 'reason')
    readonly_fields = ('stock_before', 'stock_after', 'created_at')

    # Los movimientos se registran por la API para que actualicen el stock.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'tax_rate', 'exchange_rate', 'updated_by', 'updated_at')
    readonly_fields = ('updated_by', 'updated_at')

    def has_add_permission(self, request):
        return not SystemSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(CashSession)
class CashSessionAdmin(admin.ModelAdmin):
    list_display = (
        'business_date', 'status', 'opening_amount', 'sales_count', 'sales_total',
        'expected_cash', 'counted_cash', 'difference', 'opened_by', 'closed_by',
    )
    list_filter = ('status',)
    date_hierarchy = 'business_date'

    # La caja se abre y se cierra por la API, que calcula el cierre.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    can_delete = False
    readonly_fields = ('product', 'product_name', 'unit_price', 'quantity', 'line_total')


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('id', 'created_at', 'cashier', 'status', 'subtotal', 'tax', 'total', 'cancelled_by')
    list_filter = ('status', 'cash_session__business_date')
    search_fields = ('items__product_name',)
    readonly_fields = (
        'cash_session', 'cashier', 'created_at', 'tax_rate', 'exchange_rate',
        'subtotal', 'tax', 'total',
    )
    inlines = (SaleItemInline,)

    # Las ventas se registran y se cancelan por la API (calcula totales y
    # mueve el stock); en el panel solo se consultan.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
