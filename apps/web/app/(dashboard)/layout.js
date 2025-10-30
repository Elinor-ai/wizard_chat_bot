import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/wizard", label: "Job Wizard" },
  { href: "/assets", label: "Assets" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/credits", label: "Credits" },
  { href: "/chat", label: "LLM Console" }
];

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-neutral-100">
      <aside className="hidden w-72 flex-col border-r border-neutral-200 bg-white px-6 py-8 md:flex">
        <h1 className="text-lg font-semibold text-primary-700">
          Wizard Console
        </h1>
        <nav className="mt-8 flex flex-col gap-1 text-sm font-medium text-neutral-600">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 transition hover:bg-primary-50 hover:text-primary-600"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-500">
          <p className="font-semibold text-neutral-700">Runbook</p>
          <p>Standard operating procedures are auto-generated per job.</p>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 md:px-10">{children}</main>
    </div>
  );
}
