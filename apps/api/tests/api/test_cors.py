from fastapi.testclient import TestClient


def _preflight(client: TestClient, origin: str):
    return client.options(
        "/api/v1/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )


def test_keystudio_site_and_previews_are_allowed(client: TestClient):
    for origin in (
        "https://keystudio3d.pages.dev",
        "https://abc123.keystudio3d.pages.dev",
    ):
        response = _preflight(client, origin)
        assert response.headers.get("access-control-allow-origin") == origin


def test_other_pages_dev_sites_are_not_allowed(client: TestClient):
    for origin in ("https://evil.pages.dev", "https://keystudio3d.pages.dev.evil.com"):
        response = _preflight(client, origin)
        assert response.headers.get("access-control-allow-origin") is None
