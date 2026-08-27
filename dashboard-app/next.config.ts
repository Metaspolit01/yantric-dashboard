import path from "path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Load the single unified .env from the monorepo root.
// This runs at config-parse time so all vars are available to Next.js
// before it processes NEXT_PUBLIC_ prefixes and server-only vars.
loadEnv({ path: path.resolve(process.cwd(), "../.env"), override: false });

const nextConfig: NextConfig = {};

export default nextConfig;
