import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

import { AuthProvider } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: () => (
    <AuthProvider>
      <AuthPage />
    </AuthProvider>
  ),
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (session) return <Navigate to="/" />;

  const signIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")), password: String(fd.get("password")),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/" });
  };

  const signUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: String(fd.get("name")), company: String(fd.get("company")) },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Signing you in…");
    navigate({ to: "/" });
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("Google sign-in failed"); setBusy(false); return; }
    if (result.redirected) return;
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-gradient-to-br from-primary/5 to-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary-foreground/10 flex items-center justify-center"><Boxes className="h-6 w-6" /></div>
          <div><div className="text-lg font-semibold">Nexus ERP</div><div className="text-xs opacity-70 uppercase tracking-wider">Enterprise Suite</div></div>
        </div>
        <div className="space-y-6">
          <h1 className="text-4xl font-semibold leading-tight">One platform.<br/>Every business process.</h1>
          <p className="text-primary-foreground/80 max-w-md">CRM, sales, inventory, manufacturing and accounting — unified in a secure multi-tenant cloud built for enterprises.</p>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li>• Tenant-isolated data with row-level security</li>
            <li>• Role-based access across every module</li>
            <li>• Real-time dashboards for every department</li>
          </ul>
        </div>
        <div className="text-xs opacity-60">© {new Date().getFullYear()} Nexus ERP</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto h-10 w-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center mb-2 lg:hidden"><Boxes className="h-6 w-6" /></div>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create your workspace to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full mb-4" disabled={busy} onClick={google}>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Continue with Google
            </Button>
            <div className="relative my-4"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div></div>

            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="signin">Sign in</TabsTrigger><TabsTrigger value="signup">Sign up</TabsTrigger></TabsList>

              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-3 mt-4">
                  <div><Label htmlFor="si-email">Email</Label><Input id="si-email" name="email" type="email" required autoComplete="email" /></div>
                  <div><Label htmlFor="si-pw">Password</Label><Input id="si-pw" name="password" type="password" required autoComplete="current-password" /></div>
                  <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in</Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-3 mt-4">
                  <div><Label htmlFor="su-name">Full name</Label><Input id="su-name" name="name" required /></div>
                  <div><Label htmlFor="su-company">Company / Workspace name</Label><Input id="su-company" name="company" required /></div>
                  <div><Label htmlFor="su-email">Work email</Label><Input id="su-email" name="email" type="email" required autoComplete="email" /></div>
                  <div><Label htmlFor="su-pw">Password</Label><Input id="su-pw" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
                  <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create workspace</Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
