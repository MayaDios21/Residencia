from django.db import models

from django.contrib.auth.models import User


class UserProfile(models.Model):
    class Role(models.TextChoices):
        CASHIER = 'cashier', 'Cajero'
        ADMIN = 'admin', 'Administrador'

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CASHIER,
    )

    def __str__(self):
        return f'{self.user.username} ({self.get_role_display()})'
