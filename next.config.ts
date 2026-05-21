import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8001" },
      { protocol: "http", hostname: "localhost", port: "8001" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/artifacts/:path*",
        destination: "http://127.0.0.1:8001/artifacts/:path*",
      },
    ];
  },
};

export default nextConfig;
