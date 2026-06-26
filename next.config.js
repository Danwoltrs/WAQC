/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable compression for responses
  compress: true,

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Add security headers
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    const embedCsp = isProd
      ? "frame-ancestors 'self' https://sys.wolthers.com"
      : "frame-ancestors 'self' https://sys.wolthers.com http://localhost:*"

    return [
      // Embed routes: CSP frame-ancestors only — NO X-Frame-Options (it would block the iframe).
      // These blocks are listed first; Next.js merges ALL matching source blocks, so we must
      // keep X-Frame-Options out of the /embed/* and /api/embed/* sources entirely and rely
      // on the negative-lookahead on the global block below to prevent it leaking there too.
      {
        source: '/embed/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Security-Policy', value: embedCsp },
        ],
      },
      {
        source: '/api/embed/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Security-Policy', value: embedCsp },
        ],
      },
      // Global security headers for all non-embed paths.
      // The negative-lookahead excludes /embed/* and /api/embed/* so X-Frame-Options is
      // never sent on embed routes (those must be iframeable by sys.wolthers.com).
      {
        source: '/((?!embed/|api/embed/).*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
        ],
      },
      // Cache static assets
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // Optimize bundle
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Enable React strict mode for better development experience
  reactStrictMode: true,
}

module.exports = nextConfig