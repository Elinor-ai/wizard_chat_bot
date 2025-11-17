import { llmLogger } from "../logger.js";

function sanitizeCompanySnapshot(company = {}) {
  const snapshot = {
    name: company.name ?? "",
    primaryDomain: company.primaryDomain ?? "",
    industry: company.industry ?? "",
    employeeCountBucket: company.employeeCountBucket ?? "",
    website: company.website ?? "",
    hqCountry: company.hqCountry ?? "",
    hqCity: company.hqCity ?? "",
    tagline: company.tagline ?? "",
    toneOfVoice: company.toneOfVoice ?? "",
    socials: company.socials ?? {},
    intelSummary: company.intelSummary ?? ""
  };
  return snapshot;
}

export function buildCompanyIntelPrompt(context = {}) {
  const domain = context.domain ?? context.company?.primaryDomain ?? "";
  const snapshot = sanitizeCompanySnapshot(context.company ?? {});

  const payload = {
    role: "You are a set of autonomous Gemini agents with access to public knowledge, reasoning tools, and marketing expertise.",
    mission:
      "Collect the most current public-facing intelligence about the organization associated with the provided domain. Summaries must be concise, verifiable, and recruitment-friendly.",
    domain,
    previouslyStoredProfile: snapshot,
    tasks: [
      {
        id: "profile",
        description:
          "Infer or confirm the official company name, succinct tagline, value proposition summary (2 sentences), industry, headcount bucket, headquarters city/country, and website URL."
      },
      {
        id: "brand",
        description:
          "Capture brand guardrails such as primary/secondary colors (hex or CSS names), primary font family, tone of voice keywords, and any notable marketing slogans."
      },
      {
        id: "socials",
        description:
          "List the best-known social handles or URLs for LinkedIn, Facebook, Instagram, TikTok, Twitter/X if confidently known."
      },
      {
        id: "jobs",
        description:
          "List recently advertised roles or evergreen hiring areas with title, location, URL when available, and short description. If nothing is confirmed, return an empty list."
      }
    ],
    responseContract: {
      companyProfile: {
        officialName: "string",
        tagline: "string",
        summary: "string",
        industry: "string",
        companyType: "company | agency | freelancer | marketplace | staffing",
        employeeCountBucket: "one of: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+",
        website: "string (absolute URL)",
        hqCountry: "string",
        hqCity: "string",
        toneOfVoice: "string"
      },
      branding: {
        primaryColor: "string hex or CSS color",
        secondaryColor: "string",
        fontFamilyPrimary: "string"
      },
      socialProfiles: {
        linkedin: "url",
        facebook: "url",
        instagram: "url",
        tiktok: "url",
        twitter: "url"
      },
      jobs: [
        {
          title: "string",
          location: "string",
          description: "string",
          url: "string",
          source: "string label describing where it was seen"
        }
      ]
    },
    guardrails: [
      "Respond with a single JSON object matching the responseContract. Never wrap it in backticks or commentary.",
      "If a field is unknown, omit it or use null; do not invent data.",
      "Favor authoritative sources such as the company's own site or well-known press coverage.",
      "Highlight if the domain appears to redirect to another brand name in the summary.",
      "Limit summaries to 2 sentences."
    ],
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
