import pytest
from fastapi.testclient import TestClient

from src.application.analytics import use_cases as analytics_use_cases
from tests.api.conftest import auth_headers, register_user


@pytest.fixture(autouse=True)
def _clear_slug_cache():
    analytics_use_cases._slug_cache.clear()
    analytics_use_cases._product_ids_cache.clear()


def _setup(client: TestClient):
    owner = register_user(client, organization_name="Atelie 3D", email="owner@atelie.io")
    headers = auth_headers(owner["access_token"])
    org = client.get("/api/v1/organizations", headers=headers).json()[0]
    return org["id"], org["slug"], headers


def _ping(client: TestClient, slug: str, visitor: str, *, new_visit: bool, ua: str | None = None):
    return client.post(
        f"/api/v1/public/stores/{slug}/ping",
        json={"visitor_id": visitor, "new_visit": new_visit},
        headers={"User-Agent": ua} if ua else None,
    )


def test_counts_visits_unique_visitors_and_online(client: TestClient):
    org_id, slug, headers = _setup(client)

    # Duas pessoas abrem a loja; a primeira abre de novo (nova sessão) no mesmo dia.
    assert _ping(client, slug, "visitante-aaaa1111", new_visit=True).status_code == 204
    assert _ping(client, slug, "visitante-bbbb2222", new_visit=True).status_code == 204
    assert _ping(client, slug, "visitante-aaaa1111", new_visit=True).status_code == 204
    # Sinais de vida não contam como visita.
    assert _ping(client, slug, "visitante-aaaa1111", new_visit=False).status_code == 204

    stats = client.get(f"/api/v1/organizations/{org_id}/store/analytics", headers=headers).json()
    assert stats["online"] == 2
    assert stats["today"] == {"views": 3, "unique": 2, "whatsapp": 0}
    assert stats["last7"] == {"views": 3, "unique": 2, "whatsapp": 0}
    assert stats["last30"] == {"views": 3, "unique": 2, "whatsapp": 0}
    assert len(stats["days"]) == 30
    assert stats["days"][-1]["views"] == 3

    online = client.get(
        f"/api/v1/organizations/{org_id}/store/analytics/online", headers=headers
    ).json()
    assert online == {"online": 2}


def test_bots_and_invalid_ids_are_ignored(client: TestClient):
    org_id, slug, headers = _setup(client)

    assert _ping(client, slug, "visitante-aaaa1111", new_visit=True, ua="Googlebot/2.1").status_code == 204
    assert _ping(client, slug, "curto", new_visit=True).status_code == 422
    assert _ping(client, slug, "tem espaço e ç!", new_visit=True).status_code == 422

    stats = client.get(f"/api/v1/organizations/{org_id}/store/analytics", headers=headers).json()
    assert stats["online"] == 0
    assert stats["today"] == {"views": 0, "unique": 0, "whatsapp": 0}


def _event(client: TestClient, slug: str, kind: str, product_id: str | None = None):
    body = {"kind": kind}
    if product_id is not None:
        body["product_id"] = product_id
    return client.post(f"/api/v1/public/stores/{slug}/event", json=body)


def _product(client: TestClient, org_id: str, headers: dict, name: str) -> dict:
    response = client.post(
        f"/api/v1/organizations/{org_id}/products",
        json={"name": name, "manual_price": 10, "materials": []},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_counts_whatsapp_clicks_and_top_products(client: TestClient):
    org_id, slug, headers = _setup(client)
    vaso = _product(client, org_id, headers, "Vaso")
    chaveiro = _product(client, org_id, headers, "Chaveiro")

    for _ in range(3):
        assert _event(client, slug, "product_view", chaveiro["id"]).status_code == 204
    assert _event(client, slug, "product_view", vaso["id"]).status_code == 204
    # Produto que não existe (id inventado) é ignorado.
    assert _event(client, slug, "product_view", "00000000-0000-0000-0000-000000000000").status_code == 204
    assert _event(client, slug, "product_view").status_code == 204
    assert _event(client, slug, "whatsapp_click").status_code == 204
    assert _event(client, slug, "whatsapp_click").status_code == 204
    # Robô não conta.
    bot = client.post(
        f"/api/v1/public/stores/{slug}/event",
        json={"kind": "whatsapp_click"},
        headers={"User-Agent": "Googlebot/2.1"},
    )
    assert bot.status_code == 204

    stats = client.get(f"/api/v1/organizations/{org_id}/store/analytics", headers=headers).json()
    assert stats["today"]["whatsapp"] == 2
    assert stats["last30"]["whatsapp"] == 2
    assert stats["days"][-1]["whatsapp"] == 2
    assert [(p["name"], p["views"], p["views7"]) for p in stats["top_products"]] == [
        ("Chaveiro", 3, 3),
        ("Vaso", 1, 1),
    ]


def test_event_validation_and_unknown_store(client: TestClient):
    _org_id, slug, _headers = _setup(client)

    assert _event(client, slug, "tipo-invalido").status_code == 422
    assert _event(client, slug, "product_view", "id com espaço!").status_code == 422
    assert _event(client, "loja-que-nao-existe", "whatsapp_click").status_code == 404


def test_unknown_store_returns_404_and_analytics_require_login(client: TestClient):
    org_id, _slug, _headers = _setup(client)

    assert _ping(client, "loja-que-nao-existe", "visitante-aaaa1111", new_visit=True).status_code == 404
    assert client.get(f"/api/v1/organizations/{org_id}/store/analytics").status_code in (401, 403)
