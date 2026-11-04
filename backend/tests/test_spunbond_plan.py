"""План спанбонда: своя очередь, расход полипропилена по очереди, сроки по кг,
общий план по цветам с бабинами для простыней (без двойного счёта)."""
from __future__ import annotations

from helpers import adjust_stock, create_client_entity, create_warehouse, uniq


async def _product(client, headers, name, *, unit, sub="Спанбонд", weight=None, **extra) -> dict:
    body = {"name": uniq(name), "unit": unit, "category": "Спанбонд", "subcategory": sub, **extra}
    if weight is not None:
        body["base_weight"] = weight
    r = await client.post("/products", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _pp(client, headers, qty):
    r = await client.post(
        "/materials", json={"name": uniq("Полипропилен "), "unit": "кг"}, headers=headers
    )
    assert r.status_code == 201, r.text
    wh = await create_warehouse(client, headers, "RAW_MATERIALS")
    await adjust_stock(
        client, headers, warehouse_id=wh["id"], item_type="MATERIAL",
        item_id=r.json()["id"], quantity=qty, unit="кг",
    )


async def _task(client, headers, items, kind="SPUNBOND", **body) -> dict:
    body["kind"] = kind
    body["items"] = [{"product_id": pid, "quantity": qty} for pid, qty in items]
    r = await client.post("/production-plan/tasks", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _plan(client, headers) -> dict:
    r = await client.get("/production-plan/spunbond", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def test_raw_material_and_eta_by_queue(client, admin_headers):
    """ПП на складе 600 кг. №1: 500 кг белого (в кг) — хватает; №2: 10 рулонов
    голубого по 28.8 кг = 288 кг — со склада только 100, не хватит 188."""
    await _pp(client, admin_headers, 600)
    white = await _product(client, admin_headers, "60гр белый ", unit="кг")
    blue = await _product(client, admin_headers, "40гр голубой ", unit="шт", weight=28.8)
    c = await create_client_entity(client, admin_headers)
    await _task(client, admin_headers, [(white["id"], 500)], client_id=c["id"])
    await _task(client, admin_headers, [(blue["id"], 10)])

    plan = await _plan(client, admin_headers)
    a, b = [t for t in plan["tasks"] if t["status"] == "QUEUED"]
    assert a["kind"] == "SPUNBOND"
    i1, i2 = a["items"][0], b["items"][0]
    assert (i1["kg_needed"], i1["raw_status"], i1["color"]) == ("500.00", "ok", "Белый")
    assert (i2["kg_needed"], i2["raw_status"], i2["raw_short_kg"]) == ("288.00", "partial", "188.00")
    assert plan["queue_kg"] == "788.00"
    assert plan["raw_short"] == "188.00"
    # 1000 кг/смену × 2 смены: всё укладывается в сегодня.
    assert plan["total_shifts"] == "0.79"
    assert i1["eta"] == i2["eta"] == plan["finish_date"]

    colors = {c["color"]: c for c in plan["colors"]}
    assert colors["Белый"]["queue_kg"] == "500.00"
    assert colors["Белый"]["entries"][0]["client_name"] == c["name"]
    assert colors["Голубой"]["entries"][0]["quantity"] == 10


async def test_no_weight_and_own_queue(client, admin_headers):
    """Товар в штуках без веса — сырьё не посчитать. Очередь спанбонда не видна
    в плане простыней, а простыню в спанбонд поставить нельзя."""
    roll = await _product(client, admin_headers, "Рулон серый ", unit="шт")
    await _task(client, admin_headers, [(roll["id"], 3)])
    plan = await _plan(client, admin_headers)
    t = plan["tasks"][0]
    assert plan["tasks"][0]["items"][0]["raw_status"] == "no_weight"
    assert plan["no_weight"] == 1

    sheets = (await client.get("/production-plan", headers=admin_headers)).json()
    assert sheets["tasks"] == []

    r = await client.post(
        "/products", json={"name": uniq("Простыня-"), "unit": "шт"}, headers=admin_headers
    )
    sheet = r.json()
    r = await client.post(
        "/production-plan/tasks",
        json={"kind": "SPUNBOND", "items": [{"product_id": sheet["id"], "quantity": 1}]},
        headers=admin_headers,
    )
    assert r.status_code == 400


async def test_reorder_is_per_line(client, admin_headers):
    p = await _product(client, admin_headers, "Белый ", unit="кг")
    await _task(client, admin_headers, [(p["id"], 10)])
    await _task(client, admin_headers, [(p["id"], 20)])
    a, b = (await _plan(client, admin_headers))["tasks"]
    r = await client.post(
        "/production-plan/spunbond/reorder", json={"ids": [b["id"], a["id"]]}, headers=admin_headers
    )
    assert r.status_code == 200, r.text
    order = [t["id"] for t in r.json()["tasks"]]
    assert order[:2] == [b["id"], a["id"]]


async def test_color_plan_includes_bobbins_for_sheets(client, admin_headers):
    """Простыням клиента не хватает 3 бабин голубого (по 116 кг). В общий план по
    цветам они попадают с клиентом; после того как 1 бабину поставили в очередь
    спанбонда, из «для простыней» остаются 2."""
    r = await client.post(
        "/products",
        json={"name": uniq("Простыня голубая-"), "unit": "шт", "category": "Одноразовые простыни"},
        headers=admin_headers,
    )
    sheet = r.json()
    bobbin = await _product(
        client, admin_headers, "Бабина голубая ", unit="шт", sub="Бабины", weight=116,
        roll_norm=1000, roll_product_id=sheet["id"],
    )
    c = await create_client_entity(client, admin_headers)
    await _task(client, admin_headers, [(sheet["id"], 3000)], kind="SHEETS", client_id=c["id"])

    plan = await _plan(client, admin_headers)
    blue = next(x for x in plan["colors"] if x["color"] == "Голубой")
    e = blue["entries"][0]
    assert (e["source"], e["quantity"], e["kg"], e["client_name"]) == ("sheets", 3, "348.00", c["name"])
    assert e["for_product"] == sheet["name"]
    assert plan["sheets_kg"] == "348.00"

    await _task(client, admin_headers, [(bobbin["id"], 1)])
    plan = await _plan(client, admin_headers)
    blue = next(x for x in plan["colors"] if x["color"] == "Голубой")
    by_source = {e["source"]: e for e in blue["entries"]}
    assert by_source["queue"]["quantity"] == 1
    assert by_source["sheets"]["quantity"] == 2
    assert blue["kg"] == "348.00"


async def test_spunbond_settings(client, admin_headers):
    r = await client.put(
        "/production-plan/spunbond/settings",
        json={"kg_per_shift": 400, "shifts_per_day": 1},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["settings"] == {"kg_per_shift": 400, "shifts_per_day": 1}
    # Выработка простыней не тронута.
    sheets = (await client.get("/production-plan", headers=admin_headers)).json()
    assert sheets["settings"]["sheets_per_shift"] > 0
