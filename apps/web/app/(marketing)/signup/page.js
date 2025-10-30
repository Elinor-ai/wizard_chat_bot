"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "../../../components/user-context";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function SignupPage() {
  const { setUser } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    companyName: "",
    email: ""
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
      router.push("/dashboard");
    } catch (signupError) {
      setError(signupError.message);
    } finally {
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
            placeholder="you@wizardlabs.com"
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
          className="rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
        >
          {isSubmitting ? "Creating account…" : "Sign Up"}
        </button>
      </form>
      <p className="text-center text-sm text-neutral-600">
        Already have access?{" "}
        <Link href="/login" className="font-semibold text-primary-600">
          Sign in
        </Link>
      </p>
    </section>
  );
}
