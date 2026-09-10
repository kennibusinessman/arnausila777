"""Каталог прав доступа и их привязка к ролям.

Модель доступа двухслойная:

1. **Роль** задаёт набор прав по умолчанию — ``ROLE_PERMISSIONS``. Он повторяет
   ровно ту матрицу, что раньше была «зашита» в ``require_roles(...)`` каждого
   маршрута, поэтому без индивидуальных настроек поведение не меняется.
2. **Индивидуальные права** пользователя (``users.permissions``) — точечные
   отклонения от набора роли: ``{"stock.view": true, "expenses.view": false}``.
   ``true`` выдаёт право сверх роли, ``false`` — забирает выданное ролью.

SUPER_ADMIN всегда обладает всеми правами: иначе его можно было бы запереть,
сняв право менять права.

Модуль намеренно не импортирует ни модели, ни FastAPI — им пользуется и
ORM-модель ``User`` (свойство ``effective_permissions``), и слой API.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from enum import Enum

from app.core.enums import UserRole


class Permission(str, Enum):
    """Одно право = одно конкретное действие в интерфейсе/API."""

    DASHBOARD_VIEW = "dashboard.view"

    ORDERS_VIEW = "orders.view"
    ORDERS_VIEW_MONEY = "orders.view_money"
    ORDERS_CREATE = "orders.create"
    ORDERS_EDIT = "orders.edit"
    ORDERS_REBUILD = "orders.rebuild"
    ORDERS_SET_PRICES = "orders.set_prices"
    ORDERS_DELETE = "orders.delete"

    SHIPMENTS_VIEW = "shipments.view"

    SHIFT_REPORTS_VIEW = "shift_reports.view"
    SHIFT_REPORTS_VIEW_ALL = "shift_reports.view_all"
    SHIFT_REPORTS_CREATE = "shift_reports.create"
    SHIFT_REPORTS_APPROVE = "shift_reports.approve"
    SHIFT_REPORTS_DELETE = "shift_reports.delete"

    STOCK_VIEW = "stock.view"
    STOCK_ADJUST = "stock.adjust"
    STOCK_DELETE_MOVEMENT = "stock.delete_movement"

    EXPENSES_VIEW = "expenses.view"
    EXPENSES_MANAGE = "expenses.manage"
    EXPENSES_DELETE = "expenses.delete"

    PAYMENTS_VIEW = "payments.view"
    PAYMENTS_CREATE = "payments.create"
    PAYMENTS_EDIT = "payments.edit"

    CLIENTS_VIEW = "clients.view"
    CLIENTS_CREATE = "clients.create"
    CLIENTS_VIEW_DETAILS = "clients.view_details"
    CLIENTS_EDIT = "clients.edit"
    CLIENTS_DELETE = "clients.delete"

    PRODUCTS_VIEW = "products.view"
    PRODUCTS_CREATE = "products.create"
    PRODUCTS_EDIT = "products.edit"
    PRODUCTS_DELETE = "products.delete"
    # Норма выхода рулонов с бабины и привязка бабины к наименованию продукции.
    # Отделено от products.edit: норму задаёт только СА, править карточку могут и другие.
    PRODUCTS_SET_NORM = "products.set_norm"

    MATERIALS_VIEW = "materials.view"
    MATERIALS_MANAGE = "materials.manage"
    MATERIALS_DELETE = "materials.delete"

    WAREHOUSES_VIEW = "warehouses.view"
    WAREHOUSES_MANAGE = "warehouses.manage"

    REPORTS_FINANCE = "reports.finance"
    REPORTS_PRODUCTION = "reports.production"
    REPORTS_STOCK = "reports.stock"
    REPORTS_DEBTS = "reports.debts"

    USERS_VIEW = "users.view"
    USERS_MANAGE = "users.manage"
    USERS_DELETE = "users.delete"
    USERS_PERMISSIONS = "users.permissions"

    AUDIT_VIEW = "audit.view"
    AUDIT_DELETE = "audit.delete"

    SETTINGS_EDIT = "settings.edit"


P = Permission

# Человекочитаемые подписи — их же отдаёт GET /api/users/permissions/catalog,
# чтобы редактор прав во фронте не разъезжался с бэкендом.
PERMISSION_LABELS: dict[Permission, str] = {
    P.DASHBOARD_VIEW: "Видеть дашборд",
    P.ORDERS_VIEW: "Видеть заказы",
    P.ORDERS_VIEW_MONEY: "Видеть суммы и цены в заказах",
    P.ORDERS_CREATE: "Заводить заказы и отгрузки",
    P.ORDERS_EDIT: "Править заказ (даты, комментарий)",
    P.ORDERS_REBUILD: "Менять состав заказа",
    P.ORDERS_SET_PRICES: "Проставлять цены в заказе",
    P.ORDERS_DELETE: "Удалять заказы",
    P.SHIPMENTS_VIEW: "Видеть отгрузки",
    P.SHIFT_REPORTS_VIEW: "Открывать сменный отчёт",
    P.SHIFT_REPORTS_VIEW_ALL: "Видеть все сменные отчёты",
    P.SHIFT_REPORTS_CREATE: "Заводить и править сменные отчёты",
    P.SHIFT_REPORTS_APPROVE: "Утверждать и отклонять сменные отчёты",
    P.SHIFT_REPORTS_DELETE: "Удалять сменные отчёты",
    P.STOCK_VIEW: "Видеть остатки и движения",
    P.STOCK_ADJUST: "Делать корректировки склада",
    P.STOCK_DELETE_MOVEMENT: "Удалять движения склада",
    P.EXPENSES_VIEW: "Видеть расходы",
    P.EXPENSES_MANAGE: "Заводить и править расходы",
    P.EXPENSES_DELETE: "Удалять расходы",
    P.PAYMENTS_VIEW: "Видеть оплаты",
    P.PAYMENTS_CREATE: "Заводить оплаты",
    P.PAYMENTS_EDIT: "Править и удалять оплаты",
    P.CLIENTS_VIEW: "Видеть список клиентов",
    P.CLIENTS_CREATE: "Заводить клиентов",
    P.CLIENTS_VIEW_DETAILS: "Открывать карточку клиента и долги",
    P.CLIENTS_EDIT: "Править клиентов",
    P.CLIENTS_DELETE: "Удалять клиентов",
    P.PRODUCTS_VIEW: "Видеть товары",
    P.PRODUCTS_CREATE: "Заводить товары",
    P.PRODUCTS_EDIT: "Править товары",
    P.PRODUCTS_DELETE: "Удалять товары",
    P.PRODUCTS_SET_NORM: "Задавать норму выхода бабин",
    P.MATERIALS_VIEW: "Видеть материалы",
    P.MATERIALS_MANAGE: "Заводить и править материалы",
    P.MATERIALS_DELETE: "Удалять материалы",
    P.WAREHOUSES_VIEW: "Видеть склады",
    P.WAREHOUSES_MANAGE: "Заводить и править склады",
    P.REPORTS_FINANCE: "Отчёты: деньги (за период, продажи, топ товаров)",
    P.REPORTS_PRODUCTION: "Отчёты: производство",
    P.REPORTS_STOCK: "Отчёты: остатки и движение",
    P.REPORTS_DEBTS: "Отчёты: дебиторка",
    P.USERS_VIEW: "Видеть пользователей",
    P.USERS_MANAGE: "Заводить пользователей и менять роли",
    P.USERS_DELETE: "Деактивировать пользователей",
    P.USERS_PERMISSIONS: "Менять индивидуальные права",
    P.AUDIT_VIEW: "Видеть журнал аудита",
    P.AUDIT_DELETE: "Удалять записи аудита",
    P.SETTINGS_EDIT: "Менять настройки системы",
}

# Порядок и группировка для редактора прав на странице «Пользователи».
PERMISSION_GROUPS: list[tuple[str, tuple[Permission, ...]]] = [
    (
        "Заказы и отгрузки",
        (
            P.ORDERS_VIEW,
            P.ORDERS_VIEW_MONEY,
            P.ORDERS_CREATE,
            P.ORDERS_EDIT,
            P.ORDERS_REBUILD,
            P.ORDERS_SET_PRICES,
            P.ORDERS_DELETE,
            P.SHIPMENTS_VIEW,
        ),
    ),
    (
        "Склад",
        (
            P.STOCK_VIEW,
            P.STOCK_ADJUST,
            P.STOCK_DELETE_MOVEMENT,
            P.WAREHOUSES_VIEW,
            P.WAREHOUSES_MANAGE,
        ),
    ),
    (
        "Производство",
        (
            P.SHIFT_REPORTS_VIEW,
            P.SHIFT_REPORTS_VIEW_ALL,
            P.SHIFT_REPORTS_CREATE,
            P.SHIFT_REPORTS_APPROVE,
            P.SHIFT_REPORTS_DELETE,
        ),
    ),
    (
        "Деньги",
        (
            P.PAYMENTS_VIEW,
            P.PAYMENTS_CREATE,
            P.PAYMENTS_EDIT,
            P.EXPENSES_VIEW,
            P.EXPENSES_MANAGE,
            P.EXPENSES_DELETE,
        ),
    ),
    (
        "Клиенты",
        (
            P.CLIENTS_VIEW,
            P.CLIENTS_CREATE,
            P.CLIENTS_VIEW_DETAILS,
            P.CLIENTS_EDIT,
            P.CLIENTS_DELETE,
        ),
    ),
    (
        "Справочники",
        (
            P.PRODUCTS_VIEW,
            P.PRODUCTS_CREATE,
            P.PRODUCTS_EDIT,
            P.PRODUCTS_DELETE,
            P.PRODUCTS_SET_NORM,
            P.MATERIALS_VIEW,
            P.MATERIALS_MANAGE,
            P.MATERIALS_DELETE,
        ),
    ),
    (
        "Отчёты",
        (
            P.DASHBOARD_VIEW,
            P.REPORTS_FINANCE,
            P.REPORTS_PRODUCTION,
            P.REPORTS_STOCK,
            P.REPORTS_DEBTS,
        ),
    ),
    (
        "Администрирование",
        (
            P.USERS_VIEW,
            P.USERS_MANAGE,
            P.USERS_DELETE,
            P.USERS_PERMISSIONS,
            P.AUDIT_VIEW,
            P.AUDIT_DELETE,
            P.SETTINGS_EDIT,
        ),
    ),
]

# Руководитель может почти всё, кроме «расширенных» действий супер-админа
# (удаление сущностей и записей аудита, управление доступами).
_BOSS: frozenset[Permission] = frozenset(Permission) - {
    P.STOCK_DELETE_MOVEMENT,
    P.EXPENSES_DELETE,
    P.PRODUCTS_DELETE,
    P.PRODUCTS_SET_NORM,
    P.MATERIALS_DELETE,
    P.USERS_DELETE,
    P.USERS_PERMISSIONS,
    P.AUDIT_DELETE,
}

# Зав. складом «забивает» заказы, но денег в них не видит (ORDERS_VIEW_MONEY нет).
_WAREHOUSE_MANAGER: frozenset[Permission] = frozenset({
    P.ORDERS_VIEW,
    P.ORDERS_CREATE,
    P.ORDERS_EDIT,
    P.SHIPMENTS_VIEW,
    P.SHIFT_REPORTS_VIEW,
    P.SHIFT_REPORTS_VIEW_ALL,
    P.SHIFT_REPORTS_CREATE,
    P.SHIFT_REPORTS_APPROVE,
    P.STOCK_VIEW,
    P.STOCK_ADJUST,
    P.WAREHOUSES_VIEW,
    P.CLIENTS_VIEW,
    P.CLIENTS_CREATE,
    P.PRODUCTS_VIEW,
    P.PRODUCTS_CREATE,
    P.PRODUCTS_EDIT,
    P.MATERIALS_VIEW,
    P.REPORTS_STOCK,
})

_SHIFT_MASTER: frozenset[Permission] = frozenset({
    P.SHIFT_REPORTS_VIEW,
    P.SHIFT_REPORTS_CREATE,
    P.PRODUCTS_VIEW,
    P.PRODUCTS_CREATE,
    P.MATERIALS_VIEW,
})

_SALES_MANAGER: frozenset[Permission] = frozenset({
    P.ORDERS_VIEW,
    P.ORDERS_VIEW_MONEY,
    P.ORDERS_CREATE,
    P.ORDERS_EDIT,
    P.ORDERS_SET_PRICES,
    P.SHIPMENTS_VIEW,
    P.PAYMENTS_VIEW,
    P.PAYMENTS_CREATE,
    P.CLIENTS_VIEW,
    P.CLIENTS_CREATE,
    P.CLIENTS_VIEW_DETAILS,
    P.CLIENTS_EDIT,
    P.PRODUCTS_VIEW,
    P.REPORTS_DEBTS,
})

#: Права роли «по умолчанию». У SUPER_ADMIN — все, и отнять их нельзя.
ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.SUPER_ADMIN: frozenset(Permission),
    UserRole.BOSS: _BOSS,
    UserRole.WAREHOUSE_MANAGER: _WAREHOUSE_MANAGER,
    UserRole.SHIFT_MASTER: _SHIFT_MASTER,
    UserRole.SALES_MANAGER: _SALES_MANAGER,
}


def role_permissions(role: UserRole) -> frozenset[Permission]:
    return ROLE_PERMISSIONS.get(role, frozenset())


def normalize_overrides(raw: Mapping[str, object] | None) -> dict[str, bool]:
    """Оставляет только известные ключи прав со значением bool."""
    if not raw:
        return {}
    result: dict[str, bool] = {}
    for key, value in raw.items():
        try:
            perm = Permission(key)
        except ValueError:
            continue  # право убрали из каталога — старая запись просто игнорируется
        result[perm.value] = bool(value)
    return result


def resolve_permissions(
    role: UserRole, overrides: Mapping[str, object] | None
) -> frozenset[Permission]:
    """Итоговый набор прав: набор роли, скорректированный индивидуальными."""
    if role is UserRole.SUPER_ADMIN:
        return frozenset(Permission)  # супер-админа ограничить нельзя
    granted = set(role_permissions(role))
    for key, allowed in normalize_overrides(overrides).items():
        perm = Permission(key)
        if allowed:
            granted.add(perm)
        else:
            granted.discard(perm)
    return frozenset(granted)


_CATALOG_ORDER: dict[Permission, int] = {
    perm: index
    for index, perm in enumerate(p for _, group in PERMISSION_GROUPS for p in group)
}


def sort_permissions(perms: Iterable[Permission]) -> list[Permission]:
    """Порядок как в каталоге — стабильный вывод в API и в журнале аудита."""
    return sorted(perms, key=lambda p: (_CATALOG_ORDER.get(p, len(_CATALOG_ORDER)), p.value))
