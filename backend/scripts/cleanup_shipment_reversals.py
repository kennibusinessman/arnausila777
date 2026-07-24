"""Убирает старые пары «Продажа+Возврат» из истории склада.

До перехода на удаление списаний (см. order_service) правка/удаление заказа
возвращала товар отдельной записью RETURN_IN, поэтому у каждой отменённой
(soft-deleted) отгрузки в журнале осталась пара: SALE_OUT + RETURN_IN. По складу
они гасят друг друга (сумма = 0), поэтому их удаление НЕ меняет текущие остатки —
только очищает историю.

Безопасность: скрипт удаляет движения только тех отменённых отгрузок, у которых
сумма движений строго равна нулю. Отгрузки с ненулевым итогом (неожиданные) он
пропускает и печатает, ничего не трогая.

Запуск (сначала посмотреть, потом применить):
    python -m scripts.cleanup_shipment_reversals            # dry-run, только показать
    python -m scripts.cleanup_shipment_reversals --apply    # удалить
"""
from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select

from app.core.database import async_session_maker
from app.core.enums import SourceType
from app.models import Shipment, StockMovement
from app.services import stock_service


async def main(apply: bool) -> None:
    async with async_session_maker() as session:
        deleted_ids = (
            await session.execute(select(Shipment.id).where(Shipment.deleted_at.is_not(None)))
        ).scalars().all()
        if not deleted_ids:
            print("[cleanup] Отменённых отгрузок нет — чистить нечего.")
            return

        movements = (
            await session.execute(
                select(StockMovement).where(
                    StockMovement.source_type == SourceType.SHIPMENT,
                    StockMovement.source_id.in_(deleted_ids),
                )
            )
        ).scalars().all()

        by_ship: dict = defaultdict(list)
        for m in movements:
            by_ship[m.source_id].append(m)

        to_delete: list[StockMovement] = []
        skipped: list[tuple] = []
        for sid, movs in by_ship.items():
            net = sum(
                (m.quantity * stock_service.movement_sign(m.movement_type) for m in movs),
                Decimal("0"),
            )
            if net == 0:
                to_delete.extend(movs)
            else:
                skipped.append((sid, net, len(movs)))

        print(f"[cleanup] Отменённых отгрузок: {len(deleted_ids)}; из них с движениями: {len(by_ship)}")
        print(f"[cleanup] Движений к удалению: {len(to_delete)} (пары с нулевым итогом)")
        if skipped:
            print(f"[cleanup] ПРОПУЩЕНО отгрузок (итог не ноль — не трогаю): {len(skipped)}")
            for sid, net, n in skipped:
                print(f"    - отгрузка {sid}: сумма движений={net}, движений={n}")

        if not apply:
            print("[cleanup] DRY-RUN: ничего не удалено. Запусти с --apply, чтобы применить.")
            return

        for m in to_delete:
            await session.delete(m)
        await session.commit()
        print(
            f"[cleanup] ГОТОВО. Удалено движений: {len(to_delete)}. "
            f"Остатки не изменились (итог по каждой отгрузке = 0)."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Очистка пар «Продажа+Возврат» отменённых отгрузок")
    parser.add_argument("--apply", action="store_true", help="применить удаление (иначе dry-run)")
    args = parser.parse_args()
    asyncio.run(main(args.apply))
