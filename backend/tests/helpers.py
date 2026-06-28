"""Хелперы для тестов: создание сущностей (заказ сразу списывает остаток)."""
from __future__ import annotations

import uuid

from httpx import AsyncClient

_n = 0


def uniq(prefix: str = "") -> str:
    global _n
    _n += 1
    return f"{prefix}{_n}-{uuid.uuid4().hex[:6]}"


async def _post(client: AsyncClient, headers, path: str, body: dict) -> dict:
    r = await client.post(path, json=body, headers=headers)
    assert r.status_code in (200, 201), f"{path} -> {r.status_code}: {r.text}"
    return r.json()


async def create_warehouse(client, headers, wtype="FINISHED_GOODS") -> dict:
    return await _post(client, headers, "/warehouses", {"name": uniq("WH-"), "type": wtype})


async def create_product(client, headers, *, unit="roll", price=500) -> dict:
    return await _post(client, headers, "/products", {
        "name": uniq("P-"), "sku": uniq("SKU-"), "unit": unit, "default_price": price,
    })


async def create_material(client, headers, *, unit="kg") -> dict:
    return await _post(client, headers, "/materials", {
        "name": uniq("M-"), "sku": uniq("MSKU-"), "unit": unit,
    })


async def create_client_entity(client, headers, *, manager_id=None) -> dict:
    body = {"name": uniq("C-")}
    if manager_id is not None:
        body["manager_id"] = manager_id
    return await _post(client, headers, "/clients", body)


async def create_user(client, headers, role: str, *, password="temp12345") -> dict:
    return await _post(client, headers, "/users", {
        "full_name": uniq("U-"), "email": f"{uniq('u')}@ex.com",
        "role": role, "temp_password": password,
    })


async def adjust_stock(client, headers, *, warehouse_id, item_type, item_id, quantity, unit, direction="IN") -> dict:
    body = {
        "warehouse_id": warehouse_id, "item_type": item_type,
        "quantity": quantity, "unit": unit, "direction": direction,
    }
    body["product_id" if item_type == "PRODUCT" else "material_id"] = item_id
    return await _post(client, headers, "/stock/adjustments", body)


async def create_order(client, headers, *, client_id, items, deadline=None) -> dict:
    body = {"client_id": client_id, "items": items}
    if deadline is not None:
        body["deadline"] = deadline
    return await _post(client, headers, "/orders", body)


async def balance(client, headers, *, warehouse_id, item_type, item_id) -> float:
    key = "product_id" if item_type == "PRODUCT" else "material_id"
    r = await client.get(f"/stock/balances?warehouse_id={warehouse_id}&{key}={item_id}", headers=headers)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    return float(items[0]["quantity"]) if items else 0.0
