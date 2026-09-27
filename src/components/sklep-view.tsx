"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, Field, LanguageSwitch } from "./ui";
import { useI18n } from "./i18n-provider";
import { ShopLegalLinks } from "./shop-legal";
import { ShopFrame, shopProductGrid } from "./shop-theme";
import { shopTemplate } from "@/lib/constants";

type Seller = { name: string; address: string; email: string; nip: string };

type Catalog = {
  open?: boolean;
  template?: string;
  lockedGame?: string;
  seller?: Seller;
  hasCodes?: boolean;
  providers: ("stripe" | "paypal" | "p24")[];
  products: { id: string; name: string; description: string; priceCents: number; serverName: string; game: string; image?: string; askSteam?: boolean; askFivem?: boolean }[];
};

export function SklepView() {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [productId, setProductId] = useState("");
  const [nick, setNick] = useState("");
  const [email, setEmail] = useState("");
  const [steam, setSteam] = useState("");
  const [fivem, setFivem] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [game, setGame] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cancelled") === "1";

  useEffect(() => {
    void api<Catalog>("/api/shop/public")
      .then((next) => {
        setCatalog(next);
        if (next.lockedGame) {
          setGame(next.lockedGame);
          return;
        }
        const games = [...new Set(next.products.map((item) => item.game).filter(Boolean))];
        if (games.length === 1) setGame(games[0] ?? "");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "request_failed"));
  }, []);

  const games = [...new Set(catalog?.products.map((item) => item.game).filter(Boolean) ?? [])];
  const locked = Boolean(catalog?.lockedGame);
  const picking = games.length > 1 && !locked && !game;
  const visible = (catalog?.products ?? []).filter((item) => !game || item.game === game);
  const product = visible.find((item) => item.id === productId) ?? null;
  const template = shopTemplate(catalog?.template ?? "");

  function gameName(id: string) {
    if (id === "minecraft" || id === "cs2" || id === "gmod" || id === "tf2" || id === "gta" || id === "fs25") return t.servers[id];
    return id;
  }

  async function buy(provider: "stripe" | "paypal" | "p24") {
    if (!product) return;
    if ((product.askSteam && !steam.trim()) || (product.askFivem && !fivem.trim())) {
      setError("validation");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ url: string }>("/api/shop/public", {
        method: "POST",
        body: JSON.stringify({
          productId: product.id,
          nick,
          email,
          steam: product.askSteam ? steam : "",
          fivem: product.askFivem ? fivem : "",
          provider,
          consent: true,
          code: catalog?.hasCodes ? code : "",
        }),
      });
      window.location.href = data.url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
      setBusy(false);
    }
  }

  return (
    <ShopFrame template={template}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">{locked && game ? `${t.shop.publicTitle} · ${gameName(game)}` : t.shop.publicTitle}</h1>
        <LanguageSwitch />
      </div>
      <p className="text-fog">{catalog?.open === false ? t.shop.closedPublic : t.shop.publicLead}</p>
      {cancelled ? <p className="text-sm text-fog">{t.shop.cancelled}</p> : null}
      <ErrorNote code={error} />
      {games.length > 0 && !locked ? (
        <div className="flex flex-wrap gap-2">
          {games.map((id) => (
            <button
              key={id}
              type="button"
              className={`btn ${game === id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setGame(id);
                setProductId("");
              }}
            >
              {gameName(id)}
            </button>
          ))}
        </div>
      ) : null}
      {picking ? <p className="text-fog">{t.shop.gameChoice}</p> : null}
      {catalog && catalog.open !== false && !picking && visible.length === 0 ? <p className="text-fog">{game ? t.shop.gameEmpty : t.shop.empty}</p> : null}
      <div className={shopProductGrid(template)}>
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            data-picked={productId === item.id}
            className={`shop-product card p-4 text-left ${template === "terminal" ? "font-mono" : ""} ${productId === item.id && template === "helios" ? "ring-1 ring-amber" : ""}`}
            onClick={() => setProductId(item.id)}
          >
            {item.image ? <img src={item.image} alt={item.name} className="mb-3 h-40 w-full rounded-xl object-cover" /> : null}
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-fog">{item.serverName} · {(item.priceCents / 100).toFixed(2)} zł</p>
            {item.description ? <p className="mt-2 text-sm">{item.description}</p> : null}
          </button>
        ))}
      </div>
      {product ? (
        <form className="card space-y-4 p-5" onSubmit={(event) => event.preventDefault()}>
          <Field label={t.shop.nick}>
            <input className="field" value={nick} onChange={(event) => setNick(event.target.value)} required />
          </Field>
          <Field label={t.shop.email}>
            <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          {product.askSteam ? (
            <Field label={t.shop.steam}>
              <input className="field" value={steam} onChange={(event) => setSteam(event.target.value)} required />
            </Field>
          ) : null}
          {product.askFivem ? (
            <Field label={t.shop.fivem}>
              <input className="field" value={fivem} onChange={(event) => setFivem(event.target.value)} required />
            </Field>
          ) : null}
          {catalog?.hasCodes ? (
            <Field label={`${t.shop.promo} (${t.optional})`}>
              <input className="field" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
            </Field>
          ) : null}
          {catalog?.seller?.name && catalog.seller.address && catalog.seller.email ? (
            <>
              <label className="flex items-start gap-2 text-sm leading-6">
                <input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{t.shop.consent}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {catalog.providers.map((provider) => (
                  <button key={provider} className="btn btn-primary" type="button" disabled={busy || !consent} onClick={() => void buy(provider)}>
                    {provider === "p24" ? "Przelewy24" : provider === "stripe" ? "Stripe" : "PayPal"}
                  </button>
                ))}
              </div>
              {catalog.providers.length === 0 && code.trim() ? (
                <button className="btn btn-primary" type="button" disabled={busy || !consent} onClick={() => void buy("stripe")}>{t.shop.codeUse}</button>
              ) : null}
              {catalog.providers.length === 0 && !code.trim() ? <p className="text-sm text-fog">{t.shop.noPayments}</p> : null}
            </>
          ) : (
            <p className="text-sm text-fog">{t.shop.sellerPublic}</p>
          )}
        </form>
      ) : null}
      {catalog?.seller?.name ? (
        <p className="text-sm leading-6 text-fog">
          {catalog.seller.name}
          {catalog.seller.address ? ` · ${catalog.seller.address}` : ""}
          {catalog.seller.email ? ` · ${catalog.seller.email}` : ""}
          {catalog.seller.nip ? ` · NIP ${catalog.seller.nip}` : ""}
        </p>
      ) : null}
      <ShopLegalLinks />
    </ShopFrame>
  );
}
