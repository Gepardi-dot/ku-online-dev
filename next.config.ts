import type {NextConfig} from 'next';
import type {RemotePattern} from 'next/dist/shared/lib/image-config';
import { withSentryConfig } from '@sentry/nextjs';
import path from 'path';

const remotePatterns: RemotePattern[] = [
  {
    protocol: 'https',
    hostname: 'placehold.co',
    port: '',
    pathname: '/**',
  },
  {
    protocol: 'https',
    hostname: 'picsum.photos',
    port: '',
    pathname: '/**',
  },
  {
    protocol: 'https',
    hostname: 'images.unsplash.com',
    port: '',
    pathname: '/**',
  },
  {
    protocol: 'https',
    hostname: 'lh3.googleusercontent.com',
    port: '',
    pathname: '/**',
  },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHostname: string | null = null;

if (supabaseUrl) {
  try {
    const { hostname } = new URL(supabaseUrl);
    supabaseHostname = hostname;
    remotePatterns.push({
      protocol: 'https',
      hostname,
      port: '',
      pathname: '/storage/v1/object/**',
    });
    remotePatterns.push({
      protocol: 'https',
      hostname,
      port: '',
      pathname: '/storage/v1/render/**',
    });
  } catch (error) {
    console.warn('Invalid NEXT_PUBLIC_SUPABASE_URL, Supabase storage images will not be whitelisted.');
  }
}

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? null;
let sentryHostname: string | null = null;

if (sentryDsn) {
  try {
    sentryHostname = new URL(sentryDsn).hostname;
  } catch (error) {
    console.warn('Invalid Sentry DSN provided, Sentry host will be omitted from CSP.');
  }
}

const isProduction = process.env.NODE_ENV === 'production';
// To avoid blank pages caused by a static CSP blocking Next.js inline runtime scripts,
// gate the static CSP behind an explicit opt-in. In the future we can implement
// a nonce-based CSP. For now, production defaults to no static CSP header.
const enableStaticCsp = process.env.NEXT_ENABLE_STATIC_CSP === 'true';

function buildContentSecurityPolicy(): string {
  const directiveMap = new Map<string, Set<string>>([
    ['default-src', new Set(["'self'"])],
    ['base-uri', new Set(["'self'"])],
    ['form-action', new Set(["'self'"])],
    ['font-src', new Set(["'self'", 'data:'])],
    ['frame-ancestors', new Set(["'self'"])],
    [
      'img-src',
      new Set([
        "'self'",
        'data:',
        'blob:',
        'https://placehold.co',
        'https://picsum.photos',
        'https://images.unsplash.com',
        'https://lh3.googleusercontent.com',
      ]),
    ],
    ['object-src', new Set(["'none'"])],
    ['script-src', new Set(["'self'"])],
    ['style-src', new Set(["'self'", "'unsafe-inline'"])],
    ['connect-src', new Set(["'self'"])],
  ]);

  if (supabaseHostname) {
    directiveMap.get('connect-src')?.add(`https://${supabaseHostname}`);
    directiveMap.get('connect-src')?.add(`wss://${supabaseHostname}`);
    directiveMap.get('img-src')?.add(`https://${supabaseHostname}`);
  }

  if (sentryHostname) {
    directiveMap.get('connect-src')?.add(`https://${sentryHostname}`);
  }

  // Allow ingestion to the broader Sentry ingest domain to cover all DSN patterns.
  directiveMap.get('connect-src')?.add('https://*.ingest.sentry.io');

  const serialized = Array.from(directiveMap.entries()).map(([key, values]) => {
    const value = Array.from(values).join(' ');
    return value ? `${key} ${value}` : key;
  });

  serialized.push('upgrade-insecure-requests');
  return serialized.join('; ');
}

const securityHeaders = (() => {
  const headers = [
    {
      key: 'X-Frame-Options',
      value: 'SAMEORIGIN',
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'Referrer-Policy',
      value: 'no-referrer',
    },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=()',
    },
  ];

  if (isProduction) {
    headers.push(
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    );
    if (enableStaticCsp) {
      headers.push({
        key: 'Content-Security-Policy',
        value: buildContentSecurityPolicy(),
      });
    }
  }

  return headers;
})();

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingRoot: path.join(__dirname, '.'),
  images: {
    remotePatterns,
    qualities: [75, 82],
  },
  webpack(config, options) {
    const shouldDebugWebpack = process.env.NEXT_DEBUG_WEBPACK_OUTPUT === 'true';

    if (shouldDebugWebpack && options.isServer) {
      console.log('[webpack:before]', {
        nextRuntime: options.nextRuntime,
        outputPath: config.output?.path,
        filename: config.output?.filename,
        chunkFilename: config.output?.chunkFilename,
      });
    }

    if (options.isServer && config.output) {
      config.output.chunkFilename = 'chunks/[id].js';
    }

    if (shouldDebugWebpack && options.isServer) {
      console.log('[webpack:after]', {
        nextRuntime: options.nextRuntime,
        outputPath: config.output?.path,
        filename: config.output?.filename,
        chunkFilename: config.output?.chunkFilename,
      });
    }

    return config;
  },
  async headers() {
    if (!securityHeaders.length) {
      return [];
    }

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

const sentryBuildOptions = {
  silent: true,
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
