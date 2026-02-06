import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ShowcaseCardProps = {
  title: string;
  description: string;
  href: string;
  cta?: string;
};

function ShowcaseCard({ title, description, href, cta }: ShowcaseCardProps) {
  return (
    <Card className="overflow-hidden rounded-[28px] border-white/60 bg-linear-to-br from-white/80 via-white/70 to-white/50 shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground" dir="auto">
          {description}
        </p>
        <Button asChild className="rounded-full">
          <Link href={href}>{cta ?? 'Open'}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PrototypesIndexPage() {
  return (
    <section className="pb-14">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-6 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-8">
            <h1 className="text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
              Stores & Sponsors — Prototype showroom
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground" dir="auto">
              This is a high-fidelity preview of the sponsor directory + vouchers experience (cash-first “show code”).
              Everything here uses mock data so you can review UX, copy, and flow.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-full bg-white/80">
                <Link href="/prototypes/sponsors">Start at Sponsors hub</Link>
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-[#2D2D2D]" dir="auto">
              User flow
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <ShowcaseCard
                title="Sponsors hub"
                description="Browse stores and offers without flooding the main feed. Includes city/category filters and clear Sponsored labeling."
                href="/prototypes/sponsors"
              />
              <ShowcaseCard
                title="Store profile"
                description="Modern store page with branches, contact actions, and offers. Designed to drive foot traffic."
                href="/prototypes/sponsors/stores/zain-phones"
                cta="Open sample store"
              />
              <ShowcaseCard
                title="Offer detail"
                description="Offer page with ‘How to use’ steps and a clear deal breakdown (no QR / no voucher wallet)."
                href="/prototypes/sponsors/offers/f0f0f0f0-0000-0000-0000-000000000001"
                cta="Open sample offer"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-[#2D2D2D]" dir="auto">
              Seller flow
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <ShowcaseCard
                title="Manage services"
                description="Seller UI preview: add/edit/pause services that show up under the Services tab on the store page."
                href="/prototypes/sponsors/manage"
                cta="Open mock manager"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-[#2D2D2D]" dir="auto">
              Admin
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <ShowcaseCard
                title="Admin onboarding"
                description="Internal UI preview: create/edit stores, create offers, assign staff, disable stores when needed."
                href="/prototypes/admin/sponsors"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
