'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Coins, ShieldCheck, CreditCard, CheckCircle2, Sparkles } from 'lucide-react';
import { SubscriptionApi, UsersApi } from '../../lib/api-client';
import { useUser } from '../user-context';

const initialPayment = {
  cardholder: '',
  cardNumber: '',
  expiry: '',
  cvc: '',
  postalCode: ''
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

const creditsFormatter = new Intl.NumberFormat('en-US');

function formatCredits(value = 0) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return creditsFormatter.format(Math.round(value));
}

export default function SubscriptionSection({ user }) {
  const { setUser } = useUser();
  const queryClient = useQueryClient();
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingPurchase, setLoadingPurchase] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [payment, setPayment] = useState(initialPayment);

  const authToken = user?.authToken;
  const creditsSnapshot = user?.credits ?? { balance: 0, reserved: 0, lifetimeUsed: 0 };

  useEffect(() => {
    if (!authToken) {
      return;
    }
    let isMounted = true;
    async function loadPlans() {
      setLoadingPlans(true);
      setError(null);
      try {
        const response = await SubscriptionApi.listPlans({ authToken });
        if (!isMounted) return;
        setPlans(response.plans);
        if (response.plans.length > 0) {
          setSelectedPlanId(response.plans[0].id);
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err.message ?? 'Failed to load plans.');
      } finally {
        if (isMounted) {
          setLoadingPlans(false);
        }
      }
    }
    loadPlans();
    return () => {
      isMounted = false;
    };
  }, [authToken]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  const planCards = plans.map((plan) => {
    const isActive = selectedPlanId === plan.id;
    const perCredit =
      typeof plan.effectiveUsdPerCredit === 'number'
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
            ? 'border-primary-500 bg-primary-50/60 ring-2 ring-primary-200'
            : 'border-neutral-200 bg-white hover:border-primary-200 hover:shadow-md'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {plan.headline || 'Plan'}
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
            <CheckCircle2 className="h-4 w-4 text-primary-500" />
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
  });

  const canSubmit = Boolean(selectedPlan);

  const handlePaymentChange = (event) => {
    const { name, value } = event.target;
    setPayment((prev) => ({ ...prev, [name]: value }));
  };

  const handlePurchase = async (event) => {
    event.preventDefault();
    if (!selectedPlan || !canSubmit || !authToken) {
      return;
    }
    setLoadingPurchase(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        planId: selectedPlan.id,
        payment
      };
      const response = await SubscriptionApi.purchasePlan(payload, { authToken });
      if (response.user) {
        setUser({ ...response.user, authToken });
      } else if (response.credits && user) {
        const mergedUser = {
          ...user,
          credits: response.credits,
          usage: {
            ...(user.usage ?? {}),
            ...(response.usage ?? {})
          }
        };
        setUser(mergedUser);
      }
      if (authToken) {
        try {
          const refreshed = await UsersApi.fetchCurrentUser({ authToken });
          setUser({ ...refreshed, authToken });
        } catch (refreshError) {
          // eslint-disable-next-line no-console
          console.warn("Failed to refresh user after purchase", refreshError);
        }
      }
      if (authToken) {
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary", authToken] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-ledger", authToken] });
      }
      setPayment(initialPayment);
      setSuccess(
        `Added ${formatCredits(selectedPlan.totalCredits)} credits via ${selectedPlan.name}.`
      );
    } catch (err) {
      setError(err.message ?? 'Unable to complete purchase.');
    } finally {
      setLoadingPurchase(false);
    }
  };

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50">
            <Coins className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Subscription & Credits</h2>
            <p className="text-sm text-neutral-600">
              Choose a credit bundle and simulate checkout. No cards are charged in this environment.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
          Balance: {formatCredits(creditsSnapshot.balance - creditsSnapshot.reserved)} available ·{' '}
          {formatCredits(creditsSnapshot.reserved)} reserved
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
        {loadingPlans && planCards.length === 0 ? (
          <div className="col-span-3 rounded-2xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
            Loading plans...
          </div>
        ) : (
          planCards
        )}
      </div>

      {selectedPlan ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-5">
            <h3 className="text-lg font-semibold text-neutral-900">What's included</h3>
            <p className="mt-1 text-sm text-neutral-600">{selectedPlan.headline}</p>
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Credits Added
                </p>
                <p className="text-3xl font-bold text-neutral-900">
                  {formatCredits(selectedPlan.totalCredits)}
                </p>
                <p className="text-sm text-neutral-600">
                  {formatCredits(selectedPlan.credits)} purchase + {formatCredits(selectedPlan.bonusCredits)} bonus credits
                </p>
              </div>
              <div className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
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
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary-500" />
              <div>
                <p className="text-base font-semibold text-neutral-900">Simulated payment</p>
                <p className="text-xs text-neutral-500">Enter any card details to credit your account.</p>
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
                  autoComplete="cc-name"
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
                  autoComplete="cc-number"
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
                    autoComplete="cc-exp"
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
                    autoComplete="cc-csc"
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
                    autoComplete="postal-code"
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={!canSubmit || loadingPurchase}
              className="mt-6 w-full rounded-full bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {loadingPurchase ? 'Processing...' : `Add ${formatCredits(selectedPlan.totalCredits)} credits`}
            </button>
            <p className="mt-2 text-center text-xs text-neutral-500">
              Funds settle instantly. Credits are shareable across the workspace.
            </p>
          </form>
        </div>
      ) : null}
    </div>
  );
}
