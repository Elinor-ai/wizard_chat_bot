import { llmLogger } from "../logger.js";

function sanitizeCompanySnapshot(company = {}) {
  return {
    id: company.id ?? "",
    name: company.name ?? "",
    primaryDomain: company.primaryDomain ?? "",
    website: company.website ?? "",
    companyType: company.companyType ?? "",
    industry: company.industry ?? "",
    employeeCountBucket: company.employeeCountBucket ?? "",
    hqCountry: company.hqCountry ?? "",
    hqCity: company.hqCity ?? "",
    tagline: company.tagline ?? "",
    description: company.description ?? "",
    toneOfVoice: company.toneOfVoice ?? "",
    socials: company.socials ?? {},
    brand: {
      logoUrl: company.brand?.logoUrl ?? company.logoUrl ?? "",
      primaryColor: company.brand?.colors?.primary ?? company.primaryColor ?? "",
      fontFamilyPrimary: company.brand?.fonts?.primary ?? company.fontFamilyPrimary ?? ""
    },
    intelSummary: company.intelSummary ?? "",
    fieldSources: company.fieldSources ?? {},
    enrichmentStatus: company.enrichmentStatus ?? "",
    jobDiscoveryStatus: company.jobDiscoveryStatus ?? ""
  };
}

function normalizeGaps(gaps = {}) {
  const defaultShape = {
    core: [],
    segmentation: [],
    location: [],
    branding: [],
    voice: [],
    socials: [],
    jobs: []
  };
  const normalized = { ...defaultShape };
  Object.entries(gaps ?? {}).forEach(([section, fields]) => {
    normalized[section] = Array.isArray(fields) ? fields : [];
  });
  return normalized;
}

export function buildCompanyIntelPrompt(context = {}) {
  const snapshotSource = context.companySnapshot ?? context.company ?? {};
  const domain = context.domain ?? snapshotSource?.primaryDomain ?? "";
  const snapshot = sanitizeCompanySnapshot(snapshotSource);
  const gaps = normalizeGaps(context.gaps);

  const payload = {
    role:
      "You are Wizard's company intelligence collective. You triangulate Brandfetch results, LinkedIn data, and public web sources to fill only the requested gaps.",
    mission:
      "Confirm or fill the missing fields for the company tied to this domain. Treat existing values as ground truth unless you have strong contradictory evidence and can cite the new source.",
    domain,
    companySnapshot: snapshot,
    missingTargets: gaps,
    guidance: [
      "Only output values for fields listed in missingTargets.* unless you have definitive proof that an existing value is wrong. Call out corrections via evidence.sources.",
      "Always attempt job discovery; return an empty array when nothing reliable is found.",
      "Favor primary sources (official website, press releases, LinkedIn company page, trusted news) over scraped directories.",
      "Provide concise descriptions (summary max 2 sentences) suitable for recruiters.",
      "Every field you populate must have an evidence entry listing the sources that justify it.",
      "Do not hallucinate social URLs or job postings. Return null/omit if uncertain."
    ],
    responseContract: {
      profile: {
        officialName: "string",
        website: "absolute URL",
        companyType: "company | agency | freelancer",
        industry: "string",
        employeeCountBucket: "1-10 | 11-50 | 51-200 | 201-500 | 501-1000 | 1000+",
        hqCountry: "string",
        hqCity: "string",
        tagline: "string",
        summary: "<=2 sentences overview",
        toneOfVoice: "keywords describing writing voice"
      },
      branding: {
        primaryColor: "hex or CSS color keyword",
        secondaryColor: "hex or CSS color keyword",
        fontFamilyPrimary: "string",
        additionalBrandNotes: "optional short notes about slogans or design patterns"
      },
      socials: {
        linkedin: "url",
        facebook: "url",
        instagram: "url",
        tiktok: "url",
        twitter: "url",
        youtube: "url"
      },
      jobs: [
        {
          title: "string",
          url: "absolute URL to the job or application",
          location: "city/state or remote",
          description: "one-sentence summary",
          source: "careers-site | linkedin | linkedin-post | other",
          externalId: "string or null",
          postedAt: "ISO-8601 timestamp or null"
        }
      ],
      evidence: {
        profile: {
          field: { value: "string", sources: ["list of evidence labels or URLs"] }
        },
        branding: {
          field: { value: "string", sources: ["..."] }
        },
        socials: {
          field: { value: "string", sources: ["..."] }
        },
        jobs: [
          {
            title: "string",
            url: "string",
            sources: ["linkedin-jobs-tab", "careers-page", "news-article"]
          }
        ]
      }
    },
    attempt: context.attempt ?? 0,
    strictMode: context.strictMode ?? false
  };

  const prompt = JSON.stringify(payload, null, 2);
  llmLogger.debug(
    {
      task: "company_intel",
      domain,
      length: prompt.length
    },
    "LLM company intel prompt built"
  );
  return prompt;
}
