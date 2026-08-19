import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pptxgenjs", "jszip", "image-size", "sharp", "heic-convert"],
};

export default nextConfig;
