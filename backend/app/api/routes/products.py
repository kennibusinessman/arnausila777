"""Справочник готовой продукции: /api/products."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError

from app.api.deps import DbSession, Pagination
from app.core.enums import UserRole
from app.core.exceptions import ConflictError, NotFoundError
from app.core.permissions import require_roles
from app.models import Product, User
from app.repositories.base import CRUDRepository
from app.schemas.common import Message, Page
from app.schemas.product import CatalogResponse, ProductCreate, ProductRead, ProductUpdate
from app.services import audit_service, report_service

router = APIRouter(prefix="/products", tags=["products"])
repo = CRUDRepository(Product, soft_delete=True)

# Продукцию видят все операционные роли (нужна для форм заказа/отгрузки/склада), а
# также мастер смены — он выбирает выпуск и сырьё-спанбонд в сменном отчёте.
Reader = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.SUPER_ADMIN,
            UserRole.BOSS,
            UserRole.WAREHOUSE_MANAGER,
            UserRole.SALES_MANAGER,
            UserRole.SHIFT_MASTER,
        )
    ),
]
# Редактировать справочник могут SA/B, а также зав. складом — он правит карточку
# товара (в т.ч. вес единицы) прямо со страницы «Остатки».
Writer = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.WAREHOUSE_MANAGER)),
]
# Создавать товар могут ещё мастер смены и зав. складом — заводят новую продукцию
# «на ходу» прямо из формы сменного отчёта (см. CreateProductModal во фронте).
# Правка/удаление при этом остаются за SA/B.
Creator = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.SUPER_ADMIN,
            UserRole.BOSS,
            UserRole.SHIFT_MASTER,
            UserRole.WAREHOUSE_MANAGER,
        )
    ),
]
# Удаление — расширенное право, только супер-админ.
SuperAdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]


@router.get("", response_model=Page[ProductRead])
async def list_products(
    actor: Reader,
    db: DbSession,
    params: Pagination,
    search: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
    subcategory: Annotated[str | None, Query()] = None,
    is_active: Annotated[bool | None, Query()] = None,
) -> Page[ProductRead]:
    items, total = await repo.list(
        db,
        offset=params.offset,
        limit=params.limit,
        filters={"category": category, "subcategory": subcategory, "is_active": is_active},
        search=search,
        search_fields=("name", "sku"),
        order_by=Product.name.asc(),
    )
    return Page[ProductRead](
        items=[ProductRead.model_validate(i) for i in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/catalog", response_model=CatalogResponse)
async def get_catalog(actor: Reader, db: DbSession) -> CatalogResponse:
    """Единый каталог: продукция + сырьё с остатками (для страницы «Товары»)."""
    return await report_service.catalog(db)


@router.post("", response_model=ProductRead, status_code=201)
async def create_product(data: ProductCreate, actor: Creator, db: DbSession) -> ProductRead:
    try:
        obj = await repo.create(db, data.model_dump())
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Товар с таким SKU уже существует")
    await db.refresh(obj)
    return ProductRead.model_validate(obj)


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(product_id: uuid.UUID, actor: Reader, db: DbSession) -> ProductRead:
    obj = await repo.get(db, product_id)
    if obj is None:
        raise NotFoundError("Товар не найден")
    return ProductRead.model_validate(obj)


@router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: uuid.UUID, data: ProductUpdate, actor: Writer, db: DbSession
) -> ProductRead:
    obj = await repo.get(db, product_id)
    if obj is None:
        raise NotFoundError("Товар не найден")
    try:
        await repo.update(db, obj, data.model_dump(exclude_unset=True))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Товар с таким SKU уже существует")
    await db.refresh(obj)
    return ProductRead.model_validate(obj)


@router.delete("/{product_id}", response_model=Message)
async def delete_product(product_id: uuid.UUID, actor: SuperAdminUser, db: DbSession) -> Message:
    obj = await repo.get(db, product_id)
    if obj is None:
        raise NotFoundError("Товар не найден")
    await repo.delete(db, obj)
    await audit_service.log(
        db, user_id=actor.id, action="DELETE_PRODUCT", entity_type="Product", entity_id=obj.id
    )
    await db.commit()
    return Message(detail="Товар удалён")
