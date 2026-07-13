import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "unpdf", "officeparser"],
  experimental: {
    // Course material can be big — slides and scanned PDFs especially.
    serverActions: { bodySizeLimit: "100mb" },
  },
};

export default nextConfig;
