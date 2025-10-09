"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductSort } from "@/lib/services/products";

const conditionOptions = [
  { value: "", label: "All Conditions" },
  { value: "New", label: "New" },
  { value: "Used - Like New", label: "Used - Like New" },
  { value: "Used - Good", label: "Used - Good" },
  { value: "Used - Fair", label: "Used - Fair" },
];

const sortOptions: { value: ProductSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "views_desc", label: "Most Viewed" },
];

export interface ProductsFilterValues {
  search: string;
  category: string;
  condition: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  sort: ProductSort;
}

interface ProductsFilterBarProps {
  categories: { id: string; name: string }[];
  locations: string[];
  initialValues: ProductsFilterValues;
}

export function ProductsFilterBar({ categories, locations, initialValues }: ProductsFilterBarProps) {
  const [values, setValues] = useState<ProductsFilterValues>(initialValues);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const applyFilters = (nextValues: ProductsFilterValues) => {
    const params = new URLSearchParams();

    const trimmedSearch = nextValues.search.trim();
    if (trimmedSearch) {
      params.set("search", trimmedSearch);
    }

    if (nextValues.category) {
      params.set("category", nextValues.category);
    }

    if (nextValues.condition) {
      params.set("condition", nextValues.condition);
    }

    if (nextValues.location) {
      params.set("location", nextValues.location);
    }

    if (nextValues.minPrice) {
      params.set("minPrice", nextValues.minPrice);
    }

    if (nextValues.maxPrice) {
      params.set("maxPrice", nextValues.maxPrice);
    }

    if (nextValues.sort && nextValues.sort !== "newest") {
      params.set("sort", nextValues.sort);
    }

    const queryString = params.toString();

    startTransition(() => {
      router.replace(queryString ? `/products?${queryString}` : "/products", { scroll: true });
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyFilters(values);
  };

  const handleReset = () => {
    const reset: ProductsFilterValues = {
      search: "",
      category: "",
      condition: "",
      location: "",
      minPrice: "",
      maxPrice: "",
      sort: "newest",
    };
    setValues(reset);
    applyFilters(reset);
  };

  const handleImmediateChange = (partial: Partial<ProductsFilterValues>) => {
    const nextValues = { ...values, ...partial };
    setValues(nextValues);
    applyFilters(nextValues);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      <div className="lg:col-span-2">
        <Input
          value={values.search}
          onChange={(event) => setValues((prev) => ({ ...prev, search: event.target.value }))}
          placeholder="Search for products, brands, or keywords"
        />
      </div>

      <div>
        <Select
          value={values.category}
          onValueChange={(value) => handleImmediateChange({ category: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Select
          value={values.condition}
          onValueChange={(value) => handleImmediateChange({ condition: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any condition" />
          </SelectTrigger>
          <SelectContent>
            {conditionOptions.map((option) => (
              <SelectItem key={option.value || "all"} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Select
          value={values.location}
          onValueChange={(value) => handleImmediateChange({ location: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All cities</SelectItem>
            {locations.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="Min price"
          value={values.minPrice}
          onChange={(event) => setValues((prev) => ({ ...prev, minPrice: event.target.value }))}
        />
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="Max price"
          value={values.maxPrice}
          onChange={(event) => setValues((prev) => ({ ...prev, maxPrice: event.target.value }))}
        />
      </div>

      <div>
        <Select value={values.sort} onValueChange={(value) => handleImmediateChange({ sort: value as ProductSort })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end lg:col-span-2 xl:col-span-1">
        <Button type="submit" disabled={isPending}>
          Apply filters
        </Button>
        <Button type="button" variant="outline" onClick={handleReset} disabled={isPending}>
          Reset
        </Button>
      </div>
    </form>
  );
}



