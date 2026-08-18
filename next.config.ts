import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pptxgenjs", "sharp", "heic-convert"],
};

export default nextConfig;
