"""Справочник готовой продукции: /api/products."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError

from sqlalchemy import select

from app.api.deps import DbSession, Pagination
from app.core.access import Permission
from app.core.catalog import is_bobbin
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.permissions import require_permissions
from app.models import Product, User
from app.repositories.base import CRUDRepository
from app.schemas.common import Message, Page
from app.schemas.product import CatalogResponse, ProductCreate, ProductRead, ProductUpdate
from app.services import audit_service, report_service

router = APIRouter(prefix="/products", tags=["products"])
repo = CRUDRepository(Product, soft_delete=True)

# Продукцию видят все операционные роли (нужна для форм заказа/отгрузки/склада), а
# Справочник читает и мастер смены — он выбирает выпуск и сырьё-спанбонд в
# сменном отчёте; заводить товар «на ходу» из формы отчёта тоже может он и
# зав. складом (см. CreateProductModal во фронте).
Reader = Annotated[User, Depends(require_permissions(Permission.PRODUCTS_VIEW))]
Writer = Annotated[User, Depends(require_permissions(Permission.PRODUCTS_EDIT))]
Creator = Annotated[User, Depends(require_permissions(Permission.PRODUCTS_CREATE))]
Remover = Annotated[User, Depends(require_permissions(Permission.PRODUCTS_DELETE))]


NORM_FIELDS = ("roll_norm", "roll_product_id")


async def _check_norm_fields(
    db: DbSession,
    actor: User,
    payload: dict,
    *,
    category: str | None,
    subcategory: str | None,
    product_id: uuid.UUID | None = None,
) -> None:
    """Проверки для нормы выхода бабин (payload — только переданные поля).

    Норму и привязку меняет отдельное право (по умолчанию только супер-админ),
    и поля осмысленны лишь у бабин. Одно наименование можно привязать к
    нескольким бабинам — его выпуск в отчёте делится между ними пропорционально
    ожиданию по норме (см. report_service._split_shares).
    """
    # Важно: присутствие ключа = осознанная правка, даже если значение None
    # (сброс нормы — тоже правка). Поэтому на вход идёт model_dump(exclude_unset=True),
    # иначе создание любого товара требовало бы права на норму.
    touched = {f: payload[f] for f in NORM_FIELDS if f in payload}
    if not touched:
        return
    if not actor.has_permission(Permission.PRODUCTS_SET_NORM):
        raise ForbiddenError("Норму выхода бабин и привязку задаёт только супер-админ")
    if all(v is None for v in touched.values()):
        return  # сброс нормы: проверять привязку и подкатегорию уже не нужно
    if not is_bobbin(category, subcategory):
        raise BadRequestError(
            "Норма выхода задаётся только у бабин (категория «Спанбонд», подкатегория «Бабины»)"
        )

    roll_product_id = touched.get("roll_product_id")
    if roll_product_id is None:
        return
    if roll_product_id == product_id:
        raise BadRequestError("Бабину нельзя привязать саму к себе")
    target = await repo.get(db, roll_product_id)
    if target is None:
        raise BadRequestError("Наименование продукции не найдено")
    if not target.is_active:
        raise BadRequestError(f"Товар «{target.name}» неактивен")


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
    data = await report_service.catalog(db)
    # Кто и когда завёл позицию — административная информация: отдаём только тем,
    # кому доступен журнал аудита (защита на уровне API, не только в UI).
    if not actor.has_permission(Permission.AUDIT_VIEW):
        for item in data.items:
            item.created_by_name = None
            item.created_at = None
    return data


@router.post("", response_model=ProductRead, status_code=201)
async def create_product(data: ProductCreate, actor: Creator, db: DbSession) -> ProductRead:
    await _check_norm_fields(
        db,
        actor,
        data.model_dump(exclude_unset=True),
        category=data.category,
        subcategory=data.subcategory,
    )
    try:
        obj = await repo.create(db, {**data.model_dump(), "created_by": actor.id})
        await audit_service.log(
            db,
            user_id=actor.id,
            action="CREATE_PRODUCT",
            entity_type="Product",
            entity_id=obj.id,
            new={"name": obj.name, "sku": obj.sku, "category": obj.category},
        )
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
    payload = data.model_dump(exclude_unset=True)
    # Категория/подкатегория могут меняться этим же запросом — проверяем по итоговым.
    await _check_norm_fields(
        db,
        actor,
        payload,
        category=payload.get("category", obj.category),
        subcategory=payload.get("subcategory", obj.subcategory),
        product_id=obj.id,
    )
    try:
        await repo.update(db, obj, payload)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Товар с таким SKU уже существует")
    await db.refresh(obj)
    return ProductRead.model_validate(obj)


@router.delete("/{product_id}", response_model=Message)
async def delete_product(product_id: uuid.UUID, actor: Remover, db: DbSession) -> Message:
    obj = await repo.get(db, product_id)
    if obj is None:
        raise NotFoundError("Товар не найден")
    await repo.delete(db, obj)
    await audit_service.log(
        db, user_id=actor.id, action="DELETE_PRODUCT", entity_type="Product", entity_id=obj.id
    )
    await db.commit()
    return Message(detail="Товар удалён")
