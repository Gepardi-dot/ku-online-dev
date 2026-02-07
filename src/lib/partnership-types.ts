export const PARTNERSHIP_TYPE_CODES = [
  'influencer_collab',
  'sponsored_placement',
  'store_onboarding',
  'affiliate_referrals',
  'pr_press',
  'integrations',
  'investment_other',
] as const;

export type PartnershipTypeCode = (typeof PARTNERSHIP_TYPE_CODES)[number];

export const SELLER_APPLICATION_TYPE: PartnershipTypeCode = 'store_onboarding';

export const PARTNERSHIP_TYPE_LABEL_KEYS: Record<PartnershipTypeCode, string> = {
  influencer_collab: 'partnership.options.influencer',
  sponsored_placement: 'partnership.options.sponsored',
  store_onboarding: 'partnership.options.storeOnboarding',
  affiliate_referrals: 'partnership.options.affiliate',
  pr_press: 'partnership.options.pr',
  integrations: 'partnership.options.integrations',
  investment_other: 'partnership.options.investment',
};

export const PARTNERSHIP_TYPE_EMAIL_LABELS: Record<PartnershipTypeCode, string> = {
  influencer_collab: 'Influencer collab',
  sponsored_placement: 'Sponsored placement',
  store_onboarding: 'Store onboarding / bulk listings',
  affiliate_referrals: 'Affiliate / referrals',
  pr_press: 'PR / press',
  integrations: 'Integrations',
  investment_other: 'Investment / other',
};
