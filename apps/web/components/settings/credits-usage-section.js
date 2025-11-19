'use client';

import { Coins, TrendingUp, Briefcase, Image, Zap, Activity, Download } from 'lucide-react';

export default function CreditsUsageSection({ user }) {
  const credits = user?.credits || {};
  const usage = user?.usage || {};

  const availableCredits = (credits.balance || 0) - (credits.reserved || 0);
  const usagePercentage = credits.balance > 0
    ? ((credits.reserved / credits.balance) * 100).toFixed(1)
    : 0;

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toLocaleString() || '0';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return 'Yesterday';
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
            <Coins className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Credits & Usage</h2>
            <p className="text-sm text-neutral-600">Track your credit balance and platform usage</p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-amber-500">
          <Coins className="h-4 w-4" />
          Buy Credits
        </button>
      </div>

      {/* Credits Overview */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {/* Available Balance */}
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
            <Coins className="h-4 w-4" />
            Available
          </div>
          <p className="text-3xl font-bold text-emerald-700">{formatNumber(availableCredits)}</p>
          <p className="mt-1 text-xs text-neutral-600">
            {formatNumber(credits.balance)} total balance
          </p>
        </div>

        {/* Reserved */}
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
            <Activity className="h-4 w-4" />
            Reserved
          </div>
          <p className="text-3xl font-bold text-amber-700">{formatNumber(credits.reserved)}</p>
          <p className="mt-1 text-xs text-neutral-600">
            {usagePercentage}% of total balance
          </p>
        </div>

        {/* Lifetime Used */}
        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-purple-600">
            <TrendingUp className="h-4 w-4" />
            Lifetime Used
          </div>
          <p className="text-3xl font-bold text-purple-700">{formatNumber(credits.lifetimeUsed)}</p>
          <p className="mt-1 text-xs text-neutral-600">Since account creation</p>
        </div>
      </div>

      {/* Credit Balance Visualization */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Credit Allocation
          </p>
          <p className="text-xs text-neutral-600">
            {formatNumber(credits.balance)} total
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-2 h-4 overflow-hidden rounded-full bg-neutral-200">
          <div className="flex h-full">
            {/* Available (green) */}
            <div
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
              style={{ width: `${((availableCredits / credits.balance) * 100) || 0}%` }}
            ></div>
            {/* Reserved (amber) */}
            <div
              className="bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
              style={{ width: `${((credits.reserved / credits.balance) * 100) || 0}%` }}
            ></div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-emerald-600"></div>
            <span className="text-neutral-600">Available: {formatNumber(availableCredits)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-amber-600"></div>
            <span className="text-neutral-600">Reserved: {formatNumber(credits.reserved)}</span>
          </div>
        </div>
      </div>

      {/* Usage Statistics */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Platform Usage
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Jobs Created */}
          <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Briefcase className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-neutral-500">Jobs Created</p>
              <p className="text-2xl font-bold text-neutral-900">{usage.jobsCreated || 0}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-500">Avg. per job</p>
              <p className="text-sm font-semibold text-neutral-700">
                {usage.jobsCreated > 0
                  ? formatNumber(Math.round(credits.lifetimeUsed / usage.jobsCreated))
                  : '0'} credits
              </p>
            </div>
          </div>

          {/* Assets Generated */}
          <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
              <Image className="h-6 w-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-neutral-500">Assets Generated</p>
              <p className="text-2xl font-bold text-neutral-900">{usage.assetsGenerated || 0}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-500">Avg. per asset</p>
              <p className="text-sm font-semibold text-neutral-700">
                {usage.assetsGenerated > 0
                  ? formatNumber(Math.round(credits.lifetimeUsed / usage.assetsGenerated))
                  : '0'} credits
              </p>
            </div>
          </div>

          {/* Tokens This Month */}
          <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
              <Zap className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-neutral-500">LLM Tokens (Month)</p>
              <p className="text-2xl font-bold text-neutral-900">{formatNumber(usage.tokensMonth || 0)}</p>
            </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500">Pricing</p>
            <p className="text-sm font-semibold text-neutral-700">—</p>
          </div>
        </div>

          {/* Last Active */}
          <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
              <Activity className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-neutral-500">Last Active</p>
              <p className="text-lg font-semibold text-neutral-900">
                {formatDate(usage.lastActiveAt)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-500">Account age</p>
              <p className="text-sm font-semibold text-neutral-700">
                {user?.createdAt
                  ? Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24))
                  : 0} days
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Credit History Link */}
      <div className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-6">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Need detailed credit history?</p>
          <p className="text-xs text-neutral-600">View all transactions in the Credits page</p>
        </div>
        <button className="flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-700 transition-colors hover:border-primary-600 hover:text-primary-600">
          <Download className="h-4 w-4" />
          Export Report
        </button>
      </div>
    </div>
  );
}
