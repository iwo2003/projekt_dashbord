"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useI18n } from "./i18n-provider";
import { ShopFrame } from "./shop-theme";

export function SklepReturn({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const [template, setTemplate] = useState("helios");

  useEffect(() => {
    void api<{ template?: string }>("/api/shop/public")
      .then((data) => {
        if (data.template) setTemplate(data.template);
      })
      .catch(() => undefined);
    if (!orderId) return;
    void api<{ status: string }>("/api/shop/public", { method: "POST", body: JSON.stringify({ action: "confirm", id: orderId }) })
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("failed"));
  }, [orderId]);

  const text = status === "queued" || status === "delivered" || status === "sending" ? t.shop.paid : status === "pending" ? t.shop.waiting : status ? t.shop.failed : t.loading;

  return (
    <ShopFrame template={template}>
    <div className="flex min-h-[70vh] flex-col justify-center gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">{t.shop.returnTitle}</h1>
      <p className="text-fog">{text}</p>
      <Link className="btn btn-primary w-fit" href="/sklep">{t.shop.back}</Link>
    </div>
    </ShopFrame>
  );
}
