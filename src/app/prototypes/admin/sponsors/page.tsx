import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PROTOTYPE_STORES } from '@/lib/prototypes/sponsors';

function statusVariant(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') return 'default';
  if (normalized === 'disabled') return 'destructive';
  return 'secondary';
}

export default function PrototypeAdminSponsorsPage() {
  const stores = PROTOTYPE_STORES.slice().sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));

  return (
    <section className="pb-14">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-6 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-8">
            <h1 className="text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
              Admin onboarding (Prototype)
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground" dir="auto">
              This is a UI preview of how the KU BAZAR team will onboard sponsor stores, offers, and staff accounts. In
              production, access is restricted to admin/moderator users.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="rounded-full">
                <Link href="/admin/sponsors">Open real admin (DB)</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full bg-white/80">
                <Link href="/prototypes/sponsors">Preview user experience</Link>
              </Button>
            </div>
          </div>

          <Card className="rounded-[28px] border-white/60 bg-white/70 shadow-sm ring-1 ring-black/5">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg">Sponsor stores</CardTitle>
              <Badge variant="secondary">Mock data</Badge>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Featured</TableHead>
                    <TableHead>KPIs (30d)</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{store.name}</span>
                          <span className="text-xs text-muted-foreground">/{store.slug}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{store.primaryCity ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(store.status) as any}>{store.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{store.isFeatured ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="font-semibold text-[#2D2D2D]">{store.kpis.views30d.toLocaleString()}</span> views •{' '}
                        <span className="font-semibold text-[#2D2D2D]">{store.kpis.claims30d.toLocaleString()}</span> claims •{' '}
                        <span className="font-semibold text-[#2D2D2D]">{store.kpis.redemptions30d.toLocaleString()}</span> redemptions
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" className="rounded-full bg-white/80">
                          <Link href={`/prototypes/admin/sponsors/stores/${store.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="rounded-[28px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-6 text-sm text-muted-foreground shadow-sm ring-1 ring-white/40" dir="auto">
            <p className="font-semibold text-[#2D2D2D]">Onboarding checklist (MVP)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Create store (status: pending → active when verified).</li>
              <li>Add 1–3 offers (with clear terms + end date).</li>
              <li>Assign staff accounts (cashier/manager) for redemption.</li>
              <li>Test redeem flow in-store with “show code”.</li>
              <li>Monitor reports; disable stores that refuse discounts repeatedly.</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

