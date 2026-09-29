import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Pin the workspace root. Without it Turbopack walks up the filesystem
  // looking for a lockfile and can latch onto an unrelated one in the home
  // directory, which changes how modules resolve.
  turbopack: { root: import.meta.dirname },

  typescript: {
    // Type errors must fail the build. CI runs `typecheck` separately too.
    ignoreBuildErrors: false,
  },

  // pdfjs-dist ships a worker as a separate ESM chunk; keep it out of the
  // server bundle so the Node runtime never tries to evaluate browser globals.
  serverExternalPackages: ['pdfjs-dist'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
