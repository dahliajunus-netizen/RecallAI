"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ArrowLeft, BarChart3, BookOpen, FileText, ListChecks } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { fetchSubject, useLoad } from "@/lib/data";
import { cn } from "@/lib/utils";

export default function SubjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { data: subject, error } = useLoad(() => fetchSubject(id), [id]);

  const base = `/subjects/${id}`;
  const tabs = [
    { href: base, label: "Materials", icon: FileText, active: pathname === base },
    { href: `${base}/notes`, label: "Notes", icon: BookOpen, active: pathname.startsWith(`${base}/notes`) },
    { href: `${base}/quiz`, label: "Quiz", icon: ListChecks, active: pathname.startsWith(`${base}/quiz`) },
    { href: `${base}/progress`, label: "Progress", icon: BarChart3, active: pathname.startsWith(`${base}/progress`) },
  ];

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
        <p className="text-destructive">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <div className="pt-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Dashboard
        </Link>
        <h1 className="mt-2 min-h-9 text-2xl font-semibold tracking-tight sm:text-3xl">
          {subject ? subject.name : <Skeleton className="h-8 w-56" />}
        </h1>
      </div>
      <nav className="sticky top-14 z-20 -mx-4 mt-4 border-b bg-background/85 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors",
                  t.active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="size-4" />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="py-8">{children}</div>
    </div>
  );
}
