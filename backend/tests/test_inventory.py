"""Инвентаризация: фактический остаток → приход/расход на разницу, доступ только СА."""
from __future__ import annotations

from conftest import auth, get_token
from helpers import (
    adjust_stock,
    balance,
    create_material,
    create_product,
    create_user,
    create_warehouse,
)


async def _inventory_row(client, headers, item_id) -> dict:
    r = await client.get("/stock/inventory", headers=headers)
    assert r.status_code == 200, r.text
    return next(row for row in r.json() if row["item_id"] == item_id)


async def _movements(client, headers, product_id) -> list[dict]:
    r = await client.get(f"/stock/movements?product_id={product_id}&size=100", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["items"]


async def test_surplus_creates_adjustment_in(client, admin_headers):
    wh = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    prod = await create_product(client, admin_headers)
    await adjust_stock(client, admin_headers, warehouse_id=wh["id"], item_type="PRODUCT",
                       item_id=prod["id"], quantity=100, unit="roll")

    r = await client.post("/stock/inventory", headers=admin_headers, json={
        "items": [{"item_type": "PRODUCT", "item_id": prod["id"],
                   "quantity": "120", "expected_quantity": "100.000"}],
        "comment": "Пересчёт",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["movements_created"] == 1
    assert float(body["changes"][0]["before"]) == 100
    assert float(body["changes"][0]["after"]) == 120

    assert await balance(client, admin_headers, warehouse_id=wh["id"],
                         item_type="PRODUCT", item_id=prod["id"]) == 120
    inv = [m for m in await _movements(client, admin_headers, prod["id"])
           if (m["comment"] or "").startswith("Инвентаризация")]
    assert len(inv) == 1
    assert inv[0]["movement_type"] == "ADJUSTMENT_IN"
    assert float(inv[0]["quantity"]) == 20
    assert inv[0]["source_type"] == "MANUAL_ADJUSTMENT"
    assert "было 100, стало 120" in inv[0]["comment"] and "Пересчёт" in inv[0]["comment"]

    r = await client.get("/audit-logs?action=STOCK_INVENTORY", headers=admin_headers)
    assert r.status_code == 200, r.text
    log = r.json()["items"][0]
    assert log["entity_type"] == "Product" and log["entity_id"] == prod["id"]
    assert log["old_value"]["quantity"] == "100" and log["new_value"]["quantity"] == "120"


async def test_shortage_takes_default_warehouse_first_and_never_goes_negative(client, admin_headers):
    wh_default = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    wh_other = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    prod = await create_product(client, admin_headers)
    await adjust_stock(client, admin_headers, warehouse_id=wh_default["id"], item_type="PRODUCT",
                       item_id=prod["id"], quantity=10, unit="roll")
    await adjust_stock(client, admin_headers, warehouse_id=wh_other["id"], item_type="PRODUCT",
                       item_id=prod["id"], quantity=30, unit="roll")
    assert float((await _inventory_row(client, admin_headers, prod["id"]))["quantity"]) == 40

    r = await client.post("/stock/inventory", headers=admin_headers, json={
        "items": [{"item_type": "PRODUCT", "item_id": prod["id"], "quantity": "25"}],
    })
    assert r.status_code == 200, r.text
    assert r.json()["movements_created"] == 2  # 10 со склада по умолчанию + 5 с другого

    assert await balance(client, admin_headers, warehouse_id=wh_default["id"],
                         item_type="PRODUCT", item_id=prod["id"]) == 0
    assert await balance(client, admin_headers, warehouse_id=wh_other["id"],
                         item_type="PRODUCT", item_id=prod["id"]) == 25
    assert float((await _inventory_row(client, admin_headers, prod["id"]))["quantity"]) == 25


async def test_item_without_stock_gets_initial_quantity(client, admin_headers):
    await create_warehouse(client, admin_headers, "RAW_MATERIALS")
    mat = await create_material(client, admin_headers)
    row = await _inventory_row(client, admin_headers, mat["id"])
    assert row["item_type"] == "MATERIAL" and float(row["quantity"]) == 0

    r = await client.post("/stock/inventory", headers=admin_headers, json={
        "items": [{"item_type": "MATERIAL", "item_id": mat["id"],
                   "quantity": "12.5", "expected_quantity": "0"}],
    })
    assert r.status_code == 200, r.text
    assert float((await _inventory_row(client, admin_headers, mat["id"]))["quantity"]) == 12.5


async def test_changed_balance_is_rejected_without_moving_anything(client, admin_headers):
    wh = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    p1 = await create_product(client, admin_headers)
    p2 = await create_product(client, admin_headers)
    for p in (p1, p2):
        await adjust_stock(client, admin_headers, warehouse_id=wh["id"], item_type="PRODUCT",
                           item_id=p["id"], quantity=50, unit="roll")

    # p1 пользователь видел верно, p2 — устаревшим (50 → уже 40 после продажи).
    await adjust_stock(client, admin_headers, warehouse_id=wh["id"], item_type="PRODUCT",
                       item_id=p2["id"], quantity=10, unit="roll", direction="OUT")
    r = await client.post("/stock/inventory", headers=admin_headers, json={
        "items": [
            {"item_type": "PRODUCT", "item_id": p1["id"], "quantity": "60", "expected_quantity": "50"},
            {"item_type": "PRODUCT", "item_id": p2["id"], "quantity": "45", "expected_quantity": "50"},
        ],
    })
    assert r.status_code == 409, r.text
    assert p2["name"] in r.json()["detail"]
    # Ни одна позиция не проведена — даже p1, по которой расхождения не было.
    assert await balance(client, admin_headers, warehouse_id=wh["id"],
                         item_type="PRODUCT", item_id=p1["id"]) == 50


async def test_unchanged_and_invalid_lines(client, admin_headers):
    wh = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    prod = await create_product(client, admin_headers)
    await adjust_stock(client, admin_headers, warehouse_id=wh["id"], item_type="PRODUCT",
                       item_id=prod["id"], quantity=7, unit="roll")
    line = {"item_type": "PRODUCT", "item_id": prod["id"], "quantity": "7"}

    r = await client.post("/stock/inventory", headers=admin_headers, json={"items": [line]})
    assert r.status_code == 200, r.text
    assert r.json() == {"changes": [], "movements_created": 0}

    r = await client.post("/stock/inventory", headers=admin_headers, json={"items": [line, line]})
    assert r.status_code == 400, r.text

    r = await client.post("/stock/inventory", headers=admin_headers,
                          json={"items": [{**line, "quantity": "-1"}]})
    assert r.status_code == 422, r.text


async def test_inventory_is_super_admin_only(client, admin_headers):
    prod = await create_product(client, admin_headers)
    body = {"items": [{"item_type": "PRODUCT", "item_id": prod["id"], "quantity": "5"}]}

    for role in ("boss", "warehouse_manager"):
        user = await create_user(client, admin_headers, role)
        headers = auth(await get_token(client, user["email"], "temp12345"))
        assert (await client.get("/stock/inventory", headers=headers)).status_code == 403
        assert (await client.post("/stock/inventory", headers=headers, json=body)).status_code == 403

    # СА может выдать право точечно — тогда доступ появляется.
    boss = await create_user(client, admin_headers, "boss")
    r = await client.patch(f"/users/{boss['id']}/permissions", headers=admin_headers,
                           json={"permissions": {"stock.inventory": True}})
    assert r.status_code == 200, r.text
    headers = auth(await get_token(client, boss["email"], "temp12345"))
    assert (await client.get("/stock/inventory", headers=headers)).status_code == 200
