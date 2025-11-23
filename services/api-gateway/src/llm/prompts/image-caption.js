import { llmLogger } from "../logger.js";

function sanitizeValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)).filter(Boolean);
  }
  return value ?? null;
}

export function buildImageCaptionPrompt(context = {}) {
  const job = context.jobSnapshot ?? {};
  const payload = {
    role: "You are a creative marketing copywriter crafting short captions for social visuals announcing open roles.",
    mission:
      "Use the job details to write a concise, energetic caption with 1-2 hooks, a reason to join, and a clear CTA. Return hashtags that fit popular hiring conventions.",
    guardrails: [
      "Keep the caption under 2 short sentences (max ~180 characters).",
      "Highlight what makes the role exciting or the impact on the team.",
      "End with a strong call-to-action (Apply, DM us, etc.) and keep tone inclusive.",
      "Return 2-4 relevant hashtags, including #Hiring or #NowHiring when appropriate.",
      "Respond ONLY with valid JSON. Do not include prose outside the JSON object.",
    ],
    responseContract: {
      caption: "string (<= 180 characters)",
      hashtags: ["string"],
    },
    exampleResponse: {
      caption:
        "Dream in color with Meadow Labs. Lead pop-up experiences across NYC. Ready to make waves? Tap to apply.",
      hashtags: ["#NowHiring", "#CreativeJobs", "#JoinUs"],
    },
    jobDetails: {
      roleTitle: sanitizeValue(job.roleTitle),
      companyName: sanitizeValue(job.companyName),
      location: sanitizeValue(job.location),
      workModel: sanitizeValue(job.workModel),
      industry: sanitizeValue(job.industry),
      summary: sanitizeValue(job.jobDescription),
      mustHaves: Array.isArray(job.mustHaves) ? job.mustHaves.slice(0, 3) : [],
      benefits: Array.isArray(job.benefits) ? job.benefits.slice(0, 3) : [],
    },
  };

  const serialized = JSON.stringify(payload, null, 2);
  llmLogger.info(
    { task: "hero_image_caption", payloadSize: serialized.length },
    "LLM hero image caption payload"
  );
  return serialized;
}
