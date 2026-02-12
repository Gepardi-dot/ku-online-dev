import { cookies } from 'next/headers';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { normalizeMarketCityValue } from '@/data/market-cities';
import { createClient } from '@/utils/supabase/server';
import { SELLER_APPLICATION_TYPE } from '@/lib/partnership-types';
import { getEnv } from '@/lib/env';
import { isModerator } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

const env = getEnv();
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

type PartnershipInquiry = {
  id: string;
  userId: string | null;
  name: string;
  company: string | null;
  email: string;
  website: string | null;
  partnershipType: string;
  message: string;
  budgetRange: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  attachmentUrl: string | null;
  status: string;
  createdAt: string;
};

type PartnershipStatus = 'new' | 'reviewed' | 'closed';
const PARTNERSHIP_STATUSES: readonly PartnershipStatus[] = ['new', 'reviewed', 'closed'] as const;

type PartnershipsSearchParams = {
  status?: string;
  type?: string;
};

function normalizeStatusFilter(value: string | null | undefined): PartnershipStatus | 'all' {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'all') return 'all';
  if (PARTNERSHIP_STATUSES.includes(normalized as PartnershipStatus)) {
    return normalized as PartnershipStatus;
  }
  return 'all';
}

function normalizeTypeFilter(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized || 'all';
}

function buildCreateStoreHref(inquiry: PartnershipInquiry): string {
  const query = new URLSearchParams();
  const preferredName = inquiry.company?.trim() || inquiry.name.trim();
  if (preferredName) {
    query.set('name', preferredName);
  }
  const normalizedCity = normalizeMarketCityValue(inquiry.city);
  if (normalizedCity) {
    query.set('city', normalizedCity);
  }
  if (inquiry.userId) {
    query.set('ownerUserId', inquiry.userId);
  }
  const normalizedPhone = inquiry.phone?.trim() ?? '';
  if (normalizedPhone) {
    query.set('phone', normalizedPhone);
  }
  const normalizedWebsite = inquiry.website?.trim() ?? '';
  if (normalizedWebsite) {
    query.set('website', normalizedWebsite);
  }
  const qs = query.toString();
  return qs ? `/admin/sponsors/new?${qs}` : '/admin/sponsors/new';
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'new' ? 'default' : status === 'closed' ? 'outline' : 'secondary';

  return <Badge variant={variant}>{status}</Badge>;
}

async function updateInquiryStatus(formData: FormData) {
  'use server';

  const inquiryId = String(formData.get('inquiryId') ?? '').trim();
  const nextStatus = String(formData.get('nextStatus') ?? '').trim().toLowerCase();
  if (!inquiryId || !PARTNERSHIP_STATUSES.includes(nextStatus as PartnershipStatus)) {
    return;
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user) || !supabaseServiceRole) {
    return;
  }

  const { error } = await supabaseServiceRole
    .from('partnership_inquiries')
    .update({ status: nextStatus })
    .eq('id', inquiryId);

  if (error) {
    console.error('Failed to update partnership inquiry status', error);
    return;
  }

  revalidatePath('/admin/partnerships');
  revalidatePath('/sponsors');
}

function buildPartnershipsHref(input: { type: string; status: PartnershipStatus | 'all' }): string {
  const query = new URLSearchParams();
  if (input.type !== 'all') {
    query.set('type', input.type);
  }
  if (input.status !== 'all') {
    query.set('status', input.status);
  }
  const qs = query.toString();
  return qs ? `/admin/partnerships?${qs}` : '/admin/partnerships';
}

export default async function PartnershipsPage({
  searchParams,
}: {
  searchParams?: Promise<PartnershipsSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const statusFilter = normalizeStatusFilter(params.status);
  const typeFilter = normalizeTypeFilter(params.type);

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    redirect('/');
  }

  let inquiries: PartnershipInquiry[] = [];
  const serviceRoleMissing = !supabaseServiceRole;
  let loadError: string | null = null;

  if (supabaseServiceRole) {
    let query = supabaseServiceRole
      .from('partnership_inquiries')
      .select(
        `
        id,
        user_id,
        name,
        company,
        email,
        website,
        partnership_type,
        message,
        budget_range,
        country,
        city,
        phone,
        attachment_url,
        status,
        created_at
      `,
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (typeFilter !== 'all') {
      query = query.eq('partnership_type', typeFilter);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to load partnership inquiries', error);
      loadError = 'Could not load partnership inquiries. Check SUPABASE_SERVICE_ROLE_KEY and table access.';
    } else if (data) {
      inquiries = data.map((row: any) => ({
        id: row.id,
        userId: row.user_id ?? null,
        name: row.name,
        company: row.company ?? null,
        email: row.email,
        website: row.website ?? null,
        partnershipType: row.partnership_type,
        message: row.message,
        budgetRange: row.budget_range ?? null,
        country: row.country ?? null,
        city: row.city ?? null,
        phone: row.phone ?? null,
        attachmentUrl: row.attachment_url ?? null,
        status: row.status ?? 'new',
        createdAt: row.created_at,
      }));
    }
  }

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Partnership inquiries</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review incoming seller applications, create a sponsor store for approved applicants,
              then mark the application as reviewed.
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Link
                href={buildPartnershipsHref({ type: 'all', status: 'all' })}
                className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
              >
                All inquiries
              </Link>
              <Link
                href={buildPartnershipsHref({ type: SELLER_APPLICATION_TYPE, status: 'new' })}
                className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
              >
                New seller applications
              </Link>
              <Link
                href={buildPartnershipsHref({ type: SELLER_APPLICATION_TYPE, status: 'reviewed' })}
                className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
              >
                Reviewed seller applications
              </Link>
            </div>

            {serviceRoleMissing ? (
              <div className="text-sm text-muted-foreground">
                Service role is not configured. Set `SUPABASE_SERVICE_ROLE_KEY` to view inquiries.
              </div>
            ) : loadError ? (
              <div className="text-sm text-destructive">{loadError}</div>
            ) : inquiries.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No partnership inquiries yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inquiries.map((inquiry) => {
                    const createdLabel = formatDistanceToNow(new Date(inquiry.createdAt), {
                      addSuffix: true,
                    });
                    const locationLabel = [inquiry.city, inquiry.country]
                      .filter(Boolean)
                      .join(', ');

                    return (
                      <TableRow key={inquiry.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {createdLabel}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{inquiry.name}</span>
                            <a href={`mailto:${inquiry.email}`} className="text-xs text-primary">
                              {inquiry.email}
                            </a>
                            {inquiry.phone ? (
                              <span className="text-xs text-muted-foreground">
                                {inquiry.phone}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {inquiry.company || '—'}
                            </span>
                            {inquiry.website ? (
                              <a
                                href={inquiry.website}
                                className="text-xs text-primary hover:underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {inquiry.website}
                              </a>
                            ) : null}
                            {locationLabel ? (
                              <span className="text-xs text-muted-foreground">
                                {locationLabel}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{inquiry.partnershipType}</span>
                            {inquiry.budgetRange ? (
                              <span className="text-xs text-muted-foreground">
                                Budget: {inquiry.budgetRange}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs text-sm">
                          <div className="line-clamp-3">{inquiry.message}</div>
                          {inquiry.attachmentUrl ? (
                            <a
                              href={inquiry.attachmentUrl}
                              className="mt-2 inline-flex text-xs text-primary hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Media kit
                            </a>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={inquiry.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Link
                              href={buildCreateStoreHref(inquiry)}
                              className="inline-flex h-8 items-center rounded-full border border-black/10 bg-white px-3 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
                            >
                              Create store
                            </Link>

                            {inquiry.status !== 'reviewed' ? (
                              <form action={updateInquiryStatus}>
                                <input type="hidden" name="inquiryId" value={inquiry.id} />
                                <input type="hidden" name="nextStatus" value="reviewed" />
                                <Button type="submit" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs">
                                  Mark reviewed
                                </Button>
                              </form>
                            ) : (
                              <form action={updateInquiryStatus}>
                                <input type="hidden" name="inquiryId" value={inquiry.id} />
                                <input type="hidden" name="nextStatus" value="new" />
                                <Button type="submit" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs">
                                  Reopen
                                </Button>
                              </form>
                            )}
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
    </AppLayout>
  );
}
