import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable auto-generation of AGENTS.md and CLAUDE.md
  agentRules: false,
  // Load .env from the monorepo root (shared with the Python agent worker)
  envDir: path.resolve(__dirname, ".."),
};

export default nextConfig;
