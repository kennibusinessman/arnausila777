"""Сменные отчёты: шапка, работники, выпуск продукции, расход сырья."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ShiftReportStatus, ShiftType
from app.models.base import (
    QUANTITY,
    Base,
    CreatedAtMixin,
    TimestampMixin,
    UUIDMixin,
    str_enum,
)

if TYPE_CHECKING:
    from app.models.material import Material
    from app.models.product import Product
    from app.models.user import User


class ShiftReport(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "shift_reports"
    __table_args__ = (
        Index("ix_shift_reports_master_status", "master_id", "status"),
        Index("ix_shift_reports_shift_date", "shift_date"),
    )

    shift_date: Mapped[date] = mapped_column(Date)
    shift_type: Mapped[ShiftType] = mapped_column(str_enum(ShiftType))
    master_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[ShiftReportStatus] = mapped_column(
        str_enum(ShiftReportStatus),
        default=ShiftReportStatus.DRAFT,
        server_default=text("'DRAFT'"),
    )
    comment: Mapped[str | None] = mapped_column(Text)
    # Часы простоя за смену (вводит мастер при создании отчёта).
    downtime_hours: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=0, server_default=text("0")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    master: Mapped[User] = relationship(back_populates="shift_reports", foreign_keys=[master_id])
    approver: Mapped[User | None] = relationship(foreign_keys=[approved_by])
    workers: Mapped[list[ShiftReportWorker]] = relationship(
        back_populates="shift_report", cascade="all, delete-orphan"
    )
    outputs: Mapped[list[ShiftReportOutput]] = relationship(
        back_populates="shift_report", cascade="all, delete-orphan"
    )
    materials: Mapped[list[ShiftReportMaterial]] = relationship(
        back_populates="shift_report", cascade="all, delete-orphan"
    )


class ShiftReportWorker(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "shift_report_workers"

    shift_report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shift_reports.id", ondelete="CASCADE"), index=True
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    hours_worked: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    comment: Mapped[str | None] = mapped_column(Text)

    shift_report: Mapped[ShiftReport] = relationship(back_populates="workers")
    worker: Mapped[User] = relationship()


class ShiftReportOutput(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "shift_report_outputs"

    shift_report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shift_reports.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[Decimal] = mapped_column(QUANTITY)
    defect_quantity: Mapped[Decimal] = mapped_column(
        QUANTITY, default=0, server_default=text("0")
    )
    comment: Mapped[str | None] = mapped_column(Text)

    shift_report: Mapped[ShiftReport] = relationship(back_populates="outputs")
    product: Mapped[Product] = relationship()


class ShiftReportMaterial(UUIDMixin, CreatedAtMixin, Base):
    """Строка расхода сырья. Ссылается ровно на одно из двух:

    - `material_id` — обычное сырьё со склада сырья (напр. Полипропилен для линии
      спанбонда), списывается PRODUCTION_OUT по типу MATERIAL;
    - `product_id` — полуфабрикат-спанбонд (Бабины / Дастархан сырьё), который сам
      является готовой продукцией и расходуется на простыни/дастархан; списывается
      PRODUCTION_OUT по типу PRODUCT со склада готовой продукции.
    """

    __tablename__ = "shift_report_materials"
    __table_args__ = (
        CheckConstraint(
            "(material_id IS NOT NULL AND product_id IS NULL) "
            "OR (material_id IS NULL AND product_id IS NOT NULL)",
            name="ck_shift_report_materials_one_ref",
        ),
    )

    shift_report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shift_reports.id", ondelete="CASCADE"), index=True
    )
    material_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("materials.id"))
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"))
    quantity_used: Mapped[Decimal] = mapped_column(QUANTITY)
    comment: Mapped[str | None] = mapped_column(Text)

    shift_report: Mapped[ShiftReport] = relationship(back_populates="materials")
    material: Mapped[Material | None] = relationship()
    product: Mapped[Product | None] = relationship()
