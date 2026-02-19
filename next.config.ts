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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

type SupabaseOrigin = {
  protocol: 'http' | 'https';
  hostname: string;
  port: string;
};

const supabaseImageOriginKeys = new Set<string>();
const supabaseCspConnectSources = new Set<string>();
const supabaseCspImageSources = new Set<string>();

function addSupabaseImageOrigin(origin: SupabaseOrigin): void {
  const key = `${origin.protocol}|${origin.hostname}|${origin.port}`;
  if (supabaseImageOriginKeys.has(key)) {
    return;
  }
  supabaseImageOriginKeys.add(key);

  remotePatterns.push({
    protocol: origin.protocol,
    hostname: origin.hostname,
    port: origin.port,
    pathname: '/storage/v1/object/**',
  });

  remotePatterns.push({
    protocol: origin.protocol,
    hostname: origin.hostname,
    port: origin.port,
    pathname: '/storage/v1/render/**',
  });
}

function addSupabaseCspSources(origin: SupabaseOrigin): void {
  const portSuffix = origin.port ? `:${origin.port}` : '';
  const originUrl = `${origin.protocol}://${origin.hostname}${portSuffix}`;
  const websocketProtocol = origin.protocol === 'https' ? 'wss' : 'ws';
  const websocketUrl = `${websocketProtocol}://${origin.hostname}${portSuffix}`;

  supabaseCspConnectSources.add(originUrl);
  supabaseCspConnectSources.add(websocketUrl);
  supabaseCspImageSources.add(originUrl);
}

if (supabaseUrl) {
  try {
    const parsedSupabaseUrl = new URL(supabaseUrl);
    const protocol =
      parsedSupabaseUrl.protocol === 'http:'
        ? 'http'
        : parsedSupabaseUrl.protocol === 'https:'
          ? 'https'
          : null;

    if (!protocol) {
      console.warn('Unsupported Supabase URL protocol, storage images will not be whitelisted.');
    } else {
      const supabaseOrigin: SupabaseOrigin = {
        protocol,
        hostname: parsedSupabaseUrl.hostname,
        port: parsedSupabaseUrl.port,
      };
      addSupabaseImageOrigin(supabaseOrigin);
      addSupabaseCspSources(supabaseOrigin);
    }
  } catch (error) {
    console.warn('Invalid Supabase URL, storage images will not be whitelisted.');
  }
}

// Local Supabase defaults used in development when URLs point at localhost/127.0.0.1.
addSupabaseImageOrigin({
  protocol: 'http',
  hostname: '127.0.0.1',
  port: '54321',
});
addSupabaseImageOrigin({
  protocol: 'http',
  hostname: 'localhost',
  port: '54321',
});

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

  for (const source of supabaseCspConnectSources) {
    directiveMap.get('connect-src')?.add(source);
  }

  for (const source of supabaseCspImageSources) {
    directiveMap.get('img-src')?.add(source);
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
  allowedDevOrigins: ['192.168.32.1'],
  outputFileTracingRoot: path.join(__dirname, '.'),
  images: {
    remotePatterns,
    qualities: [60, 70, 75, 82],
    // Local Supabase storage runs on 127.0.0.1 in dev; Next.js blocks private-IP
    // upstreams unless this flag is enabled.
    dangerouslyAllowLocalIP: !isProduction,
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
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/offline.html',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
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
