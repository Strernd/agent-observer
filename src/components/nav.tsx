import Link from "next/link";
import type { ReactNode } from "react";

export function Nav() {
  return (
    <nav className="border-b border-gray-400 bg-background-100">
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-14">
        <Link
          href="/"
          className="font-semibold text-[15px] tracking-tight text-gray-1000"
        >
          Agent Observer
        </Link>
        <div className="flex items-center gap-1 text-[13px] text-gray-900">
          <NavLink href="/">Overview</NavLink>
          <NavLink href="/reports">Reports</NavLink>
          <NavLink href="/stats">Stats</NavLink>
          <NavLink href="/sessions">Sessions</NavLink>
          <NavLink href="/tickets">Tickets</NavLink>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center justify-center rounded-md px-3 text-[13px] text-gray-900 transition-colors hover:bg-gray-100"
    >
      {children}
    </Link>
  );
}
