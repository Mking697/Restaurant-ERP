"use client";
import { useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";
export type LogoUpload = { type: string; data: string };
export function useBrandingError() {
 const {t} = useTranslation();
 return (message: string) => {
   if (message === "Use a valid, non-animated PNG, JPEG or WebP up to 1 MB and 4 million pixels") return t(message, "Sahi, bina animation ka PNG, JPEG ya WebP chunein: 1 MB aur 40 lakh pixels tak");
   if (message === "Enter a restaurant name (1–100 characters)") return t(message, "Restaurant ka naam likhein (1–100 akshar)");
   if (message === "Request too large") return t(message, "Upload bahut bada hai");
   return message;
 };
}
export function BrandingFields({ name, onName, logoUrl, logo, onLogo, onBusy, disabled = false }: { name: string; onName: (value: string) => void; logoUrl?: string | null; logo: LogoUpload | null | undefined; onLogo: (value: LogoUpload | null | undefined) => void; onBusy: (value: boolean) => void; disabled?: boolean }) {
 const {t} = useTranslation();
 const [error, setError] = useState("");
 const [reading, setReading] = useState(false);
 const generation = useRef(0);
 const preview = logo ? `data:${logo.type};base64,${logo.data}` : logo === null ? null : logoUrl;
 async function upload(file?: File) {
   const version = ++generation.current; setError("");
   if (!file) return;
   if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1048576 || !file.size) { setError(t("Choose PNG, JPEG or WebP up to 1 MB. SVG is not allowed.", "PNG, JPEG ya WebP chunein, 1 MB tak. SVG allowed nahi hai.")); return; }
   setReading(true); onBusy(true);
   try {
     const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("read")); reader.readAsDataURL(file); });
     if (version === generation.current) onLogo({type:file.type, data});
   } catch { if (version === generation.current) setError(t("Could not read this image. Choose another file.", "Image padh nahi paaye. Doosri file chunein.")); }
   finally { if (version === generation.current) { setReading(false); onBusy(false); } }
 }
 return <fieldset disabled={disabled} className="space-y-3">
   <label className="block space-y-1"><span className="text-sm">{t("Restaurant name", "Restaurant ka naam")}</span><input name="restaurantName" value={name} onChange={e => onName(e.target.value)} maxLength={100} required className="w-full rounded-md border bg-background px-3 py-2 text-base" /></label>
   <label className="block space-y-1"><span className="text-sm">{t("Restaurant logo (optional)", "Restaurant ka logo (optional)")}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={reading} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} className="block w-full min-w-0 text-sm" /></label>
   <p className="text-xs text-muted-foreground">{t("PNG, JPEG or WebP • up to 1 MB / 4 million pixels • no animation. Stored as a small PNG; also used as the browser icon.", "PNG, JPEG ya WebP • 1 MB / 40 lakh pixels tak • animation nahi. Chhota PNG save hoga; browser icon bhi yahi hoga.")}</p>
   {preview && <div className="flex items-center gap-3"><img src={preview} alt={t("Logo preview", "Logo ka preview")} className="size-16 rounded border object-contain" /><button type="button" disabled={reading} className="text-sm underline" onClick={() => { setError(""); onLogo(null); }}>{t("Remove logo", "Logo hatayein")}</button></div>}
   {reading && <p role="status" className="text-sm">{t("Reading image…", "Image padh rahe hain…")}</p>}
   {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
 </fieldset>;
}
