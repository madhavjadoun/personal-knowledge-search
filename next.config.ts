import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || (isProd ? "https://quizgenerator-production.up.railway.app" : "");

const connectSources = [
  "'self'",
  "https://*.supabase.co",
  "https://generativelanguage.googleapis.com",
];

if (supabaseUrl) {
  connectSources.push(supabaseUrl);
}
if (apiUrl) {
  connectSources.push(apiUrl);
}
if (!isProd) {
  connectSources.push("http://127.0.0.1:8000", "http://localhost:8000");
}

const connectSrcString = connectSources.join(" ");

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://*.googleapis.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com https://srhhlhcgkgopibhleliq.supabase.co; connect-src ${connectSrcString}; frame-ancestors 'none';`,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
