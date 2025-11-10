'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getPublicEnv } from '@/lib/env-public';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
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
};

interface SellFormProps {
  user: User | null;
}

export default function SellForm({ user }: SellFormProps) {
  const [loading, setLoading] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    condition: '',
    categoryId: '',
    location: '',
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
          title: 'Unable to load categories',
          description: 'Please try again later.',
          variant: 'destructive',
        });
        return;
      }

      setCategories(data ?? []);
    };

    loadCategories();
  }, [supabase]);

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
        title: 'Authentication required',
        description: 'Please sign in to upload images.',
        variant: 'destructive',
      });
      return;
    }

    let availableSlots = MAX_IMAGES - uploadedImages.length;

    if (availableSlots <= 0) {
      toast({
        title: 'Upload limit reached',
        description: `You can upload up to ${MAX_IMAGES} images per listing.`,
      });
      return;
    }

    const filesToHandle = incomingFiles.slice(0, availableSlots);

    if (incomingFiles.length > filesToHandle.length) {
      toast({
        title: 'Upload limit reached',
        description: `Only ${availableSlots} more image${availableSlots === 1 ? '' : 's'} can be added (maximum ${MAX_IMAGES}).`,
      });
    }

    setStorageBusy(true);

    try {
      for (const file of filesToHandle) {
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: 'File too large',
            description: `${file.name} exceeds the 10MB size limit.`,
            variant: 'destructive',
          });
          continue;
        }

        const extension = determineExtension(file);

        if (!extension) {
          toast({
            title: 'Unsupported file type',
            description: `${file.name} must be a ${ACCEPTED_FILES_DESCRIPTION} image.`,
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
            title: 'Upload failed',
            description: `Could not upload ${file.name}. Check your connection and try again.`,
            variant: 'destructive',
          });
          continue;
        }

        if (!uploadResponse.ok || !uploadPayload?.path) {
          const message = uploadPayload?.error ?? `Could not upload ${file.name}. Please try again.`;
          toast({ title: 'Upload failed', description: message, variant: 'destructive' });
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
        title: 'Upload limit reached',
        description: `You can upload up to ${MAX_IMAGES} images per listing.`,
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
        const message = payload?.error ?? 'Please try again in a moment.';
        toast({
          title: 'Unable to remove image',
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
        title: 'Unable to remove image',
        description: 'Please try again in a moment.',
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
          title: 'Authentication required',
          description: 'Please sign in to create a listing.',
          variant: 'destructive',
        });
        return;
      }

      // Require verified email before creating listings
      const confirmed = (resolvedUser as any)?.email_confirmed_at;
      if (!confirmed) {
        toast({
          title: 'Verify your email',
          description: 'Please verify your email address before creating a listing.',
          variant: 'destructive',
        });
        return;
      }

      const validation = createProductSchema.safeParse({
        title: formData.title,
        description: formData.description,
        price: formData.price,
        condition: formData.condition,
        categoryId: formData.categoryId,
        location: formData.location,
        images: formData.images.length ? formData.images : uploadedImages.map((image) => image.path),
        sellerId: resolvedUser.id,
      });

      if (!validation.success) {
        const issue = validation.error.issues[0];
        toast({
          title: 'Check your listing details',
          description: issue?.message ?? 'Please review your listing before submitting.',
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
          is_active: true,
        });

      if (error) {
        throw error;
      }

      toast({
        title: 'Listing created!',
        description: 'Your product has been listed successfully.',
      });

      setFormData({
        title: '',
        description: '',
        price: '',
        condition: '',
        categoryId: '',
        location: '',
        images: [],
      });
      setUploadedImages([]);
      setIsFree(false);

      setHasUnsaved(false);
      router.push('/');
    } catch (error) {
      console.error('Error creating listing:', error);
      toast({
        title: 'Failed to create listing',
        description: 'Please review your details and try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Create New Listing</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="title">Product Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => { setHasUnsaved(true); setFormData((prev) => ({ ...prev, title: e.target.value })); }}
                placeholder="What are you selling?"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => { setHasUnsaved(true); setFormData((prev) => ({ ...prev, description: e.target.value })); }}
                placeholder="Describe your item..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="price">Price (IQD) *</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Free</span>
                    <Switch
                      checked={isFree}
                      onCheckedChange={(checked) => {
                        setIsFree(checked);
                        setHasUnsaved(true);
                        setFormData((prev) => ({ ...prev, price: checked ? '0' : prev.price }));
                      }}
                      aria-label="Mark as free"
                    />
                  </div>
                </div>
                <Input
                  id="price"
                  type="number"
                  value={isFree ? '0' : formData.price}
                  onChange={(e) => { setHasUnsaved(true); setFormData((prev) => ({ ...prev, price: e.target.value })); }}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  required
                  disabled={isFree}
                />
              </div>

              <div>
                <Label htmlFor="condition">Condition *</Label>
                <Select
                  value={formData.condition}
                  onValueChange={(value) => { setHasUnsaved(true); setFormData((prev) => ({ ...prev, condition: value })); }}
                >
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
              <Select
                value={formData.location || 'all'}
                onValueChange={(value) => {
                  setHasUnsaved(true);
                  setFormData((prev) => ({ ...prev, location: value === 'all' ? '' : value }));
                }}
              >
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
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, categoryId: value }))}
                disabled={categories.length === 0}
              >
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
                className={`border-2 border-dashed rounded-lg p-6 text-center transition ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300'
                } ${storageBusy ? 'opacity-60' : ''}`}
                onDragEnter={handleDragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="presentation"
              >
                <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-gray-600">Drag and drop images here or</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={handleFileButtonClick}
                  disabled={storageBusy || uploadedImages.length >= MAX_IMAGES}
                >
                  {storageBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Browse files'
                  )}
                </Button>
                <p className="mt-2 text-sm text-muted-foreground">
                  Supports {ACCEPTED_FILES_DESCRIPTION} up to 50MB each. Max {MAX_IMAGES} images.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tip: Cars and Property keep original resolution (up to 10MB per image) after upload.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_MIME_TYPES.join(',')}
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {uploadedImages.length} of {MAX_IMAGES} images selected
                </p>
              </div>

              {uploadedImages.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {uploadedImages.map((image) => (
                    <div key={image.path} className="relative aspect-square overflow-hidden rounded-lg border">
                      <Image
                        src={image.url}
                        alt="Uploaded preview"
                        fill
                        className="object-cover"
                      />
                      <button
                        type="button"
                        className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                        onClick={() => handleRemoveImage(image)}
                        disabled={storageBusy}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading || storageBusy}>
              {loading ? 'Creating Listing...' : 'Create Listing'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
