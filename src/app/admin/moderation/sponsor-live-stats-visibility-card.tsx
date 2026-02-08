'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import type { SponsorLiveStatsVisibility } from '@/lib/services/app-settings';

type SponsorLiveStatsVisibilityCardProps = {
  initial: SponsorLiveStatsVisibility;
  canEdit: boolean;
};

function buildUpdatedLabel(settings: SponsorLiveStatsVisibility): string {
  if (!settings.updatedAt) return 'Never updated from moderation dashboard yet.';
  const parsed = new Date(settings.updatedAt);
  if (Number.isNaN(parsed.getTime())) return 'Unknown update time';
  const relative = formatDistanceToNow(parsed, { addSuffix: true });
  const by = settings.updatedByName ? ` by ${settings.updatedByName}` : '';
  return `${relative}${by}`;
}

export default function SponsorLiveStatsVisibilityCard({ initial, canEdit }: SponsorLiveStatsVisibilityCardProps) {
  const [settings, setSettings] = useState<SponsorLiveStatsVisibility>(initial);
  const [saving, setSaving] = useState(false);

  const updatedLabel = useMemo(() => buildUpdatedLabel(settings), [settings]);

  const handleVisibilityChange = async (checked: boolean) => {
    if (!canEdit || saving || checked === settings.publicVisible) return;
    setSaving(true);

    try {
      const res = await fetch('/api/admin/app-settings/sponsor-live-stats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicVisible: checked }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        const description = typeof payload?.error === 'string' ? payload.error : 'Failed to update visibility.';
        toast({ title: 'Save failed', description, variant: 'destructive' });
        return;
      }

      const next = payload.settings as SponsorLiveStatsVisibility;
      setSettings(next);
      toast({
        title: 'Visibility updated',
        description: next.publicVisible
          ? 'Live stats chips are now visible to all users.'
          : 'Live stats chips are now limited to admins and moderators.',
      });
    } catch (error) {
      console.error('Failed to update sponsor live stats visibility', error);
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
        Control whether sponsor live stats chips are public, or visible only to admins and moderators.
      </p>

      {settings.source !== 'db' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Using default visibility (admins/moderators only). Save once to persist this setting in the database.
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-3 ring-1 ring-black/5">
        <div className="min-w-0">
          <Label htmlFor="sponsor-live-stats-public" className="text-sm font-semibold text-[#111827]">
            Public sponsor stats chips
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {settings.publicVisible
              ? 'Visible to everyone on sponsor cards.'
              : 'Visible only to admins and moderators.'}
          </p>
        </div>

        <Switch
          id="sponsor-live-stats-public"
          checked={settings.publicVisible}
          disabled={!canEdit || saving}
          onCheckedChange={handleVisibilityChange}
          aria-label="Toggle public sponsor stats chip visibility"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Last updated: {updatedLabel}</p>
        {canEdit ? (
          <p className="text-xs text-muted-foreground">{saving ? 'Saving...' : 'Changes save instantly.'}</p>
        ) : (
          <p className="text-xs text-muted-foreground">View only. Admin role is required to change this setting.</p>
        )}
      </div>
    </div>
  );
}
