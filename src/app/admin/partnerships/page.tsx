import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClient } from '@/utils/supabase/server';
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

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'new' ? 'default' : status === 'closed' ? 'outline' : 'secondary';

  return <Badge variant={variant}>{status}</Badge>;
}

export default async function PartnershipsPage() {
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

  if (supabaseServiceRole) {
    const { data, error } = await supabaseServiceRole
      .from('partnership_inquiries')
      .select(
        `
        id,
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

    if (error) {
      console.error('Failed to load partnership inquiries', error);
    } else if (data) {
      inquiries = data.map((row: any) => ({
        id: row.id,
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
          </CardHeader>
          <CardContent>
            {serviceRoleMissing ? (
              <div className="text-sm text-muted-foreground">
                Service role is not configured. Set `SUPABASE_SERVICE_ROLE_KEY` to view inquiries.
              </div>
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
