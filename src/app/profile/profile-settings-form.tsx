'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import NextImage from 'next/image';
import { getPublicEnv } from '@/lib/env-public';

import { updateProfileAction } from './actions';
import {
  UPDATE_PROFILE_INITIAL_STATE,
  type UpdateProfileFormState,
  type UpdateProfileFormValues,
} from './form-state';

type ProfileSettingsFormProps = {
  initialValues: UpdateProfileFormValues;
};

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  name: string;
};

export default function ProfileSettingsForm({ initialValues }: ProfileSettingsFormProps) {
  const [state, formAction] = useActionState<UpdateProfileFormState, FormData>(
    updateProfileAction,
    UPDATE_PROFILE_INITIAL_STATE,
  );
  const { toast } = useToast();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET } = useMemo(() => getPublicEnv(), []);

  const [notifyMessages, setNotifyMessages] = useState(initialValues.notifyMessages);
  const [notifyOffers, setNotifyOffers] = useState(initialValues.notifyOffers);
  const [notifyUpdates, setNotifyUpdates] = useState(initialValues.notifyUpdates);
  const [marketingEmails, setMarketingEmails] = useState(initialValues.marketingEmails);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialValues.avatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarValue, setAvatarValue] = useState<string>(initialValues.avatarUrl ?? '');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success' && state.message) {
      toast({
        title: 'Profile updated',
        description: state.message,
      });
    }

    if (state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length === 0) {
      toast({
        title: 'Profile update failed',
        description: state.message,
        variant: 'destructive',
      });
    }
  }, [state, toast]);

  useEffect(() => {
    setNotifyMessages(initialValues.notifyMessages);
    setNotifyOffers(initialValues.notifyOffers);
    setNotifyUpdates(initialValues.notifyUpdates);
    setMarketingEmails(initialValues.marketingEmails);
  }, [initialValues]);

  // If navigated with #profile-details anchor, scroll into view on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#profile-details') {
      setTimeout(() => {
        document.getElementById('profile-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, []);

  const hasGlobalError =
    state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length > 0;

  return (
    <form action={formAction} className="space-y-10" id="profile-settings-form">
      <section className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-foreground">Avatar</h3>
          <p className="text-sm text-muted-foreground">A clear photo helps buyers recognize you.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 overflow-hidden rounded-full bg-muted">
            {avatarPreview ? (
              <NextImage src={avatarPreview} alt="Avatar" fill className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No avatar</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" disabled={avatarUploading} onClick={() => avatarInputRef.current?.click()}>
              {avatarUploading ? 'Uploading...' : 'Upload avatar'}
            </Button>
            <input id="avatar-file-input" ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // Open cropper with a local preview URL
              const url = URL.createObjectURL(file);
              setCropImageUrl(url);
              setZoom(1);
              setOffset({ x: 0, y: 0 });
              setCropOpen(true);
              // reset input value safely via ref
              if (avatarInputRef.current) {
                avatarInputRef.current.value = '';
              }
            }} />
          </div>
        </div>
        <input type="hidden" name="avatarUrl" id="avatarUrlHidden" value={avatarValue} readOnly />
      </section>
      <section id="profile-details" className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Profile details</h3>
          <p className="text-sm text-muted-foreground">
            Update what buyers see on your storefront and how they can reach you.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={initialValues.fullName}
              placeholder="Jane Doe"
              required
            />
            <FieldErrors errors={state.fieldErrors?.fullName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={initialValues.phone ?? ''}
              placeholder="+964 750 000 0000"
            />
            <FieldErrors errors={state.fieldErrors?.phone} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            defaultValue={initialValues.location ?? ''}
            placeholder="Erbil, Kurdistan"
          />
          <FieldErrors errors={state.fieldErrors?.location} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            name="bio"
            defaultValue={initialValues.bio ?? ''}
            placeholder="Tell buyers a little about yourself."
            rows={4}
          />
          <FieldErrors errors={state.fieldErrors?.bio} />
        </div>
      </section>

      {/* Hidden notification preferences to preserve current values without showing toggles */}
      <input type="hidden" name="notifyMessages" value={initialValues.notifyMessages ? 'true' : 'false'} />
      <input type="hidden" name="notifyOffers" value={initialValues.notifyOffers ? 'true' : 'false'} />
      <input type="hidden" name="notifyUpdates" value={initialValues.notifyUpdates ? 'true' : 'false'} />
      <input type="hidden" name="marketingEmails" value={initialValues.marketingEmails ? 'true' : 'false'} />

      <Separator />
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
          <p className="text-sm text-muted-foreground">Permanently delete your account and data.</p>
        </div>
        <Button type="button" variant="destructive" onClick={async () => {
          if (!confirm('This will permanently delete your account. Continue?')) return;
          try {
            const res = await fetch('/api/account/delete', { method: 'POST', headers: { 'x-reconfirm': 'delete' } });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body?.error || 'Failed to delete account');
            }
            window.location.href = '/';
          } catch (err) {
            console.error('Delete account failed', err);
            toast({ title: 'Delete failed', description: 'Please try again shortly.', variant: 'destructive' });
          }
        }}>Delete my account</Button>
      </section>

      {/* Cropper Dialog */}
      {cropOpen && cropImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h4 className="mb-2 text-sm font-semibold">Crop your avatar</h4>
            <div
              className="relative mx-auto my-2 h-72 w-72 overflow-hidden rounded-full bg-muted"
              onPointerMove={(e) => {
                if (!draggingRef.current) return;
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;
                setOffset({ x: dragStartOffsetRef.current.x + dx, y: dragStartOffsetRef.current.y + dy });
              }}
              onPointerUp={() => { draggingRef.current = false; }}
              onPointerLeave={() => { draggingRef.current = false; }}
              onPointerCancel={() => { draggingRef.current = false; }}
            >
              <NextImage
                src={cropImageUrl}
                alt="Crop"
                fill
                unoptimized
                draggable={false}
                className="select-none"
                sizes="288px"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
                  maxWidth: 'none',
                  cursor: draggingRef.current ? ('grabbing' as const) : 'grab',
                }}
                onLoadingComplete={(img) => {
                  setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                onPointerDown={(ev) => {
                  draggingRef.current = true;
                  dragStartRef.current = { x: ev.clientX, y: ev.clientY };
                  dragStartOffsetRef.current = { ...offset };
                }}
              />
              {/* Circle mask (visual) */}
              <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/60" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Label className="text-xs">Zoom</Label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setCropOpen(false); URL.revokeObjectURL(cropImageUrl); setCropImageUrl(null); }}>Cancel</Button>
              <Button
                type="button"
                onClick={async () => {
                  if (!cropImageUrl || imgSize.w === 0 || imgSize.h === 0) return;
                  try {
                    setAvatarUploading(true);
                    // Create a 512x512 cropped image from the current transform state
                    const size = 512;
                    const canvas = document.createElement('canvas');
                    canvas.width = size; canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Canvas unsupported');

                    // mapping from container space (w=288px) to source
                    const container = 288; // h-72 w-72
                    const baseScale = Math.max(container / imgSize.w, container / imgSize.h);
                    const totalScale = baseScale * zoom;
                    const imgLeft = container / 2 - (imgSize.w * totalScale) / 2 + offset.x;
                    const imgTop = container / 2 - (imgSize.h * totalScale) / 2 + offset.y;

                    const srcX = Math.max(0, (0 - imgLeft) / totalScale);
                    const srcY = Math.max(0, (0 - imgTop) / totalScale);
                    const srcW = Math.min(imgSize.w - srcX, container / totalScale);
                    const srcH = Math.min(imgSize.h - srcY, container / totalScale);

                    // Fill background transparent
                    ctx.clearRect(0, 0, size, size);
                    ctx.save();
                    // Clip to circle so edges match preview
                    ctx.beginPath();
                    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(await loadImage(cropImageUrl), srcX, srcY, srcW, srcH, 0, 0, size, size);
                    ctx.restore();

                    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png', 0.92));

                    // Upload cropped blob via signed upload
                    const res = await fetch('/api/uploads/sign', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ extension: 'png', contentType: 'image/png', kind: 'avatar' }),
                    });
                    const payload = await res.json();
                    if (!res.ok || !payload?.path || !payload?.token) throw new Error(payload?.error || 'Upload prep failed');

                    const { createClient } = await import('@/utils/supabase/client');
                    const supabase = createClient();
                    const bucket = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'product-images';
                    const upload = await supabase.storage.from(bucket).uploadToSignedUrl(payload.path, payload.token, blob, { contentType: 'image/png', cacheControl: '3600', upsert: false });
                    if (upload.error) throw upload.error;

                    const publicUrl = `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${payload.path}`;
                    setAvatarPreview(publicUrl);
                    setAvatarValue(publicUrl);

                    // Persist immediately so server card updates, then refresh page
                    const saveRes = await fetch('/api/profile/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: publicUrl }) });
                    if (!saveRes.ok) throw new Error('Failed to save avatar');

                    setCropOpen(false);
                    URL.revokeObjectURL(cropImageUrl);
                    setCropImageUrl(null);
                    toast({ title: 'Avatar updated' });
                    router.refresh();
                  } catch (err) {
                    console.error('Cropping/upload failed', err);
                    toast({ title: 'Avatar update failed', description: 'Please try again.', variant: 'destructive' });
                  } finally {
                    setAvatarUploading(false);
                  }
                }}
              >
                Crop & Upload
              </Button>
            </div>
          </div>
        </div>
      )}

      {state.status === 'success' && state.message ? (
        <p className="text-sm text-green-600">{state.message}</p>
      ) : null}

      {hasGlobalError ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function ToggleRow({ label, description, checked, onCheckedChange, name }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      <input type="hidden" name={name} value={checked ? 'true' : 'false'} />
    </div>
  );
}

function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-1 text-sm text-destructive">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Save changes'}
    </Button>
  );
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
