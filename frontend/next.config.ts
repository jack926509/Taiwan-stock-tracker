import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  experimental: { externalDir: true },
  webpack(config) {
    config.resolve.alias["@"] = root;
    return config;
  },
};

export default nextConfig;
