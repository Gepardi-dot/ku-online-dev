'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import RemoveListingButton from '@/components/product/RemoveListingButton';

type ModerationUser = { id: string; name: string; isVerified: boolean };

export type ModerationReport = {
  id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'auto-flagged' | 'resolved' | 'dismissed' | string;
  isAutoFlagged: boolean;
  createdAt: string;
  product: { id: string; title: string; isActive: boolean } | null;
  reporter: ModerationUser | null;
  reportedUser: ModerationUser | null;
};

interface ModerationTableProps {
  reports: ModerationReport[];
}

function StatusBadge({ status }: { status: ModerationReport['status'] }) {
  const variant =
    status === 'resolved'
      ? 'secondary'
      : status === 'dismissed'
      ? 'outline'
      : status === 'auto-flagged'
      ? 'destructive'
      : 'default';

  return <Badge variant={variant}>{status}</Badge>;
}

export default function ModerationTable({ reports }: ModerationTableProps) {
  const [rows, setRows] = useState<ModerationReport[]>(reports ?? []);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ModerationUser | null>(null);
  const [verifyingUserId, setVerifyingUserId] = useState<string | null>(null);

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [rows],
  );

  const openUserDialog = (user: ModerationUser) => {
    setSelectedUser(user);
    setUserDialogOpen(true);
  };

  const updateUserVerified = async (userId: string, isVerified: boolean) => {
    setVerifyingUserId(userId);
    try {
      const res = await fetch('/api/admin/users/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isVerified }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        const description =
          typeof payload?.error === 'string' ? payload.error : 'Failed to update user.';
        toast({
          title: 'Update failed',
          description,
          variant: 'destructive',
        });
        return;
      }

      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          reporter:
            row.reporter?.id === userId ? { ...row.reporter, isVerified } : row.reporter,
          reportedUser:
            row.reportedUser?.id === userId ? { ...row.reportedUser, isVerified } : row.reportedUser,
        })),
      );
      setSelectedUser((prev) => (prev?.id === userId ? { ...prev, isVerified } : prev));

      toast({
        title: 'User updated',
        description: isVerified ? 'User is now verified.' : 'Verification removed.',
      });
    } catch (error) {
      console.error('Failed to update user verification', error);
      toast({
        title: 'Update failed',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setVerifyingUserId(null);
    }
  };

  const updateReport = async (
    id: string,
    status?: ModerationReport['status'],
    reactivateProduct = false,
  ) => {
    setLoadingId(id);
    try {
      const res = await fetch('/api/abuse/report/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, reactivateProduct }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        const description =
          typeof payload?.error === 'string' ? payload.error : 'Failed to update report.';
        toast({
          title: 'Update failed',
          description,
          variant: 'destructive',
        });
        return;
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                status: (payload.report?.status as ModerationReport['status']) ?? status ?? row.status,
                product: row.product
                  ? {
                      ...row.product,
                      isActive: reactivateProduct ? true : row.product.isActive,
                    }
                  : row.product,
              }
            : row,
        ),
      );

      toast({
        title: 'Report updated',
        description: 'The report status has been updated.',
      });
    } catch (error) {
      console.error('Failed to update report', error);
      toast({
        title: 'Update failed',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setLoadingId(null);
    }
  };

  if (sortedRows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No reports yet. They will appear here when users submit them.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Recent abuse reports</p>
      </div>

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User</DialogTitle>
            <DialogDescription>Manage verification status for this user.</DialogDescription>
          </DialogHeader>
          {selectedUser ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">{selectedUser.name}</div>
                <div className="text-xs text-muted-foreground">ID: {selectedUser.id}</div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Verified</div>
                  <div className="text-xs text-muted-foreground">Shows the verification badge across the app.</div>
                </div>
                <Switch
                  checked={selectedUser.isVerified}
                  onCheckedChange={(checked) => updateUserVerified(selectedUser.id, checked)}
                  disabled={verifyingUserId === selectedUser.id}
                  aria-label="Toggle verified"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reported</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Reporter</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((report) => {
            const createdLabel = formatDistanceToNow(new Date(report.createdAt), {
              addSuffix: true,
            });

            const targetLabel = report.product
              ? `Listing • ${report.product.title}`
              : report.reportedUser
              ? `User • ${report.reportedUser.name}`
              : 'Unknown';

            const isProcessing = loadingId === report.id;

            return (
              <TableRow key={report.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {createdLabel}
                </TableCell>
                <TableCell className="text-sm">
                  {report.product ? (
                    <div className="flex flex-col">
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/product/${report.product.id}`}
                        prefetch={false}
                      >
                        {report.product.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {report.product.isActive ? 'Active' : 'Hidden'}
                      </div>
                    </div>
                  ) : report.reportedUser ? (
                    <div className="flex flex-col">
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 justify-start font-medium"
                        onClick={() => openUserDialog(report.reportedUser as ModerationUser)}
                      >
                        {report.reportedUser.name}
                        {report.reportedUser.isVerified ? (
                          <Badge variant="secondary" className="ml-2">
                            Verified
                          </Badge>
                        ) : null}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        User ID: {report.reportedUser.id}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {report.reporter ? (
                    <div className="flex flex-col">
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 justify-start font-medium"
                        onClick={() => openUserDialog(report.reporter as ModerationUser)}
                      >
                        {report.reporter.name}
                        {report.reporter.isVerified ? (
                          <Badge variant="secondary" className="ml-2">
                            Verified
                          </Badge>
                        ) : null}
                      </Button>
                      <span className="text-xs text-muted-foreground">ID: {report.reporter.id}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={report.status} />
                  {report.isAutoFlagged ? (
                    <div className="text-xs text-destructive">auto-flagged</div>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-xs text-sm">
                  <div className="font-medium">{report.reason}</div>
                  {report.details ? (
                    <div className="text-xs text-muted-foreground line-clamp-3">{report.details}</div>
                  ) : null}
                </TableCell>
                <TableCell className="space-x-2 whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateReport(report.id, 'resolved', false)}
                    disabled={isProcessing || report.status === 'resolved'}
                  >
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateReport(report.id, 'dismissed', false)}
                    disabled={isProcessing || report.status === 'dismissed'}
                  >
                    Dismiss
                  </Button>
                  {report.product ? (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => updateReport(report.id, 'resolved', true)}
                        disabled={isProcessing || report.product.isActive}
                      >
                        Reactivate listing
                      </Button>
                      <RemoveListingButton
                        productId={report.product.id}
                        size="sm"
                        onDeleted={() => {
                          setRows((prev) =>
                            prev.map((row) =>
                              row.product?.id === report.product?.id ? { ...row, product: null } : row,
                            ),
                          );
                        }}
                      />
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
