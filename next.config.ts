import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Isolated QA/build output avoids corrupting a concurrently running local dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
