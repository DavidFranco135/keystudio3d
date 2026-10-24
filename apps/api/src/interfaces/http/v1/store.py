from uuid import UUID

from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.orm import Session

from src.application.analytics import use_cases as analytics_use_cases
from src.application.store import use_cases as store_use_cases
from src.domain.auth.roles import Role
from src.domain.shared.exceptions import DomainError
from src.interfaces.http.dependencies import get_db, require_org_role
from src.interfaces.http.errors import as_http_exception
from src.interfaces.http.v1.schemas import (
    PublicStoreResponse,
    StoreAdminResponse,
    StoreAnalyticsResponse,
    StoreEvent,
    StoreOnlineResponse,
    StorePing,
    StoreSettings,
)

router = APIRouter(prefix="/organizations/{organization_id}/store", tags=["store"])
public_router = APIRouter(prefix="/public", tags=["public"])


@router.get(
    "",
    response_model=StoreAdminResponse,
    dependencies=[Depends(require_org_role(Role.VIEWER))],
)
def get_store(organization_id: UUID, db: Session = Depends(get_db)) -> StoreAdminResponse:
    try:
        return store_use_cases.get_store_settings(db, organization_id=organization_id)
    except DomainError as exc:
        raise as_http_exception(exc) from exc


@router.put(
    "",
    response_model=StoreAdminResponse,
    dependencies=[Depends(require_org_role(Role.MANAGER))],
)
def save_store(
    organization_id: UUID, payload: StoreSettings, db: Session = Depends(get_db)
) -> StoreAdminResponse:
    try:
        return store_use_cases.save_store_settings(
            db, organization_id=organization_id, settings=payload
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc


@router.get(
    "/analytics",
    response_model=StoreAnalyticsResponse,
    dependencies=[Depends(require_org_role(Role.VIEWER))],
)
def get_store_analytics(
    organization_id: UUID, response: Response, db: Session = Depends(get_db)
) -> StoreAnalyticsResponse:
    response.headers["Cache-Control"] = "no-store"
    return analytics_use_cases.get_stats(db, organization_id=organization_id)


@router.get(
    "/analytics/online",
    response_model=StoreOnlineResponse,
    dependencies=[Depends(require_org_role(Role.VIEWER))],
)
def get_store_online(
    organization_id: UUID, response: Response, db: Session = Depends(get_db)
) -> StoreOnlineResponse:
    response.headers["Cache-Control"] = "no-store"
    return StoreOnlineResponse(
        online=analytics_use_cases.get_online(db, organization_id=organization_id)
    )


@public_router.post("/stores/{slug}/ping", status_code=status.HTTP_204_NO_CONTENT)
def ping_public_store(
    slug: str,
    payload: StorePing,
    user_agent: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    try:
        analytics_use_cases.record_ping(
            db,
            slug=slug,
            visitor_id=payload.visitor_id,
            new_visit=payload.new_visit,
            user_agent=user_agent,
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.post("/stores/{slug}/event", status_code=status.HTTP_204_NO_CONTENT)
def public_store_event(
    slug: str,
    payload: StoreEvent,
    user_agent: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    try:
        analytics_use_cases.record_event(
            db,
            slug=slug,
            kind=payload.kind,
            product_id=payload.product_id,
            user_agent=user_agent,
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.get("/stores/{slug}", response_model=PublicStoreResponse)
def get_public_store(
    slug: str, response: Response, db: Session = Depends(get_db)
) -> PublicStoreResponse:
    try:
        store = store_use_cases.get_public_store(db, slug=slug)
    except DomainError as exc:
        raise as_http_exception(exc) from exc
    response.headers["Cache-Control"] = "public, max-age=30"
    return store
