import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@phantom/animations", "@phantom/shared", "remotion", "@remotion/player"],
};

export default nextConfig;
