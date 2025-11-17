"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
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
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { CONDITION_OPTIONS } from '@/lib/products/filter-params';
import { createProductSchema } from '@/lib/validation/schemas';
import { Switch } from '@/components/ui/switch';
import { compressToWebp } from '@/lib/images/client-compress';

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
    condition: string;
    categoryId: string;
    location: string;
    imagePaths: string[];
    imageUrls: string[];
  };
};

export default function EditProductForm({ productId, initial }: EditProductFormProps) {
  const [loading, setLoading] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [formData, setFormData] = useState({
    title: initial.title,
    description: initial.description,
    price: initial.price,
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
      toast({ title: 'Authentication required', description: 'Please sign in to upload images.', variant: 'destructive' });
      return;
    }

    let availableSlots = MAX_IMAGES - uploadedImages.length;
    const filesToHandle = incomingFiles.slice(0, availableSlots);
    if (incomingFiles.length > filesToHandle.length) {
      toast({ title: 'Upload limit reached', description: `Only ${availableSlots} images can be added (max ${MAX_IMAGES}).` });
    }

    setStorageBusy(true);
    try {
      for (const file of filesToHandle) {
        if (file.size > MAX_FILE_SIZE) {
          toast({ title: 'File too large', description: `${file.name} exceeds the 10MB limit.`, variant: 'destructive' });
          continue;
        }
        const extension = determineExtension(file);
        if (!extension) {
          toast({ title: 'Unsupported file type', description: `${file.name} must be ${ACCEPTED_FILES_DESCRIPTION}.`, variant: 'destructive' });
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
          toast({ title: 'Upload failed', description: `Could not upload ${file.name}.`, variant: 'destructive' });
          continue;
        }
        const path: string = payload.path;
        const previewUrl: string = typeof payload.signedUrl === 'string' && payload.signedUrl ? payload.signedUrl : URL.createObjectURL(file);
        setUploadedImages((prev) => [...prev, { path, url: previewUrl, isNew: true }]);
        setFormData((prev) => ({ ...prev, images: [...prev.images, path] }));
      }
    } finally {
      setStorageBusy(false);
    }
  };

  const handleRemoveImage = async (image: UploadedImage) => {
    // Optimistically remove from UI and payload
    setUploadedImages((prev) => prev.filter((i) => i.path !== image.path));
    setFormData((prev) => ({ ...prev, images: prev.images.filter((p) => p !== image.path) }));
    setHasUnsaved(true);

    // Try deleting if it belongs to the user (RLS enforces)
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([image.path]);
    } catch (e) {
      // Ignore; cleanup job can remove orphans later
      console.warn('Failed to delete image', image.path, e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        toast({ title: 'Authentication required', description: 'Sign in to update your listing.', variant: 'destructive' });
        return;
      }

      const validation = createProductSchema.safeParse({
        title: formData.title,
        description: formData.description,
        price: formData.price,
        condition: formData.condition,
        categoryId: formData.categoryId || null,
        location: formData.location,
        images: formData.images,
        sellerId: data.user.id,
      });
      if (!validation.success) {
        const issue = validation.error.issues[0];
        toast({ title: 'Check listing details', description: issue?.message ?? 'Review your inputs and try again.', variant: 'destructive' });
        return;
      }

      const payload = validation.data;

      const { error } = await supabase
        .from('products')
        .update({
          title: payload.title,
          description: payload.description,
          price: payload.price,
          condition: payload.condition,
          location: payload.location,
          category_id: payload.categoryId,
          images: payload.images,
        })
        .eq('id', productId);
      if (error) throw error;

      toast({ title: 'Listing updated', description: 'Your changes have been saved.' });
      setHasUnsaved(false);
      router.push(`/product/${productId}`);
    } catch (err) {
      console.error('Failed to update product', err);
      toast({ title: 'Update failed', description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const onFileButton = () => fileInputRef.current?.click();
  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) {
      await processFiles(files);
      e.target.value = '';
    }
  };
  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) await processFiles(files);
    setIsDragActive(false);
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Edit Listing</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="title">Product Title *</Label>
            <Input id="title" value={formData.title} onChange={(e) => { setHasUnsaved(true); setFormData((p) => ({ ...p, title: e.target.value })); }} required />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={formData.description} onChange={(e) => { setHasUnsaved(true); setFormData((p) => ({ ...p, description: e.target.value })); }} rows={4} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="price">Price (IQD) *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Free</span>
                  <Switch checked={isFree} onCheckedChange={(checked) => { setIsFree(checked); setHasUnsaved(true); setFormData((p) => ({ ...p, price: checked ? '0' : p.price })); }} />
                </div>
              </div>
              <Input id="price" type="number" value={isFree ? '0' : formData.price} onChange={(e) => { setHasUnsaved(true); setFormData((p) => ({ ...p, price: e.target.value })); }} min="0" step="0.01" disabled={isFree} required />
            </div>

            <div>
              <Label htmlFor="condition">Condition *</Label>
              <Select value={formData.condition} onValueChange={(value) => { setHasUnsaved(true); setFormData((p) => ({ ...p, condition: value })); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {conditionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="location">Location *</Label>
            <Select value={formData.location || 'all'} onValueChange={(value) => { setHasUnsaved(true); setFormData((p) => ({ ...p, location: value === 'all' ? '' : value })); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select your city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cityOptions.map((city) => (
                  <SelectItem key={city.value} value={city.label}>
                    {city.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <Select value={formData.categoryId} onValueChange={(value) => { setHasUnsaved(true); setFormData((p) => ({ ...p, categoryId: value })); }} disabled={categories.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={categories.length ? 'Select category' : 'Loading categories...'} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Images *</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300'} ${storageBusy ? 'opacity-60' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setIsDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={onDrop}
              role="presentation"
            >
              <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p className="text-gray-600">Drag and drop images here or</p>
              <Button type="button" variant="outline" className="mt-2" onClick={onFileButton} disabled={storageBusy || uploadedImages.length >= MAX_IMAGES}>
                {storageBusy ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>) : 'Browse files'}
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">Supports {ACCEPTED_FILES_DESCRIPTION} up to 50MB each. Max {MAX_IMAGES} images.</p>
              <p className="mt-1 text-xs text-muted-foreground">Tip: Cars and Property keep original resolution (up to 10MB per image) after upload.</p>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_MIME_TYPES.join(',')} multiple className="hidden" onChange={onFileChange} />
              <p className="mt-2 text-xs text-muted-foreground">{uploadedImages.length} of {MAX_IMAGES} images</p>
            </div>

            {uploadedImages.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {uploadedImages.map((image) => (
                  <div key={image.path} className="relative aspect-square overflow-hidden rounded-lg border">
                    {image.url ? (
                      <Image src={image.url} alt="Uploaded preview" fill className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">No image</div>
                    )}
                    <button type="button" className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80" onClick={() => handleRemoveImage(image)} disabled={storageBusy}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading || storageBusy}>{loading ? 'Saving...' : 'Save Changes'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
