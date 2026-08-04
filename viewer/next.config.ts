import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Same standalone output as the portal, so the runtime Docker stage needs
  // neither node_modules nor the Next CLI.
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
