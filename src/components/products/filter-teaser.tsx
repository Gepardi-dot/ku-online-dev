"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
const classNames = (...values: (string | false | null | undefined)[]) => values.filter(Boolean).join(" ");

type FilterTeaserProps = {
  searchParams: {
    category?: string;
    condition?: string;
    location?: string;
    search?: string;
  };
  categories: { id: string; name: string }[];
  messages: {
    filterTeaserTitle?: string;
    filterTeaserSubtitle?: string;
    viewAll: string;
  };
};

const defaultMessages = {
  title: "Refine your search",
  subtitle: "Filter by category, condition, price, or city for sharper results.",
};

export function FilterTeaser({ searchParams, categories, messages }: FilterTeaserProps) {
  const pills = useMemo(() => {
    const items: { label: string; value: string; variant?: "default" | "secondary" }[] = [];

    if (searchParams.search) {
      items.push({ label: "Search", value: `"${searchParams.search}"`, variant: "default" });
    }

    if (searchParams.category) {
      const category = categories.find((item) => item.id === searchParams.category);
      items.push({ label: "Category", value: category?.name ?? "Selected", variant: "secondary" });
    }

    if (searchParams.condition) {
      items.push({ label: "Condition", value: searchParams.condition, variant: "secondary" });
    }

    if (searchParams.location) {
      items.push({ label: "City", value: searchParams.location, variant: "secondary" });
    }

    return items;
  }, [searchParams, categories]);

  const title = messages.filterTeaserTitle ?? defaultMessages.title;
  const subtitle = messages.filterTeaserSubtitle ?? defaultMessages.subtitle;

  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">{subtitle}</p>
          {pills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pills.map((pill) => (
                <Badge
                  key={`${pill.label}-${pill.value}`}
                  variant={pill.variant === "secondary" ? "secondary" : "default"}
                  className={classNames("px-3 py-1 text-xs font-medium", pill.variant === "secondary" && "bg-muted")}
                >
                  <span className="uppercase text-[10px] tracking-wide text-muted-foreground mr-2">{pill.label}</span>
                  <span className="text-sm text-foreground">{pill.value}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary hover:text-white">
            <Link href="/products">Open advanced filters</Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            Browse all search options such as price range, condition, and more.
          </span>
        </div>
      </div>
    </div>
  );
}
