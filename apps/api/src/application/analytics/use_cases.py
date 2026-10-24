"""Contador de visitas da vitrine pública.

Privacidade: não guardamos IP nem dados pessoais — só um identificador
aleatório gerado no navegador do visitante, usado para contar "pessoas
diferentes" e "online agora". Nada aqui diz *quem* a pessoa é.
"""
import re
import time
from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from src.domain.shared.exceptions import OrganizationNotFoundError
from src.infrastructure.repositories import (
    OrganizationRepository,
    ProductRepository,
    StoreVisitRepository,
)
from src.interfaces.http.v1.schemas import (
    StoreAnalyticsResponse,
    StoreTopProduct,
    StoreVisitDay,
    StoreVisitTotals,
)

# Brasil não tem horário de verão desde 2019: UTC-3 fixo evita depender do
# banco de fusos (tzdata) no servidor.
_BRT = timezone(timedelta(hours=-3))
# O site manda um sinal a cada 30 s; 75 s dá folga para uma falha de rede.
ONLINE_WINDOW_SECONDS = 75
_STATS_DAYS = 30
_BOT_RE = re.compile(r"bot|crawl|spider|slurp|preview|facebookexternalhit|headless", re.I)

# slug → (quando guardou, id da organização). Evita consultar o banco a cada
# sinal de vida (cada visitante manda um a cada 30 s).
_SLUG_CACHE_TTL_SECONDS = 600.0
_slug_cache: dict[str, tuple[float, UUID]] = {}


# slug → (quando guardou, ids dos produtos). Só produtos que existem entram na
# contagem — impede que alguém encha o banco com ids inventados.
_PRODUCT_IDS_TTL_SECONDS = 300.0
_product_ids_cache: dict[str, tuple[float, set[str]]] = {}
_TOP_PRODUCTS = 10


def _day_key(moment: datetime) -> str:
    return moment.astimezone(_BRT).date().isoformat()


def _org_id_for_slug(db: Session, slug: str) -> UUID:
    cached = _slug_cache.get(slug)
    if cached is not None and time.monotonic() - cached[0] < _SLUG_CACHE_TTL_SECONDS:
        return cached[1]
    org = OrganizationRepository(db).get_by_slug(slug)
    if org is None:
        raise OrganizationNotFoundError(slug)
    org_id = org.id if isinstance(org.id, UUID) else UUID(str(org.id))
    _slug_cache[slug] = (time.monotonic(), org_id)
    return org_id


def record_ping(
    db: Session, *, slug: str, visitor_id: str, new_visit: bool, user_agent: str | None
) -> None:
    """Sinal de vida de um visitante. `new_visit` = primeira abertura da loja
    nesta sessão (conta como uma visita)."""
    if user_agent and _BOT_RE.search(user_agent):
        return
    org_id = _org_id_for_slug(db, slug)
    now = datetime.now(UTC)
    repo = StoreVisitRepository(db)
    if new_visit:
        repo.record_visit(org_id, visitor_id, now=now, day=_day_key(now))
    else:
        repo.mark_seen(org_id, visitor_id, now=now)


def _known_product_ids(db: Session, slug: str, organization_id: UUID) -> set[str]:
    cached = _product_ids_cache.get(slug)
    if cached is not None and time.monotonic() - cached[0] < _PRODUCT_IDS_TTL_SECONDS:
        return cached[1]
    ids = {str(p.id) for p in ProductRepository(db).list_for_org(organization_id)}
    _product_ids_cache[slug] = (time.monotonic(), ids)
    return ids


def record_event(
    db: Session, *, slug: str, kind: str, product_id: str | None, user_agent: str | None
) -> None:
    """Abertura de um produto ou clique no WhatsApp (sem identificar a pessoa)."""
    if user_agent and _BOT_RE.search(user_agent):
        return
    org_id = _org_id_for_slug(db, slug)
    day = _day_key(datetime.now(UTC))
    repo = StoreVisitRepository(db)
    if kind == "whatsapp_click":
        repo.add_whatsapp_click(org_id, day=day)
    elif kind == "product_view":
        if product_id and product_id in _known_product_ids(db, slug, org_id):
            repo.add_product_view(org_id, day=day, product_id=product_id)


def get_online(db: Session, *, organization_id: UUID) -> int:
    since = datetime.now(UTC) - timedelta(seconds=ONLINE_WINDOW_SECONDS)
    return StoreVisitRepository(db).online_count(organization_id, since=since)


def get_stats(db: Session, *, organization_id: UUID) -> StoreAnalyticsResponse:
    repo = StoreVisitRepository(db)
    now = datetime.now(UTC)
    today = now.astimezone(_BRT).date()
    first = today - timedelta(days=_STATS_DAYS - 1)

    by_day = {
        day: (views, unique, whatsapp)
        for day, views, unique, whatsapp in repo.list_days(
            organization_id, from_day=first.isoformat(), to_day=today.isoformat()
        )
    }
    days = []
    for offset in range(_STATS_DAYS):
        key = (first + timedelta(days=offset)).isoformat()
        views, unique, whatsapp = by_day.get(key, (0, 0, 0))
        days.append(StoreVisitDay(date=key, views=views, unique=unique, whatsapp=whatsapp))

    def total(items: list[StoreVisitDay]) -> StoreVisitTotals:
        return StoreVisitTotals(
            views=sum(d.views for d in items),
            unique=sum(d.unique for d in items),
            whatsapp=sum(d.whatsapp for d in items),
        )

    # Produtos mais abertos (30 dias, com o recorte de 7 dias ao lado).
    first7 = days[-7].date
    views30: dict[str, int] = {}
    views7: dict[str, int] = {}
    for day, product_id, views in repo.list_product_days(
        organization_id, from_day=first.isoformat(), to_day=today.isoformat()
    ):
        views30[product_id] = views30.get(product_id, 0) + views
        if day >= first7:
            views7[product_id] = views7.get(product_id, 0) + views
    names = {str(p.id): p.name for p in ProductRepository(db).list_for_org(organization_id)}
    top_products = [
        StoreTopProduct(
            product_id=pid, name=names[pid], views=count, views7=views7.get(pid, 0)
        )
        for pid, count in sorted(views30.items(), key=lambda item: item[1], reverse=True)
        if pid in names and count > 0
    ][:_TOP_PRODUCTS]

    # Limpa presenças antigas (ninguém "online" há mais de 2 dias).
    repo.prune_visitors(organization_id, before=now - timedelta(days=2))

    return StoreAnalyticsResponse(
        online=get_online(db, organization_id=organization_id),
        today=total(days[-1:]),
        last7=total(days[-7:]),
        last30=total(days),
        days=days,
        top_products=top_products,
    )
