-- Create missing tables: messages, reviews, notifications

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL,
    sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    receiver_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    content text NOT NULL,
    message_type text NOT NULL DEFAULT 'text',
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Reviews table
CREATE TABLE IF NOT EXISTS public.reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    seller_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    buyer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text,
    is_anonymous boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    content text,
    type text NOT NULL,
    related_id uuid,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Messages
DROP POLICY IF EXISTS "Users can view their messages" ON public.messages;
CREATE POLICY "Users can view their messages"
    ON public.messages FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
    ON public.messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- RLS Policies for Reviews
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "Anyone can view reviews"
    ON public.reviews FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Buyers can create reviews" ON public.reviews;
CREATE POLICY "Buyers can create reviews"
    ON public.reviews FOR INSERT
    WITH CHECK (auth.uid() = buyer_id);

-- RLS Policies for Notifications
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
CREATE POLICY "Users can view their notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
CREATE POLICY "Users can update their notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_receiver_id_idx ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages(created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_product_id_idx ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS reviews_seller_id_idx ON public.reviews(seller_id);
CREATE INDEX IF NOT EXISTS reviews_buyer_id_idx ON public.reviews(buyer_id);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);;
