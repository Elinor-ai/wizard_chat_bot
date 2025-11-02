'use client';

import { BarChart3, Tag, ExternalLink, TrendingUp, Users } from 'lucide-react';

export default function AttributionSection({ user }) {
  const attribution = user?.attribution || {};
  const signupUtm = attribution.signupUtm || {};

  const hasAttributionData =
    Object.keys(signupUtm).length > 0 || attribution.referrer || attribution.source;

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
          <BarChart3 className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Attribution & Analytics</h2>
          <p className="text-sm text-neutral-600">Learn how you discovered our platform</p>
        </div>
      </div>

      {hasAttributionData ? (
        <div className="space-y-6">
          {/* Acquisition Overview */}
          <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <h3 className="font-semibold text-neutral-900">Acquisition Overview</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Source */}
              {attribution.source && (
                <div className="rounded-xl bg-white p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Acquisition Source
                  </p>
                  <p className="text-lg font-semibold text-neutral-900">{attribution.source}</p>
                </div>
              )}

              {/* Referrer */}
              {attribution.referrer && (
                <div className="rounded-xl bg-white p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Referrer
                  </p>
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-neutral-500" />
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {attribution.referrer}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* UTM Parameters */}
          {Object.keys(signupUtm).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-neutral-500" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  Campaign Tracking (UTM)
                </h3>
              </div>

              <div className="overflow-hidden rounded-xl border border-neutral-200">
                <table className="w-full">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Parameter
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {Object.entries(signupUtm).map(([key, value]) => (
                      <tr key={key}>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                            {key}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* UTM Explanation */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="mb-2 text-xs font-semibold text-blue-900">
                  What do these parameters mean?
                </p>
                <ul className="space-y-1 text-xs text-blue-800">
                  <li>
                    <strong>utm_source:</strong> Where the traffic came from (e.g., Google, Facebook)
                  </li>
                  <li>
                    <strong>utm_medium:</strong> Marketing medium (e.g., email, social, cpc)
                  </li>
                  <li>
                    <strong>utm_campaign:</strong> Specific campaign name
                  </li>
                  <li>
                    <strong>utm_term:</strong> Paid search keywords
                  </li>
                  <li>
                    <strong>utm_content:</strong> Differentiates similar content or links
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Account Timeline */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-neutral-500" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Account Timeline
              </h3>
            </div>

            <div className="space-y-3">
              {/* Account Created */}
              {user?.createdAt && (
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <div className="h-3 w-3 rounded-full bg-emerald-600"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-neutral-900">Account Created</p>
                    <p className="text-xs text-neutral-600">
                      {new Date(user.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {attribution.source && (
                      <p className="mt-1 text-xs text-neutral-500">via {attribution.source}</p>
                    )}
                  </div>
                </div>
              )}

              {/* First Activity */}
              {user?.usage?.lastActiveAt && (
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <div className="h-3 w-3 rounded-full bg-blue-600"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-neutral-900">Last Active</p>
                    <p className="text-xs text-neutral-600">
                      {new Date(user.usage.lastActiveAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* Account Age */}
              {user?.createdAt && (
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-purple-100">
                    <div className="h-3 w-3 rounded-full bg-purple-600"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-neutral-900">Account Age</p>
                    <p className="text-xs text-neutral-600">
                      {Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24))} days
                      ({Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24 * 30))} months)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // No Attribution Data
        <div className="flex flex-col items-center justify-center py-12">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-neutral-100">
            <BarChart3 className="h-10 w-10 text-neutral-400" />
          </div>
          <p className="mb-2 text-sm font-semibold text-neutral-900">No Attribution Data</p>
          <p className="max-w-md text-center text-xs text-neutral-600">
            We don't have information about how you discovered our platform. Attribution data helps
            us understand which marketing channels are most effective.
          </p>
        </div>
      )}

      {/* Privacy Note */}
      <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="mb-1 text-xs font-semibold text-neutral-900">Privacy & Data Usage</p>
        <p className="text-xs text-neutral-600">
          This data is collected anonymously to help us understand how users find our platform and
          improve our marketing efforts. We never share your personal information with third parties
          without your explicit consent.
        </p>
      </div>
    </div>
  );
}
