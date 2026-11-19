"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "confirm" ? "That confirmation link is invalid or expired. Try signing in." : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = getSupabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setInfo("Check your email for a confirmation link, then come back and sign in.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to continue studying."
              : "Your materials, notes and progress are saved to your account."}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10"
              />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            {info && <p className="text-sm text-success" role="status">{info}</p>}
            <Button type="submit" className="h-10 w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to RecallAI?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setInfo(null);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
      <aside className="hidden border-l bg-muted/40 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md space-y-8">
          <p className="text-sm font-medium text-primary">How RecallAI works</p>
          {[
            ["Upload your school PDFs", "Text or scanned, in English or Bahasa Indonesia."],
            ["Get a focused revision guide", "Definitions, key ideas and common mix-ups, each linked to its page."],
            ["Test yourself", "Quizzes that explain every mistake and adapt to your weak topics."],
          ].map(([title, body], i) => (
            <div key={title} className="flex gap-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background text-sm font-medium">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}
