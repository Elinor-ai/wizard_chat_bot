"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "../../../components/user-context";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const devBypass = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";
  const { setUser } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    name: "",
    companyName: ""
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
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          name: form.name || form.email.split("@")[0],
          companyName: form.companyName
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Login failed");
      }

      const data = await response.json();
      setUser(data.user);
      router.push("/dashboard");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col gap-6 px-6 py-24">
      <h1 className="text-3xl font-bold text-neutral-900">Welcome back</h1>
      <p className="text-sm text-neutral-600">
        Wizard centralizes every recruiting workflow. Sign in to continue
        building campaigns, assets, and interview plans.
      </p>
      <form
        className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm shadow-neutral-100"
        onSubmit={handleSubmit}
      >
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
            placeholder="talent@company.com"
            value={form.email}
            onChange={handleChange("email")}
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
          className="mt-2 rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
        >
          {isSubmitting ? "Signing in…" : "Log In"}
        </button>
      </form>
      <p className="text-center text-sm text-neutral-600">
        Need an account?{" "}
        <Link href="/signup" className="font-semibold text-primary-600">
          Start your trial
        </Link>
      </p>
      {devBypass ? (
        <p className="text-center text-xs text-neutral-400">
          Dev mode:{" "}
          <Link href="/wizard" className="font-semibold text-primary-600">
            Skip login and open console
          </Link>
        </p>
      ) : null}
    </section>
  );
}
