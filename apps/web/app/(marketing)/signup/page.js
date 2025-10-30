"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useUser } from "../../../components/user-context";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function SignupPage() {
  const { setUser } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    companyName: "",
    email: "",
    password: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name,
          companyName: form.companyName
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Signup failed");
      }

      const data = await response.json();
      setUser(data.user);
      router.push("/");
    } catch (signupError) {
      setError(signupError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch (err) {
      setError("Google sign in failed");
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col gap-6 px-6 py-24">
      <h1 className="text-3xl font-bold text-neutral-900">Create your workspace</h1>
      <p className="text-sm text-neutral-600">
        Spin up a credit-metered Wizard environment for your team. New accounts
        start with $100 in platform credits to launch your first campaigns.
      </p>
      <div className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm shadow-neutral-100">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="flex items-center justify-center gap-3 rounded-xl border-2 border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign up with Google
        </button>

        <div className="relative flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-neutral-200"></div>
          <span className="text-xs text-neutral-500">OR</span>
          <div className="h-px flex-1 bg-neutral-200"></div>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Your name
            <input
              className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none focus:border-primary-500"
              type="text"
              placeholder="Ada Lovelace"
              value={form.name}
              onChange={handleChange("name")}
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Company
            <input
              className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none focus:border-primary-500"
              type="text"
              placeholder="Wizard Labs"
              value={form.companyName}
              onChange={handleChange("companyName")}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Work Email
            <input
              className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none focus:border-primary-500"
              type="email"
              placeholder="you@wizardlabs.com"
              value={form.email}
              onChange={handleChange("email")}
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Password
            <input
              className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none focus:border-primary-500"
              type="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={handleChange("password")}
              minLength={8}
              required
            />
          </label>
          {error ? (
            <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
          >
            {isSubmitting ? "Creating account…" : "Sign Up"}
          </button>
        </form>
      </div>
      <p className="text-center text-sm text-neutral-600">
        Already have access?{" "}
        <Link href="/login" className="font-semibold text-primary-600">
          Sign in
        </Link>
      </p>
    </section>
  );
}
