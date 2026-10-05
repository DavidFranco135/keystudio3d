"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError, uploadImage } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { CostProfile, Machine, Material, Product, ProductCost, ProductCostItem } from "@/lib/types";
import type { StoreAdminResponse, StoreCategory, StoreSettings } from "@/lib/store";
import { refreshPublicStoreCache } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { focusStyle } from "@/lib/focus";

type BomLine = { material_id: string; quantity_g: string };

function newCategoryId(): string {
  return `cat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Coloca/tira o produto de cada categoria conforme a seleção do formulário.
function assignProduct(categories: StoreCategory[], productId: string, selected: string[]): StoreCategory[] {
  return categories.map((c) => {
    const has = c.product_ids.includes(productId);
    const wants = selected.includes(c.id);
    if (has === wants) return c;
    return {
      ...c,
      product_ids: wants ? [...c.product_ids, productId] : c.product_ids.filter((id) => id !== productId),
    };
  });
}

export default function ProdutosPage() {
  const { status, accessToken, currentOrganizationId } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [costProfiles, setCostProfiles] = useState<CostProfile[]>([]);
  const [costs, setCosts] = useState<Record<string, ProductCost | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<"simples" | "completo">("completo");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [printTimeHours, setPrintTimeHours] = useState("");
  const [machineId, setMachineId] = useState("");
  const [bomLines, setBomLines] = useState<BomLine[]>([{ material_id: "", quantity_g: "" }]);
  const [manualPrice, setManualPrice] = useState("");
  const [size, setSize] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [stockQuantity, setStockQuantity] = useState("");
  const [formCategoryIds, setFormCategoryIds] = useState<string[]>([]);
  const [formPriceOnRequest, setFormPriceOnRequest] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // O formulário fica no topo da lista; ao abrir (novo ou "Editar" num
  // produto lá embaixo) leva a tela até ele, senão parece que nada aconteceu.
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ block: "start" });
  }, [showForm, editingId]);

  // As categorias moram nas configurações da loja (mesmo lugar de destaque/oculto).
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [storeSlug, setStoreSlug] = useState<string | undefined>(undefined);
  const [showCategories, setShowCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const orgPath = `/api/v1/organizations/${currentOrganizationId}`;

  const materialName = useCallback(
    (id: string) => materials.find((m) => m.id === id)?.name ?? "—",
    [materials]
  );

  const load = useCallback(async () => {
    if (!accessToken || !currentOrganizationId) return;
    setIsLoading(true);
    try {
      const [productsData, materialsData, machinesData, profilesData, store] = await Promise.all([
        apiFetch<Product[]>(`${orgPath}/products`, { accessToken }),
        apiFetch<Material[]>(`${orgPath}/materials`, { accessToken }),
        apiFetch<Machine[]>(`${orgPath}/machines`, { accessToken }),
        apiFetch<CostProfile[]>(`${orgPath}/cost-profiles`, { accessToken }),
        apiFetch<StoreAdminResponse>(`${orgPath}/store`, { accessToken }).catch(() => null),
      ]);
      setProducts(productsData);
      setStoreSettings(store ? { ...store.settings, categories: store.settings.categories ?? [] } : null);
      setStoreSlug(store?.slug);
      setMaterials(materialsData);
      setMachines(machinesData);
      setCostProfiles(profilesData);

      const defaultProfile = profilesData.find((p) => p.is_default) ?? profilesData[0];
      if (defaultProfile) {
        try {
          const items = await apiFetch<ProductCostItem[]>(
            `${orgPath}/products/costs?cost_profile_id=${defaultProfile.id}`,
            { accessToken }
          );
          setCosts(Object.fromEntries(items.map((item) => [item.product_id, item])));
        } catch {
          setCosts({});
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar produtos.");
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

  function updateBomLine(index: number, patch: Partial<BomLine>) {
    setBomLines((lines) => lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addBomLine() {
    setBomLines((lines) => [...lines, { material_id: "", quantity_g: "" }]);
  }

  function removeBomLine(index: number) {
    setBomLines((lines) => lines.filter((_, i) => i !== index));
  }

  const categories = storeSettings?.categories ?? [];

  async function saveCategories(next: StoreCategory[]): Promise<boolean> {
    return saveStore({ categories: next });
  }

  async function saveStore(patch: Partial<StoreSettings>): Promise<boolean> {
    if (!accessToken || !storeSettings) return false;
    setIsSavingCategories(true);
    setError(null);
    try {
      const saved = await apiFetch<StoreAdminResponse>(`${orgPath}/store`, {
        method: "PUT",
        accessToken,
        body: JSON.stringify({ ...storeSettings, ...patch }),
      });
      setStoreSettings({ ...saved.settings, categories: saved.settings.categories ?? [] });
      refreshPublicStoreCache(saved.slug);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar na loja.");
      return false;
    } finally {
      setIsSavingCategories(false);
    }
  }

  async function handleAddCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    if (await saveCategories([...categories, { id: newCategoryId(), name, product_ids: [] }])) {
      setNewCategoryName("");
    }
  }

  async function handleRenameCategory(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    if (await saveCategories(categories.map((c) => (c.id === id ? { ...c, name } : c)))) {
      setRenamingId(null);
    }
  }

  async function handleDeleteCategory(category: StoreCategory) {
    if (!window.confirm(`Apagar a categoria "${category.name}"? Os produtos não são apagados.`)) return;
    if (await saveCategories(categories.filter((c) => c.id !== category.id))) {
      if (categoryFilter === category.id) setCategoryFilter(null);
    }
  }

  function toggleFormCategory(id: string) {
    setFormCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function resetForm() {
    setName("");
    setDescription("");
    setPrintTimeHours("");
    setMachineId("");
    setBomLines([{ material_id: "", quantity_g: "" }]);
    setManualPrice("");
    setSize("");
    setPhotoUrls([]);
    setStockQuantity("");
    setFormCategoryIds([]);
    setFormPriceOnRequest(false);
    setMode("completo");
    setEditingId(null);
    setShowForm(false);
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0 || !accessToken) return;
    event.target.value = "";
    setIsUploadingPhoto(true);
    setError(null);
    try {
      for (const file of files) {
        const { url } = await uploadImage(`${orgPath}/uploads/image`, accessToken, file);
        setPhotoUrls((urls) => [...urls, url]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao enviar foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((urls) => urls.filter((u) => u !== url));
  }

  function setCoverPhoto(url: string) {
    setPhotoUrls((urls) => [url, ...urls.filter((u) => u !== url)]);
  }

  // Passa para preço digitado à mão, já preenchido com o preço calculado
  // (para o usuário só ajustar em vez de começar do zero).
  function switchToManualPrice(productId: string | null = editingId) {
    setMode("simples");
    const suggested = productId ? costs[productId]?.suggested_price : undefined;
    setManualPrice((current) => current || (suggested != null ? suggested.toFixed(2) : ""));
  }

  function startEditWithManualPrice(product: Product) {
    startEdit(product);
    switchToManualPrice(product.id);
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setName(product.name);
    setDescription(product.description ?? "");
    setPrintTimeHours(product.print_time_hours != null ? String(product.print_time_hours) : "");
    setMachineId(product.machine_id ?? "");
    setBomLines(
      product.materials.length > 0
        ? product.materials.map((l) => ({
            material_id: l.material_id,
            quantity_g: String(l.quantity_g),
          }))
        : [{ material_id: "", quantity_g: "" }]
    );
    setManualPrice(product.manual_price != null ? String(product.manual_price) : "");
    setSize(product.size ?? "");
    setPhotoUrls(product.photo_urls ?? []);
    setStockQuantity(product.stock_quantity != null ? String(product.stock_quantity) : "");
    setFormCategoryIds(categories.filter((c) => c.product_ids.includes(product.id)).map((c) => c.id));
    setFormPriceOnRequest(storeSettings?.price_on_request_product_ids?.includes(product.id) ?? false);
    setMode(product.manual_price != null ? "simples" : "completo");
    setShowForm(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    const validLines = mode === "simples" ? [] : bomLines.filter((l) => l.material_id && l.quantity_g);
    setIsSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name,
        description: description || null,
        print_time_hours: mode === "simples" ? null : printTimeHours ? Number(printTimeHours) : null,
        machine_id: mode === "simples" ? null : machineId || null,
        manual_price: mode === "simples" ? Number(manualPrice) : null,
        size: size || null,
        photo_urls: photoUrls,
        stock_quantity: stockQuantity !== "" ? Number(stockQuantity) : null,
        materials: validLines.map((l) => ({
          material_id: l.material_id,
          quantity_g: Number(l.quantity_g),
        })),
      });
      let productId = editingId;
      if (editingId) {
        await apiFetch(`${orgPath}/products/${editingId}`, { method: "PATCH", accessToken, body });
      } else {
        const created = await apiFetch<Product>(`${orgPath}/products`, { method: "POST", accessToken, body });
        productId = created.id;
      }
      if (productId && storeSettings) {
        const patch: Partial<StoreSettings> = {};
        const next = assignProduct(categories, productId, formCategoryIds);
        if (next.some((c, i) => c !== categories[i])) patch.categories = next;
        const onRequest = storeSettings.price_on_request_product_ids ?? [];
        if (onRequest.includes(productId) !== formPriceOnRequest) {
          patch.price_on_request_product_ids = formPriceOnRequest
            ? [...onRequest, productId]
            : onRequest.filter((id) => id !== productId);
        }
        if (Object.keys(patch).length > 0) await saveStore(patch);
      }
      resetForm();
      refreshPublicStoreCache(storeSlug);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar produto.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    if (!accessToken) return;
    if (!window.confirm(`Excluir o produto "${product.name}"?`)) return;
    setError(null);
    try {
      await apiFetch(`${orgPath}/products/${product.id}`, { method: "DELETE", accessToken });
      refreshPublicStoreCache(storeSlug);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao excluir produto.");
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Carregando…</p>
      </main>
    );
  }

  return (
    <AppShell title="Produtos">
      <div className="mx-auto max-w-5xl space-y-6">
        {error && <p className="rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>}

        {materials.length === 0 && !isLoading && (
          <p className="rounded-lg border border-yellow-800 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
            Sem materiais cadastrados ainda — isso só afeta o modo &ldquo;Completo&rdquo;; o modo
            &ldquo;Simples&rdquo; não precisa de materiais.
          </p>
        )}
        {costProfiles.length === 0 && !isLoading && (
          <p className="rounded-lg border border-yellow-800 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
            Cadastre um perfil de custo na aba Precificação (Perfil de custo) para ver o custo/preço calculado aqui.
          </p>
        )}

        {storeSettings && (
          <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">Categorias</h2>
                <p className="text-xs text-neutral-500">
                  Aparecem na loja pública. Para colocar um produto numa categoria, use “Editar” no produto.
                </p>
              </div>
              <button
                onClick={() => setShowCategories((v) => !v)}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
              >
                {showCategories ? "Fechar" : "Criar / editar categorias"}
              </button>
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[{ id: null as string | null, name: "Todos", count: products.length }, ...categories.map((c) => ({
                  id: c.id as string | null,
                  name: c.name,
                  count: products.filter((p) => c.product_ids.includes(p.id)).length,
                }))].map((c) => (
                  <button
                    key={c.id ?? "all"}
                    onClick={() => setCategoryFilter(c.id)}
                    aria-pressed={categoryFilter === c.id}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      categoryFilter === c.id
                        ? "border-blue-500 bg-blue-950 text-blue-200"
                        : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                    }`}
                  >
                    {c.name} <span className="opacity-60">{c.count}</span>
                  </button>
                ))}
              </div>
            )}

            {showCategories && (
              <div className="space-y-3 border-t border-neutral-800 pt-3">
                <form onSubmit={handleAddCategory} className="flex gap-2">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nova categoria (ex.: Chaveiros)"
                    maxLength={60}
                    className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isSavingCategories || !newCategoryName.trim() || categories.length >= 30}
                    className="shrink-0 rounded bg-blue-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    + Criar
                  </button>
                </form>
                {categories.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nenhuma categoria ainda.</p>
                ) : (
                  <ul className="divide-y divide-neutral-800">
                    {categories.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                        {renamingId === c.id ? (
                          <>
                            <input
                              autoFocus
                              value={renameValue}
                              maxLength={60}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameCategory(c.id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
                            />
                            <button
                              onClick={() => handleRenameCategory(c.id)}
                              disabled={isSavingCategories || !renameValue.trim()}
                              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                            >
                              Salvar
                            </button>
                            <button onClick={() => setRenamingId(null)} className="px-2 text-xs text-neutral-400 hover:underline">
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {c.name}{" "}
                              <span className="text-xs text-neutral-500">
                                · {products.filter((p) => c.product_ids.includes(p.id)).length} produto(s)
                              </span>
                            </span>
                            <button
                              onClick={() => {
                                setRenamingId(c.id);
                                setRenameValue(c.name);
                              }}
                              className="text-xs text-blue-400 hover:underline"
                            >
                              Renomear
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(c)}
                              disabled={isSavingCategories}
                              className="text-xs text-red-400 hover:underline disabled:opacity-50"
                            >
                              Apagar
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">{products.length} produto(s) cadastrado(s)</p>
          <button
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
          >
            {showForm ? "Cancelar" : "+ Novo produto"}
          </button>
        </div>

        {showForm && (
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="scroll-mt-24 space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="truncate font-medium">
                {editingId
                  ? `Editando: ${products.find((p) => p.id === editingId)?.name ?? "produto"}`
                  : "Novo produto"}
              </h2>
              <button type="button" onClick={resetForm} className="shrink-0 text-sm text-neutral-400 hover:underline">
                Cancelar
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("completo")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === "completo"
                    ? "border-blue-500 bg-blue-950 text-blue-200"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                }`}
              >
                Completo (produção)
              </button>
              <button
                type="button"
                onClick={() => switchToManualPrice()}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === "simples"
                    ? "border-blue-500 bg-blue-950 text-blue-200"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                }`}
              >
                Simples (manual)
              </button>
            </div>
            {mode === "simples" ? (
              <p className="text-xs text-neutral-500">
                Só nome e preço — sem máquina, material ou perfil de custo.
              </p>
            ) : (
              editingId &&
              costs[editingId] && (
                <p className="text-xs text-neutral-400">
                  Preço calculado hoje:{" "}
                  <span className="font-medium text-green-400">{formatCurrency(costs[editingId]!.suggested_price)}</span>{" "}
                  (custo {formatCurrency(costs[editingId]!.production_cost)}).{" "}
                  <button type="button" onClick={() => switchToManualPrice()} className="text-blue-400 hover:underline">
                    Prefiro digitar o preço
                  </button>
                </p>
              )
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input required placeholder="Nome do produto" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 sm:col-span-2" />
              <input placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 sm:col-span-2" />
              {mode === "simples" ? (
                <>
                  <input required type="number" step="0.01" min="0" placeholder="Preço de venda (R$)" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
                  <input placeholder="Tamanho (opcional, ex: 10x5x3cm)" value={size} onChange={(e) => setSize(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
                </>
              ) : (
                <>
                  <input type="number" step="0.01" placeholder="Tempo de impressão (h)" value={printTimeHours} onChange={(e) => setPrintTimeHours(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
                  <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2">
                    <option value="">Máquina (opcional)</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <input placeholder="Tamanho (opcional, ex: 10x5x3cm)" value={size} onChange={(e) => setSize(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 sm:col-span-2" />
                </>
              )}
              <input
                type="number"
                step="1"
                min="0"
                placeholder="Quantidade em estoque (opcional, 0 = esgotado)"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 sm:col-span-2"
              />
              <p className="text-xs text-neutral-500 sm:col-span-2">
                Deixe em branco para não controlar estoque (sempre disponível).
              </p>
            </div>

            {storeSettings && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-neutral-800 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={formPriceOnRequest}
                  onChange={(e) => setFormPriceOnRequest(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span>
                  <span className="block text-sm">Preço a consultar na loja</span>
                  <span className="block text-xs text-neutral-500">
                    O cliente vê “Preço a consultar” em vez do valor e combina pelo WhatsApp.
                  </span>
                </span>
              </label>
            )}

            {storeSettings && (
              <div className="space-y-1.5">
                <label className="block text-xs text-neutral-500">Categorias (pode marcar mais de uma)</label>
                {categories.length === 0 ? (
                  <p className="text-xs text-neutral-600">
                    Nenhuma categoria criada — use “Criar / editar categorias” acima.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((c) => {
                      const on = formCategoryIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleFormCategory(c.id)}
                          aria-pressed={on}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            on
                              ? "border-blue-500 bg-blue-950 text-blue-200"
                              : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                          }`}
                        >
                          {on ? "✓ " : ""}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs text-neutral-500">Fotos do produto (opcional, pode selecionar várias)</label>
              <input type="file" accept="image/*" multiple onChange={handlePhotoChange} className="block w-full text-sm" />
              {isUploadingPhoto && <p className="text-xs text-neutral-500">Enviando foto…</p>}
              {photoUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photoUrls.map((url, i) => (
                    <div key={url} className="relative">
                      <img
                        src={url}
                        alt=""
                        className={`h-20 w-20 rounded object-cover ${i === 0 ? "ring-2 ring-blue-500" : ""}`}
                      />
                      {i === 0 ? (
                        <span className="absolute bottom-0 left-0 right-0 rounded-b bg-blue-600/90 py-0.5 text-center text-[10px] text-white">
                          Capa
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCoverPhoto(url)}
                          className="absolute bottom-0 left-0 right-0 rounded-b bg-black/70 py-0.5 text-center text-[10px] text-neutral-200 hover:bg-black/90"
                        >
                          Definir capa
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(url)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs leading-none text-white hover:bg-red-500"
                        aria-label="Remover foto"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {mode === "completo" && (
              <div className="space-y-2">
                <p className="text-xs text-neutral-500">
                  Quanto material esse produto consome por unidade
                </p>
                {bomLines.map((line, index) => (
                  <div key={index} className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={line.material_id}
                      onChange={(e) => updateBomLine(index, { material_id: e.target.value })}
                      className="w-full min-w-0 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm sm:flex-1"
                    >
                      <option value="">Selecione o material…</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Gramas"
                        value={line.quantity_g}
                        onChange={(e) => updateBomLine(index, { quantity_g: e.target.value })}
                        className="w-full min-w-0 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm sm:w-28"
                      />
                      <button
                        type="button"
                        onClick={() => removeBomLine(index)}
                        disabled={bomLines.length === 1}
                        className="shrink-0 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:border-red-700 hover:text-red-400 disabled:opacity-30"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addBomLine}
                  className="text-sm text-blue-400 hover:underline"
                >
                  + Adicionar material
                </button>
              </div>
            )}

            <button type="submit" disabled={isSaving || isUploadingPhoto} className="w-full rounded bg-blue-600 px-4 py-2 font-medium disabled:opacity-50">
              {isSaving ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar produto"}
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {isLoading ? (
            <p className="text-neutral-500">Carregando…</p>
          ) : products.length === 0 ? (
            <p className="text-neutral-500">Nenhum produto cadastrado ainda.</p>
          ) : (
            products
              .filter(
                (product) =>
                  !categoryFilter ||
                  categories.some((c) => c.id === categoryFilter && c.product_ids.includes(product.id))
              )
              .map((product) => {
              const cost = costs[product.id];
              const isManual = product.manual_price != null;
              return (
                <div key={product.id} className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      {product.photo_urls.length > 0 && (
                        <div className="relative shrink-0">
                          <img
                            src={product.photo_urls[0]}
                            alt=""
                            className="h-14 w-14 rounded object-cover"
                            style={focusStyle(product.photo_focus, product.photo_urls[0])}
                          />
                          {product.photo_urls.length > 1 && (
                            <span className="absolute -right-1 -top-1 rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
                              +{product.photo_urls.length - 1}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="truncate font-medium">{product.name}</h3>
                        {product.description && (
                          <p className="truncate text-xs text-neutral-500">{product.description}</p>
                        )}
                        {product.size && (
                          <p className="text-xs text-neutral-500">{product.size}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {product.print_time_hours != null && (
                        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                          {product.print_time_hours}h
                        </span>
                      )}
                      {product.stock_quantity != null && (
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            product.stock_quantity === 0
                              ? "bg-red-950 text-red-300"
                              : "bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          {product.stock_quantity === 0 ? "Esgotado" : `${product.stock_quantity} em estoque`}
                        </span>
                      )}
                    </div>
                  </div>

                  {storeSettings?.price_on_request_product_ids?.includes(product.id) && (
                    <p className="text-xs text-purple-300">Na loja: preço a consultar</p>
                  )}

                  {categories.some((c) => c.product_ids.includes(product.id)) && (
                    <div className="flex flex-wrap gap-1">
                      {categories
                        .filter((c) => c.product_ids.includes(product.id))
                        .map((c) => (
                          <span key={c.id} className="rounded-full bg-blue-950/60 px-2 py-0.5 text-[11px] text-blue-300">
                            {c.name}
                          </span>
                        ))}
                    </div>
                  )}

                  {product.materials.length > 0 && (
                    <ul className="text-xs text-neutral-400">
                      {product.materials.map((line, i) => (
                        <li key={i}>
                          {materialName(line.material_id)} — {line.quantity_g}g
                        </li>
                      ))}
                    </ul>
                  )}

                  {isManual ? (
                    <div className="flex items-center justify-between border-t border-neutral-800 pt-2 text-sm">
                      <span className="text-neutral-500">Preço manual</span>
                      <span className="font-medium text-green-400">{formatCurrency(product.manual_price)}</span>
                    </div>
                  ) : cost ? (
                    <div className="flex items-center justify-between border-t border-neutral-800 pt-2 text-sm">
                      <span className="text-neutral-400">Custo: {formatCurrency(cost.production_cost)}</span>
                      <span className="font-medium text-green-400">Venda (calculada): {formatCurrency(cost.suggested_price)}</span>
                    </div>
                  ) : (
                    <p className="border-t border-neutral-800 pt-2 text-xs text-neutral-600">
                      Cadastre um perfil de custo para ver o preço sugerido.
                    </p>
                  )}

                  <div className="flex gap-3 border-t border-neutral-800 pt-2">
                    <button onClick={() => startEdit(product)} className="text-xs text-blue-400 hover:underline">
                      Editar
                    </button>
                    {!isManual && (
                      <button
                        onClick={() => startEditWithManualPrice(product)}
                        className="text-xs text-green-400 hover:underline"
                      >
                        Definir preço
                      </button>
                    )}
                    <button onClick={() => handleDelete(product)} className="text-xs text-red-400 hover:underline">
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
