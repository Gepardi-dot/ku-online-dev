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
import { Upload, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { CONDITION_OPTIONS } from '@/lib/products/filter-params';
import { createProductSchema } from '@/lib/validation/schemas';
import { Switch } from '@/components/ui/switch';
import { compressToWebp } from '@/lib/images/client-compress';
import { highlightDollar } from '@/components/currency-text';
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
  const requiredFieldMessage = t('common.validation.required');
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
  const currencyInputLabel = (() => {
    if (formData.currency === 'IQD' && (locale === 'ar' || locale === 'ku')) {
      return 'د.ع';
    }
    if (formData.currency === 'USD' && (locale === 'ar' || locale === 'ku')) {
      return '$';
    }
    return formData.currency;
  })();
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

      const normalizedInitialTitle = initial.title.trim();
      const normalizedInitialDescription = (initial.description ?? '').trim();
      const normalizedNextTitle = payload.title.trim();
      const normalizedNextDescription = (payload.description ?? '').trim();
      const titleChanged = normalizedNextTitle !== normalizedInitialTitle;
      const descriptionChanged = normalizedNextDescription !== normalizedInitialDescription;

      const updates: Record<string, unknown> = {
        title: payload.title,
        description: payload.description,
        price: payload.price,
        currency: payload.currency ?? 'IQD',
        condition: payload.condition,
        location: payload.location,
        category_id: payload.categoryId,
        images: payload.images,
      };

      if (titleChanged) {
        updates.title_translations = {};
      }
      if (descriptionChanged) {
        updates.description_translations = {};
      }
      if (titleChanged || descriptionChanged) {
        updates.i18n_source_hash = null;
        updates.i18n_updated_at = null;
      }

      const { error } = await supabase
        .from('products')
        .update(updates)
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

      try {
        fetch('/api/products/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
          keepalive: true,
        }).catch(() => {});
      } catch {}

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
      router.refresh();
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
    'h-12 w-fit max-w-full rounded-md border border-white/40 bg-white/60 px-4 text-sm text-[#1F1C1C] backdrop-blur-md',
    '[&>span]:max-w-[18rem]',
    'shadow-[0_8px_22px_rgba(15,23,42,0.10)] ring-1 ring-white/40 transition',
    'hover:border-white/70 hover:bg-white/75',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
    'focus-visible:ring-offset-1 focus-visible:ring-offset-white/80',
  ].join(' ');

  const selectContentClassName = [
    'max-h-[18rem] w-fit max-w-[min(18rem,calc(100vw-2rem))] rounded-md border border-white/60',
    'bg-white/75 p-1.5 shadow-[0_28px_70px_rgba(15,23,42,0.28)] ring-1 ring-black/10 backdrop-blur-xl',
    '[&_[data-radix-select-viewport]]:!w-auto [&_[data-radix-select-viewport]]:!min-w-0 [&_[data-radix-select-viewport]]:p-1.5',
    '[&_[data-radix-select-viewport]]:flex [&_[data-radix-select-viewport]]:flex-col [&_[data-radix-select-viewport]]:gap-1.5',
    '[&_[data-radix-select-viewport]]:!max-h-[18rem] [&_[data-radix-select-viewport]]:!overflow-y-auto',
  ].join(' ');

  const listSelectContentClassName = selectContentClassName;

  const selectItemClassName = [
    'w-full rounded-md border border-white/70 bg-white/65 px-2 py-2 ps-8 text-[16px] leading-snug text-[#1F1C1C] backdrop-blur-md',
    'whitespace-normal break-words text-left',
    'shadow-[0_12px_26px_rgba(15,23,42,0.12)] outline-none transition',
    'hover:border-white/90 hover:bg-white/80 hover:shadow-[0_16px_34px_rgba(15,23,42,0.18)]',
    'data-[highlighted]:border-white/90 data-[highlighted]:bg-white/80 data-[highlighted]:shadow-[0_16px_34px_rgba(15,23,42,0.18)]',
    'data-[state=checked]:border-white data-[state=checked]:bg-white/90 data-[state=checked]:font-medium',
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

  const uploadDropZoneBaseClassName = [
    'relative flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-10 text-center transition',
    'bg-white/92 shadow-[0_8px_18px_rgba(124,45,18,0.08)]',
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
                      onInvalid={handleRequiredInvalid}
                      onInput={handleRequiredInput}
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
                      {currencyToggleOptions.map((option) => {
                        const labelText = option.label.replace('$', '').trim();
                        return (
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
                                <span className="text-lg leading-none text-emerald-600">$</span>
                                {labelText ? (
                                  <span className="text-sm leading-none">{labelText}</span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-sm leading-none">{option.label}</span>
                            )}
                          </button>
                        );
                      })}
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
                    <div className="pointer-events-none absolute start-4 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                      {highlightDollar(currencyInputLabel)}
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
                  className={`${uploadDropZoneBaseClassName} ${
                    isDragActive
                      ? 'border-[#f97316] bg-white/95'
                      : storageBusy || uploadedImages.length >= MAX_IMAGES
                        ? 'cursor-not-allowed opacity-60 border-[#f6dcc2]'
                        : 'cursor-pointer border-[#f6dcc2] hover:border-[#f97316] hover:bg-white/95'
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
                  <div className="text-[#f97316]">
                    <Upload className="h-7 w-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-[#3f2a1e]">{t('sellForm.upload.dropHint')}</p>
                    <p className="text-sm text-muted-foreground">{t('sellForm.upload.browse')}</p>
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
                        className="group relative aspect-square overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-[0_8px_18px_rgba(124,45,18,0.08)]"
                      >
                        {image.url ? (
                          <Image
                            src={image.url}
                            alt={t('sellForm.upload.previewAlt')}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                            No image
                          </div>
                        )}
                        {index === 0 && (
                          <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
                            {t('sellForm.preview.cover')}
                          </div>
                        )}
                        {index !== 0 && (
                          <button
                            type="button"
                            className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm opacity-0 transition group-hover:opacity-100"
                            onClick={() => handleSetCover(image.path)}
                          >
                            {t('sellForm.upload.setCover')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/80"
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
