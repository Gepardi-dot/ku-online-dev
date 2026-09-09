'use client';

import { memo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Eye, BadgeCheck } from 'lucide-react';
import type { ProductWithRelations } from '@/lib/services/products';
import FavoriteToggle from '@/components/product/favorite-toggle';
import { useLocale } from '@/providers/locale-provider';
import { localizeListingText } from '@/lib/locale/localize';
import { rtlLocales } from '@/lib/locale/dictionary';
import { CurrencyText } from '@/components/currency-text';
import { isPropertyCategory, normalizeProductListingType } from '@/lib/products/property-listing';

interface ProductCardProps {
  product: ProductWithRelations;
  viewerId?: string | null;
  viewerIsAdmin?: boolean;
  searchQuery?: string | null;
  interactive?: boolean;
  imagePriority?: boolean;
  imageQuality?: number;
  prefetch?: boolean;
  /** When set, overrides the default price<=0 → Free label (used by sell preview). */
  forceFreeLabel?: boolean;
}
