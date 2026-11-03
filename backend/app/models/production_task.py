"""План производства простыней: задание (клиент, срок) и его позиции."""
from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ProductionTaskStatus
from app.models.base import Base, TimestampMixin, UUIDMixin, str_enum

if TYPE_CHECKING:
    from app.models.product import Product


class ProductionTask(UUIDMixin, TimestampMixin, Base):
    """Задание для клиента: несколько наименований простыней.

    Внутренний список супер-админа, с заказами клиентов не связан. Порядок
    очереди — `position`: по нему расчёт расходует бабины со склада и считает
    даты готовности (внутри задания — по порядку позиций).
    """

    __tablename__ = "production_tasks"
    __table_args__ = (Index("ix_production_tasks_status_position", "status", "position"),)

    position: Mapped[int] = mapped_column(Integer)
    # Для кого делаем — клиент из справочника. NULL — на склад, без клиента.
    client_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("clients.id"), index=True)
    deadline: Mapped[date | None] = mapped_column(Date)
    comment: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProductionTaskStatus] = mapped_column(
        str_enum(ProductionTaskStatus),
        default=ProductionTaskStatus.QUEUED,
        server_default=text("'QUEUED'"),
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    items: Mapped[list[ProductionTaskItem]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="ProductionTaskItem.line_no",
        lazy="selectin",
    )


class ProductionTaskItem(UUIDMixin, TimestampMixin, Base):
    """Позиция задания: сколько штук какого наименования.

    `ready` — сколько готовых штук уже отложено для клиента (закреплено со склада),
    `shipped` — сколько из них клиенту уже отгрузили. Отгрузка здесь — только
    отметка: склад она не меняет (списание идёт через «Заказы»).
    """

    __tablename__ = "production_task_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_production_task_items_quantity_positive"),
        CheckConstraint("ready >= 0 AND ready <= quantity", name="ck_production_task_items_ready"),
        CheckConstraint("shipped >= 0 AND shipped <= ready", name="ck_production_task_items_shipped"),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("production_tasks.id", ondelete="CASCADE"), index=True
    )
    line_no: Mapped[int] = mapped_column(Integer)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), index=True)
    # Какую бабину пускать. NULL — любую из привязанных к наименованию
    # (расчёт берёт ту, которой больше всего на складе).
    bobbin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    ready: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    shipped: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))

    task: Mapped[ProductionTask] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(foreign_keys=[product_id])


class ProductionTaskShipment(UUIDMixin, TimestampMixin, Base):
    """Сколько штук позиции плана отгрузил конкретный заказ.

    Создаётся само, когда на странице «Заказы» оформляют заказ клиенту на
    простыню из его открытого задания. По этим строкам план откатывает
    засчитанное, если заказ удалили или поменяли.
    """

    __tablename__ = "production_task_shipments"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_production_task_shipments_quantity_positive"),
        CheckConstraint("ready_added >= 0", name="ck_production_task_shipments_ready_added"),
    )

    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("production_task_items.id", ondelete="CASCADE"), index=True
    )
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    # На сколько при этом подняли «готово» (заказ увёз то, что не было отмечено
    # готовым) — чтобы при откате вернуть ровно столько же.
    ready_added: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
