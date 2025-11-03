'use client';

import { Shield, Lock, Eye, AlertTriangle, CheckCircle, Clock, Smartphone } from 'lucide-react';

export default function SecuritySection({ user }) {
  const security = user?.security || {};
  const riskScore = security.riskScore || 0;
  const mfaEnabled = Boolean(security.mfaEnabled);

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRiskLevel = (score) => {
    if (score < 25) return { label: 'Low', color: 'emerald', icon: CheckCircle };
    if (score < 50) return { label: 'Medium', color: 'blue', icon: Eye };
    if (score < 75) return { label: 'Elevated', color: 'amber', icon: AlertTriangle };
    return { label: 'High', color: 'red', icon: AlertTriangle };
  };

  const riskLevel = getRiskLevel(riskScore);
  const RiskIcon = riskLevel.icon;

  const handleMfaToggle = async () => {
    // TODO: Implement MFA enable/disable API call
    setMfaEnabled(!mfaEnabled);
  };

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
          <Shield className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Security</h2>
          <p className="text-sm text-neutral-600">Protect your account with advanced security features</p>
        </div>
      </div>

      {/* Risk Score Card */}
      <div className={`mb-6 rounded-2xl border border-${riskLevel.color}-200 bg-gradient-to-br from-${riskLevel.color}-50 to-white p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RiskIcon className={`h-5 w-5 text-${riskLevel.color}-600`} />
            <p className="text-sm font-semibold text-neutral-900">Account Risk Score</p>
          </div>
          <span className={`rounded-full bg-${riskLevel.color}-100 px-3 py-1 text-xs font-semibold text-${riskLevel.color}-700`}>
            {riskLevel.label} Risk
          </span>
        </div>

        {/* Risk Score Bar */}
        <div className="mb-2 h-3 overflow-hidden rounded-full bg-neutral-200">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-${riskLevel.color}-400 to-${riskLevel.color}-600 transition-all duration-500`}
            style={{ width: `${riskScore}%` }}
          ></div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-600">Score: {riskScore}/100</p>
          {riskScore < 50 ? (
            <p className="text-xs text-emerald-600">Your account is secure</p>
          ) : (
            <p className="text-xs text-amber-600">Consider enabling additional security</p>
          )}
        </div>
      </div>

      {/* Security Features */}
      <div className="mb-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Security Features
        </h3>

        {/* Multi-Factor Authentication */}
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${mfaEnabled ? 'bg-emerald-100' : 'bg-neutral-100'}`}>
              <Smartphone className={`h-6 w-6 ${mfaEnabled ? 'text-emerald-600' : 'text-neutral-400'}`} />
            </div>
            <div>
              <p className="font-semibold text-neutral-900">Two-Factor Authentication (2FA)</p>
              <p className="text-xs text-neutral-600">
                {mfaEnabled
                  ? 'Your account is protected with 2FA'
                  : 'Add an extra layer of security to your account'}
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {mfaEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {/* Password Protection */}
        {user?.auth?.provider === 'password' && (
          <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                <Lock className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-neutral-900">Password</p>
                <p className="text-xs text-neutral-600">
                  Manage your password from the profile tab while editing your details.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Login Activity */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Login Activity
        </h3>

        {/* Last Login */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-neutral-500" />
            <p className="text-sm font-semibold text-neutral-900">Last Login</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-neutral-500">Date & Time</p>
              <p className="text-sm font-semibold text-neutral-900">
                {formatDate(security.lastLoginAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Login Method</p>
              <p className="text-sm font-semibold text-neutral-900">
                {user?.auth?.provider === 'google' ? 'Google OAuth' : 'Email & Password'}
              </p>
            </div>
          </div>
        </div>

        {/* Login History Table */}
        <div className="overflow-hidden rounded-xl border border-neutral-200">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Date & Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Device
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {security.lastLoginAt ? (
                <tr>
                  <td className="px-4 py-3 text-sm text-neutral-700">
                    {formatDate(security.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-700">Unknown Device</td>
                  <td className="px-4 py-3 text-sm text-neutral-700">Unknown Location</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle className="h-3 w-3" />
                      Success
                    </span>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-neutral-500">
                    No login history available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <span className="text-xs font-semibold text-neutral-400">
            Audit log retained for enterprise plans
          </span>
        </div>
      </div>

      {/* Security Recommendations */}
      {riskScore >= 50 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <p className="font-semibold text-amber-900">Security Recommendations</p>
          </div>
          <ul className="space-y-1 text-sm text-amber-800">
            {!mfaEnabled && <li>• Enable two-factor authentication for better protection</li>}
            {user?.auth?.provider === 'password' && (
              <li>• Consider using a strong, unique password</li>
            )}
            <li>• Review your recent login activity regularly</li>
          </ul>
        </div>
      )}
    </div>
  );
}
