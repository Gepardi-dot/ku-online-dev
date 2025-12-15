'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

export type ModerationReport = {
  id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'auto-flagged' | 'resolved' | 'dismissed' | string;
  isAutoFlagged: boolean;
  createdAt: string;
  product: { id: string; title: string; isActive: boolean } | null;
  reporter: { id: string; name: string } | null;
  reportedUser: { id: string; name: string } | null;
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

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [rows],
  );

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
                      <span className="font-medium">{report.reportedUser.name}</span>
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
                      <span className="font-medium">{report.reporter.name}</span>
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
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => updateReport(report.id, 'resolved', true)}
                      disabled={isProcessing || report.product.isActive}
                    >
                      Reactivate listing
                    </Button>
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
