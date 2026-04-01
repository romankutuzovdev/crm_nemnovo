import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    response = await client.post("/api/v1/auth/login", json={
        "email": "notexist@example.com",
        "password": "wrongpassword",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_lead_requires_auth(client: AsyncClient):
    # Без токена/пользователя endpoints с require_permission должны отдавать 403/401
    # (зависит от порядка: сначала auth, затем RBAC)
    response = await client.get("/api/v1/leads/00000000-0000-0000-0000-000000000000")
    assert response.status_code in (401, 403)
