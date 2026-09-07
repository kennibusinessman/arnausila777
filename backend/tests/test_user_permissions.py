"""Индивидуальные права поверх роли: выдача, снятие, границы доступа."""
from __future__ import annotations

from conftest import auth, get_token
from helpers import create_user


async def _login(client, user) -> dict[str, str]:
    return auth(await get_token(client, user["email"], "temp12345"))


async def test_defaults_are_role_permissions(client, admin_headers):
    wm = await create_user(client, admin_headers, "warehouse_manager")
    assert wm["permissions"] == {}
    assert "stock.view" in wm["effective_permissions"]
    assert "expenses.view" not in wm["effective_permissions"]


async def test_grant_and_revoke_permission(client, admin_headers):
    wm = await create_user(client, admin_headers, "warehouse_manager")
    wm_headers = await _login(client, wm)

    assert (await client.get("/stock/balances", headers=wm_headers)).status_code == 200
    assert (await client.get("/expenses", headers=wm_headers)).status_code == 403

    r = await client.patch(
        f"/users/{wm['id']}/permissions",
        headers=admin_headers,
        json={"permissions": {"expenses.view": True, "stock.view": False}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["permissions"] == {"expenses.view": True, "stock.view": False}
    assert "expenses.view" in r.json()["effective_permissions"]
    assert "stock.view" not in r.json()["effective_permissions"]

    # Права читаются из БД на каждый запрос — прежний токен уже работает по-новому.
    assert (await client.get("/expenses", headers=wm_headers)).status_code == 200
    assert (await client.get("/stock/balances", headers=wm_headers)).status_code == 403

    # Пустой словарь возвращает пользователя к правам роли.
    r = await client.patch(
        f"/users/{wm['id']}/permissions", headers=admin_headers, json={"permissions": {}}
    )
    assert r.status_code == 200, r.text
    assert r.json()["permissions"] == {}
    assert (await client.get("/stock/balances", headers=wm_headers)).status_code == 200
    assert (await client.get("/expenses", headers=wm_headers)).status_code == 403


async def test_permissions_editable_by_super_admin_only(client, admin_headers):
    boss = await create_user(client, admin_headers, "boss")
    boss_headers = await _login(client, boss)
    target = await create_user(client, admin_headers, "sales_manager")

    r = await client.patch(
        f"/users/{target['id']}/permissions",
        headers=boss_headers,
        json={"permissions": {"stock.view": True}},
    )
    assert r.status_code == 403, r.text


async def test_super_admin_permissions_are_immutable(client, admin_headers):
    me = (await client.get("/auth/me", headers=admin_headers)).json()
    r = await client.patch(
        f"/users/{me['id']}/permissions",
        headers=admin_headers,
        json={"permissions": {"orders.view": False}},
    )
    assert r.status_code == 403, r.text


async def test_unknown_permission_rejected(client, admin_headers):
    sam = await create_user(client, admin_headers, "sales_manager")
    r = await client.patch(
        f"/users/{sam['id']}/permissions",
        headers=admin_headers,
        json={"permissions": {"nope.nope": True}},
    )
    assert r.status_code == 422, r.text


async def test_catalog_covers_every_permission(client, admin_headers):
    from app.core.access import Permission

    r = await client.get("/users/permissions/catalog", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    keys = {item["key"] for group in body["groups"] for item in group["items"]}
    assert keys == {p.value for p in Permission}
    assert set(body["role_defaults"]["super_admin"]) == keys
