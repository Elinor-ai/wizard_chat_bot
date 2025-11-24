"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, ShieldCheck, Sparkles, CreditCard } from "lucide-react";
import { SubscriptionApi, UsersApi } from "../../../lib/api-client";
import { useUser } from "../../../components/user-context";
import Link from "next/link";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const creditsFormatter = new Intl.NumberFormat("en-US");

function formatCredits(value = 0) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return creditsFormatter.format(Math.round(value));
}

const initialPayment = {
  cardholder: "",
  cardNumber: "",
  expiry: "",
  cvc: "",
  postalCode: "",
};

export default function PricingPage() {
  const { user, setUser } = useUser();
  const authToken = user?.authToken ?? null;

  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingPurchase, setLoadingPurchase] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [payment, setPayment] = useState(initialPayment);

  useEffect(() => {
    let active = true;

    async function loadPlans() {
      setLoadingPlans(true);
      setError(null);
      try {
        const response = await SubscriptionApi.listPlans();
        if (!active) return;
        setPlans(response.plans);
        if (response.plans.length > 0) {
          setSelectedPlanId(response.plans[0].id);
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message ?? "Failed to load subscription plans.");
      } finally {
        if (active) {
          setLoadingPlans(false);
        }
      }
    }

    loadPlans();
    return () => {
      active = false;
    };
  }, []);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  const handlePaymentChange = (event) => {
    const { name, value } = event.target;
    setPayment((prev) => ({ ...prev, [name]: value }));
  };

  const handlePurchase = async (event) => {
    event.preventDefault();
    if (!selectedPlan) {
      return;
    }
    if (!authToken) {
      setError("Please sign in to purchase credits.");
      return;
    }
    setLoadingPurchase(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await SubscriptionApi.purchasePlan(
        {
          planId: selectedPlan.id,
          payment,
        },
        { authToken }
      );
      if (response.user) {
        setUser({ ...response.user, authToken });
      } else {
        const refreshed = await UsersApi.fetchCurrentUser({ authToken });
        setUser({ ...refreshed, authToken });
      }
      setPayment(initialPayment);
      setSuccess(
        `Added ${formatCredits(selectedPlan.totalCredits)} credits via ${selectedPlan.name}.`
      );
    } catch (err) {
      setError(err?.message ?? "Unable to complete purchase.");
    } finally {
      setLoadingPurchase(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 via-white to-white">
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="text-center">
          <p className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary-600">
            Credits & plans
          </p>
          <h1 className="mt-6 text-4xl font-bold text-neutral-900">
            Flexible bundles for every recruiting team.
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-neutral-600">
            Credits meter every workflow—refinements, channel recommendations, assets, and hero
            imagery. Pick the package that matches your hiring intensity and keep unused credits
            rolling forward.
          </p>
        </div>

        <div className="mt-12 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
                <Coins className="h-7 w-7 text-primary-600" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-neutral-900">Subscription bundles</h2>
                <p className="text-sm text-neutral-600">
                  Same UI you&apos;ll see inside the product—compare plans in detail before signing up.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
              Credits unlock channels, LLM usage, hero images, and assets.
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            {loadingPlans && plans.length === 0 ? (
              <div className="col-span-3 rounded-2xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
                Loading plans…
              </div>
            ) : (
              plans.map((plan) => {
                const isActive = plan.id === selectedPlanId;
                const perCredit =
                  typeof plan.effectiveUsdPerCredit === "number"
                    ? plan.effectiveUsdPerCredit.toFixed(4)
                    : null;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setSuccess(null);
                      setError(null);
                    }}
                    className={`text-left rounded-2xl border p-5 transition shadow-sm ${
                      isActive
                        ? "border-primary-500 bg-primary-50/70 ring-2 ring-primary-100"
                        : "border-neutral-200 bg-white hover:border-primary-200 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          {plan.headline || "Plan"}
                        </p>
                        <h3 className="text-lg font-semibold text-neutral-900">{plan.name}</h3>
                      </div>
                      {plan.badge ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          {plan.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-3xl font-bold text-neutral-900">
                      {currencyFormatter.format(plan.priceUsd)}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {formatCredits(plan.totalCredits)} credits
                      {perCredit ? ` · $${perCredit} per credit` : null}
                    </p>
                    <p className="mt-4 text-sm text-neutral-600">{plan.description}</p>
                    <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                      <li className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary-500" />
                        Includes {formatCredits(plan.credits)} purchased + {formatCredits(plan.bonusCredits)} bonus
                      </li>
                      {plan.bestFor ? (
                        <li className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-amber-500" />
                          {plan.bestFor}
                        </li>
                      ) : null}
                    </ul>
                  </button>
                );
              })
            )}
          </div>

          {selectedPlan ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-5">
                <h3 className="text-lg font-semibold text-neutral-900">What&apos;s included</h3>
                <p className="mt-1 text-sm text-neutral-600">{selectedPlan.headline}</p>
                <div className="mt-6 space-y-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Credits added
                    </p>
                    <p className="text-3xl font-bold text-neutral-900">
                      {formatCredits(selectedPlan.totalCredits)}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {formatCredits(selectedPlan.credits)} purchase + {formatCredits(selectedPlan.bonusCredits)} bonus
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Extras
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                      {selectedPlan.perks.map((perk) => (
                        <li key={perk} className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-primary-500" />
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <form
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
                onSubmit={handlePurchase}
              >
                <div className="mb-4 flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-primary-500" />
                  <div>
                    <p className="text-base font-semibold text-neutral-900">Simulated payment</p>
                    <p className="text-xs text-neutral-500">
                      Enter card details and add credits without leaving this page.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Cardholder name
                    </label>
                    <input
                      type="text"
                      name="cardholder"
                      value={payment.cardholder}
                      onChange={handlePaymentChange}
                      className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      placeholder="Jamie recruiter"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Card number
                    </label>
                    <input
                      type="text"
                      name="cardNumber"
                      value={payment.cardNumber}
                      onChange={handlePaymentChange}
                      className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      placeholder="4242 4242 4242 4242"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Expiry
                      </label>
                      <input
                        type="text"
                        name="expiry"
                        value={payment.expiry}
                        onChange={handlePaymentChange}
                        className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                        placeholder="MM/YY"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        CVC
                      </label>
                      <input
                        type="text"
                        name="cvc"
                        value={payment.cvc}
                        onChange={handlePaymentChange}
                        className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                        placeholder="123"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Postal code
                      </label>
                      <input
                        type="text"
                        name="postalCode"
                        value={payment.postalCode}
                        onChange={handlePaymentChange}
                        className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                        placeholder="94107"
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                    Plan total: {currencyFormatter.format(selectedPlan.priceUsd)} ·{" "}
                    {formatCredits(selectedPlan.totalCredits)} credits
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!selectedPlan || loadingPurchase}
                  className="mt-5 w-full rounded-full bg-primary-600 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                >
                  {loadingPurchase
                    ? "Processing…"
                    : `Add ${formatCredits(selectedPlan.totalCredits)} credits`}
                </button>
                {!authToken ? (
                  <p className="mt-3 text-center text-xs text-neutral-500">
                    Please{" "}
                    <Link href="/login" className="text-primary-600 underline">
                      sign in
                    </Link>{" "}
                    to complete the purchase.
                  </p>
                ) : (
                  <p className="mt-3 text-center text-xs text-neutral-500">
                    Funds settle instantly. Credits can be shared across your workspace.
                  </p>
                )}
              </form>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
