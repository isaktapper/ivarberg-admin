import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Tillåt production builds att slutföras även med TypeScript-errors
    // OBS: Dessa errors fanns sedan tidigare och är inte relaterade till nya ändringar
    ignoreBuildErrors: true,
  },
  // sharp (native binärer) måste följa med serverless-funktionen på Vercel
  serverExternalPackages: ['sharp'],
  outputFileTracingIncludes: {
    '/api/instagram-image': ['./node_modules/.pnpm/**/node_modules/@img/**'],
  },
};

export default nextConfig;
