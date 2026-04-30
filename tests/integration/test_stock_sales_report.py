from datetime import datetime, timezone

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_stock_adjust_sets_default_reason(auth_client: AsyncClient):
    sku = f"TEST-STOCK-{int(datetime.now(timezone.utc).timestamp())}"
    create_resp = await auth_client.post(
        "/api/v1/assets/products",
        json={
            "name": "Test Product",
            "sku": sku,
            "category": "tests",
            "unit": "pcs",
            "price": 10,
            "stock_quantity": 10,
            "is_rentable": False,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    product_id = create_resp.json()["id"]

    adjust_resp = await auth_client.post(
        f"/api/v1/assets/products/{product_id}/adjust",
        json={"delta_qty": -2},
    )
    assert adjust_resp.status_code == 201, adjust_resp.text
    movement = adjust_resp.json()
    assert movement["reason"] == "Продажа"
    assert movement["delta_qty"] == -2


@pytest.mark.asyncio
async def test_daily_sales_report_includes_reason_and_search(auth_client: AsyncClient):
    ts = int(datetime.now(timezone.utc).timestamp())
    sku = f"TEST-SALES-{ts}"
    create_resp = await auth_client.post(
        "/api/v1/assets/products",
        json={
            "name": "Searchable Product",
            "sku": sku,
            "category": "tests",
            "unit": "pcs",
            "price": 12.5,
            "stock_quantity": 20,
            "is_rentable": False,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    product_id = create_resp.json()["id"]

    adjust_resp = await auth_client.post(
        f"/api/v1/assets/products/{product_id}/adjust",
        json={"delta_qty": -4},
    )
    assert adjust_resp.status_code == 201, adjust_resp.text

    day = datetime.now(timezone.utc).date().isoformat()
    report_resp = await auth_client.get(f"/api/v1/assets/products/sales-daily?day={day}&search={sku}")
    assert report_resp.status_code == 200, report_resp.text
    rows = report_resp.json()
    assert len(rows) >= 1

    row = next((r for r in rows if r["sku"] == sku), None)
    assert row is not None
    assert row["reason"] == "Продажа"
    assert row["sold_qty"] >= 4
    assert row["estimated_amount"] >= 50.0

