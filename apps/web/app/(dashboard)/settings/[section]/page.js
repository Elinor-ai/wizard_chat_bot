"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { User, Bell, Shield, CreditCard, BarChart3, Building2, Coins } from "lucide-react";
import { useUser } from "../../../../components/user-context";
import ProfileSection from "../../../../components/settings/profile-section";
import PreferencesSection from "../../../../components/settings/preferences-section";
import SecuritySection from "../../../../components/settings/security-section";
import BillingSection from "../../../../components/settings/billing-section";
import AttributionSection from "../../../../components/settings/attribution-section";
import CompaniesSection from "../../../../components/settings/companies-section";
import SubscriptionSection from "../../../../components/settings/subscription-section";
import CreditsUsageSection from "../../../../components/settings/credits-usage-section";
import { UsersApi } from "../../../../lib/api-client";

const tabs = [
  { id: "profile", label: "Profile", icon: User, path: "Profile" },
  { id: "preferences", label: "Preferences", icon: Bell, path: "Preferences" },
  { id: "security", label: "Security", icon: Shield, path: "Security" },
  { id: "billing", label: "Billing", icon: CreditCard, path: "Billing" },
  { id: "subscription", label: "Subscriptions", icon: Coins, path: "Subscription" },
  { id: "companies", label: "Companies", icon: Building2, path: "Companies" },
  { id: "analytics", label: "Analytics", icon: BarChart3, path: "Analytics" }
];

function resolveTabFromParam(param) {
  if (!param) return tabs[0];
  const normalized = param.toLowerCase();
  return (
    tabs.find((tab) => tab.path.toLowerCase() === normalized || tab.id === normalized) ??
    tabs[0]
  );
}

export default function SettingsSectionPage({ params }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { user, setUser } = useUser();
  const sectionParam = params?.section ?? "Profile";
  const activeTab = resolveTabFromParam(sectionParam);
  const authToken = user?.authToken ?? session?.accessToken ?? null;
  const currentUser =
    user ||
    (session?.user
      ? { ...session.user, authToken: session.accessToken ?? null }
      : null);

  useEffect(() => {
    if (!tabs.some((tab) => tab.path.toLowerCase() === String(sectionParam).toLowerCase())) {
      router.replace(`/settings/${tabs[0].path}`);
    }
  }, [router, sectionParam]);

  useEffect(() => {
    if (!authToken || !setUser) {
      return;
    }
    let cancelled = false;
    const refreshUser = async () => {
      try {
        const latest = await UsersApi.fetchCurrentUser({ authToken });
        if (!cancelled) {
          setUser({ ...latest, authToken });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Failed to refresh user", error);
      }
    };
    refreshUser();
    return () => {
      cancelled = true;
    };
  }, [authToken, activeTab.id, setUser]);

  const renderTabContent = () => {
    switch (activeTab.id) {
      case "profile":
        return (
          <>
            <ProfileSection user={currentUser} />
            <CreditsUsageSection user={currentUser} />
          </>
        );
      case "preferences":
        return <PreferencesSection user={currentUser} />;
      case "security":
        return <SecuritySection user={currentUser} />;
      case "billing":
        return <BillingSection user={currentUser} />;
      case "subscription":
        return <SubscriptionSection user={currentUser} />;
      case "companies":
        return <CompaniesSection user={currentUser} />;
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
        <p className="text-sm text-neutral-600">Manage your account settings and preferences</p>
      </header>

      <div className="border-b border-neutral-200 bg-white rounded-t-3xl">
        <nav className="flex gap-1 px-2 pt-2" aria-label="Settings tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab.id;
            return (
              <button
                key={tab.id}
                onClick={() => router.push(`/settings/${tab.path}`)}
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

      <div className="animate-fadeIn">{renderTabContent()}</div>
    </div>
  );
}
