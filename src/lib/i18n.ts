"use client";

import { useCallback } from "react";
import { usePreferences, type Language } from "./preferences";

export type Translate = (english: string, hinglish?: string) => string;

// Call sites own the copy: English must be the first argument. No document
// scanning/replacement, so React, accessible names and dynamic text stay in sync.
export function createTranslator(language: Language): Translate {
  return (english, hinglish) => language === "hinglish" && hinglish ? hinglish : english;
}

export function useTranslation(): { language: Language; t: Translate } {
  const { language } = usePreferences();
  const t = useCallback<Translate>(
    (english, hinglish) => language === "hinglish" && hinglish ? hinglish : english,
    [language],
  );
  return { language, t };
}
