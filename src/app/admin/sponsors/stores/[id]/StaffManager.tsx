'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2, Plus, UserCog } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

export type SponsorStaffUser = {
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
};

export type SponsorStaffItem = {
  id: string;
  userId: string;
  user: SponsorStaffUser | null;
  role: string;
  status: string;
  createdAt: string | null;
};

type AddStaffResponse = { ok: true; staff: { id: string } } | { ok: false; error?: string } | { ok?: false; error?: string };
type UpdateStaffResponse = { ok: true } | { ok: false; error?: string } | { ok?: false; error?: string };

function statusVariant(status: string) {
  const s = status.trim().toLowerCase();
  if (s === 'active') return 'default';
  return 'secondary';
}

export default function StaffManager({
  storeId,
  initialStaff,
  serviceRoleEnabled,
}: {
  storeId: string;
  initialStaff: SponsorStaffItem[];
  serviceRoleEnabled: boolean;
}) {
  const [staff, setStaff] = useState<SponsorStaffItem[]>(initialStaff);
  const [adding, setAdding] = useState(false);

  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'cashier' | 'manager'>('cashier');

  const sorted = useMemo(
    () =>
      staff
        .slice()
        .sort((a, b) => (a.status === b.status ? a.role.localeCompare(b.role) : a.status.localeCompare(b.status))),
    [staff],
  );

  const addStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId.trim()) {
      toast({ title: 'User ID is required', variant: 'destructive' });
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`/api/admin/sponsors/stores/${encodeURIComponent(storeId)}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), role }),
      });
      const payload = (await res.json().catch(() => ({}))) as AddStaffResponse;
      if (!res.ok || !payload.ok) {
        const message = typeof (payload as any)?.error === 'string' ? (payload as any).error : undefined;
        toast({ title: 'Could not add staff', description: message ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Staff added' });
      setStaff((prev) => [
        ...prev,
        {
          id: payload.staff.id,
          userId: userId.trim(),
          user: null,
          role,
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      ]);
      setUserId('');
      setRole('cashier');
    } catch (error) {
      console.error('Failed to add staff', error);
      toast({ title: 'Could not add staff', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const updateStaff = async (id: string, patch: { role?: string; status?: string }) => {
    try {
      const res = await fetch(`/api/admin/sponsors/staff/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = (await res.json().catch(() => ({}))) as UpdateStaffResponse;
      if (!res.ok || !payload.ok) {
        const message = typeof (payload as any)?.error === 'string' ? (payload as any).error : undefined;
        toast({ title: 'Could not update staff', description: message ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    } catch (error) {
      console.error('Failed to update staff', error);
      toast({ title: 'Could not update staff', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Add staff</p>
            <p className="text-xs text-muted-foreground">
              Enter the KU BAZAR user ID.{' '}
              {serviceRoleEnabled ? 'Staff contact details show automatically.' : 'Configure SUPABASE_SERVICE_ROLE_KEY to show names/emails.'}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-black/5">
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Store staff
          </div>
        </div>

        <form onSubmit={addStaff} className="mt-4 grid gap-3 md:grid-cols-[1.3fr_.7fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="UUID" className="h-11 rounded-2xl" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
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
            <Button type="submit" disabled={adding} className="h-11 rounded-2xl">
              {adding ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Adding…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </span>
              )}
            </Button>
          </div>
        </form>
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
            {sorted.map((item) => {
              const label = item.user?.label ?? item.userId;
              const sub = [item.user?.email, item.user?.phone].filter(Boolean).join(' • ');
              const isActive = item.status.trim().toLowerCase() === 'active';
              return (
                <TableRow key={item.id}>
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium" dir="auto">
                        {label}
                      </span>
                      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
                      <span className="mt-1 text-[11px] text-muted-foreground">{item.userId}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.role}
                      onValueChange={(v) => {
                        void updateStaff(item.id, { role: v });
                      }}
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
                    <Badge variant={statusVariant(item.status) as any}>{item.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <span className="text-xs text-muted-foreground">{isActive ? 'Active' : 'Disabled'}</span>
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => void updateStaff(item.id, { status: checked ? 'active' : 'disabled' })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
