import { safePreview } from "../utils/parsing.js";

function coerceString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function normalizeUrl(value) {
  const str = coerceString(value);
  if (!str) return null;
  if (/^https?:\/\//i.test(str)) {
    return str;
  }
  return `https://${str.replace(/^\/+/, "")}`;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function coerceStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => coerceString(item))
    .filter(Boolean);
}

function normalizeJob(job) {
  if (!job || typeof job !== "object") {
    return null;
  }
  const title = coerceString(job.title);
  if (!title) {
    return null;
  }
  const url = normalizeUrl(job.url);
  if (!url) {
    return null;
  }
  return {
    title,
    url,
    location: coerceString(job.location) ?? "",
    description: coerceString(job.description) ?? "",
    industry: coerceString(job.industry),
    seniorityLevel: coerceString(job.seniorityLevel),
    employmentType: coerceString(job.employmentType),
    workModel: coerceString(job.workModel),
    source: coerceString(job.source) ?? "intel-agent",
    externalId: coerceString(job.externalId),
    postedAt: parseDate(job.postedAt),
    discoveredAt: parseDate(job.discoveredAt),
    coreDuties: coerceStringArray(job.coreDuties),
    mustHaves: coerceStringArray(job.mustHaves),
    benefits: coerceStringArray(job.benefits),
    salary: coerceString(job.salary),
    salaryPeriod: coerceString(job.salaryPeriod),
    currency: coerceString(job.currency),
    confidence:
      typeof job.confidence === "number"
        ? Math.min(Math.max(job.confidence, 0), 1)
        : null,
    fieldConfidence:
      job.fieldConfidence && typeof job.fieldConfidence === "object"
        ? Object.fromEntries(
            Object.entries(job.fieldConfidence)
              .map(([key, value]) => {
                if (typeof value !== "number") {
                  return null;
                }
                const normalized = Math.min(Math.max(value, 0), 1);
                return [key, normalized];
              })
              .filter(Boolean)
          )
        : null,
    sourceEvidence: coerceStringArray(job.sourceEvidence)
  };
}

function normalizeEvidenceSection(section = {}) {
  const normalized = {};
  Object.entries(section ?? {}).forEach(([field, entry]) => {
    if (!field || !entry) return;
    const value =
      typeof entry === "object" && entry.value !== undefined ? entry.value : entry;
    const sources = Array.isArray(entry?.sources)
      ? entry.sources.map((source) => coerceString(source)).filter(Boolean)
      : [];
    normalized[field] = {
      value: value ?? null,
      sources
    };
  });
  return normalized;
}

function normalizeEvidence(evidence = {}) {
  const jobs = Array.isArray(evidence?.jobs)
    ? evidence.jobs
        .map((entry) => ({
          title: coerceString(entry?.title),
          url: normalizeUrl(entry?.url),
          sources: Array.isArray(entry?.sources)
            ? entry.sources.map((source) => coerceString(source)).filter(Boolean)
            : []
        }))
        .filter((item) => item.title || item.url)
    : [];
  return {
    profile: normalizeEvidenceSection(evidence?.profile),
    branding: normalizeEvidenceSection(evidence?.branding),
    socials: normalizeEvidenceSection(evidence?.socials),
    jobs
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

  const profile = payload.profile ?? {};
  const branding = payload.branding ?? {};
  const socials = payload.socials ?? {};
  const jobsPayload = Array.isArray(payload.jobs) ? payload.jobs : [];
  const jobs = jobsPayload.map(normalizeJob).filter(Boolean);

  const metadata = {
    ...(response?.metadata ?? {}),
    rawPreview: safePreview(raw)
  };

  return {
    profile: {
      officialName: coerceString(profile.officialName),
      website: normalizeUrl(profile.website),
      companyType: coerceString(profile.companyType),
      industry: coerceString(profile.industry),
      employeeCountBucket: coerceString(profile.employeeCountBucket),
      hqCountry: coerceString(profile.hqCountry),
      hqCity: coerceString(profile.hqCity),
      tagline: coerceString(profile.tagline),
      summary: coerceString(profile.summary),
      toneOfVoice: coerceString(profile.toneOfVoice)
    },
    branding: {
      primaryColor: coerceString(branding.primaryColor),
      secondaryColor: coerceString(branding.secondaryColor),
      fontFamilyPrimary: coerceString(branding.fontFamilyPrimary),
      additionalBrandNotes: coerceString(branding.additionalBrandNotes)
    },
    socials: {
      linkedin: normalizeUrl(socials.linkedin),
      facebook: normalizeUrl(socials.facebook),
      instagram: normalizeUrl(socials.instagram),
      tiktok: normalizeUrl(socials.tiktok),
      twitter: normalizeUrl(socials.twitter),
      youtube: normalizeUrl(socials.youtube)
    },
    jobs,
    evidence: normalizeEvidence(payload.evidence ?? {}),
    metadata
  };
}
