import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">
        R
      </span>
      <span>RecallAI</span>
    </Link>
  );
}
