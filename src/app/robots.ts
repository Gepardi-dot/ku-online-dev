import type { MetadataRoute } from 'next';

import { getPublicEnv } from '@/lib/env-public';

const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();
const SITE_URL = NEXT_PUBLIC_SITE_URL ?? 'https://ku-online.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: [`${SITE_URL}/sitemap.xml`],
  };
}
