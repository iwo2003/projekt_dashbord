"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Game } from "@/lib/types";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

type ServerRow = { id: string; name: string; game: Game; token: string };
type Product = {
  id: string;
  server_id: string;
  name: string;
  price_cents: number;
  delivery: "off" | "console" | "plugin";
};
type State = { servers: ServerRow[]; products: Product[] };

type ProductForm = {
  name: string;
  description: string;
  priceZl: string;
  delivery: "off" | "console" | "plugin";
  waitOnline: boolean;
  commands: string;
};

const emptyProduct: ProductForm = {
  name: "",
  description: "",
  priceZl: "10",
  delivery: "off",
  waitOnline: true,
  commands: "",
};

export function ShopServerView({ serverId, canManage }: { serverId: string; canManage: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState(emptyProduct);

  function apply(next: State) {
    setState(next);
  }

  useEffect(() => {
    void api<State>("/api/shop")
      .then((next) => {
        apply(next);
        if (!next.servers.some((item) => item.id === serverId)) setError("not_found");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "request_failed"));
  }, [serverId]);

  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      apply(
        await api<State>("/api/shop", {
          method: "POST",
          body: JSON.stringify({ ...product, serverId, priceZl: Number(product.priceZl) }),
        }),
      );
      setProduct(emptyProduct);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(id: string) {
    setBusy(true);
    setError(null);
    try {
      apply(await api<State>(`/api/shop?id=${id}`, { method: "DELETE" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/shop", { method: "POST", body: JSON.stringify({ action: "install", serverId }) });
      apply(await api<State>("/api/shop"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  const server = state?.servers.find((item) => item.id === serverId);
  const products = state?.products.filter((item) => item.server_id === serverId) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-fog" href="/shop">
          ← {t.shop.title}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {t.shop.title} / {server?.name ?? t.shop.server}
        </h1>
        {server ? <p className="mt-2 text-sm text-fog">{t.servers[server.game]}</p> : null}
      </div>
      <ErrorNote code={error} />
      {server ? (
        <>
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-semibold">{t.shop.pluginTitle}</h2>
            <p className="text-sm text-fog">{t.shop.pluginLead}</p>
            <p className="text-sm text-fog">{server.token ? t.shop.pluginOn : t.shop.pluginOff}</p>
            {canManage ? (
              <div className="flex gap-2">
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void install()}>{t.shop.install}</button>
                <a className="btn btn-ghost" href={`/api/shop/plugin?server=${server.id}`}>{t.shop.download}</a>
              </div>
            ) : null}
          </section>

          {canManage ? (
            <form className="card space-y-4 p-5" onSubmit={(event) => void saveProduct(event)}>
              <h2 className="text-lg font-semibold">{t.shop.productTitle}</h2>
              <p className="text-sm text-fog">{t.shop.productLead}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t.shop.productName}>
                  <input className="field" value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} required />
                </Field>
                <Field label={t.shop.price}>
                  <input className="field" type="number" min={1} step="0.01" value={product.priceZl} onChange={(event) => setProduct({ ...product, priceZl: event.target.value })} required />
                </Field>
                <Field label={t.shop.delivery}>
                  <select className="field" value={product.delivery} onChange={(event) => setProduct({ ...product, delivery: event.target.value as "off" | "console" | "plugin" })}>
                    <option value="off">{t.shop.deliveryOff}</option>
                    <option value="console">{t.shop.deliveryConsole}</option>
                    <option value="plugin">{t.shop.deliveryPlugin}</option>
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label={t.shop.description}>
                    <input className="field" value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label={t.shop.commands} hint={t.shop.commandsHint}>
                    <textarea className="field min-h-28 font-mono" value={product.commands} onChange={(event) => setProduct({ ...product, commands: event.target.value })} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input type="checkbox" checked={product.waitOnline} onChange={(event) => setProduct({ ...product, waitOnline: event.target.checked })} />
                  {t.shop.waitOnline}
                </label>
              </div>
              <button className="btn btn-primary" disabled={busy} type="submit">{t.shop.addProduct}</button>
            </form>
          ) : null}

          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-semibold">{t.shop.products}</h2>
            {products.length === 0 ? <p className="text-sm text-fog">{t.shop.serverEmpty}</p> : null}
            {products.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 border-t border-white/10 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-fog">{(item.price_cents / 100).toFixed(2)} zł · {item.delivery === "off" ? t.shop.deliveryOff : item.delivery === "console" ? t.shop.deliveryConsole : t.shop.deliveryPlugin}</p>
                </div>
                {canManage ? <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void removeProduct(item.id)}>{t.shop.remove}</button> : null}
              </div>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
