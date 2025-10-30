import { AssetList } from "../../../components/assets/asset-list";

export default function AssetsPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Generated assets
        </h1>
        <p className="text-sm text-neutral-600">
          Review copy, media, and landing pages tied to the confirmed job JSON.
          Each asset tracks provenance: prompts, model, parameters, and approval
          status.
        </p>
      </header>

      <AssetList />
    </div>
  );
}
