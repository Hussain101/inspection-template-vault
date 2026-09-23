import { Link, useRouter } from "@tanstack/react-router";
import { ClipboardList, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader({ email }: { email?: string | null | undefined }) {
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    await router.navigate({ to: "/auth" });
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList className="size-4" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight">Template Vault</span>
        </Link>
        <div className="flex items-center gap-3">
          {email ? <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span> : null}
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
