from django.contrib import admin

from .models import Category, InventoryMovement, Product, UserProfile


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
    list_display = ('name', 'category', 'price', 'stock', 'minimum_stock', 'is_active')
    list_filter = ('is_active', 'category')
    search_fields = ('name',)


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'product', 'type', 'quantity', 'stock_before', 'stock_after', 'user')
    list_filter = ('type',)
    search_fields = ('product__name', 'reason')
    readonly_fields = ('stock_before', 'stock_after', 'created_at')
