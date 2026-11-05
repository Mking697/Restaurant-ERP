"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

/** Registers the shared service worker scoped to this one route and offers an
 * install button where the browser supports it (Chrome/Edge/Android). Safari/
 * iOS never fires beforeinstallprompt — those users get manual instructions
 * instead, surfaced by the App Downloads page, not here. */
export function PwaInstall({ scope }: { scope: string }) {
  const uiText = useUiCopy();
  const [installEvent, setInstallEvent] = React.useState<Event & { prompt?: () => void } | null>(null);
  const [installed, setInstalled] = React.useState(false);

  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope }).catch(() => {});
  }, [scope]);

  React.useEffect(() => {
    function onPrompt(event: Event) { event.preventDefault(); setInstallEvent(event); }
    function onInstalled() { setInstalled(true); setInstallEvent(null); }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed || !installEvent) return null;
  return <Button
    size="sm"
    variant="outline"
    onClick={() => { (installEvent as unknown as { prompt: () => void }).prompt(); }}
  >{uiText("Install this app", "Ye app install karein")}</Button>;
}
