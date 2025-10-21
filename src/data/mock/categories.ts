import type { MarketplaceCategory } from "@/lib/services/products";

export const mockCategories: MarketplaceCategory[] = [
  {
    id: "mock-category-electronics",
    name: "Electronics",
    nameAr: "إلكترونيات",
    nameKu: "ئه‌لیکترۆنیات",
    description: "Phones, laptops, and accessories for everyday use.",
    icon: "smartphone",
    isActive: true,
    sortOrder: 1,
    createdAt: new Date("2024-08-01T00:00:00Z"),
  },
  {
    id: "mock-category-home",
    name: "Home & Living",
    nameAr: "منزل ومعيشة",
    nameKu: "ماڵ و ژیان",
    description: "Furniture and decor to refresh your home.",
    icon: "home",
    isActive: true,
    sortOrder: 2,
    createdAt: new Date("2024-08-05T00:00:00Z"),
  },
  {
    id: "mock-category-vehicles",
    name: "Vehicles",
    nameAr: "مركبات",
    nameKu: "ئۆتۆمبێل",
    description: "Cars, motorcycles, and transportation gear.",
    icon: "car",
    isActive: true,
    sortOrder: 3,
    createdAt: new Date("2024-08-10T00:00:00Z"),
  },
];
