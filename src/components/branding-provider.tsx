"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import type { Branding } from "@/lib/branding";
const Context = createContext<{ branding: Branding; setBranding: (value: Branding) => void } | null>(null);
export function BrandingProvider({ initial, children }: { initial: Branding; children: React.ReactNode }) {
 const [branding, setBranding] = useState(initial);
 useEffect(() => { setBranding(initial); }, [initial.name, initial.logoUrl]);
 useEffect(() => {
   document.title = branding.name;
   let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
   if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.appendChild(icon); }
   icon.href = branding.logoUrl ?? "/api/branding/logo?v=default";
   icon.type = branding.logoUrl ? "image/png" : "image/svg+xml";
 }, [branding]);
 return <Context.Provider value={{branding, setBranding}}>{children}</Context.Provider>;
}
export function useBranding() { const value = useContext(Context); if (!value) throw new Error("BrandingProvider required"); return value; }
export function RestaurantBrand({ name: overrideName, logoUrl: overrideLogoUrl }: { name?: string | null; logoUrl?: string | null } = {}) {
 const { branding } = useBranding();
 const name = overrideName || branding.name; const logoUrl = overrideLogoUrl !== undefined ? overrideLogoUrl : branding.logoUrl;
 const [failed, setFailed] = useState(false);
 useEffect(() => { setFailed(false); }, [logoUrl]);
 return <div className="flex min-w-0 items-center gap-2">{logoUrl && !failed ? <img src={logoUrl} alt="" width={32} height={32} onError={() => setFailed(true)} className="size-8 shrink-0 rounded object-contain" /> : <UtensilsCrossed className="size-7 shrink-0 text-primary" />}<span className="min-w-0 break-words text-sm font-semibold">{name}</span></div>;
}
