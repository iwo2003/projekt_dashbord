"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { dictionaries, type Dictionary, type Lang } from "@/lib/i18n";

const I18nContext = createContext<{
  lang: Lang;
  t: Dictionary;
  setLang: (lang: Lang) => void;
} | null>(null);

export function I18nProvider({
  initial,
  children,
}: {
  initial: Lang;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = (next: Lang) => {
    setLangState(next);
    document.cookie = `lang=${next};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = next;
  };
  const value = useMemo(() => ({ lang, t: dictionaries[lang], setLang }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("i18n");
  return context;
}
