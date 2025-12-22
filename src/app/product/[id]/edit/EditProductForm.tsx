"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
import { mapCategoriesForUi, type RawCategoryRow } from '@/data/category-labels';
import { CATEGORY_LABEL_MAP } from '@/data/category-ui-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, Loader2, Upload, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { CONDITION_OPTIONS } from '@/lib/products/filter-params';
import { createProductSchema } from '@/lib/validation/schemas';
import { Switch } from '@/components/ui/switch';
import { compressToWebp } from '@/lib/images/client-compress';
import { useLocale } from '@/providers/locale-provider';
import { rtlLocales } from '@/lib/locale/dictionary';

const conditionOptions = CONDITION_OPTIONS.filter((option) => option.value);
const cityOptions = MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all');

type CurrencyCode = 'IQD' | 'USD';

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (client compression reduces payload)
const ACCEPTED_FILE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const ACCEPTED_FILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const ACCEPTED_FILE_LABELS = ['JPG', 'PNG', 'WebP', 'AVIF'];
const ACCEPTED_FILES_DESCRIPTION = ACCEPTED_FILE_LABELS.join(', ');

type UploadedImage = {
  url: string;
  path: string;
  isNew?: boolean;
};

type EditProductFormProps = {
  productId: string;
  initial: {
    title: string;
    description: string;
    price: string;
    currency: CurrencyCode;
    condition: string;
    categoryId: string;
    location: string;
    imagePaths: string[];
    imageUrls: string[];
  };
};

export default function EditProductForm({ productId, initial }: EditProductFormProps) {
  const { t, messages, locale } = useLocale();
  const direction = rtlLocales.includes(locale) ? 'rtl' : 'ltr';
  const contentAlign = direction === 'rtl' ? 'end' : 'start';
  const cityLabels = messages.header.city as Record<string, string>;
  const getCityLabel = (value: string) => cityLabels[value.toLowerCase()] ?? value;

  const conditionLabels: Record<string, string> = useMemo(
    () => ({
      new: t('filters.conditionNew'),
      'used - like new': t('filters.conditionLikeNew'),
      'used - good': t('filters.conditionGood'),
      'used - fair': t('filters.conditionFair'),
    }),
    [t],
  );

  const getConditionLabel = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return conditionLabels[normalized] ?? value;
  };

  const currencyToggleOptions: Array<{ value: CurrencyCode; label: string }> = useMemo(
    () => [
      { value: 'IQD', label: t('sellForm.currency.iqd') },
      { value: 'USD', label: t('sellForm.currency.usd') },
    ],
    [t],
  );

  const maxFileSizeMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));

  const [loading, setLoading] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [formData, setFormData] = useState({
    title: initial.title,
    description: initial.description,
    price: initial.price,
    currency: initial.currency,
    condition: initial.condition,
    categoryId: initial.categoryId,
    location: initial.location,
    images: initial.imagePaths as string[],
  });
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>(
    initial.imagePaths.map((path, i) => ({ path, url: initial.imageUrls[i] ?? '', isNew: false })),
  );
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isFree, setIsFree] = useState(formData.price === '0');
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<UploadedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (!error) {
        const mapped = mapCategoriesForUi((data ?? []) as RawCategoryRow[]);
        setCategories(mapped);
      }
    };
    loadCategories();
  }, [supabase]);

  const getCategoryLabel = (label: string) => {
    const normalized = label.trim().toLowerCase();
    const config = CATEGORY_LABEL_MAP[normalized];
    if (!config) return label;
    if (locale === 'ar') return config.labelAr ?? config.label;
    if (locale === 'ku') return config.labelKu ?? config.label;
    return config.label;
  };

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

  const processFiles = async (incomingFiles: File[]) => {
    if (incomingFiles.length === 0 || storageBusy) return;

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      toast({
        title: t('sellForm.toast.authRequiredTitle'),
        description: t('sellForm.toast.authRequiredUploadDescription'),
        variant: 'destructive',
      });
      return;
    }

    const availableSlots = MAX_IMAGES - uploadedImages.length;
    const filesToHandle = incomingFiles.slice(0, availableSlots);
    if (incomingFiles.length > filesToHandle.length) {
      toast({
        title: t('sellForm.toast.uploadLimitTitle'),
        description: t('sellForm.toast.uploadLimitRemainingPlural')
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
        const res = await fetch('/api/uploads', { method: 'POST', body: fd });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.path) {
          toast({
            title: t('sellForm.toast.uploadFailedTitle'),
            description: t('sellForm.toast.uploadFailedGenericDescription').replace('{filename}', file.name),
            variant: 'destructive',
          });
          continue;
        }
        const path: string = payload.path;
        const previewUrl: string =
          typeof payload.publicUrl === 'string' && payload.publicUrl
            ? payload.publicUrl
            : typeof payload.signedUrl === 'string' && payload.signedUrl
              ? payload.signedUrl
              : URL.createObjectURL(file);
        setUploadedImages((prev) => [...prev, { path, url: previewUrl, isNew: true }]);
        setFormData((prev) => ({ ...prev, images: [...prev.images, path] }));
      }
    } finally {
      setStorageBusy(false);
    }
  };

  const deleteImagePath = async (path: string) => {
    try {
      const res = await fetch(`/api/uploads?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('delete failed');
      }
    } catch (error) {
      console.warn('Failed to delete image path', path, error);
      toast({
        title: t('sellForm.toast.removeFailedTitle'),
        description: t('sellForm.toast.removeFailedDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleRemoveImage = async (image: UploadedImage) => {
    // Optimistically remove from UI and payload
    setUploadedImages((prev) => prev.filter((i) => i.path !== image.path));
    setFormData((prev) => ({ ...prev, images: prev.images.filter((p) => p !== image.path) }));
    setHasUnsaved(true);

    if (image.isNew) {
      await deleteImagePath(image.path);
      return;
    }

    // Existing images should only be deleted after save succeeds.
    setPendingRemoval((prev) => [...prev, image]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        toast({
          title: t('sellForm.toast.authRequiredTitle'),
          description: t('sellForm.toast.authRequiredCreateDescription'),
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
        images: formData.images,
        sellerId: data.user.id,
      });
      if (!validation.success) {
        const issue = validation.error.issues[0];
        toast({
          title: t('sellForm.toast.validationTitle'),
          description: issue?.message ?? t('sellForm.toast.validationDescription'),
          variant: 'destructive',
        });
        return;
      }

      const payload = validation.data;

      const { error } = await supabase
        .from('products')
        .update({
          title: payload.title,
          description: payload.description,
          price: payload.price,
          currency: payload.currency ?? 'IQD',
          condition: payload.condition,
          location: payload.location,
          category_id: payload.categoryId,
          images: payload.images,
        })
        .eq('id', productId);
      if (error) throw error;

      try {
        const syncResponse = await fetch('/api/search/algolia-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
        });
        if (!syncResponse.ok) {
          console.warn('Algolia sync failed after update', await syncResponse.text().catch(() => ''));
        }
      } catch (syncError) {
        console.warn('Algolia sync failed after update', syncError);
      }

      const removals = pendingRemoval.map((entry) => entry.path).filter(Boolean);
      if (removals.length > 0) {
        await Promise.allSettled(removals.map((path) => deleteImagePath(path)));
        setPendingRemoval([]);
      }

      toast({
        title: t('profile.settingsPanel.preferencesUpdatedTitle'),
        description: t('profile.settingsPanel.preferencesUpdatedDescription'),
      });
      setHasUnsaved(false);
      router.push(`/product/${productId}`);
    } catch (err) {
      console.error('Failed to update product', err);
      toast({
        title: t('profile.settingsPanel.preferencesErrorTitle'),
        description: t('product.toggleSoldFailedHint'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileButtonClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) {
      await processFiles(files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => setIsDragActive(false);

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) {
      await processFiles(files);
    }
    setIsDragActive(false);
  };

  const selectTriggerClassName = [
    'h-12 w-fit max-w-full rounded-2xl border border-[#eadbc5]/80 bg-gradient-to-b from-[#fffdf7] to-[#fff2e2] px-4 text-sm text-[#1F1C1C]',
    '[&>span]:max-w-[18rem]',
    'shadow-[0_10px_26px_rgba(120,72,0,0.12)] ring-1 ring-white/70 backdrop-blur-xl transition',
    'hover:-translate-y-px hover:border-[#E67E22]/45 hover:shadow-[0_14px_34px_rgba(120,72,0,0.16)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf2]',
  ].join(' ');

  const selectContentClassName = [
    'rounded-3xl border border-[#eadbc5]/80',
    'bg-gradient-to-br from-[#fffdf7]/95 via-[#fff6ea]/90 to-[#f4ecdf]/90',
    'shadow-[0_22px_60px_rgba(120,72,0,0.22)] backdrop-blur-2xl ring-1 ring-white/60',
    'w-fit max-w-[min(22rem,calc(100vw-2rem))]',
    '[&_[data-radix-select-viewport]]:!w-auto [&_[data-radix-select-viewport]]:!min-w-0 [&_[data-radix-select-viewport]]:p-2',
    '[&_[data-radix-select-viewport]]:flex [&_[data-radix-select-viewport]]:flex-col [&_[data-radix-select-viewport]]:gap-2',
  ].join(' ');

  const listSelectContentClassName = `${selectContentClassName} max-h-[16rem]`;

  const selectItemClassName = [
    'rounded-2xl border-2 border-[#eadbc5]/70 bg-white/75 px-5 py-3.5 ps-12 text-[17px] leading-none text-[#1F1C1C] shadow-[0_10px_22px_rgba(120,72,0,0.10)] outline-none transition',
    'hover:-translate-y-px hover:bg-white/80 hover:shadow-[0_10px_22px_rgba(120,72,0,0.12)]',
    'data-[highlighted]:bg-white/85 data-[highlighted]:text-foreground data-[highlighted]:shadow-[0_10px_22px_rgba(120,72,0,0.12)]',
    'data-[state=checked]:bg-[#fff1df] data-[state=checked]:font-semibold data-[state=checked]:border-[#E67E22]/30',
  ].join(' ');

  const textFieldClassName = [
    'h-12 rounded-xl border border-white/50 bg-white/65 px-4 text-sm backdrop-blur-xl',
    'shadow-[0_14px_38px_rgba(15,23,42,0.1)] ring-1 ring-black/10 transition',
    'placeholder:text-muted-foreground/70',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80',
  ].join(' ');

  const textareaClassName = [
    'min-h-[120px] rounded-xl border border-white/50 bg-white/65 px-4 py-3 text-sm backdrop-blur-xl',
    'shadow-[0_14px_38px_rgba(15,23,42,0.1)] ring-1 ring-black/10 transition',
    'placeholder:text-muted-foreground/70',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80',
  ].join(' ');

  return (
    <div dir={direction} className="relative">
      <Card className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl border-white/50 bg-white/60 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/60 to-primary/10" />
        <div className="relative">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-2xl font-bold tracking-tight">{t('product.editListing')}</CardTitle>
          </CardHeader>

          <CardContent className="p-6 pt-0">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
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
                        setFormData((p) => ({ ...p, title: e.target.value }));
                      }}
                      placeholder={t('sellForm.fields.titlePlaceholder')}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description" className="text-sm font-semibold">
                    {t('sellForm.fields.description')}
                  </Label>
                  <div className="mt-2">
                    <Textarea
                      id="description"
                      className={textareaClassName}
                      value={formData.description}
                      onChange={(e) => {
                        setHasUnsaved(true);
                        setFormData((p) => ({ ...p, description: e.target.value }));
                      }}
                      placeholder={t('sellForm.fields.descriptionPlaceholder')}
                      rows={5}
                    />
                  </div>
                </div>
              </div>

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
                      {currencyToggleOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={formData.currency === option.value}
                          className={[
                            'flex h-8 items-center rounded-xl px-3 py-0 text-xs font-semibold transition-colors',
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
                          {option.label.includes('$') ? (
                            <span className="inline-flex items-center gap-1 leading-none">
                              <span className="text-lg leading-none">$</span>
                              <span className="text-sm leading-none">{option.label.replace('$', '').trim()}</span>
                            </span>
                          ) : (
                            <span className="text-sm leading-none">{option.label}</span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-white/95 px-3 py-2 shadow-sm ring-1 ring-black/5">
                      <span className="text-sm font-semibold text-muted-foreground">{t('sellForm.fields.free')}</span>
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
                    <div className="pointer-events-none absolute start-4 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold !text-emerald-600">
                      {formData.currency}
                    </div>
                    <Input
                      id="price"
                      type="number"
                      className={[textFieldClassName, 'ps-14 text-base font-semibold'].join(' ')}
                      value={isFree ? '0' : formData.price}
                      onChange={(e) => {
                        setHasUnsaved(true);
                        setFormData((p) => ({ ...p, price: e.target.value }));
                      }}
                      placeholder="0"
                      min="0"
                      step="0.01"
                      required
                      disabled={isFree}
                    />
                  </div>
                </div>

              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                        setFormData((p) => ({ ...p, condition: value }));
                      }}
                    >
                      <SelectTrigger className={selectTriggerClassName}>
                        <SelectValue placeholder={t('sellForm.fields.conditionPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent align={contentAlign} dir={direction} className={listSelectContentClassName}>
                        {conditionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className={selectItemClassName}>
                            {getConditionLabel(option.value)}
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
                  <div className="mt-2">
                    <Select
                      dir={direction}
                      value={formData.location || 'all'}
                      onValueChange={(value) => {
                        setHasUnsaved(true);
                        setFormData((p) => ({ ...p, location: value === 'all' ? '' : value }));
                      }}
                    >
                      <SelectTrigger className={selectTriggerClassName}>
                        <SelectValue placeholder={t('sellForm.fields.locationPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent align={contentAlign} dir={direction} className={listSelectContentClassName}>
                        <SelectItem value="all" className={selectItemClassName}>
                          {t('filters.cityAll')}
                        </SelectItem>
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
                  <Label htmlFor="category" className="text-sm font-semibold">
                    {t('sellForm.fields.category')} <span className="text-primary" aria-hidden="true">*</span>
                  </Label>
                  <div className="mt-2">
                    <Select
                      dir={direction}
                      value={formData.categoryId}
                      onValueChange={(value) => {
                        setHasUnsaved(true);
                        setFormData((p) => ({ ...p, categoryId: value }));
                      }}
                      disabled={categories.length === 0}
                    >
                      <SelectTrigger className={selectTriggerClassName}>
                        <SelectValue
                          placeholder={
                            categories.length ? t('sellForm.fields.categoryPlaceholder') : t('sellForm.fields.categoryLoading')
                          }
                        />
                      </SelectTrigger>
                      <SelectContent align={contentAlign} dir={direction} className={selectContentClassName}>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id} className={selectItemClassName}>
                            {getCategoryLabel(category.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="text-sm font-semibold">
                      {t('sellForm.fields.images')} <span className="text-primary" aria-hidden="true">*</span>
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('sellForm.upload.selectedCount')
                        .replace('{count}', String(uploadedImages.length))
                        .replace('{max}', String(MAX_IMAGES))}
                    </p>
                  </div>
                </div>

                <div
                  className={`mt-2 rounded-3xl border-2 border-dashed p-6 transition ring-1 ring-black/5 ${
                    isDragActive ? 'border-primary bg-primary/10 shadow-md' : 'border-border/80 bg-white/70 shadow-sm'
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
                        {storageBusy ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('sellForm.upload.processing')}
                          </span>
                        ) : (
                          t('sellForm.upload.browse')
                        )}
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
                    type="file"
                    accept={ACCEPTED_FILE_MIME_TYPES.join(',')}
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {uploadedImages.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {uploadedImages.map((image, index) => (
                      <div
                        key={image.path}
                        className="group relative aspect-square overflow-hidden rounded-2xl border border-white/60 bg-white/50"
                      >
                        {image.url ? (
                          <Image
                            src={image.url}
                            alt={t('sellForm.upload.previewAlt')}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                            No image
                          </div>
                        )}
                        {index === 0 && (
                          <div className="absolute left-2 top-2 rounded-full bg-white/75 px-2 py-1 text-[10px] font-semibold text-foreground ring-1 ring-white/70 backdrop-blur">
                            {t('sellForm.preview.cover')}
                          </div>
                        )}
                        <button
                          type="button"
                          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-90 transition hover:bg-black/80 group-hover:opacity-100"
                          onClick={() => void handleRemoveImage(image)}
                          disabled={storageBusy}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full rounded-2xl bg-primary py-6 text-base font-semibold shadow-[0_18px_38px_rgba(234,88,12,0.3)] hover:bg-primary/90"
                disabled={loading || storageBusy || !hasUnsaved}
              >
                {loading ? t('profile.settingsPanel.saving') : t('profile.settingsPanel.save')}
              </Button>
            </form>
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
