import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Brand logos can come from org settings as remote URLs or data URLs.
    // Keep this permissive enough for production while still defaulting to https.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
  async headers() {
    // Keep headers conservative to avoid breaking existing flows while adding meaningful baseline protection.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HTTPS only on Vercel
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          // Reasonable defaults
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
        ],
      },
    ];
  },
};

export default nextConfig;
