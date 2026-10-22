"use client";

import { useSyncExternalStore } from "react";

export type Language = "en" | "hinglish";
export type Theme = "amber" | "dark" | "blue" | "emerald";
export type Preferences = Readonly<{ language: Language; theme: Theme }>;
export const PREFERENCES_STORAGE_KEY = "restaurant-erp.preferences.v1";
export const DEFAULT_PREFERENCES: Preferences = Object.freeze({ language: "en", theme: "amber" });
let current: Preferences = DEFAULT_PREFERENCES;
export const getServerSnapshot = (): Preferences => DEFAULT_PREFERENCES;
export const getPreferences = (): Preferences => current;
const listeners = new Set<() => void>();

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "hinglish";
}
export function isTheme(value: unknown): value is Theme {
  return value === "amber" || value === "dark" || value === "blue" || value === "emerald";
}

function readSaved(): Preferences {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null");
    const value = saved && typeof saved === "object" ? saved as Record<string, unknown> : {};
    return {
      language: isLanguage(value.language) ? value.language : "en",
      theme: isTheme(value.theme) ? value.theme : "amber",
    };
  } catch {
    // A malformed value defaults safely; blocked storage keeps this tab usable.
    return current;
  }
}

function publish(next: Preferences) {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = next.theme;
    root.dataset.language = next.language;
    root.lang = next.language === "hinglish" ? "en-IN" : "en";
    root.classList.toggle("dark", next.theme === "dark");
    root.style.colorScheme = next.theme === "dark" ? "dark" : "light";
  }
  if (next.language === current.language && next.theme === current.theme) return;
  current = Object.freeze(next);
  listeners.forEach(listener => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== PREFERENCES_STORAGE_KEY) return;
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
  } catch { /* Storage may be unavailable in privacy modes. */ }
  publish(readSaved());
}

// React subscribes only after hydration: both SSR and the first hydration render
// use the stable English/amber server snapshot, never localStorage during render.
export function subscribePreferences(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    window.addEventListener("storage", onStorage);
    publish(readSaved());
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function setPreferences(update: Partial<Preferences>): void {
  if (typeof window === "undefined") return;
  const base = listeners.size ? current : readSaved();
  const next: Preferences = {
    language: isLanguage(update.language) ? update.language : base.language,
    theme: isTheme(update.theme) ? update.theme : base.theme,
  };
  try { window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next)); }
  catch { /* Persistence is best-effort; still update the current tab. */ }
  publish(next);
}

export function usePreferences() {
  const preferences = useSyncExternalStore(subscribePreferences, getPreferences, getServerSnapshot);
  return { ...preferences, setPreferences };
}
