'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type SponsorStoreStatus = 'pending' | 'active' | 'disabled';
type StatusFilter = SponsorStoreStatus | 'all';

type AdminSponsorStore = {
  id: string;
  name: string;
  slug: string;
  status: SponsorStoreStatus;
  ownerUserId: string | null;
  primaryCity: string | null;
  sponsorTier: string | null;
  isFeatured: boolean;
  updatedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
};

type ListStoresResponse =
  | {
      ok: true;
      stores: AdminSponsorStore[];
      requestId?: string;
    }
  | {
      ok: false;
      error?: string;
      errorCode?: string;
      requestId?: string;
    };

type UpdateStatusResponse =
  | {
      ok: true;
      store: {
        id: string;
        status: SponsorStoreStatus;
        approvedAt: string | null;
        approvedBy: string | null;
        disabledAt: string | null;
        disabledBy: string | null;
      };
      requestId?: string;
    }
  | {
      ok: false;
      error?: string;
      errorCode?: string;
      requestId?: string;
    };

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'all', label: 'All' },
];

function normalizeStatus(value: unknown): SponsorStoreStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'active' || normalized === 'disabled') {
    return normalized;
  }
  return 'pending';
}

function formatRelative(value: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return formatDistanceToNow(date, { addSuffix: true });
}

function statusBadgeClass(status: SponsorStoreStatus): string {
  if (status === 'active') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }
  if (status === 'disabled') {
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

export default function AdminSponsorStoresPanel() {
  const [stores, setStores] = useState<AdminSponsorStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [ownerIssuesOnly, setOwnerIssuesOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusAction, setStatusAction] = useState<{
    storeId: string;
    nextStatus: 'active' | 'disabled';
  } | null>(null);

  const loadStores = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetch('/api/admin/sponsors/stores', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({ ok: false }))) as ListStoresResponse;

      if (!response.ok || data.ok !== true) {
        const message =
          'error' in data && typeof data.error === 'string' ? data.error : 'Failed to load sponsor stores.';
        setLoadError(message);
        if (mode === 'refresh') {
          toast({ title: 'Refresh failed', description: message, variant: 'destructive' });
        }
        return;
      }

      const normalized = data.stores
        .map((store) => ({
          ...store,
          status: normalizeStatus(store.status),
        }))
        .filter((store) => store.id.trim().length > 0);

      setStores(normalized);
      setLoadError(null);
    } catch (error) {
      console.error('Failed to fetch admin sponsor stores', error);
      const message = 'Failed to load sponsor stores.';
      setLoadError(message);
      if (mode === 'refresh') {
        toast({ title: 'Refresh failed', description: message, variant: 'destructive' });
      }
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadStores('initial');
  }, [loadStores]);

  const summary = useMemo(() => {
    const pending = stores.filter((store) => store.status === 'pending').length;
    const active = stores.filter((store) => store.status === 'active').length;
    const disabled = stores.filter((store) => store.status === 'disabled').length;
    const pendingMissingOwner = stores.filter((store) => store.status === 'pending' && !store.ownerUserId).length;
    return {
      total: stores.length,
      pending,
      active,
      disabled,
      pendingMissingOwner,
    };
  }, [stores]);

  const searchTerm = search.trim().toLowerCase();
  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (statusFilter !== 'all' && store.status !== statusFilter) {
        return false;
      }

      if (ownerIssuesOnly && store.ownerUserId) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const haystack = `${store.name} ${store.slug} ${store.ownerUserId ?? ''}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [ownerIssuesOnly, searchTerm, statusFilter, stores]);

  const updateStoreStatus = useCallback(
    async (store: AdminSponsorStore, nextStatus: 'active' | 'disabled') => {
      setStatusAction({ storeId: store.id, nextStatus });
      try {
        const response = await fetch(`/api/admin/sponsors/stores/${encodeURIComponent(store.id)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        const data = (await response.json().catch(() => ({ ok: false }))) as UpdateStatusResponse;
        if (!response.ok || data.ok !== true) {
          const message =
            'error' in data && typeof data.error === 'string' ? data.error : 'Failed to update store status.';
          toast({
            title: 'Status update failed',
            description: message,
            variant: 'destructive',
          });
          return;
        }

        setStores((prev) =>
          prev.map((item) =>
            item.id === store.id
              ? {
                  ...item,
                  status: normalizeStatus(data.store.status),
                  approvedAt: data.store.approvedAt ?? null,
                  approvedBy: data.store.approvedBy ?? null,
                  disabledAt: data.store.disabledAt ?? null,
                  disabledBy: data.store.disabledBy ?? null,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        );

        toast({
          title: data.store.status === 'active' ? 'Store approved' : 'Store disabled',
          description: `${store.name} is now ${data.store.status}.`,
        });

        void loadStores('refresh');
      } catch (error) {
        console.error('Failed to update sponsor store status', error);
        toast({
          title: 'Status update failed',
          description: 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setStatusAction(null);
      }
    },
    [loadStores],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-black/10 bg-white/80 px-4 py-8 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading sponsor stores...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="rounded-xl border border-black/10 bg-white/90">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Total stores</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-extrabold text-[#111827]">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-amber-200 bg-amber-50/70">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-amber-900">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-extrabold text-amber-900">{summary.pending}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-emerald-200 bg-emerald-50/70">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-emerald-900">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-extrabold text-emerald-900">{summary.active}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-200 bg-slate-50/70">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-slate-900">Disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-extrabold text-slate-900">{summary.disabled}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-red-200 bg-red-50/70">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-red-900">Pending without owner</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-extrabold text-red-900">{summary.pendingMissingOwner}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-black/10 bg-white/90">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-extrabold text-[#111827]">Store controls</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => void loadStores('refresh')}
              disabled={refreshing}
            >
              {refreshing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Refreshing...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Refresh
                </span>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((filter) => {
              const selected = statusFilter === filter.value;
              const count =
                filter.value === 'all'
                  ? summary.total
                  : filter.value === 'pending'
                    ? summary.pending
                    : filter.value === 'active'
                      ? summary.active
                      : summary.disabled;

              return (
                <Button
                  key={filter.value}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label} ({count})
                </Button>
              );
            })}

            <Button
              type="button"
              variant={ownerIssuesOnly ? 'default' : 'outline'}
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setOwnerIssuesOnly((prev) => !prev)}
            >
              Missing owner only ({summary.pendingMissingOwner})
            </Button>
          </div>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by store name, slug, or owner ID"
            className="h-10 rounded-xl bg-white"
          />
        </CardHeader>

        <CardContent className="space-y-2">
          {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

          {filteredStores.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 bg-white/70 p-4 text-sm text-muted-foreground">
              No stores match the current filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStores.map((store) => {
                  const busyForStore = statusAction?.storeId === store.id;
                  const canActivate = Boolean(store.ownerUserId?.trim());
                  const activateLabel = store.status === 'pending' ? 'Approve' : 'Activate';

                  return (
                    <TableRow key={store.id}>
                      <TableCell className="min-w-[220px]">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-[#111827]">{store.name}</p>
                          <p className="text-xs text-muted-foreground">
                            /{store.slug}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {store.isFeatured ? (
                              <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                                featured
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className="h-5 px-2 text-[10px]">
                              {store.sponsorTier ?? 'basic'}
                            </Badge>
                            {store.primaryCity ? (
                              <Badge variant="outline" className="h-5 px-2 text-[10px]">
                                {store.primaryCity}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <Badge className={cn('border text-[10px] font-semibold', statusBadgeClass(store.status))}>
                            {store.status}
                          </Badge>
                          {store.status === 'pending' && !store.ownerUserId ? (
                            <p className="text-[11px] font-semibold text-amber-700">Assign owner before approval.</p>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="min-w-[180px]">
                        {store.ownerUserId ? (
                          <code className="block text-[11px] text-muted-foreground">{store.ownerUserId}</code>
                        ) : (
                          <span className="text-xs font-semibold text-amber-700">Missing owner</span>
                        )}
                      </TableCell>

                      <TableCell className="min-w-[180px] text-xs text-muted-foreground">
                        <p>Updated {formatRelative(store.updatedAt)}</p>
                        {store.approvedAt ? <p>Approved {formatRelative(store.approvedAt)}</p> : null}
                        {store.disabledAt ? <p>Disabled {formatRelative(store.disabledAt)}</p> : null}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {store.status !== 'active' ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 rounded-full px-3 text-xs"
                              onClick={() => void updateStoreStatus(store, 'active')}
                              disabled={!canActivate || busyForStore}
                            >
                              {busyForStore && statusAction?.nextStatus === 'active' ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : null}
                              {activateLabel}
                            </Button>
                          ) : null}

                          {store.status !== 'disabled' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full px-3 text-xs"
                              onClick={() => void updateStoreStatus(store, 'disabled')}
                              disabled={busyForStore}
                            >
                              {busyForStore && statusAction?.nextStatus === 'disabled' ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : null}
                              Disable
                            </Button>
                          ) : null}

                          <Button asChild type="button" size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs">
                            <Link href={`/sponsors/manage?store=${encodeURIComponent(store.slug)}`}>Manage</Link>
                          </Button>

                          <Button asChild type="button" size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs">
                            <Link href={`/sponsors/stores/${store.slug}`} target="_blank" rel="noreferrer">
                              View
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
