import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // frame-ancestors backs X-Frame-Options on browsers that honor CSP; no
  // third-party script/style origins are in use today so default-src 'self'
  // is safe — widen deliberately if an external asset origin is added later.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Isolated QA/build output avoids corrupting a concurrently running local dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Evidence capture needs first-party camera/GPS permission on Tasks only;
      // every other page retains the restrictive default above.
      { source: "/tasks", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" }] },
    ];
  },
};

export default nextConfig;
