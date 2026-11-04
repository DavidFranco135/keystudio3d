// Gera o PDF A4 do pedido/orçamento para o cliente (feito no navegador).
// Layout: faixa preta com a logo KeyStudio3D, dados do cliente, dados do
// pedido, tabela de itens, totais, forma de pagamento, observações e rodapé.
import type { Customer, Order, OrderItem, Product } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/order-status";

export const PAYMENT_METHODS = [
  "PIX",
  "Cartão de crédito",
  "Cartão de débito",
  "Dinheiro",
  "Boleto bancário",
  "Transferência bancária",
] as const;

export type PaymentInfo = {
  method: string;
  // 1 = à vista. Mais de 1 = parcelado.
  installments: number;
  // Entrada em % do total (0 = sem entrada). Ex.: 50 = metade antes de produzir.
  downPaymentPercent: number;
  discount: number;
  shipping: number;
  // Validade do orçamento, em dias (só aparece quando o pedido é orçamento).
  validityDays: number;
  // Texto livre: condições combinadas, instruções extras…
  details: string;
  // Prazo para pagamento em dias após a emissão (0 = sem prazo / na aprovação).
  termDays: number;
  // A/C: comprador ou setor responsável na empresa cliente.
  attention: string;
  // Nº do pedido de compra (PO) enviado pela empresa cliente.
  purchaseOrder: string;
  // Texto do frete quando não há valor: "Incluso", "Por conta do cliente"…
  shippingNote: string;
};

export const DEFAULT_PAYMENT: PaymentInfo = {
  method: "PIX",
  installments: 1,
  downPaymentPercent: 0,
  discount: 0,
  shipping: 0,
  validityDays: 7,
  details: "",
  termDays: 0,
  attention: "",
  purchaseOrder: "",
  shippingNote: "A combinar",
};

// Dados de quem vende (fornecedor) e para onde a empresa paga.
export type SupplierInfo = {
  name: string;
  document: string; // CPF ou CNPJ
  email: string;
  phone: string;
  address: string;
  bank: string;
  agency: string;
  account: string;
  pixKey: string;
};

export const EMPTY_SUPPLIER: SupplierInfo = {
  name: "",
  document: "",
  email: "",
  phone: "",
  address: "",
  bank: "",
  agency: "",
  account: "",
  pixKey: "",
};

export type CompanyInfo = {
  name: string;
  whatsapp?: string;
  instagram?: string;
  address?: string;
  hours?: string;
};

function docLabelFor(doc: string): string {
  const d = doc.replace(/\D/g, "");
  return d.length === 14 ? "CNPJ" : d.length === 11 ? "CPF" : "CPF / CNPJ";
}

type Rgb = [number, number, number];
const INK: Rgb = [28, 25, 23];
const MUTED: Rgb = [120, 113, 108];
const LINE: Rgb = [231, 229, 228];
const SOFT: Rgb = [250, 246, 242];
const BLACK: Rgb = [0, 0, 0];
const COPPER: Rgb = [224, 144, 96]; // cobre da logo (#e09060)
const COPPER_DARK: Rgb = [154, 79, 34]; // cobre com contraste no branco (#9a4f22)

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function dateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Datas "AAAA-MM-DD" vêm sem fuso: monta no dia local para não voltar um dia.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10)) && iso.length <= 10) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleDateString("pt-BR");
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("pt-BR");
}

export function orderNumber(order: Order): string {
  return order.id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatDocument(doc: string | null): string {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc;
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

const ADDRESS_ORDER = [
  "street", "logradouro", "rua", "endereco", "number", "numero", "complement", "complemento",
  "district", "neighborhood", "bairro", "city", "cidade", "state", "uf", "estado",
  "zip", "zipcode", "cep", "postal_code",
];

function addressText(address: Customer["address"]): string | null {
  if (!address) return null;
  const entries = Object.entries(address).filter(
    ([, v]) => (typeof v === "string" && v.trim() !== "") || typeof v === "number"
  );
  entries.sort(([a], [b]) => {
    const ia = ADDRESS_ORDER.indexOf(a.toLowerCase());
    const ib = ADDRESS_ORDER.indexOf(b.toLowerCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const parts = entries.map(([k, v]) => {
    const s = String(v).trim();
    return /^(zip|zipcode|cep|postal_code)$/i.test(k) ? `CEP ${s}` : s;
  });
  return parts.length > 0 ? parts.join(", ") : null;
}

async function loadImage(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = data;
    });
    return { data, ...size };
  } catch {
    return null;
  }
}

export type OrderPdfInput = {
  order: Order;
  customer: Customer | null;
  items: OrderItem[];
  products: Product[];
  company: CompanyInfo;
  supplier: SupplierInfo;
  payment: PaymentInfo;
};

export function pdfFileName(order: Order, customer: Customer | null): string {
  const kind = order.status === "quote" ? "Orcamento" : "Pedido";
  const who = (customer?.name ?? "cliente")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${kind}-${orderNumber(order)}-${who || "cliente"}.pdf`;
}

export async function buildOrderPdf(input: OrderPdfInput) {
  const { order, customer, items, products, company, payment } = input;
  const sup = input.supplier;
  // Nome de quem vende: o do fornecedor, senão o da loja.
  const sellerName = sup.name.trim() || company.name;
  const sellerPhone = sup.phone.trim() || company.whatsapp || "";
  const sellerAddress = sup.address.trim() || company.address || "";
  const sellerDoc = sup.document.trim()
    ? `${docLabelFor(sup.document)} ${formatDocument(sup.document)}`
    : "";
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth(); // 210
  const H = doc.internal.pageSize.getHeight(); // 297
  const M = 14; // margem lateral
  const CW = W - M * 2;
  const isQuote = order.status === "quote";
  const title = isQuote ? "ORÇAMENTO" : "PEDIDO DE VENDA";
  const number = orderNumber(order);
  const now = new Date();

  const setText = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);

  doc.setProperties({
    title: `${title} Nº ${number} — ${company.name}`,
    subject: `${title} para ${customer?.name ?? "cliente"}`,
    author: company.name,
    creator: company.name,
  });

  // ---------- Cabeçalho (faixa preta da marca) ----------
  const HEADER_H = 42;
  const logo = await loadImage("/brand/keystudio3d-logo-pdf.jpg");
  const drawHeader = (compact: boolean) => {
    const h = compact ? 22 : HEADER_H;
    setFill(BLACK);
    doc.rect(0, 0, W, h, "F");
    setFill(COPPER);
    doc.rect(0, h, W, 1.2, "F");
    if (logo) {
      const lh = h - (compact ? 4 : 6);
      const lw = (logo.w / logo.h) * lh;
      doc.addImage(logo.data, "JPEG", M - 2, (h - lh) / 2, lw, lh, "logo", "FAST");
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      setText(COPPER);
      doc.text(company.name, M, h / 2 + 3);
    }
    // Bloco do documento (direita)
    const rx = W - M;
    if (compact) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setText(COPPER);
      doc.text(`${title} Nº ${number}`, rx, 12.5, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setText([200, 190, 182]);
      doc.text(`${customer?.name ?? ""}`, rx, 17, { align: "right" });
      return;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    setText(COPPER);
    doc.text(title, rx, 13.5, { align: "right" });
    doc.setFontSize(10);
    setText([255, 255, 255]);
    doc.text(`Nº ${number}  •  Emissão ${now.toLocaleDateString("pt-BR")}`, rx, 19.5, { align: "right" });
    const contact: string[] = [];
    if (sup.email.trim()) contact.push(sup.email.trim());
    if (sellerPhone) contact.push(`WhatsApp ${formatPhone(sellerPhone)}`);
    if (!sup.email.trim() && company.instagram) contact.push(`@${company.instagram.replace(/^@/, "")}`);
    let y = 26;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    setText([235, 225, 216]);
    doc.text([sellerName, sellerDoc].filter(Boolean).join("  •  "), rx, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText([200, 190, 182]);
    for (const line of [contact.join("  •  "), sellerAddress].filter(Boolean)) {
      y += 4.2;
      const wrapped = doc.splitTextToSize(line, 110) as string[];
      doc.text(wrapped[0], rx, y, { align: "right" });
    }
  };
  drawHeader(false);

  // ---------- Helpers de seção ----------
  let y = HEADER_H + 8;
  const sectionTitle = (label: string, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(COPPER_DARK);
    doc.text(label.toUpperCase(), M, yy, { charSpace: 0.4 });
    setDraw(LINE);
    doc.setLineWidth(0.3);
    const tw = doc.getTextWidth(label.toUpperCase()) + label.length * 0.4;
    doc.line(M + tw + 3, yy - 1.1, W - M, yy - 1.1);
  };
  type Field = { label: string; value: string; span?: number; plain?: boolean };
  // Grade de campos (rótulo pequeno em cima, valor embaixo), 4 colunas.
  const fieldGrid = (fields: Field[], top: number, cols = 4): number => {
    const colW = CW / cols;
    const padX = 4;
    let col = 0;
    let rowTop = top + 3.2;
    let rowH = 0;
    const rows: { f: Field; x: number; y: number; w: number; lines: string[] }[] = [];
    for (const f of fields) {
      const span = Math.min(f.span ?? 1, cols);
      if (col + span > cols) {
        rowTop += rowH;
        col = 0;
        rowH = 0;
      }
      const w = colW * span - padX * 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const lines = doc.splitTextToSize(f.value || "—", w) as string[];
      rows.push({ f, x: M + colW * col + padX, y: rowTop, w, lines });
      rowH = Math.max(rowH, 3.5 + lines.length * 4.3 + 2.2);
      col += span;
    }
    const bottom = rowTop + rowH + 0.8;
    setFill(SOFT);
    setDraw(LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, top, CW, bottom - top, 1.8, 1.8, "FD");
    for (const r of rows) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      setText(MUTED);
      doc.text(r.f.label.toUpperCase(), r.x, r.y + 1.5, { charSpace: 0.25 });
      doc.setFont("helvetica", r.f.plain ? "normal" : "bold");
      doc.setFontSize(9.5);
      setText(INK);
      doc.text(r.lines, r.x, r.y + 5.8, { lineHeightFactor: 1.3 });
    }
    return bottom;
  };

  // ---------- Dados do cliente ----------
  sectionTitle("Dados do cliente", y);
  const docDigits = (customer?.document ?? "").replace(/\D/g, "");
  const docLabel = docDigits.length === 14 ? "CNPJ" : docDigits.length === 11 ? "CPF" : "CPF / CNPJ";
  y = fieldGrid(
    [
      { label: "Nome / Razão social", value: customer?.name ?? "—", span: 2 },
      { label: docLabel, value: formatDocument(customer?.document ?? null) },
      { label: "Telefone", value: formatPhone(customer?.phone) },
      { label: "E-mail", value: customer?.email || "—", span: 2 },
      { label: "Endereço", value: addressText(customer?.address ?? null) ?? "—", span: 2 },
    ],
    y + 3
  );

  // ---------- Dados do pedido ----------
  y += 7;
  sectionTitle(isQuote ? "Dados do orçamento" : "Dados do pedido", y);
  const orderFields: Field[] = [
    { label: isQuote ? "Nº do orçamento" : "Nº do pedido", value: number },
    { label: "Data", value: dateBR(order.created_at) },
    { label: "Status", value: STATUS_LABELS[order.status] ?? order.status },
    isQuote
      ? { label: "Válido até", value: addDays(now, payment.validityDays || 7) }
      : { label: "Previsão de entrega", value: order.due_date ? dateBR(order.due_date.slice(0, 10)) : "A combinar" },
  ];
  if (isQuote && order.due_date) {
    orderFields.push({ label: "Previsão de entrega", value: dateBR(order.due_date.slice(0, 10)) });
  }
  if (payment.attention.trim()) {
    orderFields.push({ label: "A/C (aos cuidados de)", value: payment.attention.trim(), span: 2 });
  }
  if (payment.purchaseOrder.trim()) {
    orderFields.push({ label: "Pedido de compra", value: payment.purchaseOrder.trim() });
  }
  const notes = (order.notes ?? "").trim();
  if (notes) orderFields.push({ label: "Observações", value: notes, span: 4, plain: true });
  y = fieldGrid(orderFields, y + 3);

  // ---------- Itens ----------
  y += 7;
  sectionTitle("Itens", y);
  const productById = new Map(products.map((p) => [p.id, p]));
  const descByRow: { name: string; extra: string }[] = [];
  const DESC_W = CW - 10 - 16 - 30 - 32; // largura fixa da coluna Descrição
  const body = items.map((item, i) => {
    const p = item.product_id ? productById.get(item.product_id) : undefined;
    const name = p?.name ?? "Item personalizado";
    const extra = [p?.size ? `Tamanho: ${p.size}` : "", p?.description ? p.description.replace(/\s+/g, " ").slice(0, 140) : ""]
      .filter(Boolean)
      .join(" — ");
    descByRow.push({ name, extra });
    const unit = item.unit_price ?? 0;
    return [
      String(i + 1).padStart(2, "0"),
      name,
      String(item.quantity),
      brl(unit),
      brl(unit * item.quantity),
    ];
  });

  autoTable(doc, {
    startY: y + 3,
    margin: { left: M, right: M, top: 32, bottom: 20 },
    head: [["#", "Descrição", "Qtd.", "Valor unit.", "Total"]],
    body: body.length > 0 ? body : [["", "Nenhum item neste pedido.", "", "", ""]],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: INK,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineColor: LINE,
      lineWidth: { bottom: 0.25 },
      valign: "top",
    },
    headStyles: {
      fillColor: [28, 22, 18],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: [252, 250, 248] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center", textColor: MUTED },
      1: { cellWidth: DESC_W, fontStyle: "bold" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 32, halign: "right", fontStyle: "bold" },
    },
    // Nome do produto em negrito; tamanho/descrição em cinza menor embaixo.
    // A célula guarda só o nome e reserva a altura exata do detalhe.
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2) {
        data.cell.styles.halign = data.column.index === 2 ? "center" : "right";
      }
      if (data.section !== "body" || data.column.index !== 1) return;
      const info = descByRow[data.row.index];
      if (!info?.extra) return;
      const w = DESC_W - 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const nameLines = doc.splitTextToSize(info.name, w) as string[];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const extraLines = doc.splitTextToSize(info.extra, w) as string[];
      data.cell.text = nameLines;
      data.cell.styles.minCellHeight = 4.4 + nameLines.length * 3.65 + 1.2 + extraLines.length * 3.2 + 0.6;
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const info = descByRow[data.row.index];
      if (!info?.extra) return;
      const nameLines = data.cell.text.length;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(MUTED);
      const lines = doc.splitTextToSize(info.extra, DESC_W - 6) as string[];
      doc.text(lines, data.cell.x + 3, data.cell.y + 2.2 + nameLines * 3.65 + 1.2, {
        lineHeightFactor: 1.2,
        baseline: "top",
      });
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader(true);
    },
  });

  // ---------- Totais e pagamento ----------
  const subtotal = items.reduce((s, i) => s + (i.unit_price ?? 0) * i.quantity, 0);
  const discount = Math.max(0, payment.discount || 0);
  const shipping = Math.max(0, payment.shipping || 0);
  const total = Math.max(0, subtotal - discount + shipping);
  const qtyTotal = items.reduce((s, i) => s + i.quantity, 0);

  const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  y = lastY + 5;

  // Monta o conteúdo do quadro de pagamento antes, para saber a altura.
  const tw = 78;
  const tx = W - M - tw;
  const pw = CW - tw - 6;
  const px = M;
  const payLines: [string, string][] = [["Forma de pagamento", payment.method || "A combinar"]];
  const n = Math.max(1, Math.floor(payment.installments || 1));
  const down = Math.min(100, Math.max(0, payment.downPaymentPercent || 0));
  const term = Math.max(0, Math.floor(payment.termDays || 0));
  if (down > 0 && down < 100) {
    const downValue = (total * down) / 100;
    const rest = total - downValue;
    payLines.push(["Entrada", `${down}% — ${brl(downValue)}`]);
    payLines.push(["Restante", n > 1 ? `${n}x de ${brl(rest / n)}` : `${brl(rest)} na entrega`]);
  } else {
    payLines.push(["Condição", n > 1 ? `${n}x de ${brl(total / n)}` : term > 0 ? "Faturado" : "À vista"]);
  }
  if (term > 0) {
    payLines.push(["Prazo / vencimento", `${term} dias — vence em ${addDays(now, term)}`]);
  }
  // Dados para a empresa efetuar o pagamento.
  const bankLines: [string, string][] = [];
  if (sup.name.trim() || sup.document.trim()) {
    bankLines.push(["Favorecido", [sup.name.trim(), sellerDoc].filter(Boolean).join(" — ")]);
  }
  const bankParts = [
    sup.bank.trim() ? `Banco ${sup.bank.trim()}` : "",
    sup.agency.trim() ? `Ag. ${sup.agency.trim()}` : "",
    sup.account.trim() ? `Conta ${sup.account.trim()}` : "",
  ].filter(Boolean);
  if (bankParts.length) bankLines.push(["Dados bancários", bankParts.join("  •  ")]);
  if (sup.pixKey.trim()) bankLines.push(["Chave PIX", sup.pixKey.trim()]);
  doc.setFontSize(8.5);
  const detailLines = payment.details.trim()
    ? (doc.splitTextToSize(payment.details.trim(), pw - 8) as string[])
    : [];
  const valueLines = (v: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    return doc.splitTextToSize(v, pw - 8) as string[];
  };
  const rowsH = (rows: [string, string][]) => rows.reduce((h, [, v]) => h + 4.4 + valueLines(v).length * 4.2, 0);
  const payH =
    8 +
    rowsH(payLines) +
    (bankLines.length ? 6 + rowsH(bankLines) : 0) +
    (detailLines.length ? 2 + detailLines.length * 3.9 : 0) +
    2;
  const blockH = Math.max(48, payH + 4);
  if (y + blockH > H - 20) {
    doc.addPage();
    drawHeader(true);
    y = 32;
  }

  // Totais (direita)
  const totalRows: [string, string][] = [
    [`Subtotal (${qtyTotal} ${qtyTotal === 1 ? "unidade" : "unidades"})`, brl(subtotal)],
  ];
  if (discount > 0) totalRows.push(["Desconto", `- ${brl(discount)}`]);
  totalRows.push(["Frete / entrega", shipping > 0 ? brl(shipping) : payment.shippingNote || "A combinar"]);
  let ty = y + 2;
  doc.setFontSize(9);
  for (const [label, value] of totalRows) {
    doc.setFont("helvetica", "normal");
    setText(MUTED);
    doc.text(label, tx + 3, ty + 4);
    setText(INK);
    doc.text(value, W - M - 3, ty + 4, { align: "right" });
    setDraw(LINE);
    doc.setLineWidth(0.25);
    doc.line(tx, ty + 7, W - M, ty + 7);
    ty += 7.5;
  }
  ty += 1.5;
  setFill(BLACK);
  doc.roundedRect(tx, ty, tw, 13, 1.8, 1.8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText([255, 255, 255]);
  doc.text("TOTAL", tx + 4, ty + 8.3, { charSpace: 0.5 });
  doc.setFontSize(14);
  setText(COPPER);
  doc.text(brl(total), W - M - 4, ty + 8.8, { align: "right" });
  const totalsBottom = ty + 13;

  // Pagamento (esquerda)
  let py = y + 2;
  setFill(SOFT);
  setDraw(LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(px, py, pw, payH, 1.8, 1.8, "FD");
  setFill(COPPER);
  doc.rect(px, py + 1.8, 1.2, payH - 3.6, "F");
  const boxTitle = (label: string, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(COPPER_DARK);
    doc.text(label, px + 5, yy, { charSpace: 0.4 });
  };
  const drawRows = (rows: [string, string][]) => {
    for (const [label, value] of rows) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      setText(MUTED);
      doc.text(label.toUpperCase(), px + 5, py + 3, { charSpace: 0.25 });
      const lines = valueLines(value);
      setText(INK);
      doc.text(lines, px + 5, py + 7.2, { lineHeightFactor: 1.25 });
      py += 4.4 + lines.length * 4.2;
    }
  };
  boxTitle("PAGAMENTO", py + 6);
  py += 8;
  drawRows(payLines);
  if (bankLines.length) {
    setDraw(LINE);
    doc.setLineWidth(0.25);
    doc.line(px + 5, py + 1.2, px + pw - 4, py + 1.2);
    boxTitle("DADOS PARA PAGAMENTO", py + 5.4);
    py += 6;
    drawRows(bankLines);
  }
  if (detailLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText([68, 64, 60]);
    doc.text(detailLines, px + 5, py + 3, { lineHeightFactor: 1.3 });
  }
  y = Math.max(totalsBottom, y + 2 + payH) + 7;

  // ---------- Termos e assinatura ----------
  const terms = isQuote
    ? [
        `Orçamento válido por ${payment.validityDays || 7} dias a partir da emissão.`,
        term > 0
          ? `Pagamento em até ${term} dias após a emissão, ao favorecido indicado neste documento.`
          : "A produção é iniciada após a aprovação do orçamento e a confirmação do pagamento.",
        "Peças impressas em 3D podem apresentar pequenas variações de cor e textura, próprias do processo.",
      ]
    : [
        term > 0
          ? `Pagamento em até ${term} dias após a emissão, ao favorecido indicado neste documento.`
          : "A produção é iniciada após a confirmação do pagamento (ou da entrada combinada).",
        "Prazo de entrega contado a partir da confirmação do pagamento.",
        "Peças impressas em 3D podem apresentar pequenas variações de cor e textura, próprias do processo.",
      ];
  // Aceite com assinatura só no orçamento (é o que o cliente aprova).
  const withSignature = isQuote;
  const termsH = 5.5 + terms.length * 3.8 + (withSignature ? 16 : 0);
  if (y + termsH > H - 16) {
    doc.addPage();
    drawHeader(true);
    y = 32;
  }
  sectionTitle("Condições gerais", y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  setText(MUTED);
  terms.forEach((t, i) => doc.text(`•  ${t}`, M + 1, y + 5.5 + i * 3.8));
  y += 5.5 + terms.length * 3.8;
  if (withSignature) {
    y += 11;
    const sigW = (CW - 20) / 2;
    setDraw([168, 162, 158]);
    doc.setLineWidth(0.3);
    doc.line(M, y, M + sigW, y);
    doc.line(W - M - sigW, y, W - M, y);
    doc.setFontSize(7.8);
    setText(MUTED);
    doc.text(sellerName, M + sigW / 2, y + 4, { align: "center" });
    doc.text(`${customer?.name ?? "Cliente"} — aceite do orçamento`, W - M - sigW / 2, y + 4, { align: "center" });
  }

  // ---------- Rodapé em todas as páginas ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    setDraw(LINE);
    doc.setLineWidth(0.3);
    doc.line(M, H - 14, W - M, H - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setText(MUTED);
    const foot = [
      company.name,
      sup.name.trim() && sup.name.trim() !== company.name ? sup.name.trim() : "",
      sup.email.trim(),
      sellerPhone ? `WhatsApp ${formatPhone(sellerPhone)}` : "",
    ]
      .filter(Boolean)
      .join("  •  ");
    doc.text(foot, M, H - 9.5);
    doc.text("Este documento não é um documento fiscal.", M, H - 6);
    doc.text(`Página ${p} de ${pages}`, W - M, H - 9.5, { align: "right" });
    doc.text(`${title} Nº ${number}`, W - M, H - 6, { align: "right" });
  }

  return doc;
}

export async function downloadOrderPdf(input: OrderPdfInput): Promise<void> {
  const doc = await buildOrderPdf(input);
  doc.save(pdfFileName(input.order, input.customer));
}
