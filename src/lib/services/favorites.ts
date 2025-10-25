import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { ProductWithRelations, SupabaseProductRow } from "./products";
import { mapProduct, PRODUCT_SELECT } from "./products";
import { mockProducts } from "@/data/mock/products";

const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK === "true";
export const MOCK_FAVORITES_COOKIE = "ku_mock_favorites";

async function getSupabaseClient() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

type MockFavoritesMap = Record<string, string[]>;

function parseMockFavorites(value: string | undefined): MockFavoritesMap {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return Object.keys(parsed).reduce<MockFavoritesMap>((acc, key) => {
        const entry = parsed[key];
        if (Array.isArray(entry)) {
          acc[key] = entry.filter((item): item is string => typeof item === "string");
        }
        return acc;
      }, {});
    }
  } catch (error) {
    console.warn("Failed to parse mock favorites cookie", error);
  }

  return {};
}

async function readMockFavorites() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(MOCK_FAVORITES_COOKIE)?.value;
  const favoritesMap = parseMockFavorites(raw);
  return { cookieStore, favoritesMap };
}

export async function getFavoriteProductIds(userId: string): Promise<string[]> {
  if (!userId) {
    return [];
  }

  if (USE_MOCK_DATA) {
    const { favoritesMap } = await readMockFavorites();
    return favoritesMap[userId] ?? [];
  }

  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from("favorites")
    .select("product_id")
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to load favorite product ids", error);
    return [];
  }

  return (data ?? [])
    .map((row) => row.product_id)
    .filter((value): value is string => Boolean(value));
}

function isSupabaseProductRow(value: unknown): value is SupabaseProductRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    (record.price == null || typeof record.price === "number" || typeof record.price === "string")
  );
}

function isFavoriteRow(value: unknown): value is { product: SupabaseProductRow | null } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as { product?: unknown };

  if (!("product" in record)) {
    return false;
  }

  const product = record.product;
  return product === null || isSupabaseProductRow(product);
}

export async function getFavoriteProducts(userId: string): Promise<ProductWithRelations[]> {
  if (!userId) {
    return [];
  }

  if (USE_MOCK_DATA) {
    const ids = await getFavoriteProductIds(userId);
    const favorites = ids
      .map((id) => mockProducts.find((product) => product.id === id))
      .filter((product): product is ProductWithRelations => Boolean(product));
    return favorites;
  }

  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from("favorites")
    .select(`product:products(${PRODUCT_SELECT})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load favorite products", error);
    return [];
  }

  const rows = Array.isArray(data) ? data.filter(isFavoriteRow) : [];
  const products: ProductWithRelations[] = [];

  for (const row of rows) {
    const product = row.product;
    if (!product || !isSupabaseProductRow(product)) {
      continue;
    }
    products.push(mapProduct(product));
  }

  return products;
}

type FavoriteMutationResult = { success: boolean; error?: unknown; mockFavorites?: MockFavoritesMap };

export async function addFavorite(userId: string, productId: string): Promise<FavoriteMutationResult> {
  if (!userId || !productId) {
    return { success: false };
  }

  if (USE_MOCK_DATA) {
    const { favoritesMap } = await readMockFavorites();
    const current = new Set(favoritesMap[userId] ?? []);
    current.add(productId);
    favoritesMap[userId] = Array.from(current);
    return { success: true, mockFavorites: favoritesMap };
  }

  const supabase = await getSupabaseClient();

  const { error } = await supabase
    .from("favorites")
    .upsert({ user_id: userId, product_id: productId }, { onConflict: "user_id,product_id" });

  if (error) {
    console.error("Failed to add favorite", error);
    return { success: false, error };
  }

  return { success: true };
}

export async function removeFavorite(userId: string, productId: string): Promise<FavoriteMutationResult> {
  if (!userId || !productId) {
    return { success: false };
  }

  if (USE_MOCK_DATA) {
    const { favoritesMap } = await readMockFavorites();
    const current = new Set(favoritesMap[userId] ?? []);
    current.delete(productId);
    favoritesMap[userId] = Array.from(current);
    return { success: true, mockFavorites: favoritesMap };
  }

  const supabase = await getSupabaseClient();

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);

  if (error) {
    console.error("Failed to remove favorite", error);
    return { success: false, error };
  }

  return { success: true };
}
