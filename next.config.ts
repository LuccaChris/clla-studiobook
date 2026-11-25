import type { NextConfig } from "next";

const api = process.env.STUDIOBOOK_API_URL ?? "http://127.0.0.1:5080";
const config: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "utfs.io" }] },
  async rewrites() {
    return [{ source: "/api/salons/:path*", destination: api + "/api/salons/:path*" }];
  },
};
export default config;
