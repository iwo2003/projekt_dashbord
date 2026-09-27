"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useI18n } from "./i18n-provider";

export function SklepReturn({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!orderId) return;
    void api<{ status: string }>("/api/shop/public", { method: "POST", body: JSON.stringify({ action: "confirm", id: orderId }) })
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("failed"));
  }, [orderId]);

  const text = status === "queued" || status === "delivered" || status === "sending" ? t.shop.paid : status === "pending" ? t.shop.waiting : status ? t.shop.failed : t.loading;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-5">
      <h1 className="text-3xl font-semibold tracking-tight">{t.shop.returnTitle}</h1>
      <p className="text-fog">{text}</p>
      <Link className="btn btn-primary w-fit" href="/sklep">{t.shop.back}</Link>
    </div>
  );
}
