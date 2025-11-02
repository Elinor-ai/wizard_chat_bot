"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { useUser } from "../../components/user-context";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/wizard", label: "Job Wizard" },
  { href: "/assets", label: "Assets" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/credits", label: "Credits" }
];

export default function DashboardLayout({ children }) {
  const { user, setUser, isHydrated } = useUser();
  const { data: session, status } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  // Sync OAuth session with user context
  useEffect(() => {
    if (session?.user && !user) {
      console.log("Dashboard: Syncing session user to context:", session.user);
      setUser(session.user);
    }
  }, [session, user, setUser]);

  // Use session user as fallback if user context is empty
  const displayUser = user || session?.user;
  const isLoading = status === "loading" || !isHydrated;

  const handleSignOut = async () => {
    setUser(null);
    await signOut({ callbackUrl: "/" });
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUserMenu]);

  return (
    <div className="flex min-h-screen bg-neutral-100">
      <aside className="hidden w-72 flex-col border-r border-neutral-200 bg-white px-6 py-8 md:flex">
        <h1 className="text-lg font-semibold text-primary-700">
          Wizard Console
        </h1>
        <nav className="mt-8 flex flex-col gap-1 text-sm font-medium text-neutral-600">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 transition hover:bg-primary-50 hover:text-primary-600"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-500">
          <p className="font-semibold text-neutral-700">Runbook</p>
          <p>Standard operating procedures are auto-generated per job.</p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Top header with user menu */}
        <header className="border-b border-neutral-200 bg-white px-4 py-3 md:px-10">
          <div className="flex items-center justify-end">
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2">
                <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-200"></div>
                <div className="h-4 w-24 animate-pulse rounded bg-neutral-200"></div>
              </div>
            ) : displayUser ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                    {displayUser.profile?.name?.[0]?.toUpperCase() || displayUser.auth?.email?.[0]?.toUpperCase() || "U"}
                  </div>
                  <span>{displayUser.profile?.name || displayUser.auth?.email}</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-200 bg-white shadow-lg z-10">
                    <div className="border-b border-neutral-100 px-4 py-3">
                      <p className="text-sm font-semibold text-neutral-900">{displayUser.profile?.name}</p>
                      <p className="text-xs text-neutral-500">{displayUser.auth?.email}</p>
                      {displayUser.profile?.companyName && (
                        <p className="mt-1 text-xs text-neutral-400">{displayUser.profile.companyName}</p>
                      )}
                    </div>
                    <div className="p-2">
                      <Link
                        href="/"
                        className="block rounded-lg px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                        onClick={() => setShowUserMenu(false)}
                      >
                        Home
                      </Link>
                      <Link
                        href="/dashboard"
                        className="block rounded-lg px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                        onClick={() => setShowUserMenu(false)}
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/settings"
                        className="block rounded-lg px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                        onClick={() => setShowUserMenu(false)}
                      >
                        Settings
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-primary-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-primary-500"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-10">{children}</main>
      </div>
    </div>
  );
}
