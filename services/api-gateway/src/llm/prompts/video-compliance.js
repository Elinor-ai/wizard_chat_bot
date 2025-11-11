import { llmLogger } from "../logger.js";

export function buildVideoCompliancePrompt({ jobSnapshot = {}, spec }) {
  if (!spec) {
    throw new Error("Video compliance prompt requires spec");
  }

  const payload = {
    role: "You act as a compliance checker for employment ads.",
    guardrails: [
      "Respond with JSON only.",
      "Surface at most 3 flags with severity: info, warning, blocking.",
      "Call out missing disclosures (pay, geo, CTA, captions).",
      "Respect channel-specific special ad category rules."
    ],
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
  llmLogger.info({ task: "video_compliance", payloadSize: serialized.length }, "LLM video compliance prompt");
  return serialized;
}
