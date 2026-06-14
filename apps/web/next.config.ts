import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@codex-remote/ui"],
  turbopack: {
    root: monorepoRoot,
  },
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: "tsconfig.json",
  },
};

export default nextConfig;
