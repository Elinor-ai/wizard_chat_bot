'use client';

import { CreditCard, Calendar, Users, DollarSign, FileText, MapPin, ExternalLink, Crown } from 'lucide-react';

export default function BillingSection({ user }) {
  const getPlanBadge = (planId) => {
    const badges = {
      free: { color: 'bg-neutral-200 text-neutral-700', icon: null },
      starter: { color: 'bg-blue-100 text-blue-700', icon: null },
      pro: { color: 'bg-purple-100 text-purple-700', icon: Crown },
      enterprise: { color: 'bg-amber-100 text-amber-700', icon: Crown },
    };
    const badge = badges[planId] || badges.free;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${badge.color}`}>
        {Icon && <Icon className="h-3 w-3" />}
        {planId}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const badges = {
      trial: { color: 'bg-blue-100 text-blue-700', text: 'Trial' },
      active: { color: 'bg-emerald-100 text-emerald-700', text: 'Active' },
      past_due: { color: 'bg-red-100 text-red-700', text: 'Past Due' },
      canceled: { color: 'bg-neutral-200 text-neutral-700', text: 'Canceled' },
    };
    const badge = badges[status] || badges.trial;
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
            <CreditCard className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Subscription & Billing</h2>
            <p className="text-sm text-neutral-600">Manage your plan and payment details</p>
          </div>
        </div>
      </div>

      {/* Current Plan Card */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Current Plan
            </p>
            <div className="flex items-center gap-2">
              {getPlanBadge(user?.plan?.planId)}
              {getStatusBadge(user?.plan?.status)}
            </div>
          </div>
          <button className="flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-primary-500">
            <Crown className="h-4 w-4" />
            Upgrade Plan
          </button>
        </div>

        {/* Plan Details Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Seats */}
          <div className="flex items-center gap-3 rounded-xl bg-white p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">Team Seats</p>
              <p className="text-lg font-semibold text-neutral-900">{user?.plan?.seatCount || 1}</p>
            </div>
          </div>

          {/* Currency */}
          <div className="flex items-center gap-3 rounded-xl bg-white p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">Currency</p>
              <p className="text-lg font-semibold text-neutral-900">{user?.plan?.currency || 'USD'}</p>
            </div>
          </div>

          {/* Trial End */}
          {user?.plan?.trialEndsAt && (
            <div className="flex items-center gap-3 rounded-xl bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">Trial Ends</p>
                <p className="text-sm font-semibold text-neutral-900">
                  {formatDate(user.plan.trialEndsAt)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Entitlements */}
        {user?.plan?.entitlements && Object.keys(user.plan.entitlements).length > 0 && (
          <div className="mt-4 border-t border-neutral-200 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Plan Features
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries(user.plan.entitlements).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary-600"></div>
                  <span className="text-neutral-700">
                    {key.replace(/([A-Z])/g, ' $1').trim()}:
                  </span>
                  <span className="font-semibold text-neutral-900">
                    {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Billing Information */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Billing Information
        </h3>

        {/* Invoice Email */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <FileText className="h-3 w-3" />
            Invoice Email
          </label>
          <input
            type="email"
            value={user?.billing?.invoiceEmail || user?.auth?.email || ''}
            disabled
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500"
          />
        </div>

        {/* Payment Method */}
        {user?.billing?.paymentMethodLast4 && (
          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <CreditCard className="h-3 w-3" />
              Payment Method
            </label>
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-12 items-center justify-center rounded bg-gradient-to-br from-neutral-700 to-neutral-900 text-xs font-bold text-white">
                  CARD
                </div>
                <span className="text-sm text-neutral-700">
                  •••• •••• •••• {user.billing.paymentMethodLast4}
                </span>
              </div>
              <button className="text-xs font-semibold text-primary-600 hover:text-primary-700">
                Update
              </button>
            </div>
          </div>
        )}

        {/* Billing Address */}
        {user?.billing?.address && (
          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <MapPin className="h-3 w-3" />
              Billing Address
            </label>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
              {user.billing.address.line1 && <p>{user.billing.address.line1}</p>}
              {user.billing.address.line2 && <p>{user.billing.address.line2}</p>}
              <p>
                {user.billing.address.city}, {user.billing.address.state} {user.billing.address.zip}
              </p>
              <p>{user.billing.address.country}</p>
            </div>
          </div>
        )}

        {/* Tax ID */}
        {user?.billing?.taxId && (
          <div>
            <label className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Tax ID / VAT Number
            </label>
            <input
              type="text"
              value={user.billing.taxId}
              disabled
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500"
            />
          </div>
        )}

        {/* Billing Cycle Anchor */}
        {user?.billing?.billingCycleAnchor && (
          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <Calendar className="h-3 w-3" />
              Next Billing Date
            </label>
            <input
              type="text"
              value={formatDate(user.billing.billingCycleAnchor)}
              disabled
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500"
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3 border-t border-neutral-200 pt-6">
        <button className="flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-700 transition-colors hover:border-primary-600 hover:text-primary-600">
          <FileText className="h-4 w-4" />
          View Invoices
        </button>
        <button className="flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-700 transition-colors hover:border-primary-600 hover:text-primary-600">
          <ExternalLink className="h-4 w-4" />
          Billing Portal
        </button>
      </div>
    </div>
  );
}
