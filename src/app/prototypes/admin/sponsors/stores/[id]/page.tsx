'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Plus, Save, UserPlus2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  PROTOTYPE_OFFERS,
  PROTOTYPE_STAFF,
  PROTOTYPE_STORES,
  type PrototypeSponsorOffer,
  type PrototypeStaffMember,
  type PrototypeSponsorStore,
} from '@/lib/prototypes/sponsors';

function statusVariant(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') return 'default';
  if (normalized === 'disabled') return 'destructive';
  return 'secondary';
}

function offerStatusVariant(status: string) {
  const s = status.trim().toLowerCase();
  if (s === 'active') return 'default';
  if (s === 'paused') return 'secondary';
  if (s === 'expired' || s === 'archived') return 'outline';
  return 'secondary';
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function PrototypeAdminSponsorStorePage() {
  const params = useParams<{ id: string }>();
  const storeId = typeof params?.id === 'string' ? params.id : '';

  const storeInitial = useMemo(() => PROTOTYPE_STORES.find((s) => s.id === storeId) ?? null, [storeId]);
  const offersInitial = useMemo(() => PROTOTYPE_OFFERS.filter((o) => o.storeId === storeId), [storeId]);
  const staffInitial = useMemo(() => PROTOTYPE_STAFF.filter((s) => s.storeId === storeId), [storeId]);

  const [store, setStore] = useState<PrototypeSponsorStore | null>(storeInitial);
  const [offers, setOffers] = useState<PrototypeSponsorOffer[]>(offersInitial);
  const [staff, setStaff] = useState<PrototypeStaffMember[]>(staffInitial);

  const [newOfferTitle, setNewOfferTitle] = useState('');
  const [newStaffUserId, setNewStaffUserId] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'cashier' | 'manager'>('cashier');

  if (!store) {
    return (
      <section className="pb-14">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-[36px] border border-white/60 bg-white/70 p-6 shadow-sm ring-1 ring-black/5">
              <h1 className="text-2xl font-bold text-[#2D2D2D]" dir="auto">
                Store not found (Prototype)
              </h1>
              <p className="mt-2 text-sm text-muted-foreground" dir="auto">
                This store id does not exist in the mock dataset.
              </p>
              <Button asChild className="mt-4 rounded-full">
                <Link href="/prototypes/admin/sponsors">Back to admin list</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-14">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">{store.name}</h1>
                <Badge variant={statusVariant(store.status) as any}>{store.status}</Badge>
                {store.isFeatured ? <Badge variant="secondary">featured</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">/{store.slug}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-full bg-white/80">
                <Link href="/prototypes/admin/sponsors">Back</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full bg-white/80">
                <Link href={`/prototypes/sponsors/stores/${store.slug}`} target="_blank" rel="noreferrer">
                  <span className="inline-flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    View public
                  </span>
                </Link>
              </Button>
              <Button asChild className="rounded-full">
                <Link href={`/admin/sponsors/stores/${store.id}`} target="_blank" rel="noreferrer">
                  Open real admin
                </Link>
              </Button>
            </div>
          </div>

          <Card className="rounded-[28px] border-white/60 bg-linear-to-br from-white/80 via-white/70 to-white/50 shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
            <CardHeader>
              <CardTitle className="text-lg">Manage (Prototype)</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="store">
                <TabsList className="w-full">
                  <TabsTrigger value="store" className="flex-1">
                    Store
                  </TabsTrigger>
                  <TabsTrigger value="offers" className="flex-1">
                    Offers ({offers.length})
                  </TabsTrigger>
                  <TabsTrigger value="staff" className="flex-1">
                    Staff ({staff.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="store" className="mt-6 space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Store name</Label>
                      <Input
                        value={store.name}
                        onChange={(e) => setStore((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                        className="h-11 rounded-2xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Slug</Label>
                      <Input
                        value={store.slug}
                        onChange={(e) => setStore((prev) => (prev ? { ...prev, slug: slugify(e.target.value) } : prev))}
                        className="h-11 rounded-2xl font-semibold"
                      />
                      <p className="text-xs text-muted-foreground">Public URL: /sponsors/stores/{store.slug}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={store.status}
                        onValueChange={(value) => setStore((prev) => (prev ? { ...prev, status: value as any } : prev))}
                      >
                        <SelectTrigger className="h-11 rounded-2xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">pending</SelectItem>
                          <SelectItem value="active">active</SelectItem>
                          <SelectItem value="disabled">disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Sponsor tier</Label>
                      <Select
                        value={store.sponsorTier}
                        onValueChange={(value) => setStore((prev) => (prev ? { ...prev, sponsorTier: value as any } : prev))}
                      >
                        <SelectTrigger className="h-11 rounded-2xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">basic</SelectItem>
                          <SelectItem value="featured">featured</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end justify-between rounded-2xl border bg-white/40 p-4">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Featured store</p>
                        <p className="text-xs text-muted-foreground">Shows in hub featured row.</p>
                      </div>
                      <Switch checked={store.isFeatured} onCheckedChange={(checked) => setStore((prev) => (prev ? { ...prev, isFeatured: checked } : prev))} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={store.phone ?? ''} onChange={(e) => setStore((prev) => (prev ? { ...prev, phone: e.target.value } : prev))} className="h-11 rounded-2xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp</Label>
                      <Input
                        value={store.whatsapp ?? ''}
                        onChange={(e) => setStore((prev) => (prev ? { ...prev, whatsapp: e.target.value } : prev))}
                        className="h-11 rounded-2xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input
                        value={store.website ?? ''}
                        onChange={(e) => setStore((prev) => (prev ? { ...prev, website: e.target.value } : prev))}
                        className="h-11 rounded-2xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={store.description ?? ''}
                      onChange={(e) => setStore((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                      className="min-h-28 rounded-2xl"
                    />
                  </div>

                  <Button
                    type="button"
                    className="h-11 rounded-2xl"
                    onClick={() => toast({ title: 'Saved (prototype)', description: 'No database changes were made.' })}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Save changes
                    </span>
                  </Button>
                </TabsContent>

                <TabsContent value="offers" className="mt-6 space-y-5">
	                    <div className="rounded-2xl border bg-white/40 p-4">
	                      <div className="flex flex-wrap items-start justify-between gap-3">
	                        <div>
	                          <p className="text-sm font-medium">Create a new offer</p>
	                          <p className="text-xs text-muted-foreground">In production, offers define the sponsored deal users see.</p>
	                        </div>
	                        <Badge variant="secondary">Prototype</Badge>
	                      </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <Label>Offer title</Label>
                        <Input value={newOfferTitle} onChange={(e) => setNewOfferTitle(e.target.value)} className="h-11 rounded-2xl" />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="h-11 rounded-2xl"
                          onClick={() => {
                            if (newOfferTitle.trim().length < 2) {
                              toast({ title: 'Title required', variant: 'destructive' });
                              return;
                            }
                            const id = `proto-${Date.now()}`;
                            const next: PrototypeSponsorOffer = {
                              id,
                              storeId: store.id,
                              title: newOfferTitle.trim(),
                              description: null,
                              terms: null,
                              discountType: 'custom',
                              discountValue: null,
                              currency: null,
                              startAt: new Date(),
                              endAt: null,
                              store: {
                                id: store.id,
                                name: store.name,
                                slug: store.slug,
                                logoUrl: store.logoUrl,
                                primaryCity: store.primaryCity,
                                phone: store.phone,
                                whatsapp: store.whatsapp,
                                website: store.website,
                              },
	                              status: 'draft',
	                              isFeatured: false,
	                              maxTotalRedemptions: null,
	                              sampleVoucherCode: 'KUDEMO0000',
	                              originalPrice: null,
	                              dealPrice: null,
	                              kpis: { views30d: 0, claims30d: 0, redemptions30d: 0, lastRedemptionAt: null },
	                            };
                            setOffers((prev) => [next, ...prev]);
                            setNewOfferTitle('');
                            toast({ title: 'Offer created (prototype)' });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Add offer
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {offers.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No offers yet.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Offer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ends</TableHead>
                          <TableHead>Featured</TableHead>
                          <TableHead className="text-right">Preview</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {offers.map((offer) => {
                          const endsIn =
                            offer.endAt && !Number.isNaN(offer.endAt.getTime())
                              ? formatDistanceToNow(offer.endAt, { addSuffix: true })
                              : '—';
                          return (
                            <TableRow key={offer.id}>
                              <TableCell className="text-sm">
                                <div className="flex flex-col">
                                  <span className="font-medium">{offer.title}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {offer.discountType}
                                    {offer.discountValue != null ? ` • ${offer.discountValue}` : ''}
                                    {offer.currency ? ` ${offer.currency}` : ''}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={offer.status}
                                  onValueChange={(value) =>
                                    setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, status: value as any } : o)))
                                  }
                                >
                                  <SelectTrigger className="h-9 w-40 rounded-full bg-white/80">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="active">active</SelectItem>
                                    <SelectItem value="paused">paused</SelectItem>
                                    <SelectItem value="draft">draft</SelectItem>
                                    <SelectItem value="expired">expired</SelectItem>
                                    <SelectItem value="archived">archived</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{endsIn}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={offer.isFeatured}
                                    onCheckedChange={(checked) =>
                                      setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, isFeatured: checked } : o)))
                                    }
                                  />
                                  <Badge variant={offerStatusVariant(offer.status) as any}>{offer.status}</Badge>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button asChild variant="outline" className="rounded-full bg-white/80">
                                  <Link href={`/prototypes/sponsors/offers/${offer.id}`} target="_blank" rel="noreferrer">
                                    <span className="inline-flex items-center gap-2">
                                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                      View
                                    </span>
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="staff" className="mt-6 space-y-5">
                  <div className="rounded-2xl border bg-white/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Assign staff accounts</p>
                        <p className="text-xs text-muted-foreground">
                          Staff can redeem vouchers in-store. Role controls access and visibility.
                        </p>
                      </div>
                      <Badge variant="secondary">Prototype</Badge>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_.6fr_auto]">
                      <div className="space-y-2">
                        <Label>User ID</Label>
                        <Input value={newStaffUserId} onChange={(e) => setNewStaffUserId(e.target.value)} placeholder="UUID" className="h-11 rounded-2xl" />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={newStaffRole} onValueChange={(value) => setNewStaffRole(value as any)}>
                          <SelectTrigger className="h-11 rounded-2xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cashier">cashier</SelectItem>
                            <SelectItem value="manager">manager</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="h-11 rounded-2xl"
                          onClick={() => {
                            if (!newStaffUserId.trim()) {
                              toast({ title: 'User ID required', variant: 'destructive' });
                              return;
                            }
                            setStaff((prev) => [
                              ...prev,
                              {
                                id: `staff-${Date.now()}`,
                                storeId: store.id,
                                userId: newStaffUserId.trim(),
                                displayName: `New staff (${newStaffRole})`,
                                email: null,
                                phone: null,
                                role: newStaffRole,
                                status: 'active',
                                createdAt: new Date(),
                              },
                            ]);
                            setNewStaffUserId('');
                            toast({ title: 'Staff assigned (prototype)' });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <UserPlus2 className="h-4 w-4" aria-hidden="true" />
                            Add staff
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {staff.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No staff assigned yet.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Enabled</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staff.map((member) => {
                          const isActive = member.status === 'active';
                          return (
                            <TableRow key={member.id}>
                              <TableCell className="text-sm">
                                <div className="flex flex-col">
                                  <span className="font-medium">{member.displayName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {[member.email, member.phone].filter(Boolean).join(' • ') || member.userId}
                                  </span>
                                  <span className="mt-1 text-[11px] text-muted-foreground">{member.userId}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={member.role}
                                  onValueChange={(value) =>
                                    setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, role: value as any } : s)))
                                  }
                                >
                                  <SelectTrigger className="h-9 w-40 rounded-full bg-white/80">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cashier">cashier</SelectItem>
                                    <SelectItem value="manager">manager</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Badge variant={isActive ? 'default' : 'secondary'}>{member.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  <span className="text-xs text-muted-foreground">{isActive ? 'Active' : 'Disabled'}</span>
                                  <Switch
                                    checked={isActive}
                                    onCheckedChange={(checked) =>
                                      setStaff((prev) =>
                                        prev.map((s) => (s.id === member.id ? { ...s, status: checked ? 'active' : 'disabled' } : s)),
                                      )
                                    }
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}

                  <div className="rounded-2xl border border-brand/15 bg-brand/10 p-4 text-sm text-muted-foreground ring-1 ring-brand/10" dir="auto">
                    <p className="font-semibold text-brand">Anti-abuse note</p>
                    <p className="mt-1">
                      In production, staff redemption is store-scoped via RPC, rate-limited, and audited. Disabling staff instantly blocks redemption attempts.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 text-sm text-muted-foreground shadow-sm ring-1 ring-black/5" dir="auto">
            Prototype note: This page is a visual preview. The real admin version is already implemented at <span className="font-semibold">/admin/sponsors</span> and writes to Supabase.
          </div>
        </div>
      </div>
    </section>
  );
}
