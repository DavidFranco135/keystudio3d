from fastapi.testclient import TestClient

from tests.api.conftest import auth_headers, register_user


def _setup(client: TestClient) -> tuple[str, dict]:
    owner = register_user(client, organization_name="Atelie 3D", email="owner@atelie.io")
    headers = auth_headers(owner["access_token"])
    org_id = client.get("/api/v1/organizations", headers=headers).json()[0]["id"]
    return f"/api/v1/organizations/{org_id}/products", headers


def test_manual_price_can_be_changed(client: TestClient):
    url, headers = _setup(client)
    product = client.post(
        url, json={"name": "Chaveiro", "manual_price": 5, "materials": []}, headers=headers
    ).json()

    response = client.patch(f"{url}/{product['id']}", json={"manual_price": 18.9}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["manual_price"] == 18.9


def test_explicit_null_clears_manual_price_and_stock(client: TestClient):
    url, headers = _setup(client)
    product = client.post(
        url,
        json={"name": "Chaveiro", "manual_price": 5, "stock_quantity": 3, "materials": []},
        headers=headers,
    ).json()

    response = client.patch(
        f"{url}/{product['id']}",
        json={"manual_price": None, "stock_quantity": None},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["manual_price"] is None
    assert response.json()["stock_quantity"] is None


def test_fields_left_out_of_the_body_are_kept(client: TestClient):
    url, headers = _setup(client)
    product = client.post(
        url,
        json={"name": "Chaveiro", "manual_price": 5, "stock_quantity": 3, "materials": []},
        headers=headers,
    ).json()

    response = client.patch(
        f"{url}/{product['id']}", json={"photo_urls": ["https://example.com/a.jpg"]}, headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["manual_price"] == 5
    assert response.json()["stock_quantity"] == 3


def test_product_list_returns_each_products_own_materials(client: TestClient):
    url, headers = _setup(client)
    org_url = url.rsplit("/products", 1)[0]
    pla = client.post(
        f"{org_url}/materials", json={"name": "PLA", "type": "filament", "cost_per_kg": 100}, headers=headers
    ).json()
    petg = client.post(
        f"{org_url}/materials", json={"name": "PETG", "type": "filament", "cost_per_kg": 120}, headers=headers
    ).json()
    client.post(url, json={"name": "Vaso", "materials": [{"material_id": pla["id"], "quantity_g": 50}]}, headers=headers)
    client.post(
        url,
        json={
            "name": "Luminaria",
            "materials": [
                {"material_id": pla["id"], "quantity_g": 10},
                {"material_id": petg["id"], "quantity_g": 30},
            ],
        },
        headers=headers,
    )
    client.post(url, json={"name": "Chaveiro", "manual_price": 5, "materials": []}, headers=headers)

    listed = {p["name"]: p["materials"] for p in client.get(url, headers=headers).json()}
    assert listed["Vaso"] == [{"material_id": pla["id"], "quantity_g": 50.0}]
    assert sorted(m["quantity_g"] for m in listed["Luminaria"]) == [10.0, 30.0]
    assert listed["Chaveiro"] == []


def _default_profile(client: TestClient, org_url: str, headers: dict) -> dict:
    return client.post(
        f"{org_url}/cost-profiles",
        json={
            "name": "Padrão",
            "energy_cost_per_kwh": 0.9,
            "labor_cost_per_hour": 20.0,
            "packaging_cost_flat": 1.5,
            "waste_percentage": 5.0,
            "fees_percentage": 3.0,
            "profit_margin_percentage": 60.0,
            "is_default": True,
        },
        headers=headers,
    ).json()


def test_product_without_price_or_recipe_gets_no_invented_price(client: TestClient):
    url, headers = _setup(client)
    org_url = url.rsplit("/products", 1)[0]
    profile = _default_profile(client, org_url, headers)
    empty = client.post(url, json={"name": "Sem nada", "materials": []}, headers=headers).json()
    timed = client.post(
        url, json={"name": "Com tempo", "print_time_hours": 2, "materials": []}, headers=headers
    ).json()

    single = client.get(f"{url}/{empty['id']}/cost?cost_profile_id={profile['id']}", headers=headers)
    assert single.status_code == 422
    assert "não tem preço" in single.json()["detail"]

    costs = client.get(f"{url}/costs?cost_profile_id={profile['id']}", headers=headers).json()
    ids = {c["product_id"] for c in costs}
    assert empty["id"] not in ids
    assert timed["id"] in ids
