"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Images,
  Target,
  Coins,
  Menu,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { clsx } from "../../lib/cn";
import { useUser } from "../../components/user-context";

const navItems = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
  { href: "/wizard", label: "Job Wizard", Icon: Sparkles },
  { href: "/assets", label: "Assets", Icon: Images },
  { href: "/campaigns", label: "Campaigns", Icon: Target },
  { href: "/credits", label: "Credits", Icon: Coins }
];

export default function DashboardLayout({ children }) {
  const { user, setUser, isHydrated } = useUser();
  const { data: session, status } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

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
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-neutral-200 bg-white px-6 py-8 shadow-xl transition-all duration-200 md:static md:z-auto md:flex md:translate-x-0 md:shadow-none",
          isSidebarCollapsed ? "md:w-20 md:px-3" : "md:w-72 md:px-6",
          isMobileMenuOpen ? "translate-x-0" : ""
        )}
      >
        <div className="flex items-center justify-between">
          {!isSidebarCollapsed ? (
            <h1 className="text-lg font-semibold text-primary-700">
              Wizard Console
            </h1>
          ) : (
            <span className="text-lg font-semibold text-primary-700">✨</span>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close navigation"
              className="inline-flex rounded-full border border-neutral-200 p-2 text-neutral-500 transition hover:border-primary-200 hover:text-primary-600 md:hidden"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSidebarCollapsed((prev) => !prev);
                setIsMobileMenuOpen(false);
              }}
              aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              className="hidden rounded-full border border-neutral-200 p-2 text-neutral-500 transition hover:border-primary-200 hover:text-primary-600 md:inline-flex"
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-1 text-sm font-medium text-neutral-600">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl py-2 transition hover:bg-primary-50 hover:text-primary-600",
                isSidebarCollapsed ? "justify-center px-2" : "px-3",
                pathname === item.href ? "bg-primary-50 text-primary-600" : ""
              )}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <item.Icon className="h-5 w-5" />
              <span
                className={clsx(
                  "transition-opacity duration-150",
                  isSidebarCollapsed ? "hidden" : "block"
                )}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </nav>

        {!isSidebarCollapsed ? (
          <div className="mt-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-500">
            <p className="font-semibold text-neutral-700">Runbook</p>
            <p>Standard operating procedures are auto-generated per job.</p>
          </div>
        ) : null}
      </aside>

      {isMobileMenuOpen ? (
        <div
          role="presentation"
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      ) : null}

      <div className="flex flex-1 flex-col">
        {/* Top header with user menu */}
        <header className="border-b border-neutral-200 bg-white px-4 py-3 md:px-10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-primary-200 hover:text-primary-600 md:hidden"
              aria-label={isMobileMenuOpen ? "Hide navigation" : "Show navigation"}
            >
              <Menu className="h-5 w-5" />
              <span>{isMobileMenuOpen ? "Hide menu" : "Show menu"}</span>
            </button>

            <div className="flex flex-1 justify-end">
              {isLoading ? (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-200" />
                  <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
                </div>
              ) : displayUser ? (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowUserMenu((prev) => !prev)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                      {displayUser.profile?.name?.[0]?.toUpperCase() ||
                        displayUser.auth?.email?.[0]?.toUpperCase() ||
                        "U"}
                    </div>
                    <span>{displayUser.profile?.name || displayUser.auth?.email}</span>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showUserMenu ? (
                    <div className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-200 bg-white shadow-lg">
                      <div className="border-b border-neutral-100 px-4 py-3">
                        <p className="text-sm font-semibold text-neutral-900">
                          {displayUser.profile?.name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {displayUser.auth?.email}
                        </p>
                        {displayUser.profile?.companyName ? (
                          <p className="mt-1 text-xs text-neutral-400">
                            {displayUser.profile.companyName}
                          </p>
                        ) : null}
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
                  ) : null}
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
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-10">{children}</main>
      </div>
    </div>
  );
}
