'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Eye } from 'lucide-react';
import type { ProductWithRelations } from '@/lib/services/products';
import { formatDistanceToNow } from 'date-fns';
import FavoriteToggle from '@/components/product/favorite-toggle';

interface ProductCardProps {
  product: ProductWithRelations;
  viewerId?: string | null;
}

export default function ProductCard({ product, viewerId }: ProductCardProps) {
  const formatPrice = (price: number, currency?: string | null) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency ?? 'IQD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price).replace('IQD', 'IQD');
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'New':
        return 'bg-green-500';
      case 'Used - Like New':
        return 'bg-blue-500';
      case 'Used - Good':
        return 'bg-yellow-500';
      case 'Used - Fair':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  const createdAtLabel = product.createdAt ? formatDistanceToNow(product.createdAt, { addSuffix: true }) : '';

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={product.images?.[0] || 'https://picsum.photos/400/300'}
          alt={product.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-2 right-2">
          <FavoriteToggle productId={product.id} userId={viewerId} size="sm" />
        </div>
        <div className="absolute top-2 left-2">
          <Badge className={`text-white ${getConditionColor(product.condition || 'New')}`}>
            {product.condition || 'New'}
          </Badge>
        </div>
        {product.isPromoted && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="secondary" className="bg-yellow-400 text-black">
              Featured
            </Badge>
          </div>
        )}
      </div>
      
      <CardContent className="p-3">
        <div className="space-y-2">
          <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
            {product.title}
          </h3>
          
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-primary">
              {formatPrice(Number(product.price), product.currency)}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" />
              {product.views}
            </div>
          </div>
          
          {product.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {product.location}
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{product.seller?.fullName ?? 'Seller'}</span>
            <span>{createdAtLabel}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}