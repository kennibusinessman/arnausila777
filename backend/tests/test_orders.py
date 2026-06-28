"""Заказы: расчёт сумм, списание остатка при создании, проверка наличия, scope."""
from __future__ import annotations

from conftest import auth, get_token
from helpers import (
    adjust_stock,
    balance,
    create_client_entity,
    create_order,
    create_product,
    create_user,
    create_warehouse,
)


async def _seed(client, headers, *, stock=100, price=500):
    wh = await create_warehouse(client, headers, "FINISHED_GOODS")
    prod = await create_product(client, headers, price=price)
    cli = await create_client_entity(client, headers)
    if stock:
        await adjust_stock(client, headers, warehouse_id=wh["id"], item_type="PRODUCT",
                           item_id=prod["id"], quantity=stock, unit="roll")
    return wh, prod, cli


async def _balance(client, headers, wh, prod):
    return await balance(client, headers, warehouse_id=wh["id"], item_type="PRODUCT", item_id=prod["id"])


async def test_create_order_computes_totals_and_deducts_stock(client, admin_headers):
    wh, prod, cli = await _seed(client, admin_headers, stock=100, price=1500)
    order = await create_order(client, admin_headers, client_id=cli["id"], items=[
        {"product_id": prod["id"], "quantity": 3, "unit_price": 1000},
        {"product_id": prod["id"], "quantity": 2},  # цена из товара = 1500
    ])
    assert order["order_number"].startswith("ORD-")
    assert float(order["total_amount"]) == 3 * 1000 + 2 * 1500
    lines = {float(i["unit_price"]): float(i["total_price"]) for i in order["items"]}
    assert lines[1000.0] == 3000.0
    assert lines[1500.0] == 3000.0
    # Остаток уменьшился на весь состав (3 + 2).
    assert await _balance(client, admin_headers, wh, prod) == 95.0


async def test_create_order_insufficient_stock_rejected(client, admin_headers):
    wh, prod, cli = await _seed(client, admin_headers, stock=3)
    r = await client.post("/orders", json={
        "client_id": cli["id"],
        "items": [{"product_id": prod["id"], "quantity": 5}],
    }, headers=admin_headers)
    assert r.status_code == 409, r.text
    # Сообщение называет, какого именно товара и сколько не хватает.
    detail = r.json()["detail"]
    assert prod["name"] in detail
    assert "Недостаточно" in detail
    # Остаток не тронут, заказ не создан (откат всей транзакции).
    assert await _balance(client, admin_headers, wh, prod) == 3.0
    assert (await client.get("/orders", headers=admin_headers)).json()["total"] == 0


async def test_delete_order_returns_stock(client, admin_headers):
    wh, prod, cli = await _seed(client, admin_headers, stock=100)
    order = await create_order(client, admin_headers, client_id=cli["id"],
                               items=[{"product_id": prod["id"], "quantity": 10}])
    assert await _balance(client, admin_headers, wh, prod) == 90.0

    d = await client.delete(f"/orders/{order['id']}", headers=admin_headers)
    assert d.status_code == 200, d.text
    assert await _balance(client, admin_headers, wh, prod) == 100.0


async def test_sales_manager_scope(client, admin_headers):
    # Заказ админского клиента не виден чужому менеджеру.
    wh, prod, cli = await _seed(client, admin_headers, stock=10)
    admin_order = await create_order(client, admin_headers, client_id=cli["id"],
                                     items=[{"product_id": prod["id"], "quantity": 1}])

    sam = await create_user(client, admin_headers, "sales_manager")
    sam_headers = auth(await get_token(client, sam["email"], "temp12345"))

    r = await client.get(f"/orders/{admin_order['id']}", headers=sam_headers)
    assert r.status_code == 404

    listing = await client.get("/orders", headers=sam_headers)
    assert listing.status_code == 200
    assert listing.json()["total"] == 0
