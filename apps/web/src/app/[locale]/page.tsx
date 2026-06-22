import { redirect } from "next/navigation";

import { CodexRemoteApp } from "../../components/shell/codex-remote-app";
import { getDictionary } from "../../i18n/dictionary";
import { defaultLocale, isLocale } from "../../i18n/locales";

interface LocalePageParams {
  locale: string;
}

export default async function Page({ params }: { params: Promise<LocalePageParams> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    redirect(`/${defaultLocale}`);
  }

  const locale = rawLocale;
  const dictionary = getDictionary(locale);

  return <CodexRemoteApp dictionary={dictionary} locale={locale} />;
}
