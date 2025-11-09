'use client';

import { useState, useEffect } from 'react';
import { Bell, Mail, Megaphone, Globe, Beaker, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUser } from '../user-context';

export default function PreferencesSection({ user }) {
  const { setUser } = useUser();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [isMounted, setIsMounted] = useState(false);

  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    marketingOptIn: false,
    languagesPreferred: [],
  });

  const [experiments, setExperiments] = useState({});

  // Initialize preferences after mount to prevent hydration mismatch
  useEffect(() => {
    setPreferences({
      emailNotifications: user?.preferences?.emailNotifications ?? true,
      marketingOptIn: user?.preferences?.marketingOptIn ?? false,
      languagesPreferred: user?.preferences?.languagesPreferred || [],
    });
    setExperiments(user?.experiments || {});
    setIsMounted(true);
  }, [user]);

  const handleToggle = (key) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleLanguageToggle = (lang) => {
    setPreferences((prev) => {
      const languages = prev.languagesPreferred || [];
      const newLanguages = languages.includes(lang)
        ? languages.filter((l) => l !== lang)
        : [...languages, lang];
      return { ...prev, languagesPreferred: newLanguages };
    });
  };

  const handleSave = async () => {
    if (!user?.authToken) {
      setMessage({ type: 'error', text: 'Your session has expired. Please sign in again.' });
      return;
    }
    setIsSaving(true);
    setMessage(null);

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
      const response = await fetch(`${apiBaseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.authToken}`,
        },
        body: JSON.stringify({
          preferences,
          experiments,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      const updatedUser = await response.json();
      setUser({
        ...updatedUser,
        authToken: user.authToken,
      });
      setMessage({ type: 'success', text: 'Preferences saved successfully!' });
    } catch (error) {
      console.error('Error updating preferences:', error);
      setMessage({ type: 'error', text: 'Failed to save preferences. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const availableLanguages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'he', name: 'עברית', flag: '🇮🇱' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  ];

  if (!isMounted) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-neutral-200"></div>
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-neutral-200"></div>
              <div className="h-3 w-48 rounded bg-neutral-100"></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-20 w-full rounded-xl bg-neutral-100"></div>
            <div className="h-20 w-full rounded-xl bg-neutral-100"></div>
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Bell className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Preferences</h2>
            <p className="text-sm text-neutral-600">Customize your experience and notifications</p>
          </div>
        </div>
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

      {/* Notifications */}
      <div className="mb-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Notifications
        </h3>

        {/* Email Notifications */}
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${preferences.emailNotifications ? 'bg-emerald-100' : 'bg-neutral-100'}`}>
              <Mail className={`h-6 w-6 ${preferences.emailNotifications ? 'text-emerald-600' : 'text-neutral-400'}`} />
            </div>
            <div>
              <p className="font-semibold text-neutral-900">Email Notifications</p>
              <p className="text-xs text-neutral-600">
                Receive updates about jobs, campaigns, and important alerts
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggle('emailNotifications')}
            className={`relative h-7 w-12 rounded-full transition-colors ${
              preferences.emailNotifications ? 'bg-emerald-600' : 'bg-neutral-300'
            }`}
          >
            <div
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                preferences.emailNotifications ? 'translate-x-6' : 'translate-x-1'
              }`}
            ></div>
          </button>
        </div>

        {/* Marketing Communications */}
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${preferences.marketingOptIn ? 'bg-blue-100' : 'bg-neutral-100'}`}>
              <Megaphone className={`h-6 w-6 ${preferences.marketingOptIn ? 'text-blue-600' : 'text-neutral-400'}`} />
            </div>
            <div>
              <p className="font-semibold text-neutral-900">Marketing Communications</p>
              <p className="text-xs text-neutral-600">
                Get tips, updates, and special offers from our team
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggle('marketingOptIn')}
            className={`relative h-7 w-12 rounded-full transition-colors ${
              preferences.marketingOptIn ? 'bg-blue-600' : 'bg-neutral-300'
            }`}
          >
            <div
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                preferences.marketingOptIn ? 'translate-x-6' : 'translate-x-1'
              }`}
            ></div>
          </button>
        </div>
      </div>

      {/* Preferred Languages */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-neutral-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Preferred Languages for Job Posts
          </h3>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {availableLanguages.map((lang) => {
            const isSelected = preferences.languagesPreferred?.includes(lang.code);
            return (
              <button
                key={lang.code}
                onClick={() => handleLanguageToggle(lang.code)}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                  isSelected
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-neutral-200 bg-white hover:border-primary-200'
                }`}
              >
                <span className="text-2xl">{lang.flag}</span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-neutral-900">{lang.name}</p>
                  <p className="text-xs text-neutral-600">{lang.code.toUpperCase()}</p>
                </div>
                {isSelected && (
                  <CheckCircle2 className="h-5 w-5 text-primary-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Experiments (A/B Testing) */}
      {Object.keys(experiments).length > 0 && (
        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-neutral-500" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Active Experiments
            </h3>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="mb-3 text-xs text-neutral-600">
              You're currently enrolled in the following feature experiments:
            </p>
            <div className="space-y-2">
              {Object.entries(experiments).map(([key, variant]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                >
                  <span className="text-sm text-neutral-700">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700">
                    Variant: {variant}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end border-t border-neutral-200 pt-6">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
        >
          {isSaving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
