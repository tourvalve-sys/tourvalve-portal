import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.kiwi.com",
        pathname: "/airlines/**",
      },
    ],
  },
};

export default nextConfig;
