import { llmLogger } from "../logger.js";
import { CHANNEL_CATALOG } from "../domain/channel-catalog.js";

const ROLE_FAMILY_RULES = `
ROLE FAMILY INFERENCE
Classify job_title into one of:
- "hourly" (keywords: associate, cashier, barista, server, housekeeper, warehouse, picker, driver, cook, chef, front desk, store, retail, hospitality, delivery, custodian, caregiver)
- "healthcare" (nurse, rn, lpn, hca, care assistant, therapist, clinician, pharmacist, radiographer, sonographer, paramedic)
- "tech" (engineer, developer, software, devops, sre, data, ml, ai, qa, product manager)
- "creative" (designer, ux, ui, videographer, content, copywriter, social media, brand)
- "corporate" (accountant, finance, hr, recruiter, legal, operations, analyst, sales, marketing manager)
- "logistics_trades" (warehouse, forklift, driver, mechanic, electrician, plumber, hvac, technician, manufacturing, security)
- default to "corporate" if unknown.
`;

const GEO_RULES = `
GEO AVAILABILITY RULES
- country in ["United States","USA","US","U.S."] enables "FACEBOOK_JOBS_US" and "NEXTDOOR_BUSINESS".
- country in ["United Kingdom","UK","U.K.","England","Scotland","Wales","Northern Ireland"] enables "NEXTDOOR_BUSINESS".
- All other channels with geo:"global" are always allowed.
`;

const SCHEMA_TEXT = `
OUTPUT SCHEMA
{
  "job_title": string,
  "geo": { "country": string, "region_or_city": string|null },
  "role_family": "hourly"|"healthcare"|"tech"|"creative"|"corporate"|"logistics_trades",
  "top_channel": {
    "id": string,
    "name": string,
    "fit_score": number,
    "reason_short": string
  },
  "recommended_medium": "video"|"image"|"text",
  "copy_hint": string,
  "alternatives": [
    {"id": string, "fit_score": number},
    {"id": string, "fit_score": number}
  ],
  "compliance_flags": [string]
}
`;

export function buildChannelPickerInstructions(context = {}) {
  const jobTitle = context.jobTitle ?? context.jobSnapshot?.roleTitle ?? "";
  const country =
    context.geo?.country ??
    context.jobSnapshot?.location?.country ??
    context.jobSnapshot?.location ??
    "";
  const regionOrCity =
    context.geo?.region_or_city ??
    context.jobSnapshot?.location?.region ??
    context.jobSnapshot?.location?.city ??
    null;

  const closedChannels = JSON.stringify(CHANNEL_CATALOG, null, 2);

  const payloadObject = {
    overview:
      "You are a channel picker for recruiting. Select the single best distribution channel (from a closed list) to post a job and recommend the best creative medium.",
    constraints: [
      "Choose ONLY from CLOSED_CHANNELS below. Never invent a channel.",
      "Consider only the inputs provided (job_title, country, region_or_city if any). If something is unknown, use the defaults/rules provided.",
      "If a channel is unavailable for the country, assign it a geo score of 0 and do NOT pick it.",
      "Output MUST be valid JSON and follow the OUTPUT SCHEMA exactly. Do not include explanations outside JSON.",
    ],
    closedChannels: CHANNEL_CATALOG,
    instructions: [
      ROLE_FAMILY_RULES.trim(),
      GEO_RULES.trim(),
      `SCORING LOGIC
For each channel, compute a 0–100 "fit_score" using:
- Geo availability (0 or 1) * 40
- Role–channel affinity (0, 0.5, or 1) * 40
- Expected speed-to-applicant for this role (0–1) * 10   // e.g., hourly roles favor Meta/TikTok/Snap; senior tech favors LinkedIn/X
- Media suitability (0–1) * 10                           // e.g., video for hourly/creative/logistics; image/text for senior corporate/tech
Pick the channel with the highest fit_score. If tie, choose the one with: (1) higher geo score, then (2) higher role affinity, then (3) broader reach.

MEDIUM SELECTION
Return exactly one of: "video", "image", "text".
- Prefer "video" for hourly, logistics_trades, healthcare (short day-in-role), creative.
- Prefer "image" for corporate and designer portfolios (carousel works, but choose "image").
- Prefer "text" for X/LinkedIn posts aimed at senior/tech roles when video adds little.
If the chosen channel does not support the chosen medium well, adjust to the closest supported medium in CLOSED_CHANNELS.media.

COPY HINT (one-liner)
Compose a 20–30 word, platform-appropriate hook that includes: role, location/remote, pay or key benefit, and a clear call-to-action.`,
      SCHEMA_TEXT.trim(),
      "VALIDATION: Ensure the selected channel exists in CLOSED_CHANNELS and is allowed for the geo. Ensure recommended_medium is one of the channel’s supported media; if not, switch to a supported medium. Output only the JSON object, nothing else.",
    ],
    jobContext: {
      job_title: jobTitle,
      geo: {
        country: country || "Unknown",
        region_or_city: regionOrCity,
      },
    },
  };

  const payload = JSON.stringify(payloadObject, null, 2);
  llmLogger.info(
    {
      task: "channel_picker",
      content: payload,
      length: payload.length,
      closedChannelsCount: CHANNEL_CATALOG.length,
    },
    "LLM channel picker prompt"
  );

  return payload;
}
