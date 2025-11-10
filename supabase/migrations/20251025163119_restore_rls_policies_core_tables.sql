-- Restore RLS policies for core tables

-- Users table policies
DROP POLICY IF EXISTS "Users can view profiles" ON public.users;
CREATE POLICY "Users can view profiles"
    ON public.users
    FOR SELECT
    USING (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile"
    ON public.users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Categories table policies
DROP POLICY IF EXISTS "Categories are readable" ON public.categories;
CREATE POLICY "Categories are readable"
    ON public.categories
    FOR SELECT
    USING (true);

-- Products table policies
DROP POLICY IF EXISTS "View products" ON public.products;
CREATE POLICY "View products"
    ON public.products
    FOR SELECT
    USING (is_active = true OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Insert products as seller" ON public.products;
CREATE POLICY "Insert products as seller"
    ON public.products
    FOR INSERT
    WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Update own products" ON public.products;
CREATE POLICY "Update own products"
    ON public.products
    FOR UPDATE
    USING (auth.uid() = seller_id)
    WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Delete own products" ON public.products;
CREATE POLICY "Delete own products"
    ON public.products
    FOR DELETE
    USING (auth.uid() = seller_id);
;
