import { enUSDictionary } from "./dictionaries/en-US.ts";
import { zhCNDictionary } from "./dictionaries/zh-CN.ts";
import type { Locale } from "./locales.ts";

export type { Locale } from "./locales.ts";

type DeepWiden<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends ReadonlyArray<infer U>
          ? ReadonlyArray<DeepWiden<U>>
          : T extends object
            ? { [K in keyof T]: DeepWiden<T[K]> }
            : T;

export type WebDictionary = DeepWiden<typeof zhCNDictionary>;

const dictionaries = {
  "zh-CN": zhCNDictionary,
  "en-US": enUSDictionary,
} satisfies Record<Locale, WebDictionary>;

export function getDictionary(locale: Locale): WebDictionary {
  return dictionaries[locale];
}
