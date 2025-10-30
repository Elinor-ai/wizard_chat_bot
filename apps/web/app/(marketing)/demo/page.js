export default function DemoPage() {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-3xl flex-col gap-6 px-6 py-24">
      <h1 className="text-4xl font-bold text-neutral-900">Book a live demo</h1>
      <p className="max-w-2xl text-neutral-600">
        Experience the recruiting command center: guided needs discovery,
        versioned job briefs, asset generation, multi-channel publishing, and
        interview support—powered by orchestrated LLM agents.
      </p>
      <div className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm shadow-neutral-100">
        <p className="text-sm text-neutral-600">
          Choose a time that works for you. We will walk through your current
          workflows and map them to Wizard automation.
        </p>
        <div className="flex items-center justify-between rounded-2xl border border-neutral-100 px-4 py-3 text-sm text-neutral-500">
          <span>Calendar integration coming soon.</span>
          <span>→</span>
        </div>
      </div>
    </section>
  );
}
