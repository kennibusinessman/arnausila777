import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Компактная самодостаточная сборка для Docker (.next/standalone/server.js).
  output: "standalone",
};

export default nextConfig;
