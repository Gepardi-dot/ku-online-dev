import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  decimal,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  check,
  customType,
} from "drizzle-orm/pg-core";

// Type exports
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique(),
  phone: varchar('phone', { length: 20 }),
  fullName: text('full_name'),
  avatar: text('avatar_url'),
  location: text('location'),
  bio: text('bio'),
  isVerified: boolean('is_verified').default(false),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('0.00'),
  totalRatings: integer('total_ratings').default(0),
  responseRate: decimal('response_rate', { precision: 5, scale: 2 }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  responseTimeMinutes: integer('response_time_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Categories table
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  nameAr: text('name_ar'),
  nameKu: text('name_ku'),
  description: text('description'),
  icon: text('icon'),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Products table
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('IQD'),
  condition: text('condition').notNull(), // New, Used - Like New, Used - Good, Used - Fair
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  sellerId: uuid('seller_id').references(() => users.id, { onDelete: 'set null' }),
  location: text('location'),
  images: jsonb('images').$type<string[]>().default([]),
  isActive: boolean('is_active').default(true),
  isSold: boolean('is_sold').default(false),
  isPromoted: boolean('is_promoted').default(false),
  views: integer('views').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  searchDocument: tsvector('search_document'),
});

// Conversations table
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  sellerId: uuid('seller_id').references(() => users.id, { onDelete: 'cascade' }),
  buyerId: uuid('buyer_id').references(() => users.id, { onDelete: 'cascade' }),
  lastMessage: text('last_message'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  participantsUnique: uniqueIndex('conversations_participants_unique').on(
    table.sellerId,
    table.buyerId,
    table.productId,
  ),
}));

// Messages table for chat
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  receiverId: uuid('receiver_id').references(() => users.id, { onDelete: 'set null' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  messageType: text('message_type').default('text'), // text, image, offer
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Reviews table
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  sellerId: uuid('seller_id').references(() => users.id, { onDelete: 'set null' }),
  buyerId: uuid('buyer_id').references(() => users.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(), // 1-5 stars
  comment: text('comment'),
  isAnonymous: boolean('is_anonymous').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  ratingRange: check('reviews_rating_range', sql`${table.rating} between 1 and 5`),
}));

// Favorites table
export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userProductUnique: uniqueIndex('favorites_user_product_unique').on(table.userId, table.productId),
}));

// Notifications table
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content'),
  type: text('type').notNull(), // message, review, product_update, system
  relatedId: uuid('related_id'), // ID of related entity (product, message, etc.)
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
