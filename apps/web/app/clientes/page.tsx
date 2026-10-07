"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Customer, Order, Product } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { SearchInput } from "@/components/SearchInput";
import { matchesSearch } from "@/lib/search";
import { STATUS_LABELS, STATUS_TONE, orderStage, type OrderStage } from "@/lib/order-status";

const STAGES: { key: OrderStage; title: string; empty: string }[] = [
  { key: "open", title: "Em andamento", empty: "Nenhum pedido em andamento." },
  { key: "finished", title: "Finalizados", empty: "Nenhum pedido finalizado ainda." },
  { key: "cancelled", title: "Cancelados", empty: "" },
];

function formatDay(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function ClientesPage() {
  const { status, accessToken, currentOrganizationId } = useAuth();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");

  const orgPath = `/api/v1/organizations/${currentOrganizationId}`;

  const load = useCallback(async () => {
    if (!accessToken || !currentOrganizationId) return;
    setIsLoading(true);
    try {
      const [data, ordersData, productsData] = await Promise.all([
        apiFetch<Customer[]>(`${orgPath}/customers`, { accessToken }),
        apiFetch<Order[]>(`${orgPath}/orders`, { accessToken }),
        apiFetch<Product[]>(`${orgPath}/products`, { accessToken }),
      ]);
      setCustomers(data);
      setOrders(ordersData);
      setProducts(productsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar clientes.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentOrganizationId, orgPath]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    const timeoutId = setTimeout(load, 0);
    return () => clearTimeout(timeoutId);
  }, [status, router, load]);

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setDocument("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setName(c.name);
    setEmail(c.email ?? "");
    setPhone(c.phone ?? "");
    setDocument(c.document ?? "");
    setShowForm(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setIsSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name,
        email: email || null,
        phone: phone || null,
        document: document || null,
      });
      if (editingId) {
        await apiFetch(`${orgPath}/customers/${editingId}`, { method: "PATCH", accessToken, body });
      } else {
        await apiFetch(`${orgPath}/customers`, { method: "POST", accessToken, body });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar cliente.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(c: Customer) {
    if (!accessToken) return;
    if (!window.confirm(`Excluir o cliente "${c.name}"?`)) return;
    setError(null);
    try {
      await apiFetch(`${orgPath}/customers/${c.id}`, { method: "DELETE", accessToken });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao excluir cliente.");
    }
  }

  const filtered = customers.filter(
    (c) =>
      matchesSearch(search, c.name, c.email) ||
      (search.trim() !== "" && (c.phone ?? "").replace(/\D/g, "").includes(search.replace(/\D/g, "") || "\u0000"))
  );

  // Pedidos de cada cliente, do mais recente para o mais antigo.
  const ordersByCustomer = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      const list = map.get(order.customer_id) ?? [];
      list.push(order);
      map.set(order.customer_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return map;
  }, [orders]);

  const productName = (id: string | null) =>
    (id && products.find((p) => p.id === id)?.name) || "Produto";

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Carregando…</p>
      </main>
    );
  }

  return (
    <AppShell title="Clientes">
      <div className="mx-auto max-w-5xl space-y-6">
        {error && <p className="rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nome, e-mail ou telefone…"
            className="w-full sm:max-w-sm"
          />
          <button
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
          >
            {showForm ? "Cancelar" : "+ Novo cliente"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 sm:grid-cols-2"
          >
            <input required placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
            <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
            <input placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
            <input placeholder="CPF/CNPJ" value={document} onChange={(e) => setDocument(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
            <button type="submit" disabled={isSaving} className="rounded bg-blue-600 px-4 py-2 font-medium disabled:opacity-50 sm:col-span-2">
              {isSaving ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar cliente"}
            </button>
          </form>
        )}

        <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800">
          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">Nenhum cliente encontrado.</p>
          ) : (
            filtered.map((c) => {
              const customerOrders = ordersByCustomer.get(c.id) ?? [];
              const counts = {
                open: customerOrders.filter((o) => orderStage(o.status) === "open").length,
                finished: customerOrders.filter((o) => orderStage(o.status) === "finished").length,
              };
              const isOpen = openCustomerId === c.id;
              return (
                <div key={c.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      onClick={() => setOpenCustomerId(isOpen ? null : c.id)}
                      aria-expanded={isOpen}
                      className="min-w-0 flex-1 space-y-1 text-left"
                    >
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{c.name}</span>
                        <span
                          className={`inline-block text-xs text-neutral-500 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                        >
                          ▾
                        </span>
                      </p>
                      <p className="text-sm text-neutral-400">{c.email ?? "—"}</p>
                      <p className="text-sm text-neutral-400">{c.phone ?? "—"}</p>
                      <p className="flex flex-wrap gap-1.5 pt-0.5 text-xs">
                        {customerOrders.length === 0 ? (
                          <span className="text-neutral-500">Sem pedidos</span>
                        ) : (
                          <>
                            <span className={counts.open > 0 ? "rounded bg-blue-950 px-2 py-0.5 text-blue-300" : "rounded bg-neutral-900 px-2 py-0.5 text-neutral-500"}>
                              {counts.open} em andamento
                            </span>
                            <span className="rounded bg-neutral-900 px-2 py-0.5 text-neutral-400">
                              {counts.finished} finalizado(s)
                            </span>
                          </>
                        )}
                        <span className="text-neutral-600">· Cadastrado em {formatDate(c.created_at)}</span>
                      </p>
                    </button>
                    <div className="flex shrink-0 gap-3 text-sm">
                      <button onClick={() => startEdit(c)} className="text-blue-400 hover:underline">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(c)} className="text-red-400 hover:underline">
                        Excluir
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                      {customerOrders.length === 0 ? (
                        <p className="text-sm text-neutral-500">Este cliente ainda não tem pedidos.</p>
                      ) : (
                        STAGES.map(({ key, title, empty }) => {
                          const list = customerOrders.filter((o) => orderStage(o.status) === key);
                          if (list.length === 0 && !empty) return null;
                          return (
                            <section key={key} className="space-y-2">
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                                {title} ({list.length})
                              </h3>
                              {list.length === 0 ? (
                                <p className="text-sm text-neutral-600">{empty}</p>
                              ) : (
                                <ul className="space-y-2">
                                  {list.map((o) => (
                                    <li key={o.id} className="rounded border border-neutral-800 p-3 text-sm">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-neutral-300">
                                          Pedido de {formatDate(o.created_at)}
                                          {o.due_date && orderStage(o.status) === "open" ? (
                                            <span className="text-neutral-500"> · prazo {formatDay(o.due_date)}</span>
                                          ) : null}
                                        </span>
                                        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[o.status] ?? "bg-neutral-800 text-neutral-300"}`}>
                                          {STATUS_LABELS[o.status] ?? o.status}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-neutral-400">
                                        {o.items.length === 0
                                          ? "Sem produtos ainda"
                                          : o.items.map((i) => `${i.quantity}× ${productName(i.product_id)}`).join(" · ")}
                                      </p>
                                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-medium text-neutral-100">{formatCurrency(o.total_amount)}</span>
                                        <Link href={`/pedidos?pedido=${o.id}`} className="text-xs text-blue-400 hover:underline">
                                          Abrir em Pedidos →
                                        </Link>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </section>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
