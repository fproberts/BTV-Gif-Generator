import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Uploads go through a server action, which allows only 1 MB by default. Photos are
    // shrunk on the phone first, but GIFs (kept as they are) can be bigger.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
