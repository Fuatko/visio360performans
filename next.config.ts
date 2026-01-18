import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
