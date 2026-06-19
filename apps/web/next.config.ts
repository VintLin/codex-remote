import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CODEX_REMOTE_WORKER_BASE_URL:
      process.env.NEXT_PUBLIC_CODEX_REMOTE_WORKER_BASE_URL ?? "http://127.0.0.1:8787",
    NEXT_PUBLIC_CODEX_REMOTE_WORKER_TOKEN: process.env.NEXT_PUBLIC_CODEX_REMOTE_WORKER_TOKEN ?? "",
  },
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
