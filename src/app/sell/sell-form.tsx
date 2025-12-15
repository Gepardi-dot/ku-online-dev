'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getPublicEnv } from '@/lib/env-public';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
import { mapCategoriesForUi, type RawCategoryRow } from '@/data/category-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle, FileText, Info, Loader2, MapPin, Sparkles, Tag, Upload, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { CONDITION_OPTIONS } from '@/lib/products/filter-params';
import { createProductSchema } from '@/lib/validation/schemas';
import { Switch } from '@/components/ui/switch';
import { compressToWebp } from '@/lib/images/client-compress';
import { useLocale } from '@/providers/locale-provider';
import { rtlLocales } from '@/lib/locale/dictionary';
import { CATEGORY_LABEL_MAP } from '@/data/category-ui-config';

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

const CURRENCY_TOGGLE_OPTIONS: Array<{ value: CurrencyCode; label: string }> = [
  { value: 'IQD', label: 'IQD' },
  { value: 'USD', label: '$ USD' },
];

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
}

export default function SellForm({ user }: SellFormProps) {
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
  const [currentUser, setCurrentUser] = useState<User | null>(user);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const { t, messages, locale } = useLocale();
  const direction = rtlLocales.includes(locale) ? 'rtl' : 'ltr';
  const contentAlign = direction === 'rtl' ? 'end' : 'start';
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

  const selectTriggerClassName = [
    'h-12 w-fit max-w-full rounded-xl border border-white/50 bg-white/65 px-4 text-sm backdrop-blur-xl',
    '[&>span]:max-w-[18rem]',
    'shadow-[0_12px_32px_rgba(15,23,42,0.08)] ring-1 ring-white/30 transition',
    'hover:bg-white/75 hover:shadow-[0_16px_40px_rgba(15,23,42,0.1)]',
    'focus:ring-2 focus:ring-primary/35 focus:ring-offset-2 focus:ring-offset-white/80',
  ].join(' ');

  const selectContentClassName = [
    'rounded-2xl border border-white/45 bg-white/35',
    'shadow-[0_30px_95px_rgba(15,23,42,0.2)] backdrop-blur-3xl backdrop-saturate-150 backdrop-brightness-110',
    'ring-1 ring-white/20',
    'w-fit max-w-[min(22rem,calc(100vw-2rem))]',
    '[&_[data-radix-select-viewport]]:!w-auto [&_[data-radix-select-viewport]]:!min-w-0',
  ].join(' ');

  const compactSelectContentClassName = `${selectContentClassName} max-h-[15rem]`;
  const colorSelectContentClassName = `${compactSelectContentClassName} w-48 px-0 py-0 [&_[data-radix-select-viewport]]:!min-w-0 [&_[data-radix-select-viewport]]:!w-48 [&_[data-radix-select-viewport]]:!p-0`;

  const selectItemClassName = [
    'relative isolate mb-1 last:mb-0 truncate overflow-hidden rounded-lg border border-white/35 bg-slate-50/25 py-2 ps-10 pe-3 text-sm text-foreground',
    'backdrop-blur-3xl backdrop-saturate-150 backdrop-brightness-110',
    'shadow-[0_14px_30px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(255,255,255,0.12)]',
    'before:pointer-events-none before:absolute before:inset-0 before:z-0 before:opacity-55',
    'before:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.18)_1px,transparent_0)] before:[background-size:6px_6px]',
    'after:pointer-events-none after:absolute after:inset-0 after:z-0 after:opacity-60',
    'after:bg-gradient-to-b after:from-white/22 after:via-transparent after:to-transparent',
    'motion-safe:transition-[transform,background-color,border-color,box-shadow] motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none',
    'hover:bg-white/22 hover:border-white/45 focus:bg-white/22 focus:text-foreground',
    'active:scale-[0.99] data-[highlighted]:scale-[0.99] data-[highlighted]:-translate-y-[1px]',
    'data-[highlighted]:bg-primary/10 data-[highlighted]:border-primary/25 data-[highlighted]:shadow-[0_14px_26px_rgba(249,115,22,0.12)]',
    'data-[state=checked]:bg-primary/10 data-[state=checked]:border-primary/30 data-[state=checked]:shadow-[0_14px_26px_rgba(249,115,22,0.14)]',
  ].join(' ');

  const colorSelectItemBaseClassName = [
    'flex h-12 w-full items-center justify-center rounded-none px-3 text-center text-sm font-semibold uppercase tracking-wide',
    '!ps-0 !pe-0',
    'border border-transparent [&_[data-indicator]]:hidden select-none outline-none',
    'bg-[var(--chip-bg)] text-[var(--chip-fg)]',
    'hover:bg-[var(--chip-bg)] hover:text-[var(--chip-fg)]',
    'focus:bg-[var(--chip-bg)] focus:text-[var(--chip-fg)]',
    'data-[highlighted]:bg-[var(--chip-bg)] data-[highlighted]:text-[var(--chip-fg)]',
    'motion-safe:transition-[transform,border-color] motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none',
    'active:scale-[0.98] data-[highlighted]:scale-[0.99] data-[highlighted]:border-white/60',
    'data-[state=checked]:border-white data-[state=checked]:shadow-none',
  ].join(' ');

  const getColorSelectItemStyle = (token: (typeof SELL_COLOR_TOKENS)[number]) =>
    ({
      ['--chip-bg' as string]: COLOR_CHIP_STYLE_MAP[token].bg,
      ['--chip-fg' as string]: COLOR_CHIP_STYLE_MAP[token].fg,
    }) as React.CSSProperties;

  const allColorsOptionClassName = [
    colorSelectItemBaseClassName,
  ].join(' ');

  const textFieldClassName = [
    'h-12 rounded-2xl border border-border/80 bg-white/95 px-4 text-sm shadow-sm backdrop-blur-xl',
    'ring-1 ring-black/5 transition hover:bg-white hover:shadow-md',
    'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80',
  ].join(' ');

  const textareaClassName = [
    'min-h-[140px] rounded-2xl border border-border/80 bg-white/95 px-4 py-3 text-sm shadow-sm backdrop-blur-xl',
    'ring-1 ring-black/5 transition hover:bg-white hover:shadow-md',
    'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80',
  ].join(' ');

  const sectionClassName = 'py-5 border-b border-black/10 last:border-b-0';
  const firstSectionClassName = 'pt-0 pb-5 border-b border-black/10 last:border-b-0';

  const glassAsideCardClassName = [
    'rounded-3xl border border-white/50 bg-white/60 shadow-[0_18px_50px_rgba(15,23,42,0.08)]',
    'backdrop-blur-2xl ring-1 ring-white/30',
  ].join(' ');

  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading categories', error);
        toast({
          title: t('sellForm.toast.categoriesErrorTitle'),
          description: t('sellForm.toast.categoriesErrorDescription'),
          variant: 'destructive',
        });
        return;
      }

      const mapped = mapCategoriesForUi((data ?? []) as RawCategoryRow[]);
      setCategories(mapped);
    };

    loadCategories();
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
        let uploadPayload: { path?: string; signedUrl?: string | null; error?: string } | null = null;
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

        const { path, signedUrl } = uploadPayload;
        const previewUrl = typeof signedUrl === 'string' && signedUrl.length > 0 ? signedUrl : URL.createObjectURL(file);

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
        sellerId: resolvedUser.id,
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

      const { error } = await supabase
        .from('products')
        .insert({
          title: payload.title,
          description: payload.description,
          price: payload.price,
          condition: payload.condition,
          location: payload.location,
          category_id: payload.categoryId,
          seller_id: payload.sellerId,
          images: payload.images,
          currency: payload.currency ?? 'IQD',
          color_token: payload.color ?? null,
          is_active: true,
        });

      if (error) {
        throw error;
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
      router.push('/');
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
  const completionPercent = Math.round((completedChecklistCount / checklistItems.length) * 100);
  const selectedCategory = categories.find((category) => category.id === formData.categoryId) ?? null;
  const previewTitle = formData.title.trim().length > 0 ? formData.title.trim() : t('sellForm.preview.placeholderTitle');
  const previewCategory = selectedCategory ? getCategoryLabel(selectedCategory.name) : t('sellForm.fields.category');
  const previewLocation = formData.location.trim().length > 0 ? getCityLabel(formData.location) : t('sellForm.fields.location');
  const previewCondition = formData.condition.trim().length > 0 ? getConditionLabel(formData.condition) : null;
  const previewImage = uploadedImages[0]?.url ?? null;
  const previewDetails = `${previewCategory} • ${previewLocation}`;

  const previewPrice = (() => {
    if (isFree) {
      return t('sellForm.fields.free');
    }

    const numericPrice = Number.parseFloat(formData.price);
    if (!Number.isFinite(numericPrice)) {
      return '—';
    }

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: formData.currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
        .format(numericPrice)
        .replace('IQD', 'IQD');
    } catch {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: formData.currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
        .format(numericPrice)
        .replace('IQD', 'IQD');
    }
  })();

  return (
    <div dir={direction} className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-32 left-[-6rem] h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-[-10rem] h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 pb-28 md:pb-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr),360px] lg:items-start">
          <Card className="relative overflow-hidden rounded-3xl border-white/50 bg-white/60 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/60 to-primary/10" />
            <div className="relative">
              <CardHeader className="p-6 pb-0 md:p-8 md:pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-3xl md:text-4xl font-bold tracking-tight">{t('sellForm.title')}</CardTitle>
                      <div className="inline-flex items-center gap-2 rounded-2xl bg-primary/10 px-3 py-2 text-primary ring-1 ring-primary/20 md:hidden">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-xs font-semibold">KU Online</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{t('sellForm.hero.subtitle')}</p>
                  </div>

                  <div className="hidden md:inline-flex items-center gap-2 self-start rounded-2xl bg-primary/10 px-3 py-2 text-primary ring-1 ring-primary/20">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-xs font-semibold">KU Online</span>
                  </div>
                </div>

                <div className="mt-0 md:mt-1">
                  <div className="mt-1 h-1.5 md:h-2 w-full overflow-hidden rounded-full bg-white/70 ring-1 ring-white/60">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${completionPercent}%` }} />
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
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                          <Upload className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold leading-tight">
                            {t('sellForm.fields.images')} <span className="text-primary" aria-hidden="true">*</span>
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t('sellForm.upload.selectedCount')
                              .replace('{count}', String(uploadedImages.length))
                              .replace('{max}', String(MAX_IMAGES))}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`mt-0 rounded-3xl border-2 border-dashed p-6 transition ring-1 ring-black/5 ${
                        isDragActive
                          ? 'border-primary bg-primary/10 shadow-md'
                          : 'border-border/80 bg-white/70 shadow-sm'
                      } ${
                        storageBusy || uploadedImages.length >= MAX_IMAGES
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer hover:bg-white hover:shadow-md'
                      }`}
                      onDragEnter={handleDragOver}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      role="presentation"
                      tabIndex={storageBusy || uploadedImages.length >= MAX_IMAGES ? -1 : 0}
                      aria-label={t('sellForm.upload.browse')}
                      onClick={() => {
                        if (storageBusy || uploadedImages.length >= MAX_IMAGES) return;
                        handleFileButtonClick();
                      }}
                      onKeyDown={(event) => {
                        if (storageBusy || uploadedImages.length >= MAX_IMAGES) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleFileButtonClick();
                        }
                      }}
                    >
                      <div className="relative">
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2.25rem]">
                          <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50 blur-2xl" />
                          <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
                        </div>

                        <div className="relative flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
                          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/75 ring-1 ring-white/70 shadow-[0_10px_26px_rgba(15,23,42,0.08)] backdrop-blur">
                            <Upload className="h-7 w-7 text-foreground/70" />
                            <div
                              aria-hidden="true"
                              className={[
                                'pointer-events-none absolute inset-0 rounded-full transition-opacity',
                                isDragActive ? 'bg-primary/15 opacity-100' : 'bg-transparent opacity-0',
                              ].join(' ')}
                            />
                          </div>

                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground/90">{t('sellForm.upload.dropHint')}</p>
                            <p className="text-xs text-muted-foreground">{t('sellForm.upload.tip')}</p>
                          </div>

                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center rounded-full border border-border/70 bg-white/85 px-6 text-sm font-semibold text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (storageBusy || uploadedImages.length >= MAX_IMAGES) return;
                              handleFileButtonClick();
                            }}
                            disabled={storageBusy || uploadedImages.length >= MAX_IMAGES}
                          >
                            {t('sellForm.upload.browse')}
                          </button>

                          <div className="mt-2 inline-flex max-w-[30rem] items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] text-muted-foreground ring-1 ring-black/5 backdrop-blur">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="leading-snug">
                              {t('sellForm.upload.supports')
                                .replace('{types}', ACCEPTED_FILES_DESCRIPTION)
                                .replace('{maxMb}', String(maxFileSizeMb))
                                .replace('{maxImages}', String(MAX_IMAGES))}
                            </span>
                          </div>
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
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {uploadedImages.map((image, index) => (
                          <div
                            key={image.path}
                            className="group relative aspect-square overflow-hidden rounded-2xl border border-white/60 bg-white/50"
                          >
                            <Image
                              src={image.url}
                              alt={t('sellForm.upload.previewAlt')}
                              fill
                              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                            {index === 0 && (
                              <div className="absolute left-2 top-2 rounded-full bg-white/75 px-2 py-1 text-[10px] font-semibold text-foreground ring-1 ring-white/70 backdrop-blur">
                                {t('sellForm.preview.cover')}
                              </div>
                            )}
                            <button
                              type="button"
                              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-90 transition hover:bg-black/80 group-hover:opacity-100"
                              onClick={() => handleRemoveImage(image)}
                              disabled={storageBusy}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className={sectionClassName}>
                    <div className="grid gap-4">
                      <div>
                        <Label htmlFor="title" className="text-sm font-semibold">
                          {t('sellForm.fields.title')} <span className="text-primary" aria-hidden="true">*</span>
                        </Label>
                        <div className="mt-2">
                          <Input
                            id="title"
                            className={textFieldClassName}
                            value={formData.title}
                            onChange={(e) => {
                              setHasUnsaved(true);
                              setFormData((prev) => ({ ...prev, title: e.target.value }));
                            }}
                            placeholder={t('sellForm.fields.titlePlaceholder')}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="description" className="text-sm font-semibold">{t('sellForm.fields.description')}</Label>
                        <div className="mt-2">
                          <Textarea
                            id="description"
                            className={textareaClassName}
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
                  </section>

                  <section className={sectionClassName}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-end">
                      <div>
                        <Label htmlFor="price" className="text-sm font-semibold">
                          {t('sellForm.fields.price')} <span className="text-primary" aria-hidden="true">*</span>
                        </Label>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div
                            dir="ltr"
                            role="group"
                            aria-label="Currency"
                            className="inline-flex items-center gap-1 rounded-2xl border border-border/80 bg-white/95 p-1 shadow-sm ring-1 ring-black/5"
                          >
                            {CURRENCY_TOGGLE_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={formData.currency === option.value}
                                className={[
                                  'rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2',
                                  formData.currency === option.value
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground',
                                ].join(' ')}
                                onClick={() => {
                                  setHasUnsaved(true);
                                  setFormData((prev) => ({ ...prev, currency: option.value }));
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-white/95 px-3 py-2 shadow-sm ring-1 ring-black/5">
                            <span className="text-xs font-semibold text-muted-foreground">{t('sellForm.fields.free')}</span>
                            <Switch
                              checked={isFree}
                              onCheckedChange={(checked) => {
                                setIsFree(checked);
                                setHasUnsaved(true);
                                setFormData((prev) => ({ ...prev, price: checked ? '0' : prev.price }));
                              }}
                              aria-label={t('sellForm.fields.freeAria')}
                            />
                          </div>
                        </div>

                        <div className="relative mt-2">
                          <div className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                            {formData.currency}
                          </div>
                          <Input
                            id="price"
                            type="number"
                            className={[textFieldClassName, 'ps-14 text-base font-semibold'].join(' ')}
                            value={isFree ? '0' : formData.price}
                            onChange={(e) => {
                              setHasUnsaved(true);
                              setFormData((prev) => ({ ...prev, price: e.target.value }));
                            }}
                            placeholder="0"
                            min="0"
                            step="0.01"
                            required
                            disabled={isFree}
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="condition" className="text-sm font-semibold">
                          {t('sellForm.fields.condition')} <span className="text-primary" aria-hidden="true">*</span>
                        </Label>
                        <div className="mt-2">
                          <Select
                            dir={direction}
                            value={formData.condition}
                            onValueChange={(value) => {
                              setHasUnsaved(true);
                              setFormData((prev) => ({ ...prev, condition: value }));
                            }}
                          >
                            <SelectTrigger className={selectTriggerClassName}>
                              <SelectValue placeholder={t('sellForm.fields.conditionPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent align={contentAlign} dir={direction} className={selectContentClassName}>
                              {conditionOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value} className={selectItemClassName}>
                                  {getConditionLabel(option.value)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </section>


                  <section className={sectionClassName}>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <Label htmlFor="category" className="text-sm font-semibold">
                          {t('sellForm.fields.category')} <span className="text-primary" aria-hidden="true">*</span>
                        </Label>
                        <div className="mt-3">
                          <Select
                            dir={direction}
                            value={formData.categoryId}
                            onValueChange={(value) => {
                              setHasUnsaved(true);
                              setFormData((prev) => ({ ...prev, categoryId: value }));
                            }}
                            disabled={categories.length === 0}
                          >
                            <SelectTrigger className={selectTriggerClassName}>
                              <SelectValue
                                placeholder={
                                  categories.length
                                    ? t('sellForm.fields.categoryPlaceholder')
                                    : t('sellForm.fields.categoryLoading')
                                }
                              />
                          </SelectTrigger>
                          <SelectContent align={contentAlign} dir={direction} className={compactSelectContentClassName}>
                            {categories.map((category) => (
                              <SelectItem key={category.id} value={category.id} className={selectItemClassName}>
                                {getCategoryLabel(category.name)}
                              </SelectItem>
                            ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="location" className="text-sm font-semibold">
                          {t('sellForm.fields.location')} <span className="text-primary" aria-hidden="true">*</span>
                        </Label>
                        <div className="mt-3">
                          <Select
                            dir={direction}
                            value={formData.location || 'all'}
                            onValueChange={(value) => {
                              setHasUnsaved(true);
                              setFormData((prev) => ({ ...prev, location: value === 'all' ? '' : value }));
                            }}
                          >
                            <SelectTrigger className={selectTriggerClassName}>
                              <SelectValue placeholder={t('sellForm.fields.locationPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent align={contentAlign} dir={direction} className={selectContentClassName}>
                              <SelectItem value="all" className={selectItemClassName}>{t('filters.cityAll')}</SelectItem>
                              {cityOptions.map((city) => (
                                <SelectItem key={city.value} value={city.label} className={selectItemClassName}>
                                  {getCityLabel(city.value)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="color" className="text-sm font-semibold">{t('sellForm.fields.color')}</Label>
                        <div className="mt-3">
                          <Select
                            dir={direction}
                            value={formData.color || 'none'}
                            onValueChange={(value) => {
                              setHasUnsaved(true);
                              setFormData((prev) => ({ ...prev, color: value === 'none' ? '' : value }));
                            }}
                          >
                            <SelectTrigger className={selectTriggerClassName}>
                              <SelectValue placeholder={t('sellForm.fields.colorPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent align={contentAlign} dir={direction} className={colorSelectContentClassName}>
                            <SelectItem
                              value="none"
                              className={allColorsOptionClassName}
                              style={{
                                ['--chip-bg' as string]: '#e2e8f0',
                                ['--chip-fg' as string]: '#0f172a',
                              }}
                            >
                              {t('filters.allColors')}
                            </SelectItem>
                            {SELL_COLOR_TOKENS.map((token) => (
                              <SelectItem
                                key={token}
                                value={token}
                                className={colorSelectItemBaseClassName}
                                style={getColorSelectItemStyle(token)}
                              >
                                {getColorLabel(token)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      </div>
                    </div>
                  </section>

            <Button
              type="submit"
              className="hidden md:flex w-full h-12 rounded-2xl text-base font-semibold shadow-lg shadow-primary/20"
              disabled={loading || storageBusy}
            >
              {loading ? t('sellForm.submit.creating') : t('sellForm.submit.create')}
            </Button>
          </form>
        </CardContent>
      </div>
    </Card>

          <aside className="hidden lg:block lg:sticky lg:top-24">
            <div className="space-y-4">
              <Card className={glassAsideCardClassName}>
                <CardHeader className="p-6 pb-0">
                  <CardTitle className="text-lg">{t('sellForm.preview.title')}</CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-4">
                  <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/50">
                    <div className="relative aspect-[4/3] bg-gradient-to-br from-secondary/60 via-white/40 to-primary/10">
                      {previewImage ? (
                        <Image src={previewImage} alt={t('sellForm.upload.previewAlt')} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          {t('sellForm.fields.images')}
                        </div>
                      )}
                      <div className="absolute left-3 top-3 rounded-full bg-white/75 px-2 py-1 text-[10px] font-semibold text-foreground ring-1 ring-white/70 backdrop-blur">
                        {t('sellForm.preview.cover')}
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-sm font-semibold leading-snug">{previewTitle}</p>
                      <p className="mt-2 text-lg font-bold text-primary">{previewPrice}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{previewDetails}</p>
                      {previewCondition && (
                        <div className="mt-3">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20">
                            {previewCondition}
                          </span>
                        </div>
                      )}
                    </div>
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

      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/60 bg-white/70 backdrop-blur-2xl">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{completedChecklistCount} / {checklistItems.length}</span>
                <span>{completionPercent}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70 ring-1 ring-white/60">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>
            <Button
              type="submit"
              form="create-listing-form"
              className="h-11 rounded-2xl px-6 font-semibold shadow-md shadow-primary/20"
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
