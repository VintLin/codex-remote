import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../globals.css";
import { getDictionary } from "../../i18n/dictionary";
import { normalizeLocale } from "../../i18n/locales";

interface LocaleLayoutParams {
  locale: string;
}

export async function generateMetadata({ params }: { params: Promise<LocaleLayoutParams> }): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const dictionary = getDictionary(normalizeLocale(rawLocale));

  return {
    title: dictionary.metadata.title,
    description: dictionary.metadata.description,
    icons: {
      icon: [{ url: "/codex.svg", type: "image/svg+xml" }],
    },
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<LocaleLayoutParams> }) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
