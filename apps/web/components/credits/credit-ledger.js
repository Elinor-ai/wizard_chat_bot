const transactions = [
  {
    id: "txn-1001",
    type: "Reserve",
    workflow: "Wizard → Asset Generation",
    amount: -45,
    status: "Reserved",
    timestamp: "2025-10-22T12:00:00Z"
  },
  {
    id: "txn-1002",
    type: "Charge",
    workflow: "Campaign Launch: LinkedIn",
    amount: -18,
    status: "Settled",
    timestamp: "2025-10-22T12:05:00Z"
  },
  {
    id: "txn-1003",
    type: "Refund",
    workflow: "Asset Regen (rollback)",
    amount: 12,
    status: "Refunded",
    timestamp: "2025-10-22T12:06:00Z"
  }
];

export function CreditLedger() {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
      <header className="flex items-center justify-between text-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Ledger</h2>
        <button
          type="button"
          className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-primary-500 hover:text-primary-600"
        >
          Export CSV
        </button>
      </header>

      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-100">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Workflow</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Txn ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-600">
            {transactions.map((txn) => (
              <tr key={txn.id}>
                <td className="px-4 py-4 text-neutral-500">
                  {new Date(txn.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-4">
                  <p className="font-semibold text-neutral-800">{txn.workflow}</p>
                </td>
                <td className="px-4 py-4">{txn.type}</td>
                <td className="px-4 py-4 font-semibold text-neutral-800">
                  {txn.amount > 0 ? `+${txn.amount}` : txn.amount}
                </td>
                <td className="px-4 py-4">{txn.status}</td>
                <td className="px-4 py-4 text-xs text-neutral-400">{txn.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
