import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable auto-generation of AGENTS.md and CLAUDE.md
  agentRules: false,
};

export default nextConfig;
