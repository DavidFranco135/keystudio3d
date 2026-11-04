"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { StoreAdminResponse } from "@/lib/store";
import type { Customer, Order, OrderItem, Product } from "@/lib/types";
import {
  DEFAULT_PAYMENT,
  EMPTY_SUPPLIER,
  PAYMENT_METHODS,
  downloadOrderPdf,
  orderNumber,
  type CompanyInfo,
  type PaymentInfo,
  type SupplierInfo,
} from "@/lib/order-pdf";

// Forma de pagamento escolhida fica salva neste navegador, por pedido, e a
// última usada vira o padrão do próximo PDF.
const PREF_KEY = (orderId: string) => `pedido-pdf:${orderId}`;
const LAST_KEY = "pedido-pdf:last";

function readPref(orderId: string): PaymentInfo {
  try {
    const raw = localStorage.getItem(PREF_KEY(orderId));
    if (raw) return { ...DEFAULT_PAYMENT, ...JSON.parse(raw) };
    const last = localStorage.getItem(LAST_KEY);
    if (last) {
      const l = JSON.parse(last) as Partial<PaymentInfo>;
      // Do último pedido aproveita só o que costuma se repetir.
      return {
        ...DEFAULT_PAYMENT,
        method: l.method ?? DEFAULT_PAYMENT.method,
        details: l.details ?? "",
        validityDays: l.validityDays ?? 7,
        termDays: l.termDays ?? 0,
        shippingNote: l.shippingNote ?? DEFAULT_PAYMENT.shippingNote,
      };
    }
  } catch {
    /* armazenamento indisponível */
  }
  return DEFAULT_PAYMENT;
}

function writePref(orderId: string, p: PaymentInfo) {
  try {
    localStorage.setItem(PREF_KEY(orderId), JSON.stringify(p));
    localStorage.setItem(LAST_KEY, JSON.stringify(p));
  } catch {
    /* armazenamento indisponível */
  }
}

// Dados do fornecedor (CPF, banco, PIX) ficam só neste aparelho: as
// configurações da loja no servidor são públicas.
const SUPPLIER_KEY = (orgId: string) => `pdf-fornecedor:${orgId}`;

function readSupplier(orgId: string): SupplierInfo {
  try {
    const raw = localStorage.getItem(SUPPLIER_KEY(orgId));
    if (raw) return { ...EMPTY_SUPPLIER, ...JSON.parse(raw) };
  } catch {
    /* armazenamento indisponível */
  }
  return EMPTY_SUPPLIER;
}

function writeSupplier(orgId: string, s: SupplierInfo) {
  try {
    localStorage.setItem(SUPPLIER_KEY(orgId), JSON.stringify(s));
  } catch {
    /* armazenamento indisponível */
  }
}

let companyCache: { orgId: string; info: CompanyInfo } | null = null;

async function loadCompany(orgPath: string, orgId: string, accessToken: string): Promise<CompanyInfo> {
  if (companyCache?.orgId === orgId) return companyCache.info;
  let info: CompanyInfo = { name: "KeyStudio3D" };
  try {
    const store = await apiFetch<StoreAdminResponse>(`${orgPath}/store`, { accessToken });
    const s = store.settings;
    info = {
      name: s.display_name?.trim() || store.name || "KeyStudio3D",
      whatsapp: s.whatsapp || undefined,
      instagram: s.instagram || undefined,
      address: s.address || undefined,
      hours: s.hours || undefined,
    };
  } catch {
    /* sem dados da loja: usa só o nome */
  }
  companyCache = { orgId, info };
  return info;
}

const field = "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm";
const label = "mb-1 block text-xs text-neutral-500";

export function OrderPdfDialog({
  order,
  customer,
  items,
  products,
  orgPath,
  orgId,
  accessToken,
  onClose,
}: {
  order: Order;
  customer: Customer | null;
  items: OrderItem[] | undefined;
  products: Product[];
  orgPath: string;
  orgId: string;
  accessToken: string;
  onClose: () => void;
}) {
  const [pay, setPay] = useState<PaymentInfo>(DEFAULT_PAYMENT);
  const [sup, setSup] = useState<SupplierInfo>(EMPTY_SUPPLIER);
  const [showSupplier, setShowSupplier] = useState(false);
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [loadedItems, setLoadedItems] = useState<OrderItem[] | undefined>(items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isQuote = order.status === "quote";

  useEffect(() => {
    const p = readPref(order.id);
    const supplier = readSupplier(orgId);
    const id = setTimeout(() => {
      setPay(p);
      setSup(supplier);
      setShowSupplier(!supplier.name.trim() || !supplier.document.trim());
      setDiscount(p.discount ? String(p.discount) : "");
      setShipping(p.shipping ? String(p.shipping) : "");
    }, 0);
    return () => clearTimeout(id);
  }, [order.id, orgId]);

  useEffect(() => {
    if (items) return;
    let cancelled = false;
    apiFetch<OrderItem[]>(`${orgPath}/orders/${order.id}/items`, { accessToken })
      .then((data) => !cancelled && setLoadedItems(data))
      .catch(() => !cancelled && setError("Falha ao carregar os itens do pedido."));
    return () => {
      cancelled = true;
    };
  }, [items, orgPath, order.id, accessToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = items ?? loadedItems;
  const subtotal = (list ?? []).reduce((s, i) => s + (i.unit_price ?? 0) * i.quantity, 0);
  const d = Math.max(0, Number(discount.replace(",", ".")) || 0);
  const f = Math.max(0, Number(shipping.replace(",", ".")) || 0);
  const total = Math.max(0, subtotal - d + f);

  async function handleGenerate() {
    if (!list) return;
    setBusy(true);
    setError(null);
    const payment: PaymentInfo = { ...pay, discount: d, shipping: f };
    try {
      writePref(order.id, payment);
      writeSupplier(orgId, sup);
      const company = await loadCompany(orgPath, orgId, accessToken);
      await downloadOrderPdf({ order, customer, items: list, products, company, supplier: sup, payment });
      onClose();
    } catch {
      setError("Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-dialog-title"
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-950 p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="pdf-dialog-title" className="text-lg font-semibold">
              {isQuote ? "PDF do orçamento" : "PDF do pedido"} #{orderNumber(order)}
            </h2>
            <p className="text-sm text-neutral-500">{customer?.name ?? "Cliente"}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-neutral-500 hover:text-neutral-300" aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-neutral-800">
          <button
            type="button"
            onClick={() => setShowSupplier((v) => !v)}
            aria-expanded={showSupplier}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
          >
            <span>
              <span className="font-medium text-neutral-200">Seus dados (fornecedor)</span>
              <span className="block text-xs text-neutral-500">
                {sup.name.trim()
                  ? [sup.name.trim(), sup.document.trim() && `CPF/CNPJ ${sup.document.trim()}`].filter(Boolean).join(" · ")
                  : "Nome, CPF, contato e dados bancários — preencha uma vez"}
              </span>
            </span>
            <span className={`text-xs text-neutral-500 transition-transform ${showSupplier ? "rotate-180" : ""}`}>▾</span>
          </button>
          {showSupplier && (
            <div className="grid grid-cols-2 gap-3 border-t border-neutral-800 p-3">
              <div className="col-span-2">
                <label className={label}>Nome completo / razão social</label>
                <input value={sup.name} onChange={(e) => setSup({ ...sup, name: e.target.value })} className={field} />
              </div>
              <div>
                <label className={label}>CPF (ou CNPJ)</label>
                <input inputMode="numeric" value={sup.document} onChange={(e) => setSup({ ...sup, document: e.target.value })} className={field} />
              </div>
              <div>
                <label className={label}>Telefone / WhatsApp</label>
                <input inputMode="tel" placeholder="Usa o da loja se vazio" value={sup.phone} onChange={(e) => setSup({ ...sup, phone: e.target.value })} className={field} />
              </div>
              <div className="col-span-2">
                <label className={label}>E-mail comercial</label>
                <input type="email" value={sup.email} onChange={(e) => setSup({ ...sup, email: e.target.value })} className={field} />
              </div>
              <div className="col-span-2">
                <label className={label}>Endereço</label>
                <input placeholder="Rua, nº, bairro, cidade - UF, CEP" value={sup.address} onChange={(e) => setSup({ ...sup, address: e.target.value })} className={field} />
              </div>
              <div className="col-span-2">
                <label className={label}>Banco</label>
                <input placeholder="Ex.: 260 - Nubank" value={sup.bank} onChange={(e) => setSup({ ...sup, bank: e.target.value })} className={field} />
              </div>
              <div>
                <label className={label}>Agência</label>
                <input value={sup.agency} onChange={(e) => setSup({ ...sup, agency: e.target.value })} className={field} />
              </div>
              <div>
                <label className={label}>Conta (com dígito)</label>
                <input value={sup.account} onChange={(e) => setSup({ ...sup, account: e.target.value })} className={field} />
              </div>
              <div className="col-span-2">
                <label className={label}>Chave PIX</label>
                <input value={sup.pixKey} onChange={(e) => setSup({ ...sup, pixKey: e.target.value })} className={field} />
              </div>
              <p className="col-span-2 text-xs text-neutral-500">
                Fica salvo só neste aparelho e aparece em todos os PDFs.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>A/C (comprador ou setor)</label>
            <input placeholder="Opcional" value={pay.attention} onChange={(e) => setPay({ ...pay, attention: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Nº pedido de compra</label>
            <input placeholder="Opcional" value={pay.purchaseOrder} onChange={(e) => setPay({ ...pay, purchaseOrder: e.target.value })} className={field} />
          </div>
          <div className="col-span-2">
            <label className={label}>Forma de pagamento</label>
            <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className={field}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value="A combinar">A combinar</option>
            </select>
          </div>
          <div>
            <label className={label}>Parcelas</label>
            <select
              value={pay.installments}
              onChange={(e) => setPay({ ...pay, installments: Number(e.target.value) })}
              className={field}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Entrada</label>
            <select
              value={pay.downPaymentPercent}
              onChange={(e) => setPay({ ...pay, downPaymentPercent: Number(e.target.value) })}
              className={field}
            >
              <option value={0}>Sem entrada</option>
              <option value={30}>30%</option>
              <option value={40}>40%</option>
              <option value={50}>50%</option>
              <option value={60}>60%</option>
              <option value={70}>70%</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={label}>Prazo para pagamento</label>
            <select value={pay.termDays} onChange={(e) => setPay({ ...pay, termDays: Number(e.target.value) })} className={field}>
              <option value={0}>Sem prazo (na aprovação)</option>
              {[7, 10, 14, 15, 21, 28, 30, 45, 60].map((d) => (
                <option key={d} value={d}>{d} dias após a emissão</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Desconto (R$)</label>
            <input inputMode="decimal" placeholder="0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Frete / entrega (R$)</label>
            <input inputMode="decimal" placeholder="0,00" value={shipping} onChange={(e) => setShipping(e.target.value)} className={field} />
          </div>
          {f === 0 && (
            <div className="col-span-2">
              <label className={label}>Frete sem valor aparece como</label>
              <select value={pay.shippingNote} onChange={(e) => setPay({ ...pay, shippingNote: e.target.value })} className={field}>
                <option value="A combinar">A combinar</option>
                <option value="Incluso">Incluso</option>
                <option value="Por conta do cliente">Por conta do cliente</option>
                <option value="Retirada no local">Retirada no local</option>
              </select>
            </div>
          )}
          {isQuote && (
            <div className="col-span-2">
              <label className={label}>Validade do orçamento (dias)</label>
              <input
                type="number"
                min={1}
                value={pay.validityDays}
                onChange={(e) => setPay({ ...pay, validityDays: Math.max(1, Number(e.target.value) || 1) })}
                className={field}
              />
            </div>
          )}
          <div className="col-span-2">
            <label className={label}>Informações adicionais de pagamento (opcional)</label>
            <textarea
              rows={2}
              placeholder="Ex.: enviar comprovante para o e-mail…"
              value={pay.details}
              onChange={(e) => setPay({ ...pay, details: e.target.value })}
              className={field}
            />
          </div>
        </div>

        <div className="mt-4 space-y-1 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
          <div className="flex justify-between text-neutral-400">
            <span>Subtotal ({list ? list.length : "…"} itens)</span>
            <span>{list ? formatCurrency(subtotal) : "…"}</span>
          </div>
          {d > 0 && (
            <div className="flex justify-between text-neutral-400">
              <span>Desconto</span>
              <span>- {formatCurrency(d)}</span>
            </div>
          )}
          {f > 0 && (
            <div className="flex justify-between text-neutral-400">
              <span>Frete</span>
              <span>{formatCurrency(f)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-neutral-100">
            <span>Total no PDF</span>
            <span>{list ? formatCurrency(total) : "…"}</span>
          </div>
        </div>

        {error && <p className="mt-3 rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={busy || !list}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Gerando PDF…" : !list ? "Carregando itens…" : "Baixar PDF"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm text-neutral-400 hover:border-neutral-500">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
