"use client";

import { usePreferences, isLanguage, isTheme } from "@/lib/preferences";
import { useTranslation } from "@/lib/i18n";

/** Self-contained header controls. Mount once; no provider or layout script needed. */
export function PreferencesControls({ className = "" }: { className?: string }) {
  const { language, theme, setPreferences } = usePreferences();
  const { t } = useTranslation();
  const selectClass = "min-h-11 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className={`flex max-w-full flex-wrap items-center gap-2 ${className}`} role="group" aria-label={t("Display preferences", "Display ki pasand")}>
      <label className="grid min-w-24 gap-0.5 text-xs text-muted-foreground">
        <span>{t("Language", "Bhasha")}</span>
        <select
          aria-label={t("Language", "Bhasha")}
          className={selectClass}
          value={language}
          onChange={event => { if (isLanguage(event.target.value)) setPreferences({ language: event.target.value }); }}
        >
          <option value="en">English</option>
          <option value="hinglish">Hinglish</option>
        </select>
      </label>
      <label className="grid min-w-24 gap-0.5 text-xs text-muted-foreground">
        <span>{t("Theme", "Rang theme")}</span>
        <select
          aria-label={t("Theme", "Rang theme")}
          className={selectClass}
          value={theme}
          onChange={event => { if (isTheme(event.target.value)) setPreferences({ theme: event.target.value }); }}
        >
          <option value="amber">{t("Amber", "Amber")}</option>
          <option value="dark">{t("Dark", "Dark")}</option>
          <option value="blue">{t("Blue", "Neela")}</option>
          <option value="emerald">{t("Emerald", "Hara")}</option>
        </select>
      </label>
    </div>
  );
}
