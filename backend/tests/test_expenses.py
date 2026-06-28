"""Расходы: запись по факту — без согласования, items и payment_method."""
from __future__ import annotations

from conftest import auth, get_token
from helpers import create_user


async def _category(client, headers, *, type_="OPERATING") -> dict:
    r = await client.post(
        "/expense-categories", json={"name": "cat", "type": type_}, headers=headers
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _expense(client, headers, *, category_id, name="Аренда цеха", amount=1000, **extra) -> dict:
    body = {
        "name": name, "expense_date": "2026-06-25", "category_id": category_id, "amount": amount,
        **extra,
    }
    r = await client.post("/expenses", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_expense_defaults_responsible_to_creator(client, admin_headers):
    cat = await _category(client, admin_headers)
    exp = await _expense(client, admin_headers, category_id=cat["id"], amount=1500)
    assert exp["name"] == "Аренда цеха"
    assert float(exp["amount"]) == 1500.0
    assert exp["responsible_id"] is not None
    assert exp["creator"]["full_name"] == "Test Admin"
    assert exp["responsible"]["full_name"] == "Test Admin"


async def test_create_expense_with_explicit_responsible(client, admin_headers):
    cat = await _category(client, admin_headers)
    boss = await create_user(client, admin_headers, "boss")
    exp = await _expense(client, admin_headers, category_id=cat["id"], responsible_id=boss["id"])
    assert exp["responsible_id"] == boss["id"]


async def test_list_filters_by_category_and_search(client, admin_headers):
    cat_a = await _category(client, admin_headers, type_="OPERATING")
    cat_b = await _category(client, admin_headers, type_="PAYROLL")
    await _expense(client, admin_headers, category_id=cat_a["id"], name="Канцтовары")
    await _expense(client, admin_headers, category_id=cat_b["id"], name="Зарплата офиса")

    by_cat = await client.get(f"/expenses?category_id={cat_b['id']}", headers=admin_headers)
    assert by_cat.json()["total"] == 1
    assert by_cat.json()["items"][0]["name"] == "Зарплата офиса"

    by_search = await client.get("/expenses?search=канц", headers=admin_headers)
    assert by_search.json()["total"] == 1
    assert by_search.json()["items"][0]["name"] == "Канцтовары"


async def test_summary_aggregates_match_filters(client, admin_headers):
    cat_a = await _category(client, admin_headers, type_="OPERATING")
    cat_b = await _category(client, admin_headers, type_="PAYROLL")
    await _expense(client, admin_headers, category_id=cat_a["id"], amount=1000)
    await _expense(client, admin_headers, category_id=cat_b["id"], amount=2500)

    r = await client.get("/expenses/summary", headers=admin_headers)
    assert r.status_code == 200
    summary = r.json()
    assert summary["count"] == 2
    assert float(summary["total_amount"]) == 3500.0
    assert summary["category_count"] == 2


async def test_update_and_delete_expense(client, admin_headers):
    cat = await _category(client, admin_headers)
    exp = await _expense(client, admin_headers, category_id=cat["id"], amount=100)

    upd = await client.patch(f"/expenses/{exp['id']}", json={"amount": 200, "name": "Обновлено"}, headers=admin_headers)
    assert upd.status_code == 200
    assert float(upd.json()["amount"]) == 200.0
    assert upd.json()["name"] == "Обновлено"

    deleted = await client.delete(f"/expenses/{exp['id']}", headers=admin_headers)
    assert deleted.status_code == 200
    after = await client.get(f"/expenses/{exp['id']}", headers=admin_headers)
    assert after.status_code == 404


async def test_only_super_admin_can_delete(client, admin_headers):
    cat = await _category(client, admin_headers)
    exp = await _expense(client, admin_headers, category_id=cat["id"])

    boss = await create_user(client, admin_headers, "boss")
    boss_headers = auth(await get_token(client, boss["email"], "temp12345"))

    r = await client.delete(f"/expenses/{exp['id']}", headers=boss_headers)
    assert r.status_code == 403
