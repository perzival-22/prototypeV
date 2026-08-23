import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spotify requires the loopback IP (127.0.0.1) rather than "localhost" for
  // OAuth redirect URIs, so we serve dev over 127.0.0.1. Allow it as a dev
  // origin, otherwise Next.js blocks its own /_next/* assets with a 403.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
