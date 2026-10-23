import { en } from "./en";
import { vi, type Dictionary } from "./vi";

export type Locale = "vi" | "en";
export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { vi, en };

export function getDictionary(locale: Locale = "vi"): Dictionary {
  return dictionaries[locale];
}

export { vi, en };
