"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";

type Totals = { views: number; unique: number; whatsapp: number };
type Day = { date: string; views: number; unique: number; whatsapp: number };
type TopProduct = { product_id: string; name: string; views: number; views7: number };
type Stats = {
  online: number;
  today: Totals;
  last7: Totals;
  last30: Totals;
  days: Day[];
  top_products: TopProduct[];
};

const STATS_REFRESH_MS = 60_000;
const ONLINE_REFRESH_MS = 15_000;

function dayLabel(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function PeriodCard({ label, totals }: { label: string; totals: Totals }) {
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold">{totals.views}</p>
      <p className="text-xs text-neutral-500">
        {totals.views === 1 ? "visita" : "visitas"} · {totals.unique}{" "}
        {totals.unique === 1 ? "visitante" : "visitantes"}
      </p>
    </div>
  );
}

export function VisitStats({ orgPath, accessToken }: { orgPath: string; accessToken: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch<Stats>(`${orgPath}/store/analytics`, { accessToken });
      setStats(data);
      setOnline(data.online);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 404 || err.status === 405)
          ? "Contador indisponível: a API ainda não foi atualizada. Republique a API para ativar."
          : "Não foi possível carregar as visitas agora."
      );
    }
  }, [orgPath, accessToken]);

  const loadOnline = useCallback(async () => {
    try {
      const data = await apiFetch<{ online: number }>(`${orgPath}/store/analytics/online`, {
        accessToken,
      });
      setOnline(data.online);
    } catch {
      // mantém o último valor; o erro geral já aparece em loadStats
    }
  }, [orgPath, accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStats();
    const statsTimer = window.setInterval(() => {
      if (!document.hidden) void loadStats();
    }, STATS_REFRESH_MS);
    const onlineTimer = window.setInterval(() => {
      if (!document.hidden) void loadOnline();
    }, ONLINE_REFRESH_MS);
    return () => {
      window.clearInterval(statsTimer);
      window.clearInterval(onlineTimer);
    };
  }, [loadStats, loadOnline]);

  const maxViews = stats ? Math.max(1, ...stats.days.map((d) => d.views)) : 1;
  const topProducts = stats?.top_products ?? [];
  const maxProductViews = Math.max(1, ...topProducts.map((p) => p.views));

  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Visitas da loja</h2>
          <p className="text-xs text-neutral-500">Atualiza sozinho. Não mostra quem é o visitante, só quantos.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-neutral-800 px-3 py-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 ${
                online ? "animate-ping" : ""
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                online ? "bg-green-500" : "bg-neutral-600"
              }`}
            />
          </span>
          <span className="text-sm">
            <strong className="text-base">{online ?? "–"}</strong>{" "}
            {online === 1 ? "pessoa online agora" : "pessoas online agora"}
          </span>
        </div>
      </div>

      {error && <p className="rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>}

      {stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <PeriodCard label="Hoje" totals={stats.today} />
            <PeriodCard label="Últimos 7 dias" totals={stats.last7} />
            <PeriodCard label="Últimos 30 dias" totals={stats.last30} />
          </div>

          <div>
            <div className="flex h-24 items-end gap-0.5">
              {stats.days.map((d) => (
                <div
                  key={d.date}
                  title={`${dayLabel(d.date)}: ${d.views} visita(s), ${d.unique} visitante(s), ${d.whatsapp} clique(s) no WhatsApp`}
                  className="flex h-full flex-1 items-end"
                >
                  <div
                    className={`w-full rounded-t ${d.views > 0 ? "bg-blue-500" : "bg-neutral-800"}`}
                    style={{ height: `${d.views > 0 ? Math.max(6, (d.views / maxViews) * 100) : 3}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
              <span>{dayLabel(stats.days[0].date)}</span>
              <span>Visitas por dia</span>
              <span>{dayLabel(stats.days[stats.days.length - 1].date)}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Cliques no WhatsApp</h3>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["Hoje", stats.today.whatsapp],
                    ["7 dias", stats.last7.whatsapp],
                    ["30 dias", stats.last30.whatsapp],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-neutral-800 p-3">
                    <p className="text-xs text-neutral-500">{label}</p>
                    <p className="text-xl font-semibold text-green-400">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-neutral-500">
                Cada clique nos botões de WhatsApp da loja (capa, produto, pedido e dúvidas).
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Produtos mais vistos (30 dias)</h3>
              {topProducts.length === 0 ? (
                <p className="text-sm text-neutral-500">Ainda sem aberturas de produtos.</p>
              ) : (
                <ol className="space-y-1.5">
                  {topProducts.map((p, i) => (
                    <li key={p.product_id} className="text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate">
                          <span className="mr-1.5 text-xs text-neutral-500">{i + 1}.</span>
                          {p.name}
                        </span>
                        <span className="shrink-0 text-xs text-neutral-400">
                          {p.views} <span className="text-neutral-600">({p.views7} em 7 dias)</span>
                        </span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded bg-neutral-800">
                        <div
                          className="h-full rounded bg-blue-500"
                          style={{ width: `${(p.views / maxProductViews) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-neutral-500">
            “Visitante” é uma pessoa diferente por dia (quem volta em outro dia conta de novo). Não guardamos IP nem
            dados pessoais. Suas próprias visitas à loja também são contadas.
          </p>
        </>
      )}
      {!stats && !error && <p className="text-sm text-neutral-500">Carregando…</p>}
    </section>
  );
}
