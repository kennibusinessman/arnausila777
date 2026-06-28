"""Аутентификация и доступ."""
from __future__ import annotations

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD


async def test_login_success(client):
    r = await client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    assert r.json()["access_token"]


async def test_login_wrong_password(client):
    r = await client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "nope"})
    assert r.status_code == 401


async def test_me_requires_auth(client):
    r = await client.get("/auth/me")
    assert r.status_code == 401


async def test_me_returns_current_user(client, admin_headers):
    r = await client.get("/auth/me", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL
    assert r.json()["role"] == "super_admin"
