'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

type ContactsState = {
  supportEmail: string | null;
  supportWhatsapp: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  source: 'db' | 'env' | 'none';
};

type AppContactsCardProps = {
  initial: ContactsState;
  canEdit: boolean;
};

export default function AppContactsCard({ initial, canEdit }: AppContactsCardProps) {
  const [contacts, setContacts] = useState<ContactsState>(initial);
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail ?? '');
  const [supportWhatsapp, setSupportWhatsapp] = useState(initial.supportWhatsapp ?? '');
  const [saving, setSaving] = useState(false);

  const updatedLabel = useMemo(() => {
    if (!contacts.updatedAt) return 'Never updated from the dashboard yet.';
    const relative = formatDistanceToNow(new Date(contacts.updatedAt), { addSuffix: true });
    const by = contacts.updatedByName ? ` by ${contacts.updatedByName}` : '';
    return `${relative}${by}`;
  }, [contacts.updatedAt, contacts.updatedByName]);

  const handleSave = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/app-contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supportEmail: supportEmail.trim() || null,
          supportWhatsapp: supportWhatsapp.trim() || null,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        const description =
          typeof payload?.error === 'string' ? payload.error : 'Failed to save contact settings.';
        toast({
          title: 'Save failed',
          description,
          variant: 'destructive',
        });
        return;
      }

      const next = payload.contacts as ContactsState;
      setContacts(next);
      setSupportEmail(next.supportEmail ?? '');
      setSupportWhatsapp(next.supportWhatsapp ?? '');

      toast({
        title: 'Contacts updated',
        description: 'Partner and seller contact channels were updated successfully.',
      });
    } catch (error) {
      console.error('Failed to update app contacts', error);
      toast({
        title: 'Save failed',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage KU BAZAR app contact channels used by Partner and Seller Application dialogs.
      </p>

      {contacts.source !== 'db' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {contacts.source === 'env'
            ? 'Currently using environment fallback values. Save once to persist these contacts in the database.'
            : 'No contact values are configured yet. Add WhatsApp and/or email below.'}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="app-support-whatsapp">KU BAZAR WhatsApp</Label>
          <Input
            id="app-support-whatsapp"
            value={supportWhatsapp}
            onChange={(event) => setSupportWhatsapp(event.target.value)}
            placeholder="+9647500000000"
            disabled={!canEdit || saving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-support-email">KU BAZAR Email</Label>
          <Input
            id="app-support-email"
            type="email"
            value={supportEmail}
            onChange={(event) => setSupportEmail(event.target.value)}
            placeholder="support@kubazar.com"
            disabled={!canEdit || saving}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Last updated: {updatedLabel}
        </p>
        {canEdit ? (
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save contacts'}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            View only. Admin role is required to edit app contacts.
          </p>
        )}
      </div>
    </div>
  );
}

