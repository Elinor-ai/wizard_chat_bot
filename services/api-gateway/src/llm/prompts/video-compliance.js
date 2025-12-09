import { llmLogger } from "../logger.js";

/**
 * Builds a human-readable summary of the video format for compliance context.
 *
 * @param {Object} videoConfig - VideoConfig object (may be undefined)
 * @param {Object} renderPlanSummary - Summary of RenderPlan (may be undefined)
 * @returns {string} Human-readable video format description
 */
function buildVideoFormatSummary(videoConfig, renderPlanSummary) {
  const duration = renderPlanSummary?.finalPlannedSeconds ?? videoConfig?.targetSeconds ?? 8;
  const aspectRatio = renderPlanSummary?.aspectRatio ?? "9:16";
  const format = aspectRatio === "9:16" ? "vertical" : "horizontal";
  const tone = videoConfig?.tone ?? "energetic";

  return `Short ${duration}-second ${format} recruiting video with ${tone} tone`;
}

export function buildVideoCompliancePrompt({
  jobSnapshot = {},
  spec,
  videoConfig,
  renderPlanSummary
}) {
  if (!spec) {
    throw new Error("Video compliance prompt requires spec");
  }

  // Build video context summary for compliance assessment
  const videoFormatSummary = buildVideoFormatSummary(videoConfig, renderPlanSummary);

  const payload = {
    role: "You act as a compliance checker for employment ads.",
    guardrails: [
      "Respond with JSON only.",
      "Surface at most 3 flags with severity: info, warning, blocking.",
      "Call out missing disclosures (pay, geo, CTA, captions).",
      "Respect channel-specific special ad category rules.",
      "Consider this is a short social media recruiting ad when judging language and claims."
    ],
    video_context: {
      format_summary: videoFormatSummary,
      tone: videoConfig?.tone ?? "energetic",
      channel_focus: videoConfig?.primaryChannelFocus ?? spec.channelId,
      has_voiceover: videoConfig?.hasVoiceOver ?? true,
      duration_seconds: renderPlanSummary?.finalPlannedSeconds ?? videoConfig?.targetSeconds ?? 8
    },
    channel: {
      id: spec.channelId,
      placement: spec.placementName,
      availability: spec.availability,
      compliance_notes: spec.complianceNotes
    },
    job_context: {
      geo: jobSnapshot.geo ?? null,
      pay_range: jobSnapshot.payRange ?? null,
      benefits: jobSnapshot.benefits ?? [],
      role: jobSnapshot.title ?? null
    },
    response_contract: {
      flags: [
        {
          id: "string",
          label: "string",
          severity: "info|warning|blocking",
          details: "string"
        }
      ]
    }
  };

  const serialized = JSON.stringify(payload, null, 2);
  llmLogger.info({
    task: "video_compliance",
    payloadSize: serialized.length,
    videoFormatSummary
  }, "LLM video compliance prompt");
  return serialized;
}
