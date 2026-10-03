import pytest
from fastapi.testclient import TestClient

from src.application.store import use_cases as store_use_cases
from tests.api.conftest import auth_headers, register_user


@pytest.fixture(autouse=True)
def _clear_public_cache():
    store_use_cases._public_cache.clear()


def _setup(client: TestClient):
    owner = register_user(client, organization_name="Atelie 3D", email="owner@atelie.io")
    headers = auth_headers(owner["access_token"])
    org = client.get("/api/v1/organizations", headers=headers).json()[0]
    return org["id"], org["slug"], headers


def _product(client: TestClient, org_id: str, headers: dict, **overrides) -> dict:
    payload = {"name": "Chaveiro", "manual_price": 12.5, "materials": []}
    payload.update(overrides)
    response = client.post(
        f"/api/v1/organizations/{org_id}/products", json=payload, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_store_settings_default_and_save(client: TestClient):
    org_id, _slug, headers = _setup(client)

    response = client.get(f"/api/v1/organizations/{org_id}/store", headers=headers)
    assert response.status_code == 200
    assert response.json()["settings"]["whatsapp"] == "5521970386065"

    payload = {
        "display_name": "Atelie 3D Premium",
        "tagline": "Peças únicas",
        "accent": "emerald",
        "theme": "dark",
        "slides": [{"url": "https://img/1.jpg", "title": "Oi", "subtitle": "Olá"}],
    }
    response = client.put(f"/api/v1/organizations/{org_id}/store", json=payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["settings"]["accent"] == "emerald"

    saved = client.get(f"/api/v1/organizations/{org_id}/store", headers=headers).json()
    assert saved["settings"]["slides"][0]["title"] == "Oi"


def test_public_store_lists_priced_products_without_auth(client: TestClient):
    org_id, slug, headers = _setup(client)
    _product(client, org_id, headers, name="Chaveiro", manual_price=12.5, photo_urls=["https://img/a.jpg"])
    _product(client, org_id, headers, name="Esgotado", manual_price=30, stock_quantity=0)
    # No manual price and no cost profile -> no sellable price, so it is not listed.
    _product(client, org_id, headers, name="Sem preco", manual_price=None)

    response = client.get(f"/api/v1/public/stores/{slug}")
    assert response.status_code == 200
    body = response.json()
    assert body["settings"]["display_name"] == "Atelie 3D"
    by_name = {p["name"]: p for p in body["products"]}
    assert set(by_name) == {"Chaveiro", "Esgotado"}
    assert by_name["Chaveiro"]["price"] == 12.5
    assert by_name["Chaveiro"]["available"] is True
    assert by_name["Esgotado"]["available"] is False
    assert "cost" not in str(body).lower()


def test_public_store_hides_products_and_flags_featured(client: TestClient):
    org_id, slug, headers = _setup(client)
    visible = _product(client, org_id, headers, name="Visivel")
    hidden = _product(client, org_id, headers, name="Oculto")

    response = client.put(
        f"/api/v1/organizations/{org_id}/store",
        json={"hidden_product_ids": [hidden["id"]], "featured_product_ids": [visible["id"]]},
        headers=headers,
    )
    assert response.status_code == 200

    body = client.get(f"/api/v1/public/stores/{slug}").json()
    assert [p["name"] for p in body["products"]] == ["Visivel"]
    assert body["products"][0]["featured"] is True


def test_public_store_unknown_slug_is_404(client: TestClient):
    assert client.get("/api/v1/public/stores/nao-existe").status_code == 404


def test_store_settings_require_membership(client: TestClient):
    org_id, _slug, _headers = _setup(client)
    other = register_user(client, organization_name="Outra", email="other@x.io")
    response = client.put(
        f"/api/v1/organizations/{org_id}/store",
        json={},
        headers=auth_headers(other["access_token"]),
    )
    assert response.status_code in (401, 403, 404)


def test_photo_focus_is_saved_and_exposed_publicly(client: TestClient):
    org_id, slug, headers = _setup(client)
    product = _product(client, org_id, headers, photo_urls=["https://img/a.jpg"])
    focus = [{"url": "https://img/a.jpg", "x": 30.5, "y": 80}]

    response = client.patch(
        f"/api/v1/organizations/{org_id}/products/{product['id']}",
        json={"photo_focus": focus},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["photo_focus"] == [{"url": "https://img/a.jpg", "x": 30.5, "y": 80.0}]

    store = client.get(f"/api/v1/public/stores/{slug}").json()
    assert store["products"][0]["photo_focus"][0]["y"] == 80.0

    bad = client.patch(
        f"/api/v1/organizations/{org_id}/products/{product['id']}",
        json={"photo_focus": [{"url": "u", "x": 120, "y": 0}]},
        headers=headers,
    )
    assert bad.status_code == 422


def test_categories_are_saved_and_exposed_publicly(client: TestClient):
    org_id, slug, headers = _setup(client)
    vaso = _product(client, org_id, headers, name="Vaso")
    chaveiro = _product(client, org_id, headers, name="Chaveiro")
    oculto = _product(client, org_id, headers, name="Oculto")

    categories = [
        {"id": "deco", "name": "Decoração", "product_ids": [vaso["id"]]},
        {"id": "brindes", "name": "Brindes", "product_ids": [vaso["id"], chaveiro["id"]]},
        {"id": "vazia", "name": "Só oculto", "product_ids": [oculto["id"]]},
        {"id": "sem-nome", "name": "  ", "product_ids": [chaveiro["id"]]},
    ]
    response = client.put(
        f"/api/v1/organizations/{org_id}/store",
        json={"categories": categories, "hidden_product_ids": [oculto["id"]]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["settings"]["categories"] == categories

    body = client.get(f"/api/v1/public/stores/{slug}").json()
    assert body["settings"]["categories"] == [
        {"id": "deco", "name": "Decoração"},
        {"id": "brindes", "name": "Brindes"},
    ]
    by_name = {p["name"]: p["category_ids"] for p in body["products"]}
    assert by_name == {"Vaso": ["deco", "brindes"], "Chaveiro": ["brindes"]}
