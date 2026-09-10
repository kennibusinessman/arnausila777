"""Норма выхода рулонов с бабины и отчёт по бабинам за период.

Главный сценарий — бабина, перешедшая на следующую смену: смену 1 её взяли и
накрутили часть рулонов, смена 2 ничего не брала, но доработала остаток. Внутри
смены расход и выпуск сходиться не обязаны, поэтому отклонение от нормы
считается накопительно за период. В детализации видны обе смены: та, что брала
бабину, и та, что доработала её остаток (помечена как «перешла»).
"""
from __future__ import annotations

from conftest import auth, get_token
from helpers import adjust_stock, create_user, create_warehouse, uniq

PERIOD = {"date_from": "2026-03-01", "date_to": "2026-03-31"}
SHIFT_DATE = "2026-03-15"


async def _create_roll(client, headers) -> dict:
    """Готовая продукция — рулоны, которые крутят из бабины."""
    r = await client.post(
        "/products",
        json={
            "name": uniq("Рулон-"),
            "sku": uniq("R-"),
            "unit": "шт",
            "category": "Одноразовые простыни",
            "base_weight": "1.5",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_bobbin(client, headers, *, norm=None, roll_id=None) -> dict:
    body = {
        "name": uniq("Бабина-"),
        "sku": uniq("B-"),
        "unit": "шт",
        "category": "Спанбонд",
        "subcategory": "Бабины",
        "base_weight": "40",
    }
    if norm is not None:
        body["roll_norm"] = norm
    if roll_id is not None:
        body["roll_product_id"] = roll_id
    return await client.post("/products", json=body, headers=headers)


async def _approve(client, headers, report_id, finished_wh) -> None:
    r = await client.post(f"/shift-reports/{report_id}/submit", headers=headers)
    assert r.status_code == 200, r.text
    r = await client.post(
        f"/shift-reports/{report_id}/approve",
        json={"finished_warehouse_id": finished_wh},
        headers=headers,
    )
    assert r.status_code == 200, r.text


async def _shift(client, headers, *, shift_type, materials, outputs) -> dict:
    r = await client.post(
        "/shift-reports",
        json={
            "shift_date": SHIFT_DATE,
            "shift_type": shift_type,
            "materials": materials,
            "outputs": outputs,
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_bobbin_carries_over_to_next_shift(client, admin_headers):
    """Смена 1 взяла 2 бабины и дала 12 рулонов, смена 2 — ещё 6 с той же бабины."""
    fin = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    roll = await _create_roll(client, admin_headers)
    r = await _create_bobbin(client, admin_headers, norm=10, roll_id=roll["id"])
    assert r.status_code == 201, r.text
    bobbin = r.json()
    assert bobbin["roll_norm"] == 10
    assert bobbin["roll_product_id"] == roll["id"]

    await adjust_stock(
        client, admin_headers, warehouse_id=fin["id"], item_type="PRODUCT",
        item_id=bobbin["id"], quantity=10, unit="шт",
    )

    first = await _shift(
        client, admin_headers, shift_type="SHIFT_1",
        materials=[{"product_id": bobbin["id"], "quantity_used": 2}],
        outputs=[{"product_id": roll["id"], "quantity": 12}],
    )
    await _approve(client, admin_headers, first["id"], fin["id"])

    # Вторая смена бабину не брала — она осталась на машине с прошлой смены.
    second = await _shift(
        client, admin_headers, shift_type="SHIFT_2",
        materials=[],
        outputs=[{"product_id": roll["id"], "quantity": 6}],
    )
    await _approve(client, admin_headers, second["id"], fin["id"])

    # Неутверждённая смена в отчёт попадать не должна.
    await _shift(
        client, admin_headers, shift_type="SHIFT_1",
        materials=[{"product_id": bobbin["id"], "quantity_used": 5}],
        outputs=[{"product_id": roll["id"], "quantity": 50}],
    )

    r = await client.get("/reports/bobbins", params=PERIOD, headers=admin_headers)
    assert r.status_code == 200, r.text
    rows = [x for x in r.json() if x["bobbin_id"] == bobbin["id"]]
    assert len(rows) == 1
    row = rows[0]
    assert float(row["taken"]) == 2
    assert float(row["expected_rolls"]) == 20      # 2 бабины × норма 10
    assert float(row["produced_rolls"]) == 18      # 12 в первую смену + 6 во вторую
    assert float(row["diff_units"]) == -2
    assert row["roll_product_name"] == roll["name"]

    # Детализация: обе смены. Первая бабину брала, вторая — нет (бабина перешла
    # на неё), и такая строка помечена carried_over, но дату, смену и мастера
    # показывает так же: видно, где брали и когда крутили.
    r = await client.get(
        f"/reports/bobbins/{bobbin['id']}/shifts", params=PERIOD, headers=admin_headers
    )
    assert r.status_code == 200, r.text
    detail = r.json()
    assert len(detail) == 2
    by_shift = {row["shift_type"]: row for row in detail}
    assert float(by_shift["SHIFT_1"]["taken"]) == 2
    assert float(by_shift["SHIFT_1"]["produced_rolls"]) == 12
    assert by_shift["SHIFT_1"]["carried_over"] is False
    assert float(by_shift["SHIFT_2"]["taken"]) == 0
    assert float(by_shift["SHIFT_2"]["produced_rolls"]) == 6
    assert by_shift["SHIFT_2"]["carried_over"] is True
    assert by_shift["SHIFT_1"]["master_name"] and by_shift["SHIFT_2"]["master_name"]


async def test_bobbin_without_norm_has_no_expectation(client, admin_headers):
    """Норма — ориентир: без неё бабина в отчёте есть, а ожидания нет."""
    fin = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    r = await _create_bobbin(client, admin_headers)
    assert r.status_code == 201, r.text
    bobbin = r.json()
    assert bobbin["roll_norm"] is None

    await adjust_stock(
        client, admin_headers, warehouse_id=fin["id"], item_type="PRODUCT",
        item_id=bobbin["id"], quantity=5, unit="шт",
    )
    report = await _shift(
        client, admin_headers, shift_type="SHIFT_1",
        materials=[{"product_id": bobbin["id"], "quantity_used": 1}],
        outputs=[],
    )
    await _approve(client, admin_headers, report["id"], fin["id"])

    r = await client.get("/reports/bobbins", params=PERIOD, headers=admin_headers)
    row = next(x for x in r.json() if x["bobbin_id"] == bobbin["id"])
    assert float(row["taken"]) == 1
    assert row["expected_rolls"] is None
    assert row["diff_units"] is None
    assert float(row["produced_rolls"]) == 0


async def test_only_super_admin_sets_norm(client, admin_headers):
    """Руководитель правит карточку, но норму выхода не задаёт."""
    roll = await _create_roll(client, admin_headers)
    r = await _create_bobbin(client, admin_headers)
    bobbin = r.json()

    boss = await create_user(client, admin_headers, "BOSS")
    boss_headers = auth(await get_token(client, boss["email"], "temp12345"))

    r = await client.patch(
        f"/products/{bobbin['id']}", json={"roll_norm": 12}, headers=boss_headers
    )
    assert r.status_code == 403, r.text
    # Сброс нормы — тоже правка, и тоже под правом.
    r = await client.patch(
        f"/products/{bobbin['id']}", json={"roll_norm": None}, headers=boss_headers
    )
    assert r.status_code == 403, r.text
    # Обычная правка карточки руководителю доступна.
    r = await client.patch(
        f"/products/{bobbin['id']}", json={"min_stock": "3"}, headers=boss_headers
    )
    assert r.status_code == 200, r.text

    r = await client.patch(
        f"/products/{bobbin['id']}",
        json={"roll_norm": 12, "roll_product_id": roll["id"]},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["roll_norm"] == 12


async def test_norm_only_for_bobbins(client, admin_headers):
    """У обычного товара нормы выхода нет — поле принимается только у бабин."""
    roll = await _create_roll(client, admin_headers)
    r = await client.patch(
        f"/products/{roll['id']}", json={"roll_norm": 5}, headers=admin_headers
    )
    assert r.status_code == 400, r.text


async def test_product_can_be_shared_by_several_bobbins(client, admin_headers):
    """Одно наименование крутят с двух бабин: выпуск делится, итог не задваивается.

    Смена 1 берёт бабину А и даёт 12 рулонов, смена 2 берёт бабину Б и даёт 18.
    Выпуск наименования внутри смены достаётся тем бабинам, которые в эту смену
    брали, поэтому 12 уходят А, 18 — Б, а сумма по строкам равна выпуску за период.
    """
    fin = await create_warehouse(client, admin_headers, "FINISHED_GOODS")
    roll = await _create_roll(client, admin_headers)
    a = (await _create_bobbin(client, admin_headers, norm=10, roll_id=roll["id"])).json()
    r = await _create_bobbin(client, admin_headers, norm=5, roll_id=roll["id"])
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["roll_product_id"] == roll["id"]

    for bobbin in (a, b):
        await adjust_stock(
            client, admin_headers, warehouse_id=fin["id"], item_type="PRODUCT",
            item_id=bobbin["id"], quantity=10, unit="шт",
        )

    first = await _shift(
        client, admin_headers, shift_type="SHIFT_1",
        materials=[{"product_id": a["id"], "quantity_used": 2}],
        outputs=[{"product_id": roll["id"], "quantity": 12}],
    )
    await _approve(client, admin_headers, first["id"], fin["id"])
    second = await _shift(
        client, admin_headers, shift_type="SHIFT_2",
        materials=[{"product_id": b["id"], "quantity_used": 2}],
        outputs=[{"product_id": roll["id"], "quantity": 18}],
    )
    await _approve(client, admin_headers, second["id"], fin["id"])

    r = await client.get("/reports/bobbins", params=PERIOD, headers=admin_headers)
    rows = {x["bobbin_id"]: x for x in r.json()}
    assert float(rows[a["id"]]["produced_rolls"]) == 12
    assert float(rows[b["id"]]["produced_rolls"]) == 18
    assert rows[a["id"]]["shared_with"] == 2
    assert rows[b["id"]]["shared_with"] == 2
    # Итог по строкам равен выпуску за период — задвоения нет.
    assert float(rows[a["id"]]["produced_rolls"]) + float(rows[b["id"]]["produced_rolls"]) == 30

    # В детализации бабины А только та смена, в которую её брали.
    r = await client.get(
        f"/reports/bobbins/{a['id']}/shifts", params=PERIOD, headers=admin_headers
    )
    detail = r.json()
    assert len(detail) == 1
    assert detail[0]["shift_type"] == "SHIFT_1"
    assert detail[0]["carried_over"] is False
    assert float(detail[0]["produced_rolls"]) == 12
