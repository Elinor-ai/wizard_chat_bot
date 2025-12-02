import { CompanySchema } from "@wizard/core";
import { LLM_CORE_TASK, LLM_LOGGING_TASK } from "../config/task-types.js";

const COMPANY_COLLECTION = "companies";

export function sanitizeCompanyProfile(raw) {
  if (!raw) {
    return null;
  }
  const parsed = CompanySchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return null;
}

export async function loadCompanyProfile({ firestore, companyId, logger }) {
  if (!firestore || !companyId) {
    return null;
  }
  try {
    const rawCompany = await firestore.getDocument(
      COMPANY_COLLECTION,
      companyId
    );
    if (!rawCompany) {
      return null;
    }
    return sanitizeCompanyProfile(rawCompany);
  } catch (error) {
    logger?.warn?.({ companyId, err: error }, "Failed to load company profile");
    return null;
  }
}

export function buildTailoredCompanyContext(companyProfile, taskType) {
  if (!companyProfile || typeof companyProfile !== "object") {
    return "";
  }
  const normalizedTask = typeof taskType === "string" ? taskType.toLowerCase() : "";
  const sections = [];
  const push = (label, value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    sections.push(`${label}: ${trimmed}`);
  };

  const industry = companyProfile.industry;
  const toneOfVoice =
    companyProfile.toneOfVoice ?? companyProfile.brand?.toneOfVoiceHint ?? null;
  const intelSummary =
    companyProfile.intelSummary ?? companyProfile.description ?? null;
  const longDescription = companyProfile.longDescription ?? null;
  const employeeCount = companyProfile.employeeCountBucket ?? null;
  const hqCountry = companyProfile.hqCountry ?? null;
  const primaryColor =
    companyProfile.primaryColor ?? companyProfile.brand?.colors?.primary ?? null;
  const secondaryColor =
    companyProfile.secondaryColor ?? companyProfile.brand?.colors?.secondary ?? null;
  const fontFamily =
    companyProfile.fontFamilyPrimary ?? companyProfile.brand?.fonts?.primary ?? null;
  const logoUrl =
    companyProfile.brand?.logoUrl ??
    companyProfile.logoUrl ??
    companyProfile.brand?.iconUrl ??
    null;
  const tagline = companyProfile.tagline ?? null;
  const socials = companyProfile.socials ?? {};

  if (normalizedTask === "job_refinement") {
    push("Tone of voice", toneOfVoice);
    push("Company summary", intelSummary);
    push("Long description", longDescription);
    push("Industry", industry);
  } else if (
    normalizedTask === LLM_LOGGING_TASK.SUGGESTIONS ||
    normalizedTask === "wizard_suggestions" // Legacy support
  ) {
    push("Industry", industry);
    push("Employee count bucket", employeeCount);
    push("HQ country", hqCountry);
  } else if (normalizedTask === "channel_recommendations") {
    push("Industry", industry);
    push("Employee count bucket", employeeCount);
  } else if (
    normalizedTask === LLM_CORE_TASK.IMAGE_PROMPT_GENERATION ||
    normalizedTask === "video_script"
  ) {
    push("Primary color", primaryColor);
    push("Secondary color", secondaryColor);
    push("Primary font", fontFamily);
    push("Industry", industry);
    push("Logo URL", logoUrl);
  } else if (normalizedTask === "social_posts") {
    push("Tone of voice", toneOfVoice);
    push("Tagline", tagline);
    if (socials && typeof socials === "object") {
      const handles = Object.entries(socials)
        .filter(
          ([, value]) => typeof value === "string" && value.trim().length > 0
        )
        .map(([network, url]) => `${network}: ${url.trim()}`);
      if (handles.length > 0) {
        sections.push(
          `Social profiles:\n${handles.map((entry) => `- ${entry}`).join("\n")}`
        );
      }
    }
  }

  return sections.join("\n").trim();
}

export async function loadCompanyContext({
  firestore,
  companyId,
  taskType,
  logger
}) {
  if (!companyId) {
    return "";
  }
  const profile = await loadCompanyProfile({ firestore, companyId, logger });
  if (!profile) {
    return "";
  }
  return buildTailoredCompanyContext(profile, taskType);
}
