export type SponsoredFeedSort = 'newest' | 'price_asc' | 'price_desc' | 'views_desc';

export type SponsoredFeedItem = {
  sponsorStoreId?: string | null;
  isPromoted: boolean;
  price: number;
  views: number;
  createdAt: Date | null;
};

export function compareSponsoredFeed<T extends SponsoredFeedItem>(
  a: T,
  b: T,
  sort: SponsoredFeedSort,
): number {
  const sponsored = Number(Boolean(b.sponsorStoreId)) - Number(Boolean(a.sponsorStoreId));
  if (sponsored !== 0) return sponsored;

  const promoted = Number(Boolean(b.isPromoted)) - Number(Boolean(a.isPromoted));
  if (promoted !== 0) return promoted;

  switch (sort) {
    case 'price_asc':
      return a.price - b.price;
    case 'price_desc':
      return b.price - a.price;
    case 'views_desc':
      return b.views - a.views;
    case 'newest':
    default:
      return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  }
}

export function rankSponsoredFeed<T extends SponsoredFeedItem>(items: T[], sort: SponsoredFeedSort): T[] {
  return [...items].sort((a, b) => compareSponsoredFeed(a, b, sort));
}
