// Minimal installability service worker, shared by the Waiter/Kitchen/POS
// installable apps. Each page registers this with its own `scope` (e.g.
// /waiter/), so the browser treats each as a separately installable app.
// Deliberately does not cache API responses — this ERP always needs live,
// server-verified data; a stale cached response is worse than a network error.
self.addEventListener("install", (event) => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (event) => {
  // Pass-through only. Presence of a fetch handler (even a no-op one) is part
  // of the installability criteria in Chromium-based browsers.
});
