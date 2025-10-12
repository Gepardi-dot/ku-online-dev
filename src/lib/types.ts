export interface User {
  id: string;
  email?: string;
  phone?: string;
  fullName?: string;
  avatar?: string;
  location?: string;
  bio?: string;
  isVerified: boolean;
  rating: number;
  totalRatings: number;
  responseRate?: number;
  lastSeenAt?: string;
  responseTimeMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Seller {
  name: string;
  avatarUrl: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  currency: 'IQD';
  imageUrl: string;
  imageHint: string | null;
  seller: Seller;
  category: string;
  condition: 'New' | 'Used - Like New' | 'Used - Good' | 'Used - Fair';
  createdAt: string; // ISO 8601 string format
  location: string;
  tags?: string[];
}

export interface Category {
  id: string;
  name: string;
  nameAr?: string;
  nameKu?: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  productId?: string;
  content: string;
  messageType: 'text' | 'image' | 'offer';
  isRead: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  productId?: string;
  sellerId: string;
  buyerId: string;
  rating: number;
  comment?: string;
  isAnonymous: boolean;
  createdAt: string;
}
