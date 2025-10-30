const campaigns = [
  {
    id: "cmpn-001",
    channel: "LinkedIn",
    audience: "SF Software Engineers",
    budget: "$1,200",
    status: "Running",
    ctr: "3.1%",
    cpa: "$92"
  },
  {
    id: "cmpn-002",
    channel: "TikTok",
    audience: "New Grad Devs",
    budget: "$800",
    status: "Scheduled",
    ctr: "—",
    cpa: "—"
  },
  {
    id: "cmpn-003",
    channel: "Reddit",
    audience: "r/node + r/javascript",
    budget: "$350",
    status: "Paused",
    ctr: "1.4%",
    cpa: "$110"
  }
];

export function CampaignTable() {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
      <header className="flex items-center justify-between text-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Campaigns</h2>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-primary-500 hover:text-primary-600"
          >
            Add channel
          </button>
          <button
            type="button"
            className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500"
          >
            Launch all
          </button>
        </div>
      </header>

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-100">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Audience</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">CTR</th>
              <th className="px-4 py-3">CPA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-600">
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td className="px-4 py-4 font-semibold text-neutral-800">
                  {campaign.channel}
                </td>
                <td className="px-4 py-4">{campaign.audience}</td>
                <td className="px-4 py-4">{campaign.budget}</td>
                <td className="px-4 py-4">{campaign.status}</td>
                <td className="px-4 py-4">{campaign.ctr}</td>
                <td className="px-4 py-4">{campaign.cpa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
