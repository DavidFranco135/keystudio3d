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
