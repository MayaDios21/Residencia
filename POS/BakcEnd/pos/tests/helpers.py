from django.contrib.auth.models import User

from ..models import UserProfile


def create_user(username, role):
    user = User.objects.create_user(username=username, password='x')
    UserProfile.objects.create(user=user, role=role)
    return user


def create_admin(username='admin'):
    return create_user(username, UserProfile.Role.ADMIN)


def create_cashier(username='cashier'):
    return create_user(username, UserProfile.Role.CASHIER)
