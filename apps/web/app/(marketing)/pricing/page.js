export default function PricingPage() {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-4xl flex-col gap-6 px-6 py-24">
      <h1 className="text-4xl font-bold text-neutral-900">Pricing</h1>
      <p className="max-w-2xl text-neutral-600">
        Usage is credit-metered per workflow. Credits include LLM usage, assets,
        channels, and platform automation. Contact us for enterprise plans with
        custom data residency, SLAs, and procurement support.
      </p>
      <ul className="grid gap-6 md:grid-cols-3">
        {[ 
          {
            name: "Launch",
            price: "$499/mo",
            description: "100 jobs/mo • Core automation • Email support"
          },
          {
            name: "Scale",
            price: "$1,599/mo",
            description:
              "Unlimited jobs • Team workspaces • Channel adapters • SLA"
          },
          {
            name: "Enterprise",
            price: "Custom",
            description:
              "Private deployments • Custom models • Dedicated success"
          }
        ].map((plan) => (
          <li
            key={plan.name}
            className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100"
          >
            <h2 className="text-lg font-semibold text-neutral-900">
              {plan.name}
            </h2>
            <p className="mt-2 text-3xl font-bold text-primary-600">
              {plan.price}
            </p>
            <p className="mt-4 text-sm text-neutral-600">{plan.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
