"use client";

import { useState, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { useUser } from "../../components/user-context";
import Link from "next/link";
import { WizardLaunchTrigger } from "../../components/wizard/launch-wizard-trigger";
import { InterviewLaunchTrigger } from "../../components/golden-interview/interview-launch-trigger";

const highlights = [
  {
    title: "Need discovery to interview support",
    description:
      "Capture requirements, generate assets, launch campaigns, and prep hiring teams in one orchestrated flow."
  },
  {
    title: "Event-driven governance",
    description:
      "Every job action emits auditable events with credit metering, retries, and deterministic state transitions."
  },
  {
    title: "LLM-first orchestration",
    description:
      "Best-fit models per task, structured prompts, schema validation, and traceable outputs."
  }
];

export default function MarketingPage() {
  const { user, setUser, isHydrated } = useUser();
  const { data: session, status } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  // Sync OAuth session with user context
  useEffect(() => {
    if (session?.user) {
      const mergedUser = {
        ...session.user,
        authToken: session.accessToken ?? user?.authToken ?? null,
      };
      if (!user || user.id !== mergedUser.id || user.authToken !== mergedUser.authToken) {
        setUser(mergedUser);
      }
    } else if (!session?.user && user) {
      setUser(null);
    }
  }, [session, user, setUser]);

  // Use session user as fallback if user context is empty
  const fallbackSessionUser =
    session?.user && !user
      ? { ...session.user, authToken: session.accessToken ?? null }
      : session?.user;
  const displayUser = user || fallbackSessionUser;
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
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-neutral-100 to-white">
      <nav className="flex w-full items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold text-primary-700">
          Wizard Recruiting OS
        </span>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/pricing" className="hover:text-primary-600">
            Pricing
          </Link>
          <Link href="/contact" className="hover:text-primary-600">
            Contact
          </Link>

          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-9 w-28 animate-pulse rounded-full bg-neutral-200"></div>
              <div className="h-9 w-24 animate-pulse rounded-full bg-neutral-200"></div>
            </div>
          ) : displayUser ? (
            <>
              <InterviewLaunchTrigger>
                {({ onClick }) => (
                  <button
                    type="button"
                    onClick={onClick}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-5 py-2 text-white shadow-sm transition hover:bg-primary-700"
                  >
                    <span>✨</span>
                    Start AI Interview
                  </button>
                )}
              </InterviewLaunchTrigger>
              <WizardLaunchTrigger>
                {({ onClick }) => (
                  <button
                    type="button"
                    onClick={onClick}
                    className="rounded-full border border-primary-500 px-5 py-2 text-primary-600 transition hover:bg-primary-50"
                  >
                    Launch Wizard
                  </button>
                )}
              </WizardLaunchTrigger>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-2 transition hover:border-primary-500"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                    {displayUser.profile?.name?.[0]?.toUpperCase() || displayUser.auth?.email?.[0]?.toUpperCase() || displayUser.email?.[0]?.toUpperCase() || "U"}
                  </div>
                  <span className="text-sm">{displayUser.profile?.name || displayUser.auth?.email?.split("@")[0] || displayUser.email?.split("@")[0]}</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-neutral-200 bg-white shadow-lg z-10">
                    <div className="border-b border-neutral-100 px-4 py-3">
                      <p className="text-sm font-semibold text-neutral-900">{displayUser.profile?.name || displayUser.name}</p>
                      <p className="text-xs text-neutral-500">{displayUser.auth?.email || displayUser.email}</p>
                    </div>
                    <div className="p-2">
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
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-primary-500 px-5 py-2 text-primary-600 transition hover:bg-primary-50"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-primary-600 px-5 py-2 text-white shadow-lg shadow-primary-200 transition hover:bg-primary-500"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 pb-24 pt-16 text-center">
        <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-600">
          Full-funnel recruiting automation
        </span>
        <h1 className="mt-6 max-w-3xl text-5xl font-bold text-neutral-900">
          Orchestrate every hiring touchpoint with LLM-driven precision.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-neutral-600">
          Wizard coordinates your recruiting engine—needs analysis, job assets,
          publishing, attribution, screening, and interview support—powered by
          an event-driven, credit-metered backend.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-primary-200 transition hover:bg-primary-500"
          >
            Start Free Trial
          </Link>
          <Link
            href="/demo"
            className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-700 transition hover:border-primary-500 hover:text-primary-600"
          >
            Book Live Demo
          </Link>
        </div>
      </section>

      <section className="border-t border-neutral-200 bg-white py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 md:grid-cols-3">
          {highlights.map((highlight) => (
            <article
              key={highlight.title}
              className="rounded-3xl border border-neutral-200 bg-neutral-50 p-8 text-left shadow-sm shadow-neutral-100"
            >
              <h3 className="text-lg font-semibold text-neutral-900">
                {highlight.title}
              </h3>
              <p className="mt-3 text-sm text-neutral-600">
                {highlight.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
