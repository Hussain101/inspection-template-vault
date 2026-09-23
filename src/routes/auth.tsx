import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

/** Map Supabase AuthError codes and messages to clear plain-English copy. */
function supabaseErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Something went wrong. Please try again.";

  const errObj = error as Record<string, unknown>;
  const code = errObj["code"] as string | undefined;
  const message = errObj["message"] as string | undefined;

  switch (code) {
    case "weak_password":
      return "That password is too weak or easy to guess. Please choose a stronger password (at least 6 characters with numbers or symbols).";
    case "email_exists":
    case "user_already_exists":
      return "An account with that email already exists. Click 'Already have an account? Sign in' below.";
    case "invalid_credentials":
      return "Incorrect email or password. Please check your credentials and try again.";
    case "email_not_confirmed":
      return "Please confirm your email address before signing in. Check your inbox or turn off email confirmation in Supabase.";
    case "user_not_found":
      return "No account found for that email address. Click 'Create one' below.";
    case "over_email_send_rate_limit":
      return "Too many requests sent. Please wait a minute before trying again.";
    case "invalid_email":
      return "That doesn't look like a valid email address.";
    case "signup_disabled":
      return "New sign-ups are currently disabled. Please contact support.";
    case "session_not_found":
    case "refresh_token_not_found":
      return "Your session expired. Please sign in again.";
    default:
      if (message && message.length > 0) return message;
      return "Something went wrong. Please try again.";
  }
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | Template Vault" },
      {
        name: "description",
        content: "Sign in to import, edit and duplicate your home inspection templates.",
      },
      { property: "og:title", content: "Sign in | Template Vault" },
      {
        property: "og:description",
        content: "Sign in to import, edit and duplicate your home inspection templates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).max(72),
});

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/dashboard" });
    });
  }, [router]);

  const toggleMode = () => {
    setFormError(null);
    setMode(mode === "signin" ? "signup" : "signin");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Please check your details";
      setFormError(msg);
      toast.error(msg);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        if (!data.session) {
          toast.info("Account created! Check your inbox to confirm your email, then sign in.");
          setMode("signin");
          return;
        }
        toast.success("Account created! Welcome to Template Vault.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
      }
      await router.navigate({ to: "/dashboard" });
    } catch (error) {
      const msg = supabaseErrorMessage(error);
      setFormError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList className="size-4" />
          </span>
          <span className="font-display text-base font-bold">Template Vault</span>
        </Link>

        <div className="panel p-6">
          <h1 className="text-xl font-bold">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your templates stay private to your account.
          </p>

          {formError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                maxLength={255}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (formError) setFormError(null);
                }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  maxLength={72}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-6 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={toggleMode}
          >
            {mode === "signin"
              ? "No account yet? Create one"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
