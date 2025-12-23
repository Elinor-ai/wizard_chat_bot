/** @type {import('next').NextConfig} */

// Backend URL for server-side proxy (not exposed to browser)
const API_BACKEND_URL = process.env.API_BACKEND_URL || "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true
  },
  env: {
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  },
  // Proxy /backend-api/* to the backend - works on localhost AND ngrok
  async rewrites() {
    return [
      {
        source: "/backend-api/:path*",
        destination: `${API_BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
