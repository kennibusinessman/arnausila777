"""Аудит-лог и ролевой доступ к отчётам."""
from __future__ import annotations

from conftest import auth, get_token
from helpers import (
    adjust_stock,
    create_client_entity,
    create_order,
    create_product,
    create_user,
    create_warehouse,
)


async def test_audit_records_order_creation(client, admin_headers):
    cli = await create_client_entity(client, admin_headers)
    prod = await create_product(client, admin_headers)
    wh = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    await adjust_stock(client, admin_headers, warehouse_id=wh["id"], item_type="PRODUCT",
                       item_id=prod["id"], quantity=10, unit="roll")
    await create_order(client, admin_headers, client_id=cli["id"],
                       items=[{"product_id": prod["id"], "quantity": 1}])

    r = await client.get("/audit-logs?action=CREATE_ORDER", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 1
    assert r.json()["items"][0]["entity_type"] == "Order"
    assert r.json()["items"][0]["user_name"] == "Test Admin"


async def test_audit_logs_admin_only(client, admin_headers):
    sam = await create_user(client, admin_headers, "sales_manager")
    sam_headers = auth(await get_token(client, sam["email"], "temp12345"))
    r = await client.get("/audit-logs", headers=sam_headers)
    assert r.status_code == 403


async def test_reports_rbac(client, admin_headers):
    wm = await create_user(client, admin_headers, "warehouse_manager")
    wm_headers = auth(await get_token(client, wm["email"], "temp12345"))

    # Склад WM доступен, dashboard — нет.
    assert (await client.get("/reports/stock", headers=wm_headers)).status_code == 200
    assert (await client.get("/reports/dashboard", headers=wm_headers)).status_code == 403

    sam = await create_user(client, admin_headers, "sales_manager")
    sam_headers = auth(await get_token(client, sam["email"], "temp12345"))
    assert (await client.get("/reports/production", headers=sam_headers)).status_code == 403
    # Долги менеджеру доступны.
    assert (await client.get("/reports/debts", headers=sam_headers)).status_code == 200
