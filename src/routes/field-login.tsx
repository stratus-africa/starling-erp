import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2, MapPin, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/field-login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Field Sales" },
      { name: "description", content: "Sign in to the Field Sales app to manage customers, quotes, orders and payments on the go." },
      { property: "og:title", content: "Sign in — Field Sales" },
      { property: "og:description", content: "Sign in to the Field Sales app on your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: () => (
    <AuthProvider>
      <FieldLogin />
    </AuthProvider>
  ),
});

function FieldLogin() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  if (loading) return <div className="flex h-[100dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (session) return <Navigate to="/field" replace />;

  const signIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/field", replace: true });
  };

  const google = async () => {
    setBusy(true);
    sessionStorage.setItem("post-login-path", "/field");
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/field-login` });
    if (result.error) { toast.error("Google sign-in failed"); setBusy(false); return; }
    if (result.redirected) return;
    navigate({ to: "/field", replace: true });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-primary text-primary-foreground">
      <div className="flex flex-1 flex-col justify-end px-6 pb-8 pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/15">
          <MapPin className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold leading-tight">Field Sales</h1>
        <p className="mt-2 text-sm text-primary-foreground/80">Customers, quotes, orders and payments — wherever you are, even with no signal.</p>
      </div>
      <div className="rounded-t-[2rem] bg-background px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 text-foreground">
        {offline && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <WifiOff className="h-4 w-4" /> You need a connection to sign in the first time.
          </div>
        )}
        <form onSubmit={signIn} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fl-email">Email</Label>
            <Input id="fl-email" name="email" type="email" inputMode="email" autoComplete="email" required className="h-12 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fl-pw">Password</Label>
            <Input id="fl-pw" name="password" type="password" autoComplete="current-password" required className="h-12 text-base" />
          </div>
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in
          </Button>
        </form>
        <Button variant="outline" className="mt-3 h-12 w-full text-base" disabled={busy} onClick={google}>Continue with Google</Button>
        <p className="mt-6 text-center text-xs text-muted-foreground">Use the same account as the office app. Your administrator controls what you can see.</p>
      </div>
    </div>
  );
}
