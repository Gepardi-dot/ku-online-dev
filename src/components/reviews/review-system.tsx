'use client';

import { useEffect, useState } from 'react';
import { Star, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';

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
}

export default function ReviewSystem({
  sellerId,
  productId,
  averageRating = 0,
  totalReviews = 0,
  reviews = [],
  canReview = false,
  viewerId = null,
}: ReviewSystemProps) {
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

  const renderStars = (rating: number, interactive = false, onRate?: (rating: number) => void) => {
    return [...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
        } ${interactive ? 'cursor-pointer hover:text-yellow-400' : ''}`}
        onClick={() => interactive && onRate && onRate(i + 1)}
      />
    ));
  };

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
        body: JSON.stringify({ sellerId, productId: productId ?? null, rating: newRating, comment: newComment, isAnonymous }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to submit');

      // Optimistically add
      setItems((prev) => [
        {
          id: payload.review?.id ?? String(Date.now()),
          rating: newRating,
          comment: newComment,
          buyerName: isAnonymous ? 'Anonymous' : 'You',
          buyerAvatar: undefined,
          createdAt: new Date().toISOString(),
          isAnonymous,
        },
        ...prev,
      ]);
      setCount((c) => c + 1);
      setAvg((prev) => {
        const total = (prev * count + newRating) / ((count + 1) || 1);
        return total;
      });

      setShowReviewDialog(false);
      setNewRating(0);
      setNewComment('');
      setIsAnonymous(false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Reviews & Ratings</span>
          {canReview && (
            <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Write Review
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Write a Review</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Rating</label>
                    <div className="flex items-center gap-1 mt-1">
          {renderStars(newRating, true, setNewRating)}
          </div>
        </div>
                  
                  <div>
                    <label className="text-sm font-medium">Comment</label>
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Share your experience..."
                      className="mt-1"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="anonymous"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                    />
                    <label htmlFor="anonymous" className="text-sm">
                      Post anonymously
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      onClick={handleSubmitReview}
                      disabled={newRating === 0}
                      className="w-full"
                    >
                      Submit Review
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Rating */}
        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold">{Number(avg).toFixed(1)}</div>
            <div className="flex items-center gap-1">
              {renderStars(Math.round(avg))}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Based on {count} review{count !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Individual Reviews */}
        <div className="space-y-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading reviews…</p>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No reviews yet. Be the first to review!
            </p>
          ) : (
            items.map((review) => (
              <div key={review.id} className="border-b pb-4 last:border-b-0">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    {!review.isAnonymous && review.buyerAvatar && (
                      <AvatarImage src={review.buyerAvatar} />
                    )}
                    <AvatarFallback>
                      {review.isAnonymous ? '?' : review.buyerName[0]}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">
                        {review.isAnonymous ? 'Anonymous' : review.buyerName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 mb-2">
                      {renderStars(review.rating)}
                    </div>
                    
                    {review.comment && (
                      <p dir="auto" className="text-sm text-muted-foreground bidi-auto">{review.comment}</p>
                    )}
                    
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant={review.votedByMe ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-auto px-2 py-1"
                        onClick={async () => {
                          try {
                            const action = review.votedByMe ? 'remove' : 'add';
                            const res = await fetch('/api/reviews/helpful', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ reviewId: review.id, action }),
                            });
                            const payload = await res.json();
                            if (!res.ok) throw new Error(payload?.error || 'Failed');
                            setItems((prev) => prev.map((r) => r.id === review.id ? { ...r, votedByMe: action === 'add', helpfulCount: payload.count } : r));
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                      >
                        <ThumbsUp className="h-3 w-3 mr-1" />
                        Helpful {typeof review.helpfulCount === 'number' ? `(${review.helpfulCount})` : ''}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>

    {/* Edit Review Dialog */}
    {showEdit && editId && (
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit your review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Rating</label>
              <div className="mt-1 flex items-center gap-1">
                {renderStars(editRating, true, setEditRating)}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Comment</label>
              <Textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="editAnon" checked={editAnon} onChange={(e) => setEditAnon(e.target.checked)} />
              <label htmlFor="editAnon" className="text-sm">Post anonymously</label>
            </div>
            <Button
              className="w-full"
              disabled={!editRating}
              onClick={async () => {
                try {
                  const res = await fetch('/api/reviews', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editId, rating: editRating, comment: editComment, isAnonymous: editAnon }),
                  });
                  const payload = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(payload?.error || 'Failed');
                  // Update local state and average
                  setItems((prev) => prev.map((r) => r.id === editId ? { ...r, rating: editRating, comment: editComment, isAnonymous: editAnon } : r));
                  // recompute average from items (simple and safe)
                  setAvg((prev) => {
                    const list = items.map((r) => r.id === editId ? { ...r, rating: editRating } : r);
                    const total = list.reduce((a, b) => a + b.rating, 0);
                    return list.length ? total / list.length : 0;
                  });
                  setShowEdit(false);
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              Save changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
