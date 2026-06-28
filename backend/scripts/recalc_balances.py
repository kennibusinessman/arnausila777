"""Пересчёт кэша остатков (stock_balances) из журнала движений.

Запуск: python -m scripts.recalc_balances
"""
from __future__ import annotations

import asyncio

from app.core.database import async_session_maker
from app.services import stock_service


async def main() -> None:
    async with async_session_maker() as session:
        count = await stock_service.recalc_balances(session)
        print(f"[recalc_balances] Пересчитано строк остатков: {count}")


if __name__ == "__main__":
    asyncio.run(main())
