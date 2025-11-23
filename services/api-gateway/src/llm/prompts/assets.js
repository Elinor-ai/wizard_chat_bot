import { llmLogger } from "../logger.js";

function buildJobContext(jobSnapshot = {}) {
  const context = {};
  Object.entries(jobSnapshot ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value) && value.length === 0) {
      return;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      return;
    }
    context[key] = value;
  });
  return context;
}

function describeChannel(channelMeta = {}, fallbackId) {
  if (!channelMeta || Object.keys(channelMeta).length === 0) {
    return {
      id: fallbackId,
      name: fallbackId,
      geo: "global",
      strengths: [],
      notes: null
    };
  }
  return {
    id: channelMeta.id ?? fallbackId,
    name: channelMeta.name ?? fallbackId,
    geo: channelMeta.geo ?? "global",
    strengths: Array.isArray(channelMeta.strengths) ? channelMeta.strengths : [],
    media: Array.isArray(channelMeta.media) ? channelMeta.media : [],
    notes: channelMeta.notes ?? null
  };
}

function describePlanItem(planItem, channelMeta) {
  return {
    planId: planItem.planId,
    channelId: planItem.channelId,
    channel: describeChannel(channelMeta, planItem.channelId),
    formatId: planItem.formatId,
    artifactType: planItem.artifactType,
    title: planItem.title,
    description: planItem.description,
    tone: planItem.tone,
    structure: planItem.structure,
    length: planItem.length,
    callToAction: planItem.callToAction
  };
}

function baseGuardrails() {
  return [
    "Return strictly valid JSON. Do not include markdown, commentary, or apologies.",
    "Never fabricate compensation details that are missing from the job context.",
    "Prioritize inclusive, bias-free language and remove internal jargon.",
    "Always include a clear call-to-action that maps to the channel experience."
  ];
}

function stringify(payload, label) {
  const serialized = JSON.stringify(payload, null, 2);
  llmLogger.info(
    {
      task: label,
      payloadSize: serialized.length
    },
    "LLM asset prompt"
  );
  return serialized;
}

export function buildAssetMasterPrompt(context = {}) {
  const { planItem, channelMeta, jobSnapshot } = context;
  if (!planItem) {
    throw new Error("Asset master prompt requires planItem");
  }

  const payload = {
    role: "You are a creative director producing the hero script/brief for recruiting campaigns.",
    guardrails: baseGuardrails(),
    jobContext: buildJobContext(jobSnapshot),
    assetPlan: describePlanItem(planItem, channelMeta),
    responseContract: {
      plan_id: planItem.planId,
      title: "string - working title or hook",
      rationale: "string - 2 sentences on why this approach fits the channel",
      content: {
        summary: "string",
        script_beats: [
          {
            beat: "string - short label",
            dialogue: "string - narration/dialog",
            visual: "string - describe what is shown"
          }
        ],
        call_to_action: "string",
        hashtags: ["string"],
        image_prompt: "string (optional) describing the visual aesthetic"
      }
    },
    exampleResponse: {
      plan_id: planItem.planId,
      title: "Grow the future of support at Lumina",
      rationale: "Opens with empathy for customers, then spotlights career growth before closing with an urgent CTA.",
      content: {
        summary: "30-second hero script for vertical video showing agents + customers.",
        script_beats: [
          {
            beat: "Hook",
            dialogue: "What if every support convo felt like a win—for customers and you?",
            visual: "Quick cut of agent high-fiving teammate while dashboard glows."
          },
          {
            beat: "Impact",
            dialogue: "At Lumina, your playbook powers millions of interactions each month.",
            visual: "Product UI overlay, zoom on metrics climbing."
          }
        ],
        call_to_action: "Tap to apply in 60 seconds—interviews start this week.",
        hashtags: ["#HiringNow", "#CustomerSuccess", "#TechJobs"]
      }
    },
    companyContext: context.companyContext ?? null
  };

  return stringify(payload, "asset_master");
}

export function buildAssetChannelBatchPrompt(context = {}) {
  const { planItems = [], jobSnapshot, channelMetaMap = {} } = context;
  if (planItems.length === 0) {
    throw new Error("Channel batch prompt requires at least one plan item");
  }

  const payload = {
    role: "You are a copywriter translating a polished job into channel-ready assets.",
    guardrails: baseGuardrails(),
    jobContext: buildJobContext(jobSnapshot),
    assetPlans: planItems.map((planItem) =>
      describePlanItem(planItem, channelMetaMap[planItem.channelId])
    ),
    responseContract: {
      assets: [
        {
          plan_id: "string",
          title: "string",
          body: "string",
          bullets: ["string"],
          hashtags: ["string"],
          rationale: "string",
          call_to_action: "string"
        }
      ]
    },
    companyContext: context.companyContext ?? null
  };

  return stringify(payload, "asset_channel_batch");
}

export function buildAssetAdaptPrompt(context = {}) {
  const { planItem, masterAsset, jobSnapshot, channelMeta } = context;
  if (!planItem) {
    throw new Error("Adaptation prompt requires planItem");
  }
  if (!masterAsset || !masterAsset.content) {
    throw new Error("Adaptation prompt requires masterAsset content");
  }

  const payload = {
    role: "You localize an existing hero script for a specific social platform.",
    guardrails: [
      ...baseGuardrails(),
      "Keep the story arc from the master script but adjust hooks, pacing, and CTA to feel native to the target platform."
    ],
    jobContext: buildJobContext(jobSnapshot),
    masterAsset: masterAsset,
    targetPlan: describePlanItem(planItem, channelMeta),
    responseContract: {
      plan_id: planItem.planId,
      title: "string",
      rationale: "string",
      content: {
        script_beats: [
          {
            beat: "string",
            dialogue: "string",
            visual: "string"
          }
        ],
        hook: "string",
        call_to_action: "string",
        hashtags: ["string"]
      }
    },
    companyContext: context.companyContext ?? null
  };

  return stringify(payload, "asset_adapt");
}
