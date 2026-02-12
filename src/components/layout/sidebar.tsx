'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  MessageSquare,
  Heart,
  User,
  Settings,
  PackagePlus,
  ChevronRight,
  Zap,
  Shirt,
  Armchair,
  Sparkles,
  HeartPulse,
  Bike,
  Book,
  MoreHorizontal
} from 'lucide-react';
import { Icons } from '@/components/icons';
import BrandLogo from '@/components/brand-logo';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { SPONSORS_CATEGORY_ID } from '@/data/category-ui-config';

type SidebarCategory = { id: string; name: string; icon?: string | null };

export default function AppSidebar() {
  const pathname = usePathname();
  const [isCategoriesOpen, setIsCategoriesOpen] = React.useState(true);
  const [categories, setCategories] = useState<SidebarCategory[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await supabase
          .from('categories')
          .select('id, name, icon')
          .eq('is_active', true)
          .neq('id', SPONSORS_CATEGORY_ID)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });
        if (!mounted) return;
        setCategories((data ?? []).map((row) => ({ id: row.id, name: row.name, icon: row.icon })));
      } catch (e) {
        // noop
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const isActive = (path: string) => pathname === path;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <header className="p-4 border-b">
        <Link href="/" className="flex items-center gap-2 font-semibold font-headline">
          <BrandLogo className="h-12 w-12" size={48} />
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <nav className="space-y-1">
          <Link href="/" className={cn("flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent", isActive('/') ? "bg-accent text-primary" : "text-muted-foreground")}>
            <Home className="h-5 w-5" />
            Marketplace
          </Link>
          <Link href="/messages" className={cn("flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent", isActive('/messages') ? "bg-accent text-primary" : "text-muted-foreground")}>
            <MessageSquare className="h-5 w-5" />
            Messages
            <Badge className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">3</Badge>
          </Link>
          <Link href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:bg-accent">
            <Heart className="h-5 w-5" />
            Favorites
          </Link>
        </nav>
        
        <Separator />

        <Collapsible open={isCategoriesOpen} onOpenChange={setIsCategoriesOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-2 font-semibold text-lg">
            Categories
            <ChevronRight className={cn("h-5 w-5 transition-transform", isCategoriesOpen && "rotate-90")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pl-4">
            {categories.map((category) => (
              <Link key={category.id} href={`/?category=${category.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:bg-accent">
                <span className="h-4 w-4 text-sm">
                  {category.icon ?? '🏷️'}
                </span>
                {category.name}
              </Link>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <footer className="p-4 mt-auto border-t">
         <Button asChild className="w-full mb-4 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/create-listing">
              <PackagePlus className="mr-2 h-4 w-4" />
              Create Listing
            </Link>
          </Button>
        <nav className="space-y-1">
          <Link href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:bg-accent">
            <User className="h-5 w-5" />
            My Account
          </Link>
          <Link href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:bg-accent">
            <Settings className="h-5 w-5" />
            Settings
          </Link>
        </nav>
      </footer>
    </div>
  );
}
