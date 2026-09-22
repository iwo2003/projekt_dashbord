import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider } from "@/components/i18n-provider";
import type { Lang } from "@/lib/i18n";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  variable: "--font-outfit",
});

const mono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: { default: "Helios", template: "%s · Helios" },
  description: "Panel serwerów VPS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang: Lang = jar.get("lang")?.value === "en" ? "en" : "pl";
  return (
    <html lang={lang} className={`${outfit.variable} ${mono.variable} h-full`}>
      <body className="min-h-full antialiased">
        <I18nProvider initial={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
