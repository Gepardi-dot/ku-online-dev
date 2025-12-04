'use client';

import { useEffect, useState } from 'react';
import { Star, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useLocale } from '@/providers/locale-provider';
import { cn } from '@/lib/utils';

interface Review {
  id: string;
  rating: number;
  comment: string;
  buyerName: string;
  buyerAvatar?: string;
  createdAt: string;
  isAnonymous: boolean;
  helpfulCount?: number;
  votedByMe?: boolean;
  buyerId?: string;
}

interface ReviewSystemProps {
  sellerId: string;
  productId?: string;
  averageRating?: number;
  totalReviews?: number;
  reviews?: Review[];
  canReview?: boolean;
  viewerId?: string | null;
  variant?: 'default' | 'compact';
  maxVisibleReviews?: number;
}

function renderStars(
  rating: number,
  interactive = false,
  onRate?: (rating: number) => void,
) {
  return [...Array(5)].map((_, index) => (
    <Star
      key={index}
      className={`h-4 w-4 ${
        index < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
      } ${interactive ? 'cursor-pointer hover:text-yellow-400' : ''}`}
      onClick={() => interactive && onRate && onRate(index + 1)}
    />
  ));
}

export default function ReviewSystem({
  sellerId,
  productId,
  averageRating = 0,
  totalReviews = 0,
  reviews = [],
  canReview = false,
  viewerId = null,
  variant = 'default',
  maxVisibleReviews,
}: ReviewSystemProps) {
  const { t, messages } = useLocale();
  const isCompact = variant === 'compact';

  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<Review[]>(reviews);
  const [avg, setAvg] = useState(averageRating);
  const [count, setCount] = useState(totalReviews);

  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editComment, setEditComment] = useState('');
  const [editAnon, setEditAnon] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('sellerId', sellerId);
        if (productId) params.set('productId', productId);
        params.set('limit', '10');

        const res = await fetch(`/api/reviews?${params.toString()}`);
        const payload = await res.json();
        if (res.ok) {
          setItems(payload.items ?? []);
          setAvg(Number(payload.average ?? averageRating));
          setCount(Number(payload.total ?? totalReviews));
        }
      } catch (error) {
        // best-effort; show empty state on failure
        console.error('Failed to load reviews', error);
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, productId]);

  const handleSubmitReview = async () => {
    if (!newRating) return;

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          productId: productId ?? null,
          rating: newRating,
          comment: newComment,
          isAnonymous,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to submit');

      const optimistic: Review = {
        id: payload.review?.id ?? String(Date.now()),
        rating: newRating,
        comment: newComment,
        buyerName: isAnonymous ? t('reviews.anonymous') : t('reviews.you'),
        buyerAvatar: undefined,
        createdAt: new Date().toISOString(),
        isAnonymous,
        helpfulCount: 0,
        votedByMe: false,
        buyerId: viewerId ?? undefined,
      };

      setItems((prev) => [optimistic, ...prev]);
      setCount((previous) => previous + 1);
      setAvg((previous) => {
        const total = previous * count + newRating;
        const nextCount = count + 1 || 1;
        return total / nextCount;
      });

      setShowReviewDialog(false);
      setNewRating(0);
      setNewComment('');
      setIsAnonymous(false);
    } catch (error) {
      console.error('Failed to submit review', error);
    }
  };

  const handleToggleHelpful = async (review: Review) => {
    try {
      const action = review.votedByMe ? 'remove' : 'add';
      const res = await fetch('/api/reviews/helpful', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: review.id, action }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed');

      setItems((prev) =>
        prev.map((item) =>
          item.id === review.id
            ? {
                ...item,
                votedByMe: action === 'add',
                helpfulCount: payload.count,
              }
            : item,
        ),
      );
    } catch (error) {
      console.error('Failed to toggle helpful vote', error);
    }
  };

  const startEdit = (review: Review) => {
    setEditId(review.id);
    setEditRating(review.rating);
    setEditComment(review.comment);
    setEditAnon(review.isAnonymous);
    setShowEdit(true);
  };

  const handleSaveEdit = async () => {
    if (!editId || !editRating) return;

    try {
      const res = await fetch('/api/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId,
          rating: editRating,
          comment: editComment,
          isAnonymous: editAnon,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed');

      setItems((prev) =>
        prev.map((review) =>
          review.id === editId
            ? { ...review, rating: editRating, comment: editComment, isAnonymous: editAnon }
            : review,
        ),
      );

      // recompute average from items (simple and safe)
      setAvg((previous) => {
        const nextItems = items.map((review) =>
          review.id === editId ? { ...review, rating: editRating } : review,
        );
        const total = nextItems.reduce((acc, review) => acc + review.rating, 0);
        return nextItems.length ? total / nextItems.length : previous;
      });

      setShowEdit(false);
    } catch (error) {
      console.error('Failed to edit review', error);
    }
  };

  const basedOnLabel =
    count === 1
      ? t('reviews.basedOnSingle')
      : messages.reviews.basedOnMultiple.replace('{count}', String(count));
  const visibleReviews =
    typeof maxVisibleReviews === 'number' ? items.slice(0, maxVisibleReviews) : items;
  const hasHiddenReviews =
    typeof maxVisibleReviews === 'number' ? count > maxVisibleReviews : false;
  const showingTopLabel =
    typeof maxVisibleReviews === 'number'
      ? (messages.reviews.showingTop ?? 'Showing top {count} reviews').replace(
          '{count}',
          String(maxVisibleReviews),
        )
      : '';

  return (
    <>
      <Card className={cn(isCompact && 'border border-muted/50 shadow-sm text-sm')}>
        <CardHeader className={cn(isCompact ? 'px-4 py-3' : '')}>
          <CardTitle className={cn('flex items-center justify-between', isCompact && 'text-base')}>
            <span>{t('reviews.title')}</span>
            {canReview && (
              <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(isCompact && 'h-8 px-2 text-xs')}
                  >
                    {t('reviews.writeReview')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('reviews.writeReview')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">
                        {t('reviews.ratingLabel')}
                      </label>
                      <div className="flex items-center gap-1 mt-1">
                        {renderStars(newRating, true, setNewRating)}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">
                        {t('reviews.commentLabel')}
                      </label>
                      <Textarea
                        value={newComment}
                        onChange={(event) => setNewComment(event.target.value)}
                        placeholder={t('reviews.commentLabel')}
                        className="mt-1"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="anonymous"
                        checked={isAnonymous}
                        onChange={(event) => setIsAnonymous(event.target.checked)}
                      />
                      <label htmlFor="anonymous" className="text-sm">
                        {t('reviews.postAnonymously')}
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <Button
                        onClick={handleSubmitReview}
                        disabled={newRating === 0}
                        className="w-full"
                      >
                        {t('reviews.submitReview')}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className={cn('space-y-4', isCompact && 'px-4 pb-4 pt-0 space-y-3')}>
          {/* Overall Rating */}
          <div className={cn('flex items-center gap-4 p-4 bg-muted rounded-lg', isCompact && 'p-3 rounded-md')}>
            <div className="text-center">
              <div className={cn('text-2xl font-bold', isCompact && 'text-xl')}>
                {Number(avg || 0).toFixed(1)}
              </div>
              <div className="flex items-center gap-1">
                {renderStars(Math.round(avg || 0))}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">{basedOnLabel}</div>
          </div>

          {/* Individual Reviews */}
          <div className={cn('space-y-4', isCompact && 'max-h-64 overflow-y-auto pr-1')}>
            {loading ? (
              <p className={cn('text-center text-muted-foreground py-8', isCompact && 'py-4 text-xs')}>
                {t('reviews.loading')}
              </p>
            ) : items.length === 0 ? (
              <p className={cn('text-center text-muted-foreground py-8', isCompact && 'py-4 text-xs')}>
                {t('reviews.empty')}
              </p>
            ) : (
              visibleReviews.map((review) => {
                const isViewer = viewerId && review.buyerId === viewerId;

                return (
                  <div
                    key={review.id}
                    className={cn('border-b pb-4 last:border-b-0', isCompact && 'pb-3')}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        {!review.isAnonymous && review.buyerAvatar && (
                          <AvatarImage src={review.buyerAvatar} />
                        )}
                        <AvatarFallback>
                          {review.isAnonymous
                            ? '?'
                            : (review.buyerName || '?').charAt(0)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">
                            {review.isAnonymous
                              ? t('reviews.anonymous')
                              : review.buyerName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(review.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>

                        <div className={cn('flex items-center gap-1 mb-2', isCompact && 'mb-1')}>
                          {renderStars(review.rating)}
                        </div>

                        {review.comment && (
                          <p
                            dir="auto"
                            className="text-sm text-muted-foreground bidi-auto"
                          >
                            {review.comment}
                          </p>
                        )}

                        <div className={cn('mt-2 flex items-center gap-2', isCompact && 'mt-1 text-xs')}>
                          <Button
                            variant={review.votedByMe ? 'secondary' : 'ghost'}
                            size="sm"
                            className={cn('h-auto px-2 py-1', isCompact && 'h-7 text-xs')}
                            onClick={() => handleToggleHelpful(review)}
                          >
                            <ThumbsUp className="h-3 w-3 mr-1" />
                            {t('reviews.helpful')}
                            {typeof review.helpfulCount === 'number'
                              ? ` (${review.helpfulCount})`
                              : ''}
                          </Button>

                          {isViewer && (
                            <button
                              type="button"
                              onClick={() => startEdit(review)}
                              className="text-xs text-primary hover:underline"
                            >
                              {t('reviews.editTitle')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {hasHiddenReviews && showingTopLabel && (
              <p className={cn('text-xs text-muted-foreground', isCompact && 'text-[11px]')}>
                {showingTopLabel}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Review Dialog */}
      {showEdit && editId && (
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('reviews.editTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  {t('reviews.ratingLabel')}
                </label>
                <div className="mt-1 flex items-center gap-1">
                  {renderStars(editRating, true, setEditRating)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('reviews.commentLabel')}
                </label>
                <Textarea
                  value={editComment}
                  onChange={(event) => setEditComment(event.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editAnon"
                  checked={editAnon}
                  onChange={(event) => setEditAnon(event.target.checked)}
                />
                <label htmlFor="editAnon" className="text-sm">
                  {t('reviews.postAnonymously')}
                </label>
              </div>
              <Button
                className="w-full"
                disabled={!editRating}
                onClick={handleSaveEdit}
              >
                {t('reviews.saveChanges')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

