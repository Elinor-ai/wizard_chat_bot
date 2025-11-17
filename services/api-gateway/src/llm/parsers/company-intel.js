import { safePreview } from "../utils/parsing.js";

function coerceString(value) {
  if (!value) return null;
  return String(value).trim() || null;
}

function normalizeUrl(value) {
  const str = coerceString(value);
  if (!str) return null;
  if (/^https?:\/\//i.test(str)) {
    return str;
  }
  return `https://${str}`;
}

function normalizeJob(job) {
  if (!job || typeof job !== "object") {
    return null;
  }
  const title = coerceString(job.title);
  if (!title) {
    return null;
  }
  return {
    title,
    location: coerceString(job.location) ?? "",
    description: coerceString(job.description) ?? "",
    url: coerceString(job.url) ?? null,
    source: coerceString(job.source) ?? "intel-agent"
  };
}

export function parseCompanyIntelResult(response) {
  const raw = response?.text?.trim();
  if (!raw) {
    throw new Error("Company intel response was empty");
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Company intel JSON parse failed: ${error?.message ?? error}`);
  }

  const profile = payload.companyProfile ?? {};
  const branding = payload.branding ?? {};
  const socials = payload.socialProfiles ?? {};
  const jobs = Array.isArray(payload.jobs) ? payload.jobs.map(normalizeJob).filter(Boolean) : [];

  return {
    profile: {
      officialName: coerceString(profile.officialName),
      tagline: coerceString(profile.tagline),
      summary: coerceString(profile.summary),
      industry: coerceString(profile.industry),
      companyType: coerceString(profile.companyType),
      employeeCountBucket: coerceString(profile.employeeCountBucket),
      website: normalizeUrl(profile.website),
      hqCountry: coerceString(profile.hqCountry),
      hqCity: coerceString(profile.hqCity),
      toneOfVoice: coerceString(profile.toneOfVoice)
    },
    branding: {
      primaryColor: coerceString(branding.primaryColor),
      secondaryColor: coerceString(branding.secondaryColor),
      fontFamilyPrimary: coerceString(branding.fontFamilyPrimary)
    },
    socials: {
      linkedin: normalizeUrl(socials.linkedin),
      facebook: normalizeUrl(socials.facebook),
      instagram: normalizeUrl(socials.instagram),
      tiktok: normalizeUrl(socials.tiktok),
      twitter: normalizeUrl(socials.twitter)
    },
    jobs,
    metadata: {
      rawPreview: safePreview(raw)
    }
  };
}
