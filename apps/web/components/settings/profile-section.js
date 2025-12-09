'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Building2, Phone, Globe, Clock, CheckCircle2, AlertCircle, Key } from 'lucide-react';
import { useUser } from '../user-context';

export default function ProfileSection({ user }) {
  const { setUser } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [isMounted, setIsMounted] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    phone: '',
    timezone: 'America/New_York',
    locale: 'en-US',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Initialize form data after mount to prevent hydration mismatch
  useEffect(() => {
    setFormData({
      name: user?.profile?.name || '',
      companyName: user?.profile?.companyName || '',
      phone: user?.profile?.phone || '',
      timezone: user?.profile?.timezone || 'America/New_York',
      locale: user?.profile?.locale || 'en-US',
    });
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setIsMounted(true);
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!user?.authToken) {
      setMessage({
        type: 'error',
        text: 'Your session has expired. Please sign in again.',
      });
      return;
    }
    setIsSaving(true);
    setMessage(null);

    const shouldChangePassword =
      user?.auth?.provider === 'password' && passwordForm.newPassword.trim().length > 0;

    if (shouldChangePassword) {
      if (passwordForm.newPassword.trim().length < 8) {
        setMessage({
          type: 'error',
          text: 'New password must be at least 8 characters long.',
        });
        setIsSaving(false);
        return;
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setMessage({
          type: 'error',
          text: 'New password and confirmation must match.',
        });
        setIsSaving(false);
        return;
      }
      if (!passwordForm.currentPassword.trim()) {
        setMessage({
          type: 'error',
          text: 'Please enter your current password to set a new one.',
        });
        setIsSaving(false);
        return;
      }
    }

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
      const profileResponse = await fetch(`${apiBaseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.authToken}`,
        },
        body: JSON.stringify({
          profile: formData,
        }),
      });

      if (!profileResponse.ok) {
        throw new Error('Failed to update profile');
      }

      let updatedUser = await profileResponse.json();

      if (shouldChangePassword) {
        const passwordResponse = await fetch(`${apiBaseUrl}/users/me/change-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.authToken}`,
          },
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword,
          }),
        });

        if (!passwordResponse.ok) {
          const payload = await passwordResponse.json().catch(() => null);
          throw new Error(payload?.error?.message ?? 'Failed to change password');
        }
      }

      const mergedUser = {
        ...updatedUser,
        authToken: user.authToken,
      };
      setUser(mergedUser);
      setIsEditing(false);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: user?.profile?.name || '',
      companyName: user?.profile?.companyName || '',
      phone: user?.profile?.phone || '',
      timezone: user?.profile?.timezone || 'America/New_York',
      locale: user?.profile?.locale || 'en-US',
    });
    setIsEditing(false);
    setMessage(null);
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  };

  const getProviderBadge = () => {
    const provider = user?.auth?.provider;
    if (provider === 'google') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
          <svg className="h-3 w-3" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700">
        <Key className="h-3 w-3" />
        Password
      </span>
    );
  };

  if (!isMounted) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-neutral-200"></div>
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-neutral-200"></div>
              <div className="h-3 w-48 rounded bg-neutral-100"></div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-12 w-full rounded-xl bg-neutral-100"></div>
            <div className="h-12 w-full rounded-xl bg-neutral-100"></div>
            <div className="h-12 w-full rounded-xl bg-neutral-100"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
            <User className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Profile & Account</h2>
            <p className="text-sm text-neutral-600">Manage your personal information</p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-700 hover:border-primary-600 hover:text-primary-600"
          >
            Edit Profile
          </button>
        )}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl p-3 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Avatar */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-2xl font-bold text-white shadow-lg shadow-primary-200">
          {user?.profile?.name?.[0]?.toUpperCase() || user?.auth?.email?.[0]?.toUpperCase() || 'U'}
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">{user?.profile?.name || 'User'}</p>
          <p className="text-xs text-neutral-600">{user?.auth?.email}</p>
          <div className="mt-2">{getProviderBadge()}</div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Full Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition-colors disabled:bg-neutral-50 disabled:text-neutral-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            placeholder="Enter your full name"
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Mail className="h-3 w-3" />
            Email Address
          </label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={user?.auth?.email || ''}
              disabled
              className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 outline-none"
            />
            {user?.auth?.emailVerified ? (
              <div className="flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Verified
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-700">
                <AlertCircle className="h-3 w-3" />
                Unverified
              </div>
            )}
          </div>
        </div>

        {/* Company Name */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Building2 className="h-3 w-3" />
            Company Name
          </label>
          <input
            type="text"
            name="companyName"
            value={formData.companyName}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition-colors disabled:bg-neutral-50 disabled:text-neutral-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            placeholder="Your company name (optional)"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Phone className="h-3 w-3" />
            Phone Number
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition-colors disabled:bg-neutral-50 disabled:text-neutral-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            placeholder="+1 (555) 000-0000"
          />
        </div>

        {/* Timezone */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Clock className="h-3 w-3" />
            Timezone
          </label>
          <select
            name="timezone"
            value={formData.timezone}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition-colors disabled:bg-neutral-50 disabled:text-neutral-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          >
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Chicago">Central Time (CT)</option>
            <option value="America/Denver">Mountain Time (MT)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="Europe/London">London (GMT)</option>
            <option value="Europe/Paris">Paris (CET)</option>
            <option value="Asia/Tokyo">Tokyo (JST)</option>
            <option value="Asia/Jerusalem">Jerusalem (IST)</option>
            <option value="Australia/Sydney">Sydney (AEST)</option>
          </select>
        </div>

        {/* Locale */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Globe className="h-3 w-3" />
            Language & Region
          </label>
          <select
            name="locale"
            value={formData.locale}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition-colors disabled:bg-neutral-50 disabled:text-neutral-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="he-IL">Hebrew (Israel)</option>
            <option value="es-ES">Español (España)</option>
            <option value="fr-FR">Français (France)</option>
            <option value="de-DE">Deutsch (Deutschland)</option>
            <option value="ja-JP">日本語 (日本)</option>
          </select>
        </div>

        {/* Password Fields */}
        {isEditing && user?.auth?.provider === 'password' && (
          <div className="space-y-4 border-t border-neutral-200 pt-4">
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Current Password
              </label>
              <input
                type="password"
                name="currentPassword"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                placeholder="Enter your current password"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                New Password
              </label>
              <input
                type="password"
                name="newPassword"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                placeholder="Set a new password (leave blank to keep current)"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Confirm New Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                placeholder="Re-enter new password"
              />
            </div>
            <p className="text-xs text-neutral-500">
              Leaving the password fields blank will keep your current password unchanged.
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {isEditing && (
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 rounded-full border border-neutral-200 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-700 transition-colors hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
