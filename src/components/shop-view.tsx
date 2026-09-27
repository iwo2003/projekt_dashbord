"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { SHOP_GAMES, SHOP_TEMPLATES, type ShopTemplate } from "@/lib/constants";
import type { Game } from "@/lib/types";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

type ServerRow = { id: string; name: string; game: Game; token: string };
type Product = {
  id: string;
  server_id: string;
  name: string;
  description: string;
  price_cents: number;
  delivery: "off" | "console" | "plugin";
  wait_online: number;
  commands: string;
};
type Order = {
  id: string;
  name: string;
  nick: string;
  status: string;
  provider: string;
  price_cents: number;
  error: string;
  created_at: number;
};
type CodeRow = {
  id: string;
  kind: "discount" | "voucher";
  code: string;
  percent: number;
  amount_cents: number;
  uses_max: number;
  uses_count: number;
};
type State = {
  host: string;
  template: ShopTemplate;
  enabled: boolean;
  panelUrl: string;
  stripe: boolean;
  paypal: boolean;
  p24: boolean;
  paypalSandbox: boolean;
  p24Sandbox: boolean;
  stripeSecretSet: boolean;
  paypalClientSet: boolean;
  paypalSecretSet: boolean;
  p24Merchant: string;
  p24CrcSet: boolean;
  p24ApiSet: boolean;
  sellerName: string;
  sellerAddress: string;
  sellerEmail: string;
  sellerNip: string;
  gameHosts: Record<Game, string>;
  servers: ServerRow[];
  products: Product[];
  orders: Order[];
  codes: CodeRow[];
};

function randomShopCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function ShopView({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState("");
  const [stripe, setStripe] = useState(false);
  const [paypal, setPaypal] = useState(false);
  const [p24, setP24] = useState(false);
  const [paypalSandbox, setPaypalSandbox] = useState(false);
  const [p24Sandbox, setP24Sandbox] = useState(false);
  const [sellerName, setSellerName] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [sellerNip, setSellerNip] = useState("");
  const [gameHosts, setGameHosts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [secrets, setSecrets] = useState({ stripeSecret: "", paypalClient: "", paypalSecret: "", p24Merchant: "", p24Crc: "", p24Api: "" });
  const [promo, setPromo] = useState({ kind: "discount" as "discount" | "voucher", code: "", mode: "percent" as "percent" | "amount", percent: "10", amountZl: "10", uses: "" });

  function apply(next: State) {
    setState(next);
    setHost(next.host);
    setStripe(next.stripe);
    setPaypal(next.paypal);
    setP24(next.p24);
    setPaypalSandbox(next.paypalSandbox);
    setP24Sandbox(next.p24Sandbox);
    setSellerName(next.sellerName);
    setSellerAddress(next.sellerAddress);
    setSellerEmail(next.sellerEmail);
    setSellerNip(next.sellerNip);
    setGameHosts(next.gameHosts);
    setSecrets((current) => ({ ...current, p24Merchant: next.p24Merchant }));
  }

  useEffect(() => {
    void api<State>("/api/shop")
      .then((next) => {
        apply(next);
        const configured = Boolean(next.host || next.stripeSecretSet || next.paypalClientSet || next.p24Merchant);
        if (!configured) setEditing(true);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "request_failed"));
  }, []);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      apply(await api<State>("/api/shop", { method: "PUT", body: JSON.stringify({ host, stripe, paypal, p24, paypalSandbox, p24Sandbox, sellerName, sellerAddress, sellerEmail, sellerNip, gameHosts, enabled: state?.enabled !== false, ...secrets }) }));
      setSecrets((current) => ({ ...current, stripeSecret: "", paypalClient: "", paypalSecret: "", p24Crc: "", p24Api: "" }));
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      apply(
        await api<State>("/api/shop", {
          method: "POST",
          body: JSON.stringify({
            action: "code",
            kind: promo.kind,
            code: promo.code,
            mode: promo.mode,
            percent: promo.mode === "percent" ? Number(promo.percent) : undefined,
            amountZl: promo.kind === "voucher" || promo.mode === "amount" ? Number(promo.amountZl) : undefined,
            uses: promo.uses ? Number(promo.uses) : undefined,
          }),
        }),
      );
      setPromo((current) => ({ ...current, code: "" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeCode(id: string) {
    setBusy(true);
    setError(null);
    try {
      apply(await api<State>(`/api/shop?code=${id}`, { method: "DELETE" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendNow(id: string) {
    setBusy(true);
    setError(null);
    try {
      apply(await api<State>("/api/shop", { method: "POST", body: JSON.stringify({ action: "send", id }) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function chooseTemplate(template: ShopTemplate) {
    if (!state || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      apply(
        await api<State>("/api/shop", {
          method: "PUT",
          body: JSON.stringify({
            host: state.host,
            stripe: state.stripe,
            paypal: state.paypal,
            p24: state.p24,
            paypalSandbox: state.paypalSandbox,
            p24Sandbox: state.p24Sandbox,
            enabled: state.enabled,
            template,
          }),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function setShopOpen(enabled: boolean) {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      apply(
        await api<State>("/api/shop", {
          method: "PUT",
          body: JSON.stringify({
            host: state.host,
            stripe: state.stripe,
            paypal: state.paypal,
            p24: state.p24,
            paypalSandbox: state.paypalSandbox,
            p24Sandbox: state.p24Sandbox,
            enabled,
          }),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  const statusText = (status: string) => {
    if (status === "pending") return t.shop.pending;
    if (status === "queued") return t.shop.queued;
    if (status === "delivered") return t.shop.delivered;
    if (status === "failed") return t.shop.failed;
    return status;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.shop.title}</h1>
        <p className="mt-2 max-w-3xl text-fog">{t.shop.lead}</p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-fog">{t.shop.steps}</p>
      </div>
      <ErrorNote code={error} />
      {state ? (
        <>
          <form className="card space-y-4 p-5" onSubmit={saveSettings}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">{t.shop.addressTitle}</h2>
              {canManage ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={state.enabled} disabled={busy} onChange={(event) => void setShopOpen(event.target.checked)} />
                  {state.enabled ? t.shop.shopOn : t.shop.shopOff}
                </label>
              ) : (
                <p className="text-sm text-fog">{state.enabled ? t.shop.shopOn : t.shop.shopOff}</p>
              )}
            </div>
            {editing ? (
              <>
                <Field label={t.shop.host} hint={t.shop.hostHint}>
                  <input className="field" value={host} onChange={(event) => setHost(event.target.value)} placeholder="sklep.domena.pl" disabled={!canManage} />
                </Field>
                <div className="space-y-3">
                  <div>
                    <h3 className="font-medium">{t.shop.sellerTitle}</h3>
                    <p className="mt-1 text-sm text-fog">{t.shop.sellerLead}</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t.shop.sellerName}>
                      <input className="field" value={sellerName} onChange={(event) => setSellerName(event.target.value)} disabled={!canManage} />
                    </Field>
                    <Field label={t.shop.sellerEmail}>
                      <input className="field" type="email" value={sellerEmail} onChange={(event) => setSellerEmail(event.target.value)} disabled={!canManage} />
                    </Field>
                    <Field label={t.shop.sellerAddress}>
                      <input className="field" value={sellerAddress} onChange={(event) => setSellerAddress(event.target.value)} disabled={!canManage} />
                    </Field>
                    <Field label={`${t.shop.sellerNip} (${t.optional})`}>
                      <input className="field" value={sellerNip} onChange={(event) => setSellerNip(event.target.value)} disabled={!canManage} />
                    </Field>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <h3 className="font-medium">{t.shop.gameHosts}</h3>
                    <p className="mt-1 text-sm text-fog">{t.shop.gameHostsLead}</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {SHOP_GAMES.map((game) => (
                      <Field key={game} label={t.servers[game]}>
                        <input
                          className="field"
                          value={gameHosts[game] ?? ""}
                          placeholder={`${game}.domena.pl`}
                          disabled={!canManage}
                          onChange={(event) => setGameHosts({ ...gameHosts, [game]: event.target.value })}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p24} onChange={(event) => setP24(event.target.checked)} disabled={!canManage} /> Przelewy24 / BLIK</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stripe} onChange={(event) => setStripe(event.target.checked)} disabled={!canManage} /> Stripe</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paypal} onChange={(event) => setPaypal(event.target.checked)} disabled={!canManage} /> PayPal</label>
                </div>
                {canManage ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {stripe ? (
                      <Field label={t.shop.stripeKey} hint={state.stripeSecretSet ? t.shop.secretSet : t.shop.stripeKeyHint}>
                        <input className="field" type="password" value={secrets.stripeSecret} onChange={(event) => setSecrets({ ...secrets, stripeSecret: event.target.value })} autoComplete="off" placeholder="sk_live_..." />
                      </Field>
                    ) : null}
                    {paypal ? (
                      <>
                        <Field label="PayPal client" hint={state.paypalClientSet ? t.shop.secretSet : t.shop.secretEmpty}>
                          <input className="field" value={secrets.paypalClient} onChange={(event) => setSecrets({ ...secrets, paypalClient: event.target.value })} autoComplete="off" />
                        </Field>
                        <Field label="PayPal secret" hint={state.paypalSecretSet ? t.shop.secretSet : t.shop.secretEmpty}>
                          <input className="field" type="password" value={secrets.paypalSecret} onChange={(event) => setSecrets({ ...secrets, paypalSecret: event.target.value })} autoComplete="off" />
                        </Field>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paypalSandbox} onChange={(event) => setPaypalSandbox(event.target.checked)} /> {t.shop.sandbox}</label>
                      </>
                    ) : null}
                    {p24 ? (
                      <>
                        <Field label="Przelewy24 merchant ID">
                          <input className="field" value={secrets.p24Merchant} onChange={(event) => setSecrets({ ...secrets, p24Merchant: event.target.value })} />
                        </Field>
                        <Field label="Przelewy24 CRC" hint={state.p24CrcSet ? t.shop.secretSet : t.shop.secretEmpty}>
                          <input className="field" type="password" value={secrets.p24Crc} onChange={(event) => setSecrets({ ...secrets, p24Crc: event.target.value })} autoComplete="off" />
                        </Field>
                        <Field label="Przelewy24 API key" hint={state.p24ApiSet ? t.shop.secretSet : t.shop.secretEmpty}>
                          <input className="field" type="password" value={secrets.p24Api} onChange={(event) => setSecrets({ ...secrets, p24Api: event.target.value })} autoComplete="off" />
                        </Field>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p24Sandbox} onChange={(event) => setP24Sandbox(event.target.checked)} /> {t.shop.sandbox}</label>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {canManage ? (
                  <div className="flex gap-2">
                    <button className="btn btn-primary" disabled={busy} type="submit">{t.shop.save}</button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        apply(state);
                        setEditing(false);
                      }}
                    >
                      {t.close}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <p>{state.host || "—"}</p>
                {state.sellerName && state.sellerAddress && state.sellerEmail ? <p>{state.sellerName} · {t.shop.configured}</p> : <p>{t.shop.sellerMissing}</p>}
                {SHOP_GAMES.filter((game) => state.gameHosts[game]).map((game) => (
                  <p key={game}>{t.servers[game]} · {state.gameHosts[game]}</p>
                ))}
                {state.stripe && state.stripeSecretSet ? <p>Stripe · {t.shop.configured}</p> : null}
                {state.paypal && state.paypalClientSet && state.paypalSecretSet ? <p>PayPal · {t.shop.configured}</p> : null}
                {state.p24 && state.p24Merchant && state.p24CrcSet && state.p24ApiSet ? <p>Przelewy24 · {t.shop.configured}</p> : null}
                {canManage ? (
                  <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>
                    {t.shop.change}
                  </button>
                ) : null}
              </div>
            )}
          </form>

          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-semibold">{t.shop.templateTitle}</h2>
            <p className="text-sm text-fog">{t.shop.templateLead}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {SHOP_TEMPLATES.map((id) => {
                const copy = {
                  helios: { name: t.shop.templateHelios, hint: t.shop.templateHeliosHint, swatch: "border-amber bg-[#11141c]" },
                  night: { name: t.shop.templateNight, hint: t.shop.templateNightHint, swatch: "border-violet-400 bg-[#07060f]" },
                  paper: { name: t.shop.templatePaper, hint: t.shop.templatePaperHint, swatch: "border-[#1c1915] bg-[#f4efe6]" },
                  terminal: { name: t.shop.templateTerminal, hint: t.shop.templateTerminalHint, swatch: "border-green-400 bg-black" },
                  arcade: { name: t.shop.templateArcade, hint: t.shop.templateArcadeHint, swatch: "border-fuchsia-400 bg-[#2a1038]" },
                }[id];
                const selected = state.template === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!canManage || busy}
                    aria-pressed={selected}
                    className={`rounded-2xl border p-3 text-left ${selected ? "ring-1 ring-amber" : "border-white/10"}`}
                    onClick={() => void chooseTemplate(id)}
                  >
                    <span className={`mb-3 block h-14 rounded-xl border-2 ${copy.swatch}`} />
                    <span className="block font-medium">{copy.name}</span>
                    <span className="mt-1 block text-xs text-fog">{copy.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-semibold">{t.shop.serversTitle}</h2>
            <p className="text-sm text-fog">{t.shop.serversLead}</p>
            {state.servers.length === 0 ? <p className="text-sm text-fog">{t.shop.noServers}</p> : null}
            {state.servers.map((server) => {
              const count = state.products.filter((item) => item.server_id === server.id).length;
              return (
                <Link key={server.id} href={`/shop/${server.id}`} className="flex flex-col gap-1 rounded-2xl border border-white/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{t.shop.title} / {server.name}</p>
                    <p className="text-sm text-fog">{t.servers[server.game]} · {count}</p>
                  </div>
                </Link>
              );
            })}
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-semibold">{t.shop.codesTitle}</h2>
            <p className="text-sm text-fog">{t.shop.codesLead}</p>
            {canManage ? (
              <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void saveCode(event)}>
                <Field label={t.shop.codeKind}>
                  <select className="field" value={promo.kind} onChange={(event) => setPromo({ ...promo, kind: event.target.value as "discount" | "voucher" })}>
                    <option value="discount">{t.shop.codeDiscount}</option>
                    <option value="voucher">{t.shop.codeVoucher}</option>
                  </select>
                </Field>
                <Field label={t.shop.codeValue}>
                  <div className="flex gap-2">
                    <input className="field" value={promo.code} onChange={(event) => setPromo({ ...promo, code: event.target.value.toUpperCase() })} required />
                    <button className="btn btn-ghost" type="button" onClick={() => setPromo({ ...promo, code: randomShopCode() })}>{t.shop.codeGenerate}</button>
                  </div>
                </Field>
                {promo.kind === "discount" ? (
                  <Field label={t.shop.codeDiscount}>
                    <select className="field" value={promo.mode} onChange={(event) => setPromo({ ...promo, mode: event.target.value as "percent" | "amount" })}>
                      <option value="percent">{t.shop.codePercent}</option>
                      <option value="amount">{t.shop.codeAmount}</option>
                    </select>
                  </Field>
                ) : null}
                {promo.kind === "voucher" || promo.mode === "amount" ? (
                  <Field label={t.shop.codeAmount}>
                    <input className="field" type="number" min={1} step="0.01" value={promo.amountZl} onChange={(event) => setPromo({ ...promo, amountZl: event.target.value })} required />
                  </Field>
                ) : (
                  <Field label={t.shop.codePercent}>
                    <input className="field" type="number" min={1} max={100} step="1" value={promo.percent} onChange={(event) => setPromo({ ...promo, percent: event.target.value })} required />
                  </Field>
                )}
                <Field label={t.shop.codeUses} hint={t.shop.codeUsesHint}>
                  <input className="field" type="number" min={1} step="1" value={promo.uses} placeholder={promo.kind === "voucher" ? "1" : ""} onChange={(event) => setPromo({ ...promo, uses: event.target.value })} />
                </Field>
                <div className="md:col-span-2">
                  <button className="btn btn-primary" disabled={busy} type="submit">{t.shop.codeAdd}</button>
                </div>
              </form>
            ) : null}
            {state.codes.length === 0 ? <p className="text-sm text-fog">{t.shop.codeNone}</p> : null}
            {state.codes.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 border-t border-white/10 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{item.code}</p>
                  <p className="text-sm text-fog">
                    {item.kind === "voucher" ? t.shop.codeVoucher : t.shop.codeDiscount}
                    {" · "}
                    {item.percent > 0 ? `${item.percent}%` : `${(item.amount_cents / 100).toFixed(2)} zł`}
                    {" · "}
                    {item.uses_count}/{item.uses_max > 0 ? item.uses_max : t.shop.codeUnlimited}
                  </p>
                </div>
                {canManage ? <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void removeCode(item.id)}>{t.shop.remove}</button> : null}
              </div>
            ))}
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-semibold">{t.shop.orders}</h2>
            {state.orders.length === 0 ? <p className="text-sm text-fog">{t.shop.noOrders}</p> : null}
            {state.orders.map((order) => (
              <div key={order.id} className="flex flex-col gap-2 border-t border-white/10 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{order.name} · {order.nick}</p>
                  <p className="text-sm text-fog">{(order.price_cents / 100).toFixed(2)} zł · {order.provider} · {statusText(order.status)}{order.error ? ` · ${order.error}` : ""}</p>
                </div>
                {canManage && (order.status === "queued" || order.status === "failed") ? (
                  <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void sendNow(order.id)}>{t.shop.sendNow}</button>
                ) : null}
              </div>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
