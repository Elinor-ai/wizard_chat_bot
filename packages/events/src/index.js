import { z } from "zod";
import {
  AssetArtifactSchema,
  ChatThreadSchema,
  CreditLedgerEntrySchema,
  EventEnvelopeSchema,
  JobVersionSchema,
  SuggestionSchema
} from "@wizard/core";

export const WizardDraftUpdated = EventEnvelopeSchema.extend({
  type: z.literal("wizard.draft.updated"),
  payload: z.object({
    jobId: z.string(),
    state: z.record(z.string(), z.string())
  })
});

export const WizardSuggestionCreated = EventEnvelopeSchema.extend({
  type: z.literal("wizard.suggestion.created"),
  payload: SuggestionSchema
});

export const JobVersionConfirmed = EventEnvelopeSchema.extend({
  type: z.literal("job.version.confirmed"),
  payload: JobVersionSchema
});

export const AssetGenerationRequested = EventEnvelopeSchema.extend({
  type: z.literal("asset.generation.requested"),
  payload: z.object({
    jobId: z.string(),
    versionId: z.string(),
    assetTypes: z.array(AssetArtifactSchema.shape.type)
  })
});

export const AssetGenerated = EventEnvelopeSchema.extend({
  type: z.literal("asset.generated"),
  payload: AssetArtifactSchema
});

export const CampaignLaunchRequested = EventEnvelopeSchema.extend({
  type: z.literal("campaign.launch.requested"),
  payload: z.object({
    campaignId: z.string(),
    jobId: z.string()
  })
});

export const CreditLedgerUpdated = EventEnvelopeSchema.extend({
  type: z.literal("credits.ledger.updated"),
  payload: CreditLedgerEntrySchema
});

export const ChatThreadUpdated = EventEnvelopeSchema.extend({
  type: z.literal("chat.thread.updated"),
  payload: ChatThreadSchema
});

export const AllEvents = [
  WizardDraftUpdated,
  WizardSuggestionCreated,
  JobVersionConfirmed,
  AssetGenerationRequested,
  AssetGenerated,
  CampaignLaunchRequested,
  CreditLedgerUpdated,
  ChatThreadUpdated
];
