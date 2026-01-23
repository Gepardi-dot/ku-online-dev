import { getEnv } from '@/lib/env';

export interface VonageConfig {
  apiKey: string;
  apiSecret: string;
}

export function getVonageConfig(): VonageConfig {
  const { VONAGE_API_KEY, VONAGE_API_SECRET } = getEnv();

  if (!VONAGE_API_KEY || !VONAGE_API_SECRET) {
    throw new Error('VONAGE_API_KEY and VONAGE_API_SECRET must be set to use Vonage.');
  }

  return {
    apiKey: VONAGE_API_KEY,
    apiSecret: VONAGE_API_SECRET,
  };
}
