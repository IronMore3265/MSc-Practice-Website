import type { NextConfig } from "next";

// Every page here depends on the signed-in user, so nothing is cached across requests.
// Cache Components is left off on purpose: it would force a Suspense boundary around every page.
const nextConfig: NextConfig = {
  cacheComponents: false,
};

export default nextConfig;
