"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useUser } from "../../../components/user-context";
import { User, Bell, Shield, CreditCard, BarChart3 } from "lucide-react";

// Import all settings sections
import ProfileSection from "../../../components/settings/profile-section";
import PreferencesSection from "../../../components/settings/preferences-section";
import SecuritySection from "../../../components/settings/security-section";
import BillingSection from "../../../components/settings/billing-section";
import AttributionSection from "../../../components/settings/attribution-section";

const tabs = [
  { id: "profile", label: "Profile", icon: User },
  { id: "preferences", label: "Preferences", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState("profile");

  const currentUser =
    user ||
    (session?.user
      ? { ...session.user, authToken: session.accessToken ?? null }
      : null);

  const renderTabContent = () => {
    switch (activeTab) {
      case "profile":
        return <ProfileSection user={currentUser} />;
      case "preferences":
        return <PreferencesSection user={currentUser} />;
      case "security":
        return <SecuritySection user={currentUser} />;
      case "billing":
        return <BillingSection user={currentUser} />;
      case "analytics":
        return <AttributionSection user={currentUser} />;
      default:
        return <ProfileSection user={currentUser} />;
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-600">
          Manage your account settings and preferences
        </p>
      </header>

      {/* Tabs Navigation */}
      <div className="border-b border-neutral-200 bg-white rounded-t-3xl">
        <nav className="flex gap-1 px-2 pt-2" aria-label="Settings tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-white text-primary-600 border-b-2 border-primary-600"
                    : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="animate-fadeIn">{renderTabContent()}</div>
    </div>
  );
}
