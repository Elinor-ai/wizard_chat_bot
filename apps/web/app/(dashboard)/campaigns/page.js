import { CampaignTable } from "../../../components/campaigns/campaign-table";

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Campaign orchestration
        </h1>
        <p className="text-sm text-neutral-600">
          Multi-channel launches are queued through the event bus with
          deterministic retries. Monitor pacing, attribution, and per-channel
          spend in real time.
        </p>
      </header>

      <CampaignTable />
    </div>
  );
}
