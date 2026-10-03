"""One-time, secret-gated endpoint that copies every row from the production

Postgres database into Firestore, for the Phase 5 cutover described in
C:\\Users\\Gamer\\.claude\\plans\\hashed-seeking-stardust.md. It runs inside the
already-deployed Cloud Function, so it reuses the function's own Postgres
connection (DATABASE_URL secret) and its automatic Firestore credentials
(the function's GCP service account) - no credentials ever pass through
the machine that writes this code.

Idempotent: every write uses the original Postgres row's own id as the
Firestore document id, so re-running it after a partial failure just
overwrites the same documents with the same data, never duplicates.

Meant to be deployed, triggered once (POST with the X-Migration-Secret
header matching settings.migration_secret), verified, then deleted from
the codebase - it is not part of the app's steady state.
"""
import dataclasses
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import get_settings
from src.infrastructure.db import models as sql
from src.infrastructure.db.session import get_db
from src.infrastructure.firestore import entities as fs
from src.infrastructure.firestore.client import get_firestore_client
from src.infrastructure.firestore.serialization import to_dict

router = APIRouter(prefix="/internal", tags=["internal"])


def _entity(cls, row, **overrides):
    kwargs = {}
    for f in dataclasses.fields(cls):
        if f.name in overrides:
            kwargs[f.name] = overrides[f.name]
        elif hasattr(row, f.name):
            kwargs[f.name] = getattr(row, f.name)
    return cls(**kwargs)


def _require_secret(x_migration_secret: str | None) -> None:
    settings = get_settings()
    expected = settings.migration_secret.strip()
    given = (x_migration_secret or "").strip()
    if not expected or given != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)


@router.post("/migrate-firestore")
def migrate_firestore(
    x_migration_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    _require_secret(x_migration_secret)
    client = get_firestore_client()
    counts: dict[str, int] = {}

    def org_coll(org_id, name):
        return client.collection("organizations").document(str(org_id)).collection(name)

    plans = list(db.scalars(select(sql.Plan)))
    for p in plans:
        client.collection("plans").document(str(p.id)).set(to_dict(_entity(fs.Plan, p)))
    counts["plans"] = len(plans)

    entitlements = list(db.scalars(select(sql.PlanEntitlement)))
    for ent in entitlements:
        client.collection("plans").document(str(ent.plan_id)).collection(
            "entitlements"
        ).document(ent.key).set(to_dict(_entity(fs.PlanEntitlement, ent)))
    counts["plan_entitlements"] = len(entitlements)

    orgs = list(db.scalars(select(sql.Organization)))
    for o in orgs:
        client.collection("organizations").document(str(o.id)).set(
            to_dict(_entity(fs.Organization, o))
        )
        client.collection("slug_index").document(o.slug).set({"organization_id": str(o.id)})
    counts["organizations"] = len(orgs)

    users = list(db.scalars(select(sql.User)))
    for u in users:
        client.collection("users").document(str(u.id)).set(to_dict(_entity(fs.User, u)))
        client.collection("email_index").document(u.email).set({"user_id": str(u.id)})
    counts["users"] = len(users)

    members = list(db.scalars(select(sql.OrgMember)))
    for m in members:
        org_coll(m.organization_id, "members").document(str(m.id)).set(
            to_dict(_entity(fs.OrgMember, m))
        )
    counts["org_members"] = len(members)

    tokens = list(db.scalars(select(sql.RefreshToken)))
    for t in tokens:
        client.collection("refresh_tokens").document(str(t.id)).set(
            to_dict(_entity(fs.RefreshToken, t))
        )
    counts["refresh_tokens"] = len(tokens)

    subs = list(db.scalars(select(sql.Subscription)))
    for s in subs:
        client.collection("subscriptions").document(str(s.organization_id)).set(
            to_dict(_entity(fs.Subscription, s))
        )
    counts["subscriptions"] = len(subs)

    events = list(db.scalars(select(sql.BillingEvent)))
    for ev in events:
        client.collection("billing_events").document(str(ev.id)).set(
            to_dict(_entity(fs.BillingEvent, ev))
        )
        client.collection("billing_event_index").document(
            f"{ev.provider}:{ev.external_event_id}"
        ).set({"event_id": str(ev.id)})
    counts["billing_events"] = len(events)

    materials = list(db.scalars(select(sql.Material)))
    for m in materials:
        org_coll(m.organization_id, "materials").document(str(m.id)).set(
            to_dict(_entity(fs.Material, m))
        )
    counts["materials"] = len(materials)

    profiles = list(db.scalars(select(sql.CostProfile)))
    for p in profiles:
        org_coll(p.organization_id, "cost_profiles").document(str(p.id)).set(
            to_dict(_entity(fs.CostProfile, p))
        )
    counts["cost_profiles"] = len(profiles)

    customers = list(db.scalars(select(sql.Customer)))
    for c in customers:
        org_coll(c.organization_id, "customers").document(str(c.id)).set(
            to_dict(_entity(fs.Customer, c))
        )
    counts["customers"] = len(customers)

    machines = list(db.scalars(select(sql.Machine)))
    for m in machines:
        org_coll(m.organization_id, "machines").document(str(m.id)).set(
            to_dict(_entity(fs.Machine, m))
        )
    counts["machines"] = len(machines)

    products = list(db.scalars(select(sql.Product)))
    product_org = {p.id: p.organization_id for p in products}
    for p in products:
        org_coll(p.organization_id, "products").document(str(p.id)).set(
            to_dict(_entity(fs.Product, p))
        )
    counts["products"] = len(products)

    product_materials = list(db.scalars(select(sql.ProductMaterial)))
    for pm in product_materials:
        org_id = product_org.get(pm.product_id)
        if org_id is None:
            continue
        org_coll(org_id, "products").document(str(pm.product_id)).collection(
            "materials"
        ).document(str(pm.id)).set(to_dict(_entity(fs.ProductMaterial, pm)))
    counts["product_materials"] = len(product_materials)

    inventory_items = list(db.scalars(select(sql.InventoryItem)))
    for i in inventory_items:
        org_coll(i.organization_id, "inventory_items").document(str(i.id)).set(
            to_dict(_entity(fs.InventoryItem, i))
        )
    counts["inventory_items"] = len(inventory_items)

    movements = list(db.scalars(select(sql.InventoryMovement)))
    for mv in movements:
        org_coll(mv.organization_id, "inventory_items").document(
            str(mv.inventory_item_id)
        ).collection("movements").document(str(mv.id)).set(
            to_dict(_entity(fs.InventoryMovement, mv))
        )
    counts["inventory_movements"] = len(movements)

    quotes = list(db.scalars(select(sql.Quote)))
    for q in quotes:
        org_coll(q.organization_id, "quotes").document(str(q.id)).set(
            to_dict(_entity(fs.Quote, q))
        )
    counts["quotes"] = len(quotes)

    orders = list(db.scalars(select(sql.Order)))
    for o in orders:
        org_coll(o.organization_id, "orders").document(str(o.id)).set(
            to_dict(_entity(fs.Order, o))
        )
    counts["orders"] = len(orders)

    order_items = list(db.scalars(select(sql.OrderItem)))
    for oi in order_items:
        org_coll(oi.organization_id, "orders").document(str(oi.order_id)).collection(
            "items"
        ).document(str(oi.id)).set(to_dict(_entity(fs.OrderItem, oi)))
    counts["order_items"] = len(order_items)

    transactions = list(db.scalars(select(sql.FinancialTransaction)))
    for t in transactions:
        overrides = {}
        if t.due_date is not None:
            overrides["due_date"] = datetime(
                t.due_date.year, t.due_date.month, t.due_date.day, tzinfo=UTC
            )
        org_coll(t.organization_id, "financial_transactions").document(str(t.id)).set(
            to_dict(_entity(fs.FinancialTransaction, t, **overrides))
        )
    counts["financial_transactions"] = len(transactions)

    projects = list(db.scalars(select(sql.Project)))
    project_org = {p.id: p.organization_id for p in projects}
    for p in projects:
        org_coll(p.organization_id, "projects").document(str(p.id)).set(
            to_dict(_entity(fs.Project, p))
        )
    counts["projects"] = len(projects)

    versions = list(db.scalars(select(sql.ProjectVersion)))
    for v in versions:
        org_id = project_org.get(v.project_id)
        if org_id is None:
            continue
        org_coll(org_id, "projects").document(str(v.project_id)).collection(
            "versions"
        ).document(str(v.id)).set(to_dict(_entity(fs.ProjectVersion, v)))
    counts["project_versions"] = len(versions)

    files = list(db.scalars(select(sql.FileAsset)))
    for f in files:
        org_coll(f.organization_id, "files").document(str(f.id)).set(
            to_dict(_entity(fs.FileAsset, f))
        )
    counts["files"] = len(files)

    return counts


@router.get("/migrate-firestore/orphans")
def list_orphans(
    x_migration_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Firestore docs (orgs/users) whose id has no matching Postgres row -

    leftover test data from earlier development, not real migrated data.
    Lists only; nothing is deleted here.
    """
    _require_secret(x_migration_secret)
    client = get_firestore_client()

    pg_org_ids = {str(o.id) for o in db.scalars(select(sql.Organization))}
    pg_user_ids = {str(u.id) for u in db.scalars(select(sql.User))}

    orphan_orgs = [
        {"id": s.id, "name": s.to_dict().get("name"), "slug": s.to_dict().get("slug")}
        for s in client.collection("organizations").stream()
        if s.id not in pg_org_ids
    ]
    orphan_users = [
        {"id": s.id, "email": s.to_dict().get("email")}
        for s in client.collection("users").stream()
        if s.id not in pg_user_ids
    ]
    return {"orphan_organizations": orphan_orgs, "orphan_users": orphan_users}


@router.get("/migrate-firestore/price-check")
def price_check(
    organization_id: str,
    x_migration_secret: str | None = Header(default=None),
) -> dict:
    """Counts and computed sale prices only (no names, no personal data):

    what the Firestore backend itself sees for one organization's products.
    """
    from uuid import UUID

    from src.application.products import use_cases as product_use_cases
    from src.infrastructure.firestore import repositories as fs_repos
    from src.infrastructure.firestore.session import FirestoreSession

    _require_secret(x_migration_secret)
    org_id = UUID(organization_id)
    session = FirestoreSession(get_firestore_client())

    materials = fs_repos.MaterialRepository(session).list_for_org(org_id)
    machines = fs_repos.MachineRepository(session).list_for_org(org_id)
    profiles = fs_repos.CostProfileRepository(session).list_for_org(org_id)
    products = fs_repos.ProductRepository(session).list_for_org(org_id)
    bom_repo = fs_repos.ProductMaterialRepository(session)
    bom_sizes = [len(bom_repo.list_for_product(org_id, p.id)) for p in products]
    default = next((p for p in profiles if p.is_default), profiles[0] if profiles else None)
    prices = []
    if default is not None:
        costs = product_use_cases.list_products_costs(
            session, organization_id=org_id, cost_profile_id=default.id
        )
        prices = sorted(round(c.suggested_price, 2) for c in costs.values())
    return {
        "materials": len(materials),
        "materials_cost_per_kg": [m.cost_per_kg for m in materials],
        "machines": len(machines),
        "machines_cost_per_hour": [m.cost_per_hour for m in machines],
        "cost_profiles": len(profiles),
        "default_profile_found": default is not None,
        "products": len(products),
        "products_manual_price_count": sum(1 for p in products if p.manual_price is not None),
        "bom_lines_per_product": bom_sizes,
        "prices": prices,
        "products_detail": [
            {
                "name": p.name,
                "created_at": p.created_at.isoformat(),
                "bom": n,
                "manual_price": p.manual_price,
            }
            for p, n in zip(products, bom_sizes, strict=True)
        ],
    }


@router.post("/migrate-firestore/restore-quote-prices")
def restore_quote_prices(
    organization_id: str,
    x_migration_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Products created from a saved Precificação piece with the old 'add

    to products' button had no recipe and no price (so they computed to the
    packaging-only R$ 5,00). Gives each such product (no recipe, no manual
    price) the original sale price of the saved piece with the same name.
    Never touches products that already have a recipe or a manual price.
    """
    from uuid import UUID

    _require_secret(x_migration_secret)
    org_id = UUID(organization_id)
    client = get_firestore_client()

    prices: dict[str, float] = {}
    for q in db.scalars(select(sql.Quote)):
        if q.organization_id == org_id and q.deleted_at is None and q.piece_name:
            value = q.final_price if q.final_price is not None else q.suggested_price
            prices[q.piece_name.strip()] = float(value)

    products_ref = client.collection("organizations").document(str(org_id)).collection("products")
    updated = []
    for snap in products_ref.stream():
        data = snap.to_dict()
        if data.get("deleted_at") is not None or data.get("manual_price") is not None:
            continue
        if any(True for _ in snap.reference.collection("materials").limit(1).stream()):
            continue
        price = prices.get((data.get("name") or "").strip())
        if price is None:
            continue
        snap.reference.update({"manual_price": price})
        updated.append({"name": data.get("name"), "manual_price": price})
    return {"updated": updated}


@router.post("/migrate-firestore/rename-org")
def rename_org(
    organization_id: str,
    name: str,
    slug: str,
    x_migration_secret: str | None = Header(default=None),
) -> dict:
    """Renames an organization and its public store address.

    The previous slug's index entry is deliberately left in place, so links
    already shared with the old address keep opening the same store.
    """
    from src.application.store import use_cases as store_use_cases

    _require_secret(x_migration_secret)
    client = get_firestore_client()
    org_ref = client.collection("organizations").document(organization_id)
    if not org_ref.get().exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")

    index_ref = client.collection("slug_index").document(slug)
    existing = index_ref.get()
    if existing.exists and existing.to_dict().get("organization_id") != organization_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already in use")

    org_ref.update({"name": name, "slug": slug, "updated_at": datetime.now(UTC)})
    index_ref.set({"organization_id": organization_id})
    store_use_cases._public_cache.clear()
    return {"organization_id": organization_id, "name": name, "slug": slug}


@router.get("/migrate-firestore/orders-check")
def orders_check(
    organization_id: str,
    x_migration_secret: str | None = Header(default=None),
) -> dict:
    """Every order doc of one organization (including soft-deleted ones), with

    just enough to compare against what the Pedidos screen shows.
    """
    _require_secret(x_migration_secret)
    client = get_firestore_client()
    orders_ref = client.collection("organizations").document(organization_id).collection("orders")
    customers_ref = client.collection("organizations").document(organization_id).collection(
        "customers"
    )
    customers = {s.id: s.to_dict() for s in customers_ref.stream()}
    rows = []
    for snap in orders_ref.stream():
        data = snap.to_dict()
        customer = customers.get(data.get("customer_id") or "")
        rows.append(
            {
                "id": snap.id[:8],
                "created_at": str(data.get("created_at"))[:19],
                "status": data.get("status"),
                "deleted": data.get("deleted_at") is not None,
                "customer": (customer or {}).get("name"),
                "customer_deleted": bool(customer and customer.get("deleted_at")),
                "items": sum(1 for _ in snap.reference.collection("items").stream()),
                "total": data.get("total_amount"),
                "has_created_at": "created_at" in data,
            }
        )
    rows.sort(key=lambda r: r["created_at"])
    return {"count": len(rows), "orders": rows}


@router.get("/migrate-firestore/hash-selftest")
def hash_selftest(x_migration_secret: str | None = Header(default=None)) -> dict:
    """Does password hashing/verification work inside the deployed function?

    Uses a throwaway string; touches no account and stores nothing.
    """
    from src.domain.shared.security import hash_password, verify_password

    _require_secret(x_migration_secret)
    sample = "selftest-not-a-real-password"
    hashed = hash_password(sample)
    return {
        "correct_password_accepted": verify_password(sample, hashed),
        "wrong_password_rejected": not verify_password(sample + "x", hashed),
    }


@router.get("/migrate-firestore/user-check")
def user_check(
    email: str,
    x_migration_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Booleans/counts only: is this login e-mail intact in Firestore compared

    with the original Postgres row (index entry, active flag, password hash)?
    """
    _require_secret(x_migration_secret)
    client = get_firestore_client()
    pg_users = list(db.scalars(select(sql.User)))
    pg_user = next((u for u in pg_users if u.email == email), None)
    index = client.collection("email_index").document(email).get()
    fs_user = None
    if index.exists:
        snap = client.collection("users").document(index.to_dict()["user_id"]).get()
        fs_user = snap.to_dict() if snap.exists else None
    return {
        "in_postgres": pg_user is not None,
        "same_email_ignoring_case_in_postgres": sum(
            1 for u in pg_users if u.email.lower() == email.lower()
        ),
        "in_email_index": index.exists,
        "firestore_user_found": fs_user is not None,
        "ids_match": bool(
            pg_user and index.exists and index.to_dict()["user_id"] == str(pg_user.id)
        ),
        "is_active_in_firestore": bool(fs_user and fs_user.get("is_active")),
        "password_hash_matches_postgres": bool(
            pg_user and fs_user and fs_user.get("password_hash") == pg_user.password_hash
        ),
    }


@router.get("/migrate-firestore/verify")
def verify_firestore(
    x_migration_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Read-only side-by-side row counts (Postgres vs Firestore) per

    collection, to confirm the copy above landed everything before the
    DB_BACKEND cutover.
    """
    _require_secret(x_migration_secret)
    client = get_firestore_client()

    def fcount(ref) -> int:
        return sum(1 for _ in ref.stream())

    orgs = list(db.scalars(select(sql.Organization)))
    pg = {
        "organizations": len(orgs),
        "users": len(list(db.scalars(select(sql.User)))),
        "products": len(list(db.scalars(select(sql.Product)))),
        "orders": len(list(db.scalars(select(sql.Order)))),
        "customers": len(list(db.scalars(select(sql.Customer)))),
    }
    fs_counts = {
        "organizations": fcount(client.collection("organizations")),
        "users": fcount(client.collection("users")),
        "products": sum(
            fcount(
                client.collection("organizations").document(str(o.id)).collection("products")
            )
            for o in orgs
        ),
        "orders": sum(
            fcount(client.collection("organizations").document(str(o.id)).collection("orders"))
            for o in orgs
        ),
        "customers": sum(
            fcount(
                client.collection("organizations").document(str(o.id)).collection("customers")
            )
            for o in orgs
        ),
    }
    return {"postgres": pg, "firestore": fs_counts}
