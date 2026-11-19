import { AppHeader } from "@/components/app-header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main>{children}</main>
    </div>
  );
}
