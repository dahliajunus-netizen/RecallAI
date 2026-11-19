import { Logo } from "@/components/logo";

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Finish setting up RecallAI</h1>
      <p className="mt-2 text-muted-foreground">
        The server is missing its Supabase configuration. Copy <code>.env.example</code> to{" "}
        <code>.env.local</code>, fill in the values, run the SQL in{" "}
        <code>supabase/migrations/0001_init.sql</code>, and restart the server.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-xl bg-muted p-4 text-sm">
{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...`}
      </pre>
    </main>
  );
}
