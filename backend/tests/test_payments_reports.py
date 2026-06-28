"""Оплаты, дебиторка и сводный dashboard."""
from __future__ import annotations

from helpers import (
    adjust_stock,
    create_client_entity,
    create_order,
    create_product,
    create_warehouse,
)

WINDOW = "date_from=2026-03-01&date_to=2026-03-31"


async def _sell(client, headers, *, client_id, product_id, qty, price=500):
    """Заказ = продажа: сразу списывает остаток и накапливает долг клиента.
    deadline задаёт дату отгрузки (попадание в отчётное окно)."""
    return await create_order(
        client, headers, client_id=client_id, deadline="2026-03-15",
        items=[{"product_id": product_id, "quantity": qty, "unit_price": price}],
    )


async def _debt(client, headers, client_id, *, only_debtors=True):
    r = await client.get(f"/reports/debts?only_debtors={'true' if only_debtors else 'false'}", headers=headers)
    assert r.status_code == 200, r.text
    rows = [row for row in r.json()["rows"] if row["client_id"] == client_id]
    return rows[0] if rows else None


async def test_debt_lifecycle(client, admin_headers):
    wh = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    prod = await create_product(client, admin_headers)
    cli = await create_client_entity(client, admin_headers)
    await adjust_stock(client, admin_headers, warehouse_id=wh["id"], item_type="PRODUCT",
                       item_id=prod["id"], quantity=100, unit="roll")
    await _sell(client, admin_headers, client_id=cli["id"], product_id=prod["id"], qty=10)

    row = await _debt(client, admin_headers, cli["id"])
    assert float(row["debt"]) == 5000.0

    await client.post("/payments", json={"client_id": cli["id"], "payment_date": "2026-03-16",
                                         "amount": 2000, "payment_method": "CASH"}, headers=admin_headers)
    row = await _debt(client, admin_headers, cli["id"])
    assert float(row["debt"]) == 3000.0

    await client.post("/payments", json={"client_id": cli["id"], "payment_date": "2026-03-17",
                                         "amount": 3000, "payment_method": "CASH"}, headers=admin_headers)
    assert await _debt(client, admin_headers, cli["id"], only_debtors=True) is None
    closed = await _debt(client, admin_headers, cli["id"], only_debtors=False)
    assert float(closed["debt"]) == 0.0


async def test_dashboard_sums(client, admin_headers):
    wh = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    prod = await create_product(client, admin_headers)
    cli = await create_client_entity(client, admin_headers)
    await adjust_stock(client, admin_headers, warehouse_id=wh["id"], item_type="PRODUCT",
                       item_id=prod["id"], quantity=100, unit="roll")
    await _sell(client, admin_headers, client_id=cli["id"], product_id=prod["id"], qty=10)
    await client.post("/payments", json={"client_id": cli["id"], "payment_date": "2026-03-16",
                                         "amount": 2000, "payment_method": "CASH"}, headers=admin_headers)

    cat = (await client.post("/expense-categories", json={"name": "op", "type": "OPERATING"},
                             headers=admin_headers)).json()
    exp_r = await client.post("/expenses", json={"name": "Расход", "expense_date": "2026-03-15",
                                                 "category_id": cat["id"], "amount": 3000},
                              headers=admin_headers)
    assert exp_r.status_code == 201, exp_r.text

    d = (await client.get(f"/reports/dashboard?{WINDOW}", headers=admin_headers)).json()
    assert float(d["gross_revenue"]) == 5000.0
    assert float(d["cash_revenue"]) == 2000.0
    assert float(d["total_expenses"]) == 3000.0
    assert float(d["revenue"]) == 5000.0          # режим по умолчанию — shipments
    assert float(d["net_profit"]) == 2000.0       # 5000 - 3000

    dp = (await client.get(f"/reports/dashboard?{WINDOW}&revenue_mode=payments", headers=admin_headers)).json()
    assert float(dp["revenue"]) == 2000.0
    assert float(dp["net_profit"]) == -1000.0     # 2000 - 3000
