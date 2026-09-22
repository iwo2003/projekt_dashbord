import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dockerode", "systeminformation", "qrcode"],
};

export default nextConfig;
