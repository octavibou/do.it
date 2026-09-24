import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
    optimizePackageImports: ["radix-ui", "@dnd-kit/core", "@dnd-kit/sortable"],
  },
};

export default nextConfig;
