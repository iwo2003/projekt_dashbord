"use client";

import { useEffect } from "react";
import { shopTemplate, type ShopTemplate } from "@/lib/constants";

export function ShopFrame({ template, children }: { template?: string; children: React.ReactNode }) {
  const name = shopTemplate(template ?? "");
  useEffect(() => {
    document.documentElement.dataset.shop = name;
    return () => {
      delete document.documentElement.dataset.shop;
    };
  }, [name]);
  const width = name === "paper" || name === "night" || name === "arcade" ? "max-w-5xl" : "max-w-3xl";
  return <div className={`shop-frame mx-auto min-h-screen space-y-6 px-5 py-8 ${width}`}>{children}</div>;
}

export function shopProductGrid(template: ShopTemplate) {
  if (template === "night" || template === "arcade") return "grid gap-3 sm:grid-cols-2";
  return "grid gap-3";
}
