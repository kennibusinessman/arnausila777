"""Сменные отчёты: движение склада при approve и атомарный откат."""
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


async def _seed(client, headers):
    raw = await create_warehouse(client, headers, "RAW_MATERIALS")
    fin = await create_warehouse(client, headers, "FINISHED_GOODS")
    mat = await create_material(client, headers)
    prod = await create_product(client, headers)
    await adjust_stock(client, headers, warehouse_id=raw["id"], item_type="MATERIAL",
                       item_id=mat["id"], quantity=100, unit="kg")
    return raw, fin, mat, prod


async def _create_report(client, headers, mat, prod, *, used, out_qty, defect):
    r = await client.post("/shift-reports", json={
        "shift_date": "2026-03-15", "shift_type": "SHIFT_1",
        "outputs": [{"product_id": prod["id"], "quantity": out_qty, "defect_quantity": defect}],
        "materials": [{"material_id": mat["id"], "quantity_used": used}],
    }, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_approve_moves_stock(client, admin_headers):
    raw, fin, mat, prod = await _seed(client, admin_headers)
    rep = await _create_report(client, admin_headers, mat, prod, used=30, out_qty=10, defect=2)

    await client.post(f"/shift-reports/{rep['id']}/submit", headers=admin_headers)
    r = await client.post(f"/shift-reports/{rep['id']}/approve",
                          json={"raw_warehouse_id": raw["id"], "finished_warehouse_id": fin["id"]},
                          headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPROVED"

    assert await balance(client, admin_headers, warehouse_id=raw["id"], item_type="MATERIAL", item_id=mat["id"]) == 70.0
    # +10 PRODUCTION_IN, -2 DEFECT_OUT = 8
    assert await balance(client, admin_headers, warehouse_id=fin["id"], item_type="PRODUCT", item_id=prod["id"]) == 8.0


async def test_insufficient_material_rolls_back(client, admin_headers):
    raw, fin, mat, prod = await _seed(client, admin_headers)
    rep = await _create_report(client, admin_headers, mat, prod, used=1000, out_qty=5, defect=0)
    await client.post(f"/shift-reports/{rep['id']}/submit", headers=admin_headers)

    r = await client.post(f"/shift-reports/{rep['id']}/approve",
                          json={"raw_warehouse_id": raw["id"], "finished_warehouse_id": fin["id"]},
                          headers=admin_headers)
    assert r.status_code == 409
    # Склад не тронут: сырьё 100, продукции нет.
    assert await balance(client, admin_headers, warehouse_id=raw["id"], item_type="MATERIAL", item_id=mat["id"]) == 100.0
    assert await balance(client, admin_headers, warehouse_id=fin["id"], item_type="PRODUCT", item_id=prod["id"]) == 0.0


async def _approve(client, headers, rep, raw, fin):
    await client.post(f"/shift-reports/{rep['id']}/submit", headers=headers)
    r = await client.post(f"/shift-reports/{rep['id']}/approve",
                          json={"raw_warehouse_id": raw["id"], "finished_warehouse_id": fin["id"]},
                          headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def test_super_admin_delete_approved_reverses_stock(client, admin_headers):
    raw, fin, mat, prod = await _seed(client, admin_headers)
    rep = await _create_report(client, admin_headers, mat, prod, used=30, out_qty=10, defect=2)
    await _approve(client, admin_headers, rep, raw, fin)
    # После утверждения: сырьё 70, продукция 8 (+10 выпуск, −2 брак).
    assert await balance(client, admin_headers, warehouse_id=raw["id"], item_type="MATERIAL", item_id=mat["id"]) == 70.0
    assert await balance(client, admin_headers, warehouse_id=fin["id"], item_type="PRODUCT", item_id=prod["id"]) == 8.0

    r = await client.delete(f"/shift-reports/{rep['id']}", headers=admin_headers)
    assert r.status_code == 200, r.text
    # Смена удалена — движения откатились: сырьё вернулось (100), выпуск/брак сняты (0).
    assert await balance(client, admin_headers, warehouse_id=raw["id"], item_type="MATERIAL", item_id=mat["id"]) == 100.0
    assert await balance(client, admin_headers, warehouse_id=fin["id"], item_type="PRODUCT", item_id=prod["id"]) == 0.0
    assert (await client.get(f"/shift-reports/{rep['id']}", headers=admin_headers)).status_code == 404


async def test_boss_cannot_delete_approved_shift(client, admin_headers):
    raw, fin, mat, prod = await _seed(client, admin_headers)
    rep = await _create_report(client, admin_headers, mat, prod, used=30, out_qty=10, defect=2)
    await _approve(client, admin_headers, rep, raw, fin)

    boss = await create_user(client, admin_headers, "boss")
    boss_headers = auth(await get_token(client, boss["email"], "temp12345"))

    r = await client.delete(f"/shift-reports/{rep['id']}", headers=boss_headers)
    assert r.status_code == 403, r.text
    # Склад не тронут, смена на месте.
    assert await balance(client, admin_headers, warehouse_id=raw["id"], item_type="MATERIAL", item_id=mat["id"]) == 70.0
    assert await balance(client, admin_headers, warehouse_id=fin["id"], item_type="PRODUCT", item_id=prod["id"]) == 8.0
    assert (await client.get(f"/shift-reports/{rep['id']}", headers=admin_headers)).status_code == 200
