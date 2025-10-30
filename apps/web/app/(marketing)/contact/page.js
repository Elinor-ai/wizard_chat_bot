export default function ContactPage() {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-3xl flex-col gap-6 px-6 py-24">
      <h1 className="text-4xl font-bold text-neutral-900">Contact Sales</h1>
      <p className="max-w-2xl text-neutral-600">
        Share your talent goals and we will tailor a rollout plan. Expect a
        response within one business day.
      </p>
      <form className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm shadow-neutral-100">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Name
          <input
            className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none focus:border-primary-500"
            type="text"
            placeholder="Ada Lovelace"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email
          <input
            className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none focus:border-primary-500"
            type="email"
            placeholder="ada@yourcompany.com"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Message
          <textarea
            className="min-h-[120px] rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none focus:border-primary-500"
            placeholder="Tell us about your hiring goals, timeline, and team."
          />
        </label>
        <button
          type="submit"
          className="mt-4 rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500"
        >
          Submit
        </button>
      </form>
    </section>
  );
}
