"use client";
import Link from "next/link";

const Nav = () => {
  return (
    <nav className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-8">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-sm font-bold text-sky-700 shadow-sm">
          D
        </div>

        <span className="text-lg font-semibold tracking-tight text-white drop-shadow-sm">
          DB_Chat
        </span>
      </div>

      <div className="hidden items-center gap-8 text-sm font-medium text-white/90 md:flex">
        <Link href="/features" className="transition hover:text-white">
          Features
        </Link>

        <Link href="/pricing" className="transition hover:text-white">
          Pricing
        </Link>

        <Link href="/docs" className="transition hover:text-white">
          Docs
        </Link>

      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="hidden text-sm font-medium text-white/90 transition hover:text-white sm:block"
        >
          Sign in
        </Link>

        <Link
          href="/dashboard"
          className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-sky-700 shadow-md transition hover:bg-white/90"
        >
          Get started
        </Link>
      </div>
    </nav>
  );
};

export default Nav;