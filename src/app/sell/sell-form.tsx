'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type CSSProperties } from 'react';
import type { User } from '@supabase/supabase-js';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getPublicEnv } from '@/lib/env-public';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
import { mapCategoriesForUi, type RawCategoryRow } from '@/data/category-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileText,
  Info,
  Loader2,
  MapPin,
  Sparkles,
  Tag,
  X,
  ChevronUp,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { CONDITION_OPTIONS } from '@/lib/products/filter-params';
import { createProductSchema } from '@/lib/validation/schemas';
import { compressToWebp } from '@/lib/images/client-compress';
import { highlightDollar } from '@/components/currency-text';
import { useLocale } from '@/providers/locale-provider';
import { rtlLocales } from '@/lib/locale/dictionary';
import { CATEGORY_LABEL_MAP, SPONSORS_CATEGORY_ID } from '@/data/category-ui-config';
import ProductCard from '@/components/product-card-new';
import type { ProductWithRelations } from '@/lib/services/products';

const conditionOptions = CONDITION_OPTIONS.filter((option) => option.value);
const cityOptions = MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all');

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (client compression reduces payload)
const ACCEPTED_FILE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const ACCEPTED_FILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const ACCEPTED_FILE_LABELS = ['JPG', 'PNG', 'WebP', 'AVIF'];
const ACCEPTED_FILES_DESCRIPTION = ACCEPTED_FILE_LABELS.join(', ');
const { NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET } = getPublicEnv();
const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const SELL_COLOR_TOKENS = [
  'orange',
  'black',
  'white',
  'blue',
  'yellow',
  'red',
  'green',
  'pink',
  'brown',
  'turquoise',
  'violet',
  'gray',
  'gold',
  'silver',
  'beige',
] as const;

type CurrencyCode = 'IQD' | 'USD';

const COLOR_CHIP_STYLE_MAP: Record<(typeof SELL_COLOR_TOKENS)[number], { bg: string; fg: string }> = {
  orange: { bg: '#f97316', fg: '#ffffff' },
  black: { bg: '#0a0a0a', fg: '#ffffff' },
  white: { bg: '#ffffff', fg: '#0f172a' },
  blue: { bg: '#2563eb', fg: '#ffffff' },
  yellow: { bg: '#fbbf24', fg: '#0f172a' },
  red: { bg: '#f43f5e', fg: '#ffffff' },
  green: { bg: '#10b981', fg: '#ffffff' },
  pink: { bg: '#ec4899', fg: '#ffffff' },
  brown: { bg: '#92400e', fg: '#ffffff' },
  turquoise: { bg: '#14b8a6', fg: '#ffffff' },
  violet: { bg: '#8b5cf6', fg: '#ffffff' },
  gray: { bg: '#94a3b8', fg: '#0f172a' },
  gold: { bg: '#f59e0b', fg: '#0f172a' },
  silver: { bg: '#cbd5e1', fg: '#0f172a' },
  beige: { bg: '#e7e5e4', fg: '#0f172a' },
};

type UploadedImage = {
  url: string;
  path: string;
};

interface SellFormData {
  title: string;
  description: string;
  price: string;
  currency: CurrencyCode;
  condition: string;
  categoryId: string;
  location: string;
  color: string;
  images: string[];
}

interface SellFormProps {
  user: User | null;
  storeContext?: {
    id: string;
    name: string;
    slug: string | null;
    ownerUserId: string | null;
  } | null;
}

export default function SellForm({ user, storeContext = null }: SellFormProps) {
  const [loading, setLoading] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [formData, setFormData] = useState<SellFormData>({
    title: '',
    description: '',
    price: '',
    currency: 'IQD',
    condition: '',
    categoryId: '',
    location: '',
    color: '',
    images: [] as string[],
  });
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(user);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const colorScrollRef = useRef<HTMLDivElement>(null);
  const { t, messages, locale } = useLocale();
  const direction = rtlLocales.includes(locale) ? 'rtl' : 'ltr';
  const returnTo = useMemo(() => {
    const raw = searchParams.get('returnTo')?.trim() ?? '';
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
  }, [searchParams]);
  const contentAlign = direction === 'rtl' ? 'end' : 'start';
  const requiredFieldMessage = t('common.validation.required');
  const updateColorScrollState = useCallback(() => {
    const el = colorScrollRef.current;
    if (!el) {
      setCanScrollUp(false);
      setCanScrollDown(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const threshold = 1;
    setCanScrollUp(scrollTop > threshold);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - threshold);
  }, []);

  useEffect(() => {
    if (!colorOpen) return;
    const el = colorScrollRef.current;
    if (!el) return;
    updateColorScrollState();

    const handleScroll = () => updateColorScrollState();
    el.addEventListener('scroll', handleScroll, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateColorScrollState());
      observer.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', handleScroll);
      observer?.disconnect();
    };
  }, [colorOpen, updateColorScrollState]);

  const currencyToggleOptions: Array<{ value: CurrencyCode; label: string }> = [
    { value: 'IQD', label: t('sellForm.currency.iqd') },
    { value: 'USD', label: t('sellForm.currency.usd') },
  ];
  const maxFileSizeMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));

  const cityLabels = messages.header.city as Record<string, string>;
  const getCityLabel = (value: string) => cityLabels[value.toLowerCase()] ?? value;

  const conditionLabels: Record<string, string> = {
    new: t('filters.conditionNew'),
    'used - like new': t('filters.conditionLikeNew'),
    'used - good': t('filters.conditionGood'),
    'used - fair': t('filters.conditionFair'),
  };

  const getConditionLabel = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return conditionLabels[normalized] ?? value;
  };

  const colorLabels = messages.filters.colors as Record<string, string>;
  const getColorLabel = (token: (typeof SELL_COLOR_TOKENS)[number]) => colorLabels[token] ?? token;

  const getCategoryLabel = (label: string) => {
    const normalized = label.trim().toLowerCase();
    const config = CATEGORY_LABEL_MAP[normalized];
    if (!config) return label;
    if (locale === 'ar') return config.labelAr ?? config.label;
    if (locale === 'ku') return config.labelKu ?? config.label;
    return config.label;
  };

  const getSelectedCityLabel = (locationValue: string) => {
    if (!locationValue) return t('filters.cityAll');
    const match = cityOptions.find((city) => city.label === locationValue);
    return match ? getCityLabel(match.value) : locationValue;
  };

  const getSelectedColorLabel = (colorValue: string) => {
    if (!colorValue) return t('filters.allColors');
    const isToken = (SELL_COLOR_TOKENS as readonly string[]).includes(colorValue);
    return isToken ? getColorLabel(colorValue as (typeof SELL_COLOR_TOKENS)[number]) : colorValue;
  };

  const menuShellClassName = [
    'mt-3 overflow-hidden rounded-2xl border border-[#e6ddd4] bg-[#f7f3ee]/95',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_10px_24px_rgba(124,45,18,0.10)] backdrop-blur-xl',
  ].join(' ');

  const menuShellDropdownClassName = `${menuShellClassName} mt-0 w-fit border-[#dccfbe]`;

  const menuHeaderClassName = [
    'flex items-center justify-between gap-3 border-b border-[#e6ddd4] bg-[#f3ece4]/90 px-4 py-2 text-[11px] font-semibold text-[#7a7168]',
    'md:px-5',
  ].join(' ');

  const menuHeaderValueClassName = 'truncate text-xs font-semibold text-[#3f372f] normal-case tracking-normal';

  const menuListClassName = 'max-h-60 overflow-y-auto md:max-h-72';
  const menuListInnerClassName = 'flex flex-col';

  const menuRowClassName = [
    'group flex w-full items-center justify-between gap-3 px-4 py-3 text-lg font-medium text-[#3f372f]',
    'border-b border-[#e6ddd4] last:border-b-0',
    'text-start transition hover:bg-[#efe7dd] hover:text-[#2f2a25]',
    'data-[state=checked]:bg-[#ece2d6] data-[state=checked]:text-[#2f2a25]',
    'md:px-5',
  ].join(' ');

  const menuRowIndicatorClassName = [
    'flex h-4 w-4 items-center justify-center rounded-full border border-[#d5c8b8] bg-[#f7f3ee]',
    'shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]',
    'group-data-[state=checked]:border-orange-500 group-data-[state=checked]:bg-orange-500',
  ].join(' ');

  const menuRowIndicatorDotClassName = [
    'h-1.5 w-1.5 rounded-full bg-white opacity-0 transition-opacity',
    'group-data-[state=checked]:opacity-100',
  ].join(' ');

  const menuRowSwatchClassName =
    'h-3 w-3 rounded-full ring-1 ring-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.12)]';

  const menuEmptyStateClassName =
    'border-b border-[#e6ddd4] bg-[#f3ece4]/80 px-4 py-4 text-center text-xs text-[#7a7168] md:px-5';

  const selectTriggerClassName = [
    'h-12 w-fit max-w-full rounded-2xl border border-[#eadbc5]/80 bg-linear-to-b from-[#fffdf7] to-[#fff2e2] px-4 text-sm text-[#1F1C1C]',
    '[&>span]:max-w-[18rem]',
    'shadow-[0_10px_26px_rgba(120,72,0,0.12)] ring-1 ring-white/70 backdrop-blur-xl transition',
    'hover:-translate-y-px hover:border-[#E67E22]/45 hover:shadow-[0_14px_34px_rgba(120,72,0,0.16)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf2]',
  ].join(' ');

  const selectContentClassName = [
    'rounded-2xl! border-slate-200/80!',
    'bg-[linear-gradient(180deg,#ffffff_0%,#f6f7f9_100%)]!',
    'shadow-[0_18px_40px_rgba(15,23,42,0.14)]! ring-1! ring-black/5! !backdrop-blur-0',
    'w-fit max-w-[min(22rem,calc(100vw-2rem))] max-h-72',
    '**:data-radix-select-viewport:w-auto! **:data-radix-select-viewport:min-w-0! **:data-radix-select-viewport:p-2',
    '**:data-radix-select-viewport:flex **:data-radix-select-viewport:flex-col **:data-radix-select-viewport:gap-1.5',
  ].join(' ');

  const dropdownPopoverContentClassName = [
    'w-fit p-0',
    'border-none bg-transparent shadow-none',
  ].join(' ');

  const compactSelectContentClassName = `${selectContentClassName} max-h-60 w-[18rem] max-w-[min(18rem,calc(100vw-2rem))] **:data-radix-select-viewport:w-full!`;

  const menuScrollAreaClassName = 'relative max-h-60 overflow-y-auto overflow-x-hidden no-scrollbar scroll-smooth md:max-h-72';
  const menuCueTopClassName = 'absolute top-0 left-0 right-0 z-10 pointer-events-none';
  const menuCueBottomClassName = 'absolute bottom-0 left-0 right-0 z-10 pointer-events-none';
  const menuCueBarTopClassName =
    'h-8 w-full rounded-t-2xl bg-gradient-to-b from-[#f7f3ee] via-[#f7f3ee]/85 to-transparent';
  const menuCueBarBottomClassName =
    'h-8 w-full rounded-b-2xl bg-gradient-to-t from-[#f7f3ee] via-[#f7f3ee]/85 to-transparent';
  const menuCueIconTopClassName = 'absolute inset-x-0 top-1 flex items-center justify-center';
  const menuCueIconBottomClassName = 'absolute inset-x-0 bottom-1 flex items-center justify-center';
  const menuCueChevronClassName = 'h-4 w-4 text-slate-400 drop-shadow-sm';

  const listSelectContentClassName = [
    selectContentClassName,
    'max-h-64',
    '**:data-radix-select-viewport:max-h-64',
    '**:data-radix-select-viewport:overflow-y-auto',
  ].join(' ');

  const selectItemClassName = [
    'w-full truncate rounded-xl! border border-transparent px-4! py-3! ps-10! text-[15px]! font-medium text-slate-700 outline-none transition-colors',
    'hover:bg-slate-100/80 hover:text-slate-900',
    'data-highlighted:bg-slate-100 data-highlighted:text-slate-900',
    'data-[state=checked]:bg-slate-900 data-[state=checked]:text-white data-[state=checked]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]',
    '[&_svg]:text-slate-400! data-[state=checked]:[&_svg]:text-emerald-300!',
  ].join(' ');

  const listingSelectTriggerClassName = [
    'h-8 w-fit max-w-full rounded-xl border border-white/55 bg-white/65 px-2.5 text-[13px]',
    'shadow-sm ring-1 ring-white/25 backdrop-blur-xl',
    'hover:bg-white/75 hover:shadow-md',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-white/80',
    'min-w-38',
  ].join(' ');

  const listingSelectContentClassName = [
    'max-h-76 w-fit min-w-38 max-w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[#d6d6d6]/70',
    'bg-white/90 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.18)] ring-1 ring-white/40 backdrop-blur-xl',
    '**:data-radix-select-viewport:w-auto! **:data-radix-select-viewport:min-w-0! **:data-radix-select-viewport:p-2',
    '**:data-radix-select-viewport:flex **:data-radix-select-viewport:flex-col **:data-radix-select-viewport:gap-2',
    '**:data-radix-select-viewport:max-h-76! **:data-radix-select-viewport:overflow-y-auto!',
  ].join(' ');

  const listingSelectItemClassName = [
    'w-full rounded-xl border border-slate-200/70 bg-white px-2.5 py-2.5 ps-9 text-[15px] leading-snug text-[#1F1C1C]',
    'whitespace-normal wrap-break-word text-left',
    'shadow-sm outline-none transition',
    'hover:border-slate-300/70 hover:bg-slate-50/80',
    'data-highlighted:border-slate-300/70 data-highlighted:bg-slate-50/80',
    'data-[state=checked]:border-primary/25 data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium',
  ].join(' ');

  const categorySelectTriggerClassName = [
    'h-10 w-fit max-w-full rounded-md border border-white/40 bg-white/60 px-2 text-sm backdrop-blur-md',
    'shadow-[0_8px_22px_rgba(15,23,42,0.10)] ring-1 ring-white/40',
    'hover:border-white/70 hover:bg-white/75',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
    'focus-visible:ring-offset-1 focus-visible:ring-offset-white/80',
    'min-w-34',
  ].join(' ');

  const categorySelectContentClassName = [
    'max-h-72 w-fit min-w-34 max-w-[min(18rem,calc(100vw-2rem))] rounded-md border border-white/60',
    'bg-white/75 p-1.5 shadow-[0_28px_70px_rgba(15,23,42,0.28)] ring-1 ring-black/10 backdrop-blur-xl',
    '**:data-radix-select-viewport:w-auto! **:data-radix-select-viewport:min-w-0! **:data-radix-select-viewport:p-1.5',
    '**:data-radix-select-viewport:flex **:data-radix-select-viewport:flex-col **:data-radix-select-viewport:gap-1.5',
    '**:data-radix-select-viewport:max-h-72! **:data-radix-select-viewport:overflow-y-auto!',
  ].join(' ');

  const categorySelectItemClassName = [
    'w-full rounded-md border border-white/70 bg-white/65 px-2 py-2 ps-8 text-[16px] leading-snug text-[#1F1C1C] backdrop-blur-md',
    'whitespace-normal wrap-break-word text-left',
    'shadow-[0_12px_26px_rgba(15,23,42,0.12)] outline-none transition',
    'motion-safe:transition-[transform,box-shadow,border-color,background-color] motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none',
    'hover:-translate-y-px hover:border-white/90 hover:bg-white/80 hover:shadow-[0_16px_34px_rgba(15,23,42,0.18)]',
    'data-highlighted:-translate-y-px data-highlighted:border-white/90 data-highlighted:bg-white/80 data-highlighted:shadow-[0_16px_34px_rgba(15,23,42,0.18)]',
    'data-[state=checked]:border-white data-[state=checked]:bg-white/90 data-[state=checked]:font-medium',
  ].join(' ');

  const allColorsTileStyle: React.CSSProperties = {
    backgroundImage:
      'conic-gradient(from 180deg at 50% 50%, #f97316 0deg, #ef4444 48deg, #ec4899 92deg, #a855f7 140deg, #3b82f6 188deg, #14b8a6 236deg, #22c55e 286deg, #facc15 330deg, #f97316 360deg)',
  };

  const textFieldClassName = [
    'h-12 rounded-2xl border border-border/80 bg-white/95 px-4 text-sm shadow-sm backdrop-blur-xl',
    'ring-1 ring-black/5 transition hover:shadow-md',
    'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80',
  ].join(' ');

  const textareaClassName = [
    'min-h-[140px] rounded-2xl border border-border/80 bg-white/95 px-4 py-3 text-sm shadow-sm backdrop-blur-xl',
    'ring-1 ring-black/5 transition hover:shadow-md',
    'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80',
  ].join(' ');

  const sectionClassName = 'py-5 border-b border-black/10 last:border-b-0';
  const firstSectionClassName = 'pt-0 pb-5 border-b border-black/10 last:border-b-0';

  const pricingPanelStyle = {
    ['--sell-panel-start' as string]: '#fff9f2',
    ['--sell-panel-mid' as string]: '#fffdf9',
    ['--sell-panel-end' as string]: '#fff2e4',
    ['--sell-panel-border' as string]: '#f6dcc2',
    ['--sell-panel-ink' as string]: '#402617',
    ['--sell-panel-accent' as string]: '#f97316',
    ['--sell-panel-glow' as string]: 'rgba(249, 115, 22, 0.25)',
  } as CSSProperties;

  const detailsPanelStyle = {
    ['--sell-panel-start' as string]: '#fffaf2',
    ['--sell-panel-mid' as string]: '#fffef8',
    ['--sell-panel-end' as string]: '#fff1df',
    ['--sell-panel-border' as string]: '#f2dcc3',
    ['--sell-panel-ink' as string]: '#3f2a1e',
    ['--sell-panel-accent' as string]: '#f59e0b',
    ['--sell-panel-glow' as string]: 'rgba(245, 158, 11, 0.24)',
  } as CSSProperties;

  const detailsPanelClassName = [
    'relative overflow-hidden rounded-3xl border border-(--sell-panel-border)',
    'bg-[linear-gradient(135deg,var(--sell-panel-start),var(--sell-panel-mid),var(--sell-panel-end))]',
    'p-4 md:p-6 shadow-[0_12px_30px_rgba(124,45,18,0.12)]',
    'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-500',
  ].join(' ');

  const detailsCardClassName = [
    'rounded-2xl border border-white/70 bg-white/92 p-4 shadow-[0_8px_18px_rgba(124,45,18,0.10)]',
    'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-500',
  ].join(' ');

  const detailsLabelClassName = 'flex items-center gap-2 text-sm font-semibold text-(--sell-panel-ink)';

  const detailsIconClassName = [
    'inline-flex items-center justify-center text-(--sell-panel-ink) opacity-80',
    '[text-shadow:0_1px_0_rgba(255,255,255,0.75)]',
  ].join(' ');

  const upperPanelStyle = {
    ['--sell-panel-start' as string]: '#fffaf4',
    ['--sell-panel-mid' as string]: '#fffefb',
    ['--sell-panel-end' as string]: '#fff4ea',
    ['--sell-panel-border' as string]: '#f0dcc7',
    ['--sell-panel-ink' as string]: '#3b2a20',
    ['--sell-panel-accent' as string]: '#f59e0b',
    ['--sell-panel-glow' as string]: 'rgba(245, 158, 11, 0.2)',
  } as CSSProperties;

  const upperPanelClassName = [
    'relative overflow-hidden rounded-3xl border border-(--sell-panel-border)',
    'bg-[linear-gradient(150deg,var(--sell-panel-start),var(--sell-panel-mid),var(--sell-panel-end))]',
    'p-4 md:p-6 shadow-[0_10px_26px_rgba(124,45,18,0.10)]',
  ].join(' ');

  const upperDropZoneBaseClassName = [
    'relative flex min-h-[136px] items-center rounded-2xl border border-dashed px-4 py-4 transition md:px-5',
    'bg-white/92 shadow-[0_8px_18px_rgba(124,45,18,0.08)]',
  ].join(' ');

  const detailsTextareaClassName = [
    textareaClassName,
    'border-[#e6ddd4] bg-[#f7f3ee] text-[#3f372f]',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_18px_rgba(124,45,18,0.08)]',
    'placeholder:text-[#7a7168]',
  ].join(' ');

  const detailsInputClassName = [
    textFieldClassName,
    'border-[#e6ddd4] bg-[#f7f3ee] text-[#3f372f]',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_18px_rgba(124,45,18,0.08)]',
    'placeholder:text-[#7a7168]',
  ].join(' ');

  const heroBadgeClassName = [
    'inline-flex items-center gap-2 rounded-full border border-[#f1e2d2] bg-white/80 px-3 py-1 text-[#7a5b46]',
    'shadow-[0_6px_14px_rgba(124,45,18,0.08)]',
  ].join(' ');

  const detailsSelectTriggerClassName = [
    'h-11 w-full rounded-xl border border-[#e6ddd4] bg-[#f7f3ee] px-4 py-2.5',
    'flex items-center justify-between gap-3 text-start',
    'text-[#3f372f] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_10px_rgba(124,45,18,0.06)]',
    'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_14px_rgba(124,45,18,0.09)] hover:border-[#dccfbe]',
    'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
  ].join(' ');

  const currencyToggleClassName = [
    'inline-flex items-center gap-1 rounded-2xl border border-[#e6ddd4] bg-[#f7f3ee] p-1',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]',
  ].join(' ');

  const currencyToggleButtonBaseClassName = [
    'flex h-10 min-w-[48px] items-center justify-center rounded-xl px-1.5 text-[17px] font-semibold leading-none transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--sell-panel-accent) focus-visible:ring-offset-2',
  ].join(' ');

  const priceInputShellClassName = [
    'mt-3 flex min-h-14 items-center gap-2 rounded-2xl border border-[#e9dccd] bg-white/95 ps-4 pe-2',
    'shadow-[0_10px_20px_rgba(124,45,18,0.10)] ring-1 ring-white/70 transition',
    'focus-within:border-(--sell-panel-accent) focus-within:ring-2 focus-within:ring-(--sell-panel-accent)/25',
  ].join(' ');

  const priceFreeChipClassName = [
    'inline-flex min-w-[94px] items-center justify-between gap-2 rounded-full border px-2.5 py-1.5',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--sell-panel-accent) focus-visible:ring-offset-2',
  ].join(' ');

  const priceCurrencyCanvasClassName = [
    'pointer-events-none inline-flex items-center rounded-lg border border-[#eadbca] bg-[#f8f2ea] px-2.5 py-1',
    'text-[17px] font-semibold leading-none text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]',
  ].join(' ');

  const glassAsideCardClassName = [
    'rounded-3xl border border-white/50 bg-white/60 shadow-[0_18px_50px_rgba(15,23,42,0.08)]',
    'backdrop-blur-2xl ring-1 ring-white/30',
  ].join(' ');

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      setIsCategoriesLoading(true);

      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_active', true)
        .neq('id', SPONSORS_CATEGORY_ID)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading categories', error);
        toast({
          title: t('sellForm.toast.categoriesErrorTitle'),
          description: t('sellForm.toast.categoriesErrorDescription'),
          variant: 'destructive',
        });
        if (isMounted) {
          setCategories([]);
          setIsCategoriesLoading(false);
        }
        return;
      }

      const mapped = mapCategoriesForUi((data ?? []) as RawCategoryRow[]);
      if (isMounted) {
        setCategories(mapped);
        setIsCategoriesLoading(false);
      }
    };

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [supabase, t]);

  useEffect(() => {
    if (currentUser) {
      return;
    }

    const resolveUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Error resolving current user', error);
        return;
      }

      setCurrentUser(data.user ?? null);
    };

    resolveUser();
  }, [currentUser, supabase]);

  // Warn about unsaved changes on navigation/refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsaved]);

  const determineExtension = (file: File) => {
    const nameExt = file.name.split('.').pop()?.toLowerCase();
    if (nameExt && ACCEPTED_FILE_EXTENSIONS.includes(nameExt)) {
      return nameExt === 'jpeg' ? 'jpg' : nameExt;
    }

    switch (file.type) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/avif':
        return 'avif';
      default:
        return null;
    }
  };

  const revokePreviewUrl = (url: string) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  const processFiles = async (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }

    if (storageBusy) {
      return;
    }

    const userForUpload = currentUser ?? (await supabase.auth.getUser()).data.user;

    if (!userForUpload) {
      toast({
        title: t('sellForm.toast.authRequiredTitle'),
        description: t('sellForm.toast.authRequiredUploadDescription'),
        variant: 'destructive',
      });
      return;
    }

    let availableSlots = MAX_IMAGES - uploadedImages.length;

    if (availableSlots <= 0) {
      toast({
        title: t('sellForm.toast.uploadLimitTitle'),
        description: t('sellForm.toast.uploadLimitDescription').replace('{max}', String(MAX_IMAGES)),
      });
      return;
    }

    const filesToHandle = incomingFiles.slice(0, availableSlots);

    if (incomingFiles.length > filesToHandle.length) {
      const remainingTemplate =
        availableSlots === 1
          ? t('sellForm.toast.uploadLimitRemainingSingle')
          : t('sellForm.toast.uploadLimitRemainingPlural');
      toast({
        title: t('sellForm.toast.uploadLimitTitle'),
        description: remainingTemplate
          .replace('{remaining}', String(availableSlots))
          .replace('{max}', String(MAX_IMAGES)),
      });
    }

    setStorageBusy(true);

    try {
      for (const file of filesToHandle) {
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: t('sellForm.toast.fileTooLargeTitle'),
            description: t('sellForm.toast.fileTooLargeDescription')
              .replace('{filename}', file.name)
              .replace('{maxMb}', String(maxFileSizeMb)),
            variant: 'destructive',
          });
          continue;
        }

        const extension = determineExtension(file);

        if (!extension) {
          toast({
            title: t('sellForm.toast.unsupportedFileTitle'),
            description: t('sellForm.toast.unsupportedFileDescription')
              .replace('{filename}', file.name)
              .replace('{types}', ACCEPTED_FILES_DESCRIPTION),
            variant: 'destructive',
          });
          continue;
        }

        // Upload to compression endpoint; server stores optimized WebP and returns signed preview URL
        let uploadResponse: Response;
        let uploadPayload: {
          path?: string;
          thumbPath?: string | null;
          publicUrl?: string | null;
          signedUrl?: string | null;
          error?: string;
        } | null = null;
        try {
        // Only pre-compress extremely large files to avoid double lossy compression on normal photos
        const shouldClientCompress = file.size > 10 * 1024 * 1024; // >10MB
        let payloadFile: File = file;
        if (shouldClientCompress) {
          try {
            const blob = await compressToWebp(file, { maxEdge: 1600, quality: 0.82 });
            payloadFile = new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'upload'}.webp`, { type: 'image/webp' });
          } catch (e) {
            console.warn('Client compression failed, falling back to raw upload', e);
          }
        }
        const fd = new FormData();
        fd.append('file', payloadFile);
        if (formData.categoryId) {
          fd.append('categoryId', formData.categoryId);
        }
          uploadResponse = await fetch('/api/uploads', { method: 'POST', body: fd });
          uploadPayload = await uploadResponse.json().catch(() => null);
        } catch (networkError) {
          console.error('Failed to upload image', networkError);
          toast({
            title: t('sellForm.toast.uploadFailedTitle'),
            description: t('sellForm.toast.uploadFailedNetworkDescription').replace('{filename}', file.name),
            variant: 'destructive',
          });
          continue;
        }

        if (!uploadResponse.ok || !uploadPayload?.path) {
          const message =
            uploadPayload?.error ??
            t('sellForm.toast.uploadFailedGenericDescription').replace('{filename}', file.name);
          toast({ title: t('sellForm.toast.uploadFailedTitle'), description: message, variant: 'destructive' });
          continue;
        }

        const { path, publicUrl, signedUrl } = uploadPayload;
        const previewUrl =
          typeof publicUrl === 'string' && publicUrl.length > 0
            ? publicUrl
            : typeof signedUrl === 'string' && signedUrl.length > 0
              ? signedUrl
              : URL.createObjectURL(file);

        setUploadedImages((prev) => [...prev, { url: previewUrl, path }]);
        setFormData((prev) => ({ ...prev, images: [...prev.images, path] }));

        availableSlots -= 1;
        if (availableSlots <= 0) {
          break;
        }
      }
    } finally {
      setStorageBusy(false);
    }
  };

  const handleFileButtonClick = () => {
    if (uploadedImages.length >= MAX_IMAGES) {
      toast({
        title: t('sellForm.toast.uploadLimitTitle'),
        description: t('sellForm.toast.uploadLimitDescription').replace('{max}', String(MAX_IMAGES)),
      });
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : [];

    if (!selectedFiles.length) {
      return;
    }

    await processFiles(selectedFiles);
    event.target.value = '';
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (storageBusy) {
      return;
    }

    const droppedFiles = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];

    if (!droppedFiles.length) {
      setIsDragActive(false);
      return;
    }

    await processFiles(droppedFiles);
    setIsDragActive(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!storageBusy) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleRemoveImage = async (image: UploadedImage) => {
    setStorageBusy(true);

    try {
      const response = await fetch(`/api/uploads?path=${encodeURIComponent(image.path)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.error ?? t('sellForm.toast.removeFailedDescription');
        toast({
          title: t('sellForm.toast.removeFailedTitle'),
          description: message,
          variant: 'destructive',
        });
        return;
      }

      setUploadedImages((prev) => prev.filter((item) => item.path !== image.path));
      setFormData((prev) => ({
        ...prev,
        images: prev.images.filter((path) => path !== image.path),
      }));
      revokePreviewUrl(image.url);
    } catch (error) {
      console.error('Failed to remove image', error);
      toast({
        title: t('sellForm.toast.removeFailedTitle'),
        description: t('sellForm.toast.removeFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setStorageBusy(false);
    }
  };

  const handleRequiredInvalid = (event: React.FormEvent<HTMLInputElement>) => {
    if (event.currentTarget.validity.valueMissing) {
      event.currentTarget.setCustomValidity(requiredFieldMessage);
    }
  };

  const handleRequiredInput = (event: React.FormEvent<HTMLInputElement>) => {
    event.currentTarget.setCustomValidity('');
  };

  const handleSetCover = (targetPath: string) => {
    setUploadedImages((prev) => {
      const index = prev.findIndex((item) => item.path === targetPath);
      if (index <= 0) return prev;
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
    setFormData((prev) => {
      const index = prev.images.findIndex((path) => path === targetPath);
      if (index <= 0) return prev;
      const nextImages = [...prev.images];
      const [selected] = nextImages.splice(index, 1);
      nextImages.unshift(selected);
      return { ...prev, images: nextImages };
    });
    setHasUnsaved(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const resolvedUser = currentUser ?? (await supabase.auth.getUser()).data.user;

      if (!resolvedUser) {
        toast({
          title: t('sellForm.toast.authRequiredTitle'),
          description: t('sellForm.toast.authRequiredCreateDescription'),
          variant: 'destructive',
        });
        return;
      }

      // Require verified email before creating listings
      const confirmed = (resolvedUser as any)?.email_confirmed_at;
      if (!confirmed) {
        toast({
          title: t('sellForm.toast.emailVerifyTitle'),
          description: t('sellForm.toast.emailVerifyDescription'),
          variant: 'destructive',
        });
        return;
      }

      const normalizedStoreOwnerId = storeContext?.ownerUserId?.trim() ?? '';
      if (storeContext && normalizedStoreOwnerId.length === 0) {
        toast({
          title: 'Store owner is not set',
          description: 'Set the store owner first, then add products to this store.',
          variant: 'destructive',
        });
        return;
      }
      const resolvedSellerId = normalizedStoreOwnerId || resolvedUser.id;

      const validation = createProductSchema.safeParse({
        title: formData.title,
        description: formData.description,
        price: formData.price,
        currency: formData.currency,
        condition: formData.condition,
        categoryId: formData.categoryId,
        location: formData.location,
        color: formData.color || undefined,
        images: formData.images.length ? formData.images : uploadedImages.map((image) => image.path),
        sellerId: resolvedSellerId,
      });

      if (!validation.success) {
        const issue = validation.error.issues[0];
        const message =
          locale === 'en'
            ? (issue?.message ?? t('sellForm.toast.validationDescription'))
            : t('sellForm.toast.validationDescription');
        toast({
          title: t('sellForm.toast.validationTitle'),
          description: message,
          variant: 'destructive',
        });
        return;
      }

      const payload = validation.data;

      const { data, error } = await supabase
        .from('products')
        .insert({
          title: payload.title,
          description: payload.description,
          price: payload.price,
          condition: payload.condition,
          location: payload.location,
          category_id: payload.categoryId,
          seller_id: resolvedSellerId,
          sponsor_store_id: storeContext?.id ?? null,
          images: payload.images,
          currency: payload.currency ?? 'IQD',
          color_token: payload.color ?? null,
          is_active: true,
        })
        .select('id')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.id) {
        try {
          const syncResponse = await fetch('/api/search/algolia-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: data.id }),
          });
          if (!syncResponse.ok) {
            console.warn('Algolia sync failed after create', await syncResponse.text().catch(() => ''));
          }
        } catch (syncError) {
          console.warn('Algolia sync failed after create', syncError);
        }

        try {
          fetch('/api/products/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: data.id }),
            keepalive: true,
          }).catch(() => {});
        } catch {}
      }

      toast({
        title: t('sellForm.toast.createSuccessTitle'),
        description: t('sellForm.toast.createSuccessDescription'),
      });

      setFormData({
        title: '',
        description: '',
        price: '',
        currency: 'IQD',
        condition: '',
        categoryId: '',
        location: '',
        color: '',
        images: [],
      });
      setUploadedImages([]);
      setIsFree(false);

      setHasUnsaved(false);
      router.push(returnTo ?? '/');
    } catch (error: any) {
      console.error('Error creating listing:', error);
      if (error && typeof error === 'object') {
        console.error('Error creating listing details:', {
          message: (error as any).message,
          details: (error as any).details,
          hint: (error as any).hint,
          code: (error as any).code,
        });
      }

      const errorDetails = (error as any)?.details;
      const errorMessage = (error as any)?.message;
      if (errorDetails === 'ku_daily_listing_limit' || errorMessage === 'Daily listing limit reached') {
        const hint = (error as any)?.hint;
        const matchedLimit =
          typeof hint === 'string' ? Number.parseInt(hint.match(/(\d+)/)?.[1] ?? '', 10) : Number.NaN;
        const dailyLimit = Number.isFinite(matchedLimit) ? matchedLimit : 3;
        const numberLocale = locale === 'ku' ? 'ku-u-nu-arab' : locale === 'ar' ? 'ar-u-nu-arab' : 'en-US';
        const limitLabel = new Intl.NumberFormat(numberLocale).format(dailyLimit);
        const description = t('sellForm.toast.dailyLimitDescription')
          .replace('{limit}', limitLabel)
          .concat(dailyLimit < 10 ? ` ${t('sellForm.toast.dailyLimitUpgradeDescription')}` : '');

        toast({
          title: t('sellForm.toast.dailyLimitTitle'),
          description,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('sellForm.toast.createFailedTitle'),
        description: t('sellForm.toast.createFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const checklistItems = [
    { label: t('sellForm.fields.images'), completed: uploadedImages.length > 0 },
    { label: t('sellForm.fields.title'), completed: formData.title.trim().length >= 3 },
    { label: t('sellForm.fields.price'), completed: isFree || formData.price.trim().length > 0 },
    { label: t('sellForm.fields.condition'), completed: formData.condition.trim().length > 0 },
    { label: t('sellForm.fields.category'), completed: formData.categoryId.trim().length > 0 },
    { label: t('sellForm.fields.location'), completed: formData.location.trim().length > 0 },
  ];

  const completedChecklistCount = checklistItems.filter((item) => item.completed).length;
  const allChecklistCompleted = completedChecklistCount >= checklistItems.length;
  const completionPercent = Math.round((completedChecklistCount / checklistItems.length) * 100);
  const numberLocale = locale === 'ku' ? 'ku-u-nu-arab' : locale === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  const completionLabel = t('sellForm.progress.completion')
    .replace('{count}', new Intl.NumberFormat(numberLocale).format(completedChecklistCount))
    .replace('{total}', new Intl.NumberFormat(numberLocale).format(checklistItems.length));
  const compactUploadSupportLabel = t('sellForm.upload.compactSupport')
    .replace('{maxImages}', new Intl.NumberFormat(numberLocale).format(MAX_IMAGES))
    .replace('{types}', ACCEPTED_FILE_LABELS.join('/'));
  const uploadInputDisabled = storageBusy || uploadedImages.length >= MAX_IMAGES;
  const completionColor = (() => {
    if (allChecklistCompleted) {
      return '#16a34a';
    }
    const redSteps = ['#dc2626', '#ef4444', '#f97316', '#f59e0b', '#fbbf24'];
    return redSteps[Math.max(0, Math.min(completedChecklistCount - 1, redSteps.length - 1))] ?? '#dc2626';
  })();
  const currencyInputLabel = (() => {
    if (formData.currency === 'IQD' && (locale === 'ar' || locale === 'ku')) {
      return 'د.ع';
    }
    if (formData.currency === 'USD' && (locale === 'ar' || locale === 'ku')) {
      return '$';
    }
    return formData.currency;
  })();
  const selectedCategory = categories.find((category) => category.id === formData.categoryId) ?? null;
  const conditionTriggerLabel =
    formData.condition.trim().length > 0
      ? getConditionLabel(formData.condition)
      : t('sellForm.fields.conditionPlaceholder');
  const categoryTriggerLabel = selectedCategory
    ? getCategoryLabel(selectedCategory.name)
    : t('sellForm.fields.categoryPlaceholder');
  const locationTriggerLabel =
    formData.location.trim().length > 0
      ? getSelectedCityLabel(formData.location)
      : t('sellForm.fields.locationPlaceholder');
  const colorTriggerLabel =
    formData.color.trim().length > 0 ? getSelectedColorLabel(formData.color) : t('sellForm.fields.colorPlaceholder');
  const previewTitle = formData.title.trim().length > 0 ? formData.title.trim() : t('sellForm.preview.placeholderTitle');
  const previewImage = uploadedImages[0]?.url ?? null;
  const previewNumericPrice = (() => {
    if (isFree) return 0;
    const numericPrice = Number.parseFloat(formData.price);
    return Number.isFinite(numericPrice) ? numericPrice : 0;
  })();
  const metadata =
    currentUser && typeof currentUser.user_metadata === 'object' && currentUser.user_metadata !== null
      ? (currentUser.user_metadata as Record<string, unknown>)
      : null;
  const rawFullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : '';
  const rawName = typeof metadata?.name === 'string' ? metadata.name.trim() : '';
  const rawEmail = typeof currentUser?.email === 'string' ? currentUser.email.trim() : '';
  const previewSellerName =
    rawFullName || rawName || (rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail) || null;
  const previewProduct: ProductWithRelations = {
    id: 'preview-listing',
    title: previewTitle,
    description: formData.description.trim() || null,
    price: previewNumericPrice,
    currency: formData.currency,
    condition: formData.condition.trim() || 'new',
    colorToken: formData.color.trim() || null,
    categoryId: formData.categoryId.trim() || null,
    sellerId: currentUser?.id ?? 'preview-seller',
    location: formData.location.trim() || null,
    imagePaths: uploadedImages.map((image) => image.path),
    imageUrls: previewImage ? [previewImage] : [],
    isActive: true,
    isSold: false,
    isPromoted: false,
    views: 0,
    createdAt: null,
    updatedAt: null,
    seller: {
      id: currentUser?.id ?? 'preview-seller',
      email: currentUser?.email ?? null,
      phone: null,
      fullName: previewSellerName,
      name: previewSellerName,
      avatar: null,
      location: null,
      bio: null,
      isVerified: false,
      rating: null,
      totalRatings: null,
      createdAt: null,
      updatedAt: null,
    },
    category: null,
  };

  return (
    <div dir={direction} className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-32 -left-24 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 pb-28 md:pb-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <Card className="relative overflow-hidden rounded-3xl border-white/50 bg-white/70 shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-br from-white/85 via-white/70 to-[#fff4ea]/70"
            />
            <div className="relative">
              <CardHeader className="p-6 pb-0 md:p-8 md:pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-3xl md:text-4xl font-bold tracking-tight text-[#f97316]">{t('sellForm.title')}</CardTitle>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{t('sellForm.hero.subtitle')}</p>
                    {storeContext ? (
                      <p className="mt-2 text-xs font-semibold text-[#475569]" dir="auto">
                        Posting to store: <span className="text-[#f97316]">{storeContext.name}</span>
                      </p>
                    ) : null}
                  </div>

                </div>

              </CardHeader>

              <CardContent className="p-6 pt-0 md:p-8 md:pt-0">
                <form
                  id="create-listing-form"
                  onSubmit={handleSubmit}
                  className="space-y-0 divide-y divide-black/10"
                >
                  <section className={firstSectionClassName}>
                    <div className={upperPanelClassName} style={upperPanelStyle}>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <h2 className="text-[1.65rem] font-semibold leading-tight tracking-tight text-(--sell-panel-ink)">
                            {t('sellForm.fields.images')}
                          </h2>
                        </div>

                        <div
                          className={`${upperDropZoneBaseClassName} ${
                            isDragActive
                              ? 'border-(--sell-panel-accent) bg-white'
                              : uploadInputDisabled
                                ? 'cursor-not-allowed opacity-65 border-(--sell-panel-border)'
                                : 'cursor-pointer border-(--sell-panel-border) hover:border-(--sell-panel-accent) hover:bg-white'
                          }`}
                          onDragEnter={handleDragOver}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          role="button"
                          tabIndex={uploadInputDisabled ? -1 : 0}
                          aria-label={t('sellForm.upload.browse')}
                          onKeyDown={(event) => {
                            if (uploadInputDisabled) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleFileButtonClick();
                            }
                          }}
                          onClick={() => {
                            if (uploadInputDisabled) return;
                            handleFileButtonClick();
                          }}
                        >
                          <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center">
                            <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl border border-[#ece4dc] bg-[#f6f3ef]">
                              <span className="absolute left-2 top-2 z-10 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">
                                {t('sellForm.preview.cover')}
                              </span>
                              {previewImage ? (
                                <Image
                                  src={previewImage}
                                  alt={t('sellForm.upload.previewAlt')}
                                  fill
                                  sizes="112px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-500">
                                  <Camera className="h-10 w-10" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 text-start">
                              <p className="text-xl font-semibold tracking-tight text-(--sell-panel-ink)">
                                {t('sellForm.upload.dragDropCta')}{' '}
                                <span className="text-[#eb7d22]">{t('sellForm.upload.browse')}</span>
                              </p>
                              <p className="mt-1 text-sm text-slate-500">{compactUploadSupportLabel}</p>
                            </div>
                          </div>

                          <input
                            ref={fileInputRef}
                            id="images-input"
                            type="file"
                            accept={ACCEPTED_FILE_MIME_TYPES.join(',')}
                            multiple
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </div>

                        {uploadedImages.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-2">
                            {uploadedImages.map((image, index) => (
                              <div
                                key={image.path}
                                className="group relative aspect-square overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-[0_8px_18px_rgba(124,45,18,0.08)]"
                              >
                                <Image
                                  src={image.url}
                                  alt="Preview"
                                  fill
                                  className="object-cover"
                                />
                                {index === 0 && (
                                  <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
                                    {t('sellForm.preview.cover')}
                                  </div>
                                )}
                                {index !== 0 && (
                                  <button
                                    type="button"
                                    className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm opacity-0 transition group-hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSetCover(image.path);
                                    }}
                                  >
                                    {t('sellForm.upload.setCover')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/80"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveImage(image);
                                  }}
                                  disabled={storageBusy}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className={sectionClassName}>
                    <div className={upperPanelClassName} style={upperPanelStyle}>
                      <div className="grid gap-4">
                        <div>
                          <Label htmlFor="title" className={detailsLabelClassName}>
                            <span className={detailsIconClassName}>
                              <FileText className="h-4 w-4" />
                            </span>
                            <span className="flex items-center gap-1">
                              <span>{t('sellForm.fields.title')}</span>
                              <span className="text-(--sell-panel-accent)" aria-hidden="true">
                                *
                              </span>
                            </span>
                          </Label>
                          <div className="mt-2">
                            <Input
                              id="title"
                              className={detailsInputClassName}
                              value={formData.title}
                              onChange={(e) => {
                                setHasUnsaved(true);
                                setFormData((prev) => ({ ...prev, title: e.target.value }));
                              }}
                              onInvalid={handleRequiredInvalid}
                              onInput={handleRequiredInput}
                              placeholder={t('sellForm.fields.titlePlaceholder')}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="description" className={detailsLabelClassName}>
                            <span className={detailsIconClassName}>
                              <Info className="h-4 w-4" />
                            </span>
                            <span>{t('sellForm.fields.description')}</span>
                          </Label>
                          <div className="mt-2">
                            <Textarea
                              id="description"
                              className={detailsTextareaClassName}
                              value={formData.description}
                              onChange={(e) => {
                                setHasUnsaved(true);
                                setFormData((prev) => ({ ...prev, description: e.target.value }));
                              }}
                              placeholder={t('sellForm.fields.descriptionPlaceholder')}
                              rows={5}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className={sectionClassName}>
                    <div className={detailsPanelClassName} style={pricingPanelStyle}>
                      <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 md:items-end">
                        <div className={detailsCardClassName}>
                          <Label htmlFor="price" className={detailsLabelClassName}>
                            <span className={detailsIconClassName}>
                              <Tag className="h-4 w-4" />
                            </span>
                            <span className="flex items-center gap-1">
                              <span>{t('sellForm.fields.price')}</span>
                              <span className="text-(--sell-panel-accent)" aria-hidden="true">
                                *
                              </span>
                            </span>
                          </Label>
                          <div className="mt-3 flex items-center gap-2">
                            <div dir="ltr" role="group" aria-label="Currency" className={currencyToggleClassName}>
                              {currencyToggleOptions.map((option) => {
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={formData.currency === option.value}
                                      className={[
                                        currencyToggleButtonBaseClassName,
                                      formData.currency === option.value
                                        ? 'bg-[linear-gradient(180deg,#f5a245,#ea7f1d)] text-white shadow-[0_8px_14px_rgba(234,127,29,0.34)]'
                                        : 'text-[#3f372f]',
                                    ].join(' ')}
                                    onClick={() => {
                                      setHasUnsaved(true);
                                      setFormData((prev) => ({ ...prev, currency: option.value }));
                                    }}
                                  >
                                    <span
                                      className={
                                        option.value === 'USD'
                                          ? 'text-[24px] leading-none'
                                          : 'text-[19px] leading-none'
                                      }
                                    >
                                      {option.value === 'USD' ? '$' : option.value}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              dir="ltr"
                              className={`${priceFreeChipClassName} border-[#ead7c2] bg-[#faf4ed] text-slate-600 hover:bg-[#f4ebe1]`}
                              aria-pressed={isFree}
                              aria-label={t('sellForm.fields.freeAria')}
                              onClick={() => {
                                const nextIsFree = !isFree;
                                setIsFree(nextIsFree);
                                setHasUnsaved(true);
                                setFormData((prev) => ({ ...prev, price: nextIsFree ? '0' : prev.price }));
                              }}
                            >
                              <span className="text-sm font-semibold">{t('sellForm.fields.free')}</span>
                              <span
                                aria-hidden="true"
                                className={`inline-flex h-6 w-10 items-center rounded-full transition ${
                                  isFree ? 'bg-[#55c47a]' : 'bg-[#e8dfd7]'
                                }`}
                              >
                                <span
                                  className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                                    isFree ? 'translate-x-4' : 'translate-x-0.5'
                                  }`}
                                />
                              </span>
                            </button>
                          </div>

                          <div className={priceInputShellClassName}>
                            <div className={priceCurrencyCanvasClassName}>
                              {highlightDollar(currencyInputLabel, 'text-black')}
                            </div>
                            <input
                              id="price"
                              type="number"
                              className="h-10 min-w-0 flex-1 bg-transparent text-xl font-semibold text-(--sell-panel-ink) outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                              value={isFree ? '0' : formData.price}
                              onChange={(e) => {
                                setHasUnsaved(true);
                                setFormData((prev) => ({ ...prev, price: e.target.value }));
                              }}
                              onInvalid={handleRequiredInvalid}
                              onInput={handleRequiredInput}
                              placeholder="0"
                              min="0"
                              step="0.01"
                              required
                              disabled={isFree}
                            />
                          </div>
                        </div>

                        <div className={`${detailsCardClassName} motion-safe:[animation-delay:120ms]`}>
                          <Label htmlFor="condition" className={detailsLabelClassName}>
                            <span className={detailsIconClassName}>
                              <Info className="h-4 w-4" />
                            </span>
                            <span className="flex items-center gap-1">
                              <span>{t('sellForm.fields.condition')}</span>
                              <span className="text-(--sell-panel-accent)" aria-hidden="true">
                                *
                              </span>
                            </span>
                          </Label>
                          <div className="mt-3">
                            <Popover
                              open={conditionOpen}
                              onOpenChange={(next) => {
                                setConditionOpen(next);
                                if (next) {
                                  setCategoryOpen(false);
                                  setLocationOpen(false);
                                  setColorOpen(false);
                                }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <button type="button" className={detailsSelectTriggerClassName}>
                                  <span
                                    className={[
                                      'flex-1 truncate text-sm',
                                      formData.condition.trim().length > 0 ? 'text-[#1F1C1C]' : 'text-slate-700',
                                    ].join(' ')}
                                  >
                                    {conditionTriggerLabel}
                                  </span>
                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align={contentAlign}
                                dir={direction}
                                sideOffset={8}
                                className={dropdownPopoverContentClassName}
                              >
                                <div className={menuShellDropdownClassName}>
                                  <div className={menuListClassName}>
                                    {conditionOptions.map((option) => (
                                      <button
                                        key={option.value}
                                        type="button"
                                        className={menuRowClassName}
                                        data-state={formData.condition === option.value ? 'checked' : 'unchecked'}
                                        onClick={() => {
                                          setHasUnsaved(true);
                                          setFormData((prev) => ({ ...prev, condition: option.value }));
                                          setConditionOpen(false);
                                        }}
                                      >
                                        <span className="flex-1">{getConditionLabel(option.value)}</span>
                                        <span className={menuRowIndicatorClassName}>
                                          <span className={menuRowIndicatorDotClassName} />
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>


                  <section className={sectionClassName}>
                    <div className={detailsPanelClassName} style={detailsPanelStyle}>
                      <div className="relative grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className={detailsCardClassName}>
                          <Label htmlFor="category" className={detailsLabelClassName}>
                            <span className={detailsIconClassName}>
                              <FileText className="h-4 w-4" />
                            </span>
                            <span className="flex items-center gap-1">
                              <span>{t('sellForm.fields.category')}</span>
                              <span className="text-(--sell-panel-accent)" aria-hidden="true">
                                *
                              </span>
                            </span>
                          </Label>
                          <div className="mt-3">
                            <Popover
                              open={categoryOpen}
                              onOpenChange={(next) => {
                                setCategoryOpen(next);
                                if (next) {
                                  setConditionOpen(false);
                                  setLocationOpen(false);
                                  setColorOpen(false);
                                }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <button type="button" className={detailsSelectTriggerClassName}>
                                  <span
                                    className={[
                                      'flex-1 truncate text-sm',
                                      formData.categoryId.trim().length > 0 ? 'text-[#1F1C1C]' : 'text-slate-700',
                                    ].join(' ')}
                                  >
                                    {categoryTriggerLabel}
                                  </span>
                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align={contentAlign}
                                dir={direction}
                                sideOffset={8}
                                className={dropdownPopoverContentClassName}
                              >
                                <div className={menuShellDropdownClassName}>
                                  <div className={menuListClassName}>
                                    {isCategoriesLoading ? (
                                      <div className={menuEmptyStateClassName}>{t('sellForm.fields.categoryLoading')}</div>
                                    ) : categories.length === 0 ? (
                                      <div className={menuEmptyStateClassName}>{t('homepage.noCategories')}</div>
                                    ) : (
                                      categories.map((category) => (
                                        <button
                                          key={category.id}
                                          type="button"
                                          className={menuRowClassName}
                                          data-state={formData.categoryId === category.id ? 'checked' : 'unchecked'}
                                          onClick={() => {
                                            setHasUnsaved(true);
                                            setFormData((prev) => ({ ...prev, categoryId: category.id }));
                                            setCategoryOpen(false);
                                          }}
                                        >
                                          <span className="flex-1">{getCategoryLabel(category.name)}</span>
                                          <span className={menuRowIndicatorClassName}>
                                            <span className={menuRowIndicatorDotClassName} />
                                          </span>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        <div className={`${detailsCardClassName} motion-safe:[animation-delay:120ms]`}>
                          <Label htmlFor="location" className={detailsLabelClassName}>
                            <span className={detailsIconClassName}>
                              <MapPin className="h-4 w-4" />
                            </span>
                            <span className="flex items-center gap-1">
                              <span>{t('sellForm.fields.location')}</span>
                              <span className="text-(--sell-panel-accent)" aria-hidden="true">
                                *
                              </span>
                            </span>
                          </Label>
                          <div className="mt-3">
                            <Popover
                              open={locationOpen}
                              onOpenChange={(next) => {
                                setLocationOpen(next);
                                if (next) {
                                  setConditionOpen(false);
                                  setCategoryOpen(false);
                                  setColorOpen(false);
                                }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <button type="button" className={detailsSelectTriggerClassName}>
                                  <span
                                    className={[
                                      'flex-1 truncate text-sm',
                                      formData.location.trim().length > 0 ? 'text-[#1F1C1C]' : 'text-slate-700',
                                    ].join(' ')}
                                  >
                                    {locationTriggerLabel}
                                  </span>
                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align={contentAlign}
                                dir={direction}
                                sideOffset={8}
                                className={dropdownPopoverContentClassName}
                              >
                                <div className={menuShellDropdownClassName}>
                                  <div className={menuListClassName}>
                                    <button
                                      type="button"
                                      className={menuRowClassName}
                                      data-state={!formData.location ? 'checked' : 'unchecked'}
                                      onClick={() => {
                                        setHasUnsaved(true);
                                        setFormData((prev) => ({ ...prev, location: '' }));
                                        setLocationOpen(false);
                                      }}
                                    >
                                      <span className="flex-1">{t('filters.cityAll')}</span>
                                      <span className={menuRowIndicatorClassName}>
                                        <span className={menuRowIndicatorDotClassName} />
                                      </span>
                                    </button>
                                    {cityOptions.map((city) => (
                                      <button
                                        key={city.value}
                                        type="button"
                                        className={menuRowClassName}
                                        data-state={formData.location === city.label ? 'checked' : 'unchecked'}
                                        onClick={() => {
                                          setHasUnsaved(true);
                                          setFormData((prev) => ({ ...prev, location: city.label }));
                                          setLocationOpen(false);
                                        }}
                                      >
                                        <span className="flex-1">{getCityLabel(city.value)}</span>
                                        <span className={menuRowIndicatorClassName}>
                                          <span className={menuRowIndicatorDotClassName} />
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        <div className={`${detailsCardClassName} motion-safe:[animation-delay:220ms]`}>
                          <Label htmlFor="color" className={detailsLabelClassName}>
                            <span className={detailsIconClassName}>
                              <span className="grid h-4 w-4 grid-cols-2 gap-0.5" aria-hidden="true">
                                <span className="rounded-full bg-rose-400" />
                                <span className="rounded-full bg-amber-400" />
                                <span className="rounded-full bg-emerald-400" />
                                <span className="rounded-full bg-sky-400" />
                              </span>
                            </span>
                            <span>{t('sellForm.fields.color')}</span>
                          </Label>
                          <div className="mt-3">
                            <Popover
                              open={colorOpen}
                              onOpenChange={(next) => {
                                setColorOpen(next);
                                if (next) {
                                  setConditionOpen(false);
                                  setCategoryOpen(false);
                                  setLocationOpen(false);
                                }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <button type="button" className={detailsSelectTriggerClassName}>
                                  <span
                                    className={[
                                      'flex-1 truncate text-sm',
                                      formData.color.trim().length > 0 ? 'text-[#1F1C1C]' : 'text-slate-700',
                                    ].join(' ')}
                                  >
                                    {colorTriggerLabel}
                                  </span>
                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align={contentAlign}
                                dir={direction}
                                sideOffset={8}
                                className={dropdownPopoverContentClassName}
                              >
                                <div className={menuShellDropdownClassName}>
                                  <div className="relative">
                                    {canScrollUp ? (
                                      <div className={menuCueTopClassName}>
                                        <div className={menuCueBarTopClassName} />
                                        <div className={menuCueIconTopClassName}>
                                          <ChevronUp className={menuCueChevronClassName} />
                                        </div>
                                      </div>
                                    ) : null}
                                    <div ref={colorScrollRef} className={menuScrollAreaClassName}>
                                      <div className={menuListInnerClassName}>
                                        <button
                                          type="button"
                                          className={menuRowClassName}
                                          data-state={!formData.color ? 'checked' : 'unchecked'}
                                          onClick={() => {
                                            setHasUnsaved(true);
                                            setFormData((prev) => ({ ...prev, color: '' }));
                                            setColorOpen(false);
                                          }}
                                          aria-pressed={!formData.color}
                                        >
                                          <span className="flex items-center gap-3">
                                            <span className={menuRowSwatchClassName} style={allColorsTileStyle} />
                                            <span>{t('filters.allColors')}</span>
                                          </span>
                                          <span className={menuRowIndicatorClassName}>
                                            <span className={menuRowIndicatorDotClassName} />
                                          </span>
                                        </button>

                                        {SELL_COLOR_TOKENS.map((token) => (
                                          <button
                                            key={token}
                                            type="button"
                                            className={menuRowClassName}
                                            data-state={formData.color === token ? 'checked' : 'unchecked'}
                                            onClick={() => {
                                              setHasUnsaved(true);
                                              setFormData((prev) => ({ ...prev, color: token }));
                                              setColorOpen(false);
                                            }}
                                            aria-pressed={formData.color === token}
                                          >
                                            <span className="flex items-center gap-3">
                                              <span
                                                className={menuRowSwatchClassName}
                                                style={{ backgroundColor: COLOR_CHIP_STYLE_MAP[token].bg }}
                                              />
                                              <span>{getColorLabel(token)}</span>
                                            </span>
                                            <span className={menuRowIndicatorClassName}>
                                              <span className={menuRowIndicatorDotClassName} />
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {canScrollDown ? (
                                      <div className={menuCueBottomClassName}>
                                        <div className={menuCueBarBottomClassName} />
                                        <div className={menuCueIconBottomClassName}>
                                          <ChevronDown className={menuCueChevronClassName} />
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

            <Button
              type="submit"
              className={[
                'hidden md:flex w-full h-12 rounded-2xl text-base font-semibold text-white',
                'bg-[linear-gradient(120deg,#f59e0b,#f97316,#fb7185)]',
                'shadow-[0_18px_40px_rgba(249,115,22,0.35)]',
                'transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(249,115,22,0.45)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400',
                'disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0',
              ].join(' ')}
              disabled={loading || storageBusy}
            >
              {loading ? t('sellForm.submit.creating') : t('sellForm.submit.create')}
            </Button>
          </form>
        </CardContent>
      </div>
    </Card>

          <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start lg:h-fit lg:transition-all lg:duration-300 lg:ease-in-out lg:will-change-scroll lg:scroll-pt-6">
            <div className="space-y-4 lg:will-change-transform lg:transform-gpu">
              <Card className={glassAsideCardClassName}>
                <CardHeader className="p-6 pb-0">
                  <CardTitle className="text-lg">{t('sellForm.preview.title')}</CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-4">
                  <div className="pointer-events-none select-none">
                    <ProductCard product={previewProduct} viewerId={null} interactive={false} />
                  </div>
                </CardContent>
              </Card>

              <Card className={glassAsideCardClassName}>
                <CardHeader className="p-6 pb-0">
                  <CardTitle className="text-lg">{t('sellForm.preview.checklistTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-4">
                  <div className="space-y-2">
                    {checklistItems.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-sm">
                        {item.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={item.completed ? 'text-foreground' : 'text-muted-foreground'}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </aside>
        </div>
      </div>

      <div className="md:hidden fixed inset-x-0 bottom-(--mobile-nav-offset) z-30 border-t border-white/60 bg-white/70 backdrop-blur-2xl">
        <div className="mx-auto max-w-6xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center text-xs text-muted-foreground">
                <span>{completionLabel}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70 ring-1 ring-white/60">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${completionPercent}%`, backgroundColor: completionColor }}
                />
              </div>
            </div>
            <Button
              type="submit"
              form="create-listing-form"
              className={[
                'h-11 rounded-2xl px-6 font-semibold text-white',
                allChecklistCompleted
                  ? 'bg-[linear-gradient(120deg,#f59e0b,#f97316,#fb7185)] shadow-[0_14px_30px_rgba(249,115,22,0.35)] hover:shadow-[0_18px_36px_rgba(249,115,22,0.45)] focus-visible:ring-orange-400'
                  : 'bg-[linear-gradient(120deg,#64748b,#475569,#334155)] shadow-[0_14px_30px_rgba(51,65,85,0.32)] hover:shadow-[0_18px_36px_rgba(51,65,85,0.40)] focus-visible:ring-slate-400',
                'transition-transform duration-200 hover:-translate-y-0.5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                'disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0',
              ].join(' ')}
              disabled={loading || storageBusy}
            >
              {loading ? t('sellForm.submit.creating') : t('sellForm.submit.create')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
