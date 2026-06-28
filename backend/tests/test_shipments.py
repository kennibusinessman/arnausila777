"""Отгрузки: автосоздание вместе с заказом, доступ только на чтение."""
from __future__ import annotations

from helpers import (
    adjust_stock,
    balance,
    create_client_entity,
    create_order,
    create_product,
    create_warehouse,
)


async def _seed(client, headers, *, stock=100):
    wh = await create_warehouse(client, headers, "FINISHED_GOODS")
    prod = await create_product(client, headers)
    cli = await create_client_entity(client, headers)
    if stock:
        await adjust_stock(client, headers, warehouse_id=wh["id"], item_type="PRODUCT",
                           item_id=prod["id"], quantity=stock, unit="roll")
    return wh, prod, cli


async def _balance(client, headers, wh, prod):
    return await balance(client, headers, warehouse_id=wh["id"], item_type="PRODUCT", item_id=prod["id"])


async def test_order_autocreates_shipment_and_deducts_stock(client, admin_headers):
    wh, prod, cli = await _seed(client, admin_headers)
    order = await create_order(client, admin_headers, client_id=cli["id"],
                               items=[{"product_id": prod["id"], "quantity": 10, "unit_price": 500}])
    assert await _balance(client, admin_headers, wh, prod) == 90.0

    # Отгрузка создана автоматически и доступна на чтение.
    shipments = (await client.get(f"/shipments?order_id={order['id']}", headers=admin_headers)).json()
    assert shipments["total"] == 1
    assert float(shipments["items"][0]["total_amount"]) == 5000.0


async def test_shipment_create_endpoint_removed(client, admin_headers):
    wh, prod, cli = await _seed(client, admin_headers)
    order = await create_order(client, admin_headers, client_id=cli["id"],
                               items=[{"product_id": prod["id"], "quantity": 1}])
    # POST /shipments больше не существует — отгрузка только часть заказа.
    r = await client.post("/shipments", json={
        "order_id": order["id"], "warehouse_id": wh["id"], "shipment_date": "2026-03-15",
    }, headers=admin_headers)
    assert r.status_code == 405


async def test_insufficient_stock_blocks_order(client, admin_headers):
    wh, prod, cli = await _seed(client, admin_headers, stock=3)
    r = await client.post("/orders", json={
        "client_id": cli["id"], "items": [{"product_id": prod["id"], "quantity": 5}],
    }, headers=admin_headers)
    assert r.status_code == 409
    assert await _balance(client, admin_headers, wh, prod) == 3.0


async def test_delete_order_returns_stock(client, admin_headers):
    wh, prod, cli = await _seed(client, admin_headers)
    order = await create_order(client, admin_headers, client_id=cli["id"],
                               items=[{"product_id": prod["id"], "quantity": 10}])
    assert await _balance(client, admin_headers, wh, prod) == 90.0

    c = await client.delete(f"/orders/{order['id']}", headers=admin_headers)
    assert c.status_code == 200
    assert await _balance(client, admin_headers, wh, prod) == 100.0
