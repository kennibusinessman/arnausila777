"""План производства простыней: задания с позициями, расход бабин по очереди,
сроки, «готово» / «отгружено», предложение свободного остатка, доступ только у СА."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from conftest import auth, get_token
from helpers import adjust_stock, create_client_entity, create_user, create_warehouse, uniq


async def _sheet(client, headers) -> dict:
    r = await client.post(
        "/products",
        json={"name": uniq("Простыня-"), "unit": "шт", "category": "Одноразовые простыни"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _bobbin(client, headers, *, norm, sheet_id) -> dict:
    r = await client.post(
        "/products",
        json={
            "name": uniq("Бабина-"),
            "unit": "шт",
            "category": "Спанбонд",
            "subcategory": "Бабины",
            "roll_norm": norm,
            "roll_product_id": sheet_id,
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _task(client, headers, items, **body) -> dict:
    """items — список (product_id, quantity)."""
    body["items"] = [{"product_id": pid, "quantity": qty} for pid, qty in items]
    r = await client.post("/production-plan/tasks", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _find(plan: dict, task_id: str) -> dict:
    return next(t for t in plan["tasks"] if t["id"] == task_id)


async def _stock(client, headers, wh, product, qty):
    await adjust_stock(
        client, headers, warehouse_id=wh["id"], item_type="PRODUCT",
        item_id=product["id"], quantity=qty, unit="шт",
    )


async def test_queue_consumes_bobbins_in_order(client, admin_headers):
    """Норма 2500 шт с бабины, на складе 5 бабин. Бабины целые: 12000 шт —
    5 бабин (лишние 500 шт останутся на складе), следующим 1000 шт нужна ещё
    1 бабина, а склад уже закончился."""
    wh = await create_warehouse(client, admin_headers)
    sheet = await _sheet(client, admin_headers)
    bobbin = await _bobbin(client, admin_headers, norm=2500, sheet_id=sheet["id"])
    await _stock(client, admin_headers, wh, bobbin, 5)

    await _task(client, admin_headers, [(sheet["id"], 12000)])
    plan = await _task(client, admin_headers, [(sheet["id"], 1000)])

    [first], [second] = (t["items"] for t in plan["tasks"])
    assert first["plan_bobbin_id"] == bobbin["id"]
    assert (first["bobbins_needed"], first["leftover_sheets"], first["bobbin_status"]) == (5, 500, "ok")
    assert (second["bobbins_needed"], second["leftover_sheets"]) == (1, 1500)
    assert (second["bobbin_status"], second["bobbins_short"]) == ("none", 1)

    [need] = plan["bobbins"]
    assert (need["needed"], need["shortage"], need["leftover_sheets"]) == (6, 1, 2000)
    u1, u2 = need["uses"]
    assert (u1["queue_no"], u1["sheets"], u1["needed"], u1["from_stock"], u1["short"]) == (1, 12000, 5, 5, 0)
    assert (u2["queue_no"], u2["sheets"], u2["needed"], u2["from_stock"], u2["short"]) == (2, 1000, 1, 0, 1)

    # 360 шт за смену, 2 смены в сутки: 12000 шт ≈ 33,33 смены ≈ 17 суток.
    assert float(first["shifts_needed"]) == 33.33
    today = date.today()
    assert first["eta"] == (today + timedelta(days=16)).isoformat()
    assert plan["tasks"][0]["eta"] == first["eta"]
    assert plan["total_remaining"] == 13000


async def test_one_task_many_items(client, admin_headers):
    """У клиента в одном задании несколько наименований; бабины и сроки
    считаются по позициям, у задания — итоги и срок последней позиции."""
    wh = await create_warehouse(client, admin_headers)
    a = await _sheet(client, admin_headers)
    b = await _sheet(client, admin_headers)
    bob_a = await _bobbin(client, admin_headers, norm=1000, sheet_id=a["id"])
    await _bobbin(client, admin_headers, norm=1000, sheet_id=b["id"])
    await _stock(client, admin_headers, wh, bob_a, 10)
    cust = await create_client_entity(client, admin_headers)

    plan = await _task(
        client, admin_headers, [(a["id"], 720), (b["id"], 720)], client_id=cust["id"],
        deadline=date.today().isoformat(),
    )
    [task] = plan["tasks"]
    assert task["client_name"] == cust["name"]
    assert task["quantity"] == 1440 and task["remaining"] == 1440
    first, second = task["items"]
    assert first["bobbin_status"] == "ok"
    assert second["bobbin_status"] == "none"  # бабин второго наименования нет
    # 720 шт в сутки: первая позиция — сегодня, вторая — завтра.
    assert first["eta"] == date.today().isoformat()
    assert task["eta"] == second["eta"] == (date.today() + timedelta(days=1)).isoformat()
    assert task["late"] is True


async def test_reorder_moves_bobbins_to_new_first(client, admin_headers):
    wh = await create_warehouse(client, admin_headers)
    sheet = await _sheet(client, admin_headers)
    bobbin = await _bobbin(client, admin_headers, norm=1000, sheet_id=sheet["id"])
    await _stock(client, admin_headers, wh, bobbin, 1)
    await _task(client, admin_headers, [(sheet["id"], 1000)])
    plan = await _task(client, admin_headers, [(sheet["id"], 500)])
    a, b = plan["tasks"]
    assert (a["items"][0]["bobbin_status"], b["items"][0]["bobbin_status"]) == ("ok", "none")

    r = await client.post(
        "/production-plan/reorder", json={"ids": [b["id"], a["id"]]}, headers=admin_headers
    )
    assert r.status_code == 200, r.text
    first, second = r.json()["tasks"][:2]
    assert first["id"] == b["id"] and first["items"][0]["bobbin_status"] == "ok"
    assert second["items"][0]["bobbin_status"] == "none"

    # Неполный список — очередь не трогаем.
    r = await client.post("/production-plan/reorder", json={"ids": [a["id"]]}, headers=admin_headers)
    assert r.status_code == 409


async def test_ready_and_partial_shipping(client, admin_headers):
    """Готово 60 из 100, отгружено 40 — видно частичную отгрузку; когда всё
    отгружено, задание закрывается само."""
    wh = await create_warehouse(client, admin_headers)
    sheet = await _sheet(client, admin_headers)
    await _stock(client, admin_headers, wh, sheet, 100)
    cust = await create_client_entity(client, admin_headers)
    plan = await _task(client, admin_headers, [(sheet["id"], 100)], client_id=cust["id"])
    task = plan["tasks"][0]
    tid, iid = task["id"], task["items"][0]["id"]
    base = f"/production-plan/tasks/{tid}/items/{iid}"

    # Отгрузить то, что не готово, нельзя.
    r = await client.post(f"{base}/ship", json={"quantity": 1}, headers=admin_headers)
    assert r.status_code == 400

    r = await client.post(f"{base}/ready", json={"quantity": 60}, headers=admin_headers)
    assert r.status_code == 200, r.text
    r = await client.post(f"{base}/ship", json={"quantity": 40}, headers=admin_headers)
    assert r.status_code == 200, r.text
    task = _find(r.json(), tid)
    item = task["items"][0]
    assert (item["ready"], item["shipped"], item["remaining"], item["awaiting_shipment"]) == (
        60, 40, 40, 20,
    )
    assert task["status"] == "IN_PROGRESS" and task["shipped"] == 40
    # Отложено под клиента только неотгруженное: 100 на складе − 20 = 80 свободно.
    [free] = [f for f in r.json()["free_stock"] if f["product_id"] == sheet["id"]]
    assert free["reserved"] == 20 and float(free["free"]) == 80

    r = await client.post(f"{base}/ship", json={"quantity": 21}, headers=admin_headers)
    assert r.status_code == 400  # готово к отгрузке только 20

    r = await client.post(f"{base}/ready", json={"quantity": 40}, headers=admin_headers)
    assert r.status_code == 200, r.text
    r = await client.post(f"{base}/ship", json={"quantity": 60}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert _find(r.json(), tid)["status"] == "DONE"

    # Закрытое задание больше не трогаем кнопками.
    r = await client.post(f"{base}/ready", json={"quantity": 1}, headers=admin_headers)
    assert r.status_code == 409


async def test_free_stock_offer(client, admin_headers):
    """На складе 34 готовые простыни — первая позиция получает предложение."""
    wh = await create_warehouse(client, admin_headers)
    sheet = await _sheet(client, admin_headers)
    await _bobbin(client, admin_headers, norm=2500, sheet_id=sheet["id"])
    await _stock(client, admin_headers, wh, sheet, 34)
    cust = await create_client_entity(client, admin_headers)
    first = await _task(client, admin_headers, [(sheet["id"], 20)], client_id=cust["id"])
    task_id = first["tasks"][0]["id"]
    item_id = first["tasks"][0]["items"][0]["id"]
    plan = await _task(client, admin_headers, [(sheet["id"], 100)])

    [offer] = plan["offers"]
    assert offer["task_id"] == task_id and offer["item_id"] == item_id
    assert offer["quantity"] == 20 and float(offer["free"]) == 34
    assert offer["client_id"] == cust["id"] and offer["client_name"] == cust["name"]

    r = await client.post(
        f"/production-plan/tasks/{task_id}/items/{item_id}/ready",
        json={"quantity": 20},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    plan = r.json()
    # Оставшиеся 14 свободных предлагаются следующему заданию.
    [offer] = plan["offers"]
    assert offer["task_id"] != task_id and offer["quantity"] == 14

    # Больше свободного отложить нельзя.
    r = await client.post(
        f"/production-plan/tasks/{offer['task_id']}/items/{offer['item_id']}/ready",
        json={"quantity": 15},
        headers=admin_headers,
    )
    assert r.status_code == 409


async def test_edit_items(client, admin_headers):
    wh = await create_warehouse(client, admin_headers)
    a = await _sheet(client, admin_headers)
    b = await _sheet(client, admin_headers)
    await _stock(client, admin_headers, wh, a, 10)
    plan = await _task(client, admin_headers, [(a["id"], 10)])
    task = plan["tasks"][0]
    item = task["items"][0]
    url = f"/production-plan/tasks/{task['id']}"

    # Добавили вторую позицию, первую оставили.
    r = await client.patch(
        url,
        json={"items": [
            {"id": item["id"], "product_id": a["id"], "quantity": 10},
            {"product_id": b["id"], "quantity": 5},
        ]},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    task = _find(r.json(), task["id"])
    assert [i["quantity"] for i in task["items"]] == [10, 5]
    assert task["items"][0]["id"] == item["id"]

    await client.post(f"{url}/items/{item['id']}/ready", json={"quantity": 3}, headers=admin_headers)
    # Позицию с готовыми штуками не убрать и не поменять наименование.
    r = await client.patch(
        url, json={"items": [{"product_id": b["id"], "quantity": 5}]}, headers=admin_headers
    )
    assert r.status_code == 409
    r = await client.patch(
        url,
        json={"items": [{"id": item["id"], "product_id": b["id"], "quantity": 10}]},
        headers=admin_headers,
    )
    assert r.status_code == 409
    # Ручная правка: отгружено больше готового — нельзя.
    r = await client.patch(
        url,
        json={"items": [{"id": item["id"], "product_id": a["id"], "quantity": 10, "shipped": 4}]},
        headers=admin_headers,
    )
    assert r.status_code == 400


async def test_validation(client, admin_headers):
    sheet = await _sheet(client, admin_headers)
    other = await _sheet(client, admin_headers)
    bobbin = await _bobbin(client, admin_headers, norm=100, sheet_id=other["id"])

    def body(**item):
        return {"items": [{"product_id": sheet["id"], "quantity": 10, **item}]}

    r = await client.post(
        "/production-plan/tasks", json=body(bobbin_id=bobbin["id"]), headers=admin_headers
    )
    assert r.status_code == 400  # бабина привязана к другому наименованию
    r = await client.post(
        "/production-plan/tasks",
        json={"items": [{"product_id": bobbin["id"], "quantity": 10}]},
        headers=admin_headers,
    )
    assert r.status_code == 400  # бабину в задание не ставят
    r = await client.post(
        "/production-plan/tasks",
        json={**body(), "client_id": str(uuid.uuid4())},
        headers=admin_headers,
    )
    assert r.status_code == 400  # такого клиента нет
    r = await client.post("/production-plan/tasks", json={"items": []}, headers=admin_headers)
    assert r.status_code == 422  # задание без позиций

    plan = await _task(client, admin_headers, [(sheet["id"], 10)])
    assert plan["tasks"][0]["items"][0]["bobbin_status"] == "no_norm"


async def test_only_super_admin(client, admin_headers):
    for role in ("boss", "warehouse_manager", "shift_master", "sales_manager"):
        user = await create_user(client, admin_headers, role)
        token = await get_token(client, user["email"], "temp12345")
        r = await client.get("/production-plan", headers=auth(token))
        assert r.status_code == 403, role
    r = await client.get("/production-plan", headers=admin_headers)
    assert r.status_code == 200


async def test_order_counts_as_shipment(client, admin_headers):
    """Заказ клиенту на простыню из его заданий сам засчитывается в план:
    по очереди, сверх плана — не засчитывается; удалили заказ — откатилось."""
    wh = await create_warehouse(client, admin_headers)
    r = await client.post(
        "/products",
        json={
            "name": uniq("Простыня-"), "unit": "шт", "category": "Одноразовые простыни",
            "base_weight": 0.1, "default_price": 50,
        },
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    sheet = r.json()
    await _stock(client, admin_headers, wh, sheet, 200)
    cust = await create_client_entity(client, admin_headers)
    other = await create_client_entity(client, admin_headers)

    first = (await _task(client, admin_headers, [(sheet["id"], 50)], client_id=cust["id"]))
    t1 = first["tasks"][0]["id"]
    plan = await _task(client, admin_headers, [(sheet["id"], 30)], client_id=cust["id"])
    t2 = next(t["id"] for t in plan["tasks"] if t["id"] != t1)

    # Заказ другому клиенту план не трогает.
    r = await client.post(
        "/orders",
        json={"client_id": other["id"], "items": [{"product_id": sheet["id"], "quantity": 5}]},
        headers=admin_headers,
    )
    assert r.status_code in (200, 201), r.text

    r = await client.post(
        "/orders",
        json={"client_id": cust["id"], "items": [{"product_id": sheet["id"], "quantity": 60}]},
        headers=admin_headers,
    )
    assert r.status_code in (200, 201), r.text
    order = r.json()

    plan = (await client.get("/production-plan", headers=admin_headers)).json()
    a, b = _find(plan, t1), _find(plan, t2)
    assert a["status"] == "DONE"  # 50 из 50 отгружено — закрылось само
    assert (a["items"][0]["shipped"], a["items"][0]["ready"]) == (50, 50)
    assert a["items"][0]["orders"][0]["order_number"] == order["order_number"]
    assert (b["items"][0]["shipped"], b["items"][0]["ready"]) == (10, 10)
    assert b["status"] == "IN_PROGRESS"

    # Заказ удалили — товар вернулся на склад, отгрузка в плане откатилась.
    r = await client.delete(f"/orders/{order['id']}", headers=admin_headers)
    assert r.status_code in (200, 204), r.text
    plan = (await client.get("/production-plan", headers=admin_headers)).json()
    a, b = _find(plan, t1), _find(plan, t2)
    assert a["status"] == "QUEUED"
    assert (a["items"][0]["shipped"], a["items"][0]["ready"], a["items"][0]["orders"]) == (0, 0, [])
    assert (b["items"][0]["shipped"], b["items"][0]["ready"]) == (0, 0)
    assert b["status"] == "QUEUED"


async def test_bobbin_color_from_name(client, admin_headers):
    sheet = await _sheet(client, admin_headers)
    r = await client.post(
        "/products",
        json={
            "name": uniq("Бабина 12гр голубая "), "unit": "шт", "category": "Спанбонд",
            "subcategory": "Бабины", "roll_norm": 100, "roll_product_id": sheet["id"],
        },
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    plan = await _task(client, admin_headers, [(sheet["id"], 150)])
    [need] = plan["bobbins"]
    assert need["color"] == "Голубой"
    assert (need["needed"], need["leftover_sheets"]) == (2, 50)


async def test_default_bobbin_is_most_popular(client, admin_headers):
    """У простыни две бабины. Бабины A на складе больше, но для этой простыни
    уже брали B — в новом задании без выбора бабины расчёт пойдёт по B."""
    wh = await create_warehouse(client, admin_headers)
    sheet = await _sheet(client, admin_headers)
    a = await _bobbin(client, admin_headers, norm=1000, sheet_id=sheet["id"])
    b = await _bobbin(client, admin_headers, norm=1000, sheet_id=sheet["id"])
    await _stock(client, admin_headers, wh, a, 10)
    await _stock(client, admin_headers, wh, b, 1)

    plan = await _task(client, admin_headers, [(sheet["id"], 500)])
    first = next(t for t in plan["tasks"] if t["status"] == "QUEUED")
    assert first["items"][0]["plan_bobbin_id"] == a["id"]  # истории нет — по остатку

    r = await client.post(
        "/production-plan/tasks",
        json={"items": [{"product_id": sheet["id"], "bobbin_id": b["id"], "quantity": 100}]},
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    plan = (await client.get("/production-plan", headers=admin_headers)).json()
    assert _find(plan, first["id"])["items"][0]["plan_bobbin_id"] == b["id"]

    opts = (await client.get("/production-plan/options", headers=admin_headers)).json()
    bobbins = {x["id"]: x for p in opts["products"] for x in p["bobbins"]}
    assert bobbins[b["id"]]["chosen"] == 1 and bobbins[a["id"]]["chosen"] == 0


async def test_comment_in_bobbin_uses(client, admin_headers):
    sheet = await _sheet(client, admin_headers)
    await _bobbin(client, admin_headers, norm=1000, sheet_id=sheet["id"])
    c = await create_client_entity(client, admin_headers)
    await _task(client, admin_headers, [(sheet["id"], 100)], client_id=c["id"], comment="Склад")
    plan = await _task(client, admin_headers, [(sheet["id"], 200)], client_id=c["id"], comment="Мегафарм")
    uses = plan["bobbins"][0]["uses"]
    assert [u["comment"] for u in uses] == ["Склад", "Мегафарм"]
