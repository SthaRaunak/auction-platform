import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The browser only ever talks to this origin; /api/* is proxied to Express (C2).
  // Cookies stay first-party and SameSite=Lax, CORS never comes up, and SSE
  // authenticates with the same cookie.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
  experimental: {
    // Proxied requests idle out after 30s by default; SSE heartbeats every 15s, this is headroom.
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
