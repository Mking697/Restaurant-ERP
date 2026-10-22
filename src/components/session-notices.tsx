"use client";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export function AccessDeniedNotice() {
  const { t } = useTranslation();
  return <>
    <h1 className="text-xl font-semibold">{t("Access denied", "Access nahi hai")}</h1>
    <p className="mt-3 text-sm text-muted-foreground">{t("Ask your branch admin for permission to use this module.", "Is module ki permission ke liye apne branch admin se baat karein.")}</p>
    <Link className="mt-4 inline-block underline" href="/guide">{t("Open your Guide Book", "Apni Guide Book kholein")}</Link>
  </>;
}
export function DemoDataNotice() {
  const { t } = useTranslation();
  return <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
    {t("Demo data — this module uses sample data, not live database records. It will be cleared before go-live.", "Demo Data — client demo ke liye seeded hai, abhi real database se connected nahi. Go-live se pehle hata diya jaayega.")}
  </div>;
}
