// Nomes e cores dos status de pedido, usados em Pedidos e em Clientes.
export const STATUS_LABELS: Record<string, string> = {
  quote: "Orçamento",
  order: "Pedido",
  paid: "Pago",
  production: "Produção",
  printing: "Imprimindo",
  finishing: "Acabamento",
  packaging: "Embalagem",
  delivered: "Entregue",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const STATUS_TONE: Record<string, string> = {
  quote: "bg-neutral-800 text-neutral-300",
  order: "bg-blue-950 text-blue-300",
  paid: "bg-cyan-950 text-cyan-300",
  production: "bg-purple-950 text-purple-300",
  printing: "bg-purple-950 text-purple-300",
  finishing: "bg-indigo-950 text-indigo-300",
  packaging: "bg-indigo-950 text-indigo-300",
  delivered: "bg-green-950 text-green-300",
  completed: "bg-green-950 text-green-300",
  cancelled: "bg-red-950 text-red-300",
};

export type OrderStage = "open" | "finished" | "cancelled";

// Entregue/concluído = finalizado; cancelado à parte; o resto está em andamento.
export function orderStage(status: string): OrderStage {
  if (status === "cancelled") return "cancelled";
  if (status === "delivered" || status === "completed") return "finished";
  return "open";
}
