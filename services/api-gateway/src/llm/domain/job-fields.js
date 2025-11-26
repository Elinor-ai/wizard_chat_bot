export const JOB_FIELD_GUIDE = [
  {
    id: "roleTitle",
    label: "Role Title",
    required: true,
    description:
      "High-Intent SEO Title: Optimize for maximum Click-Through Rate (CTR). Use the exact, prestigious term high-quality candidates type into search bars. Avoid internal jargon that lowers relevance.",
    example: "Senior Backend Engineer",
  },
  {
    id: "companyName",
    label: "Company Name",
    required: true,
    description:
      "The employer brand name. Ensure it matches the entity candidates recognize and trust.",
    example: "Botson Labs",
  },
  {
    id: "location",
    label: "Primary Location",
    required: true,
    description:
      "Geo-Targeting: Specify the hub that attracts the most relevant talent pool. If Remote, state it clearly to boost CTR from global talent.",
    example: "Tel Aviv, Israel",
  },
  {
    id: "zipCode",
    label: "Postal Code",
    required: false,
    description:
      "Precise targeting for local job boards to ensure the ad appears for candidates within a commutable radius.",
    example: "94107",
  },
  {
    id: "industry",
    label: "Industry",
    required: false,
    description:
      "Sector positioning. Use high-value keywords (e.g., 'FinTech', 'AI') that signal growth and stability to candidates.",
    example: "Artificial Intelligence / SaaS",
  },
  {
    id: "industry",
    label: "Industry",
    required: false,
    description:
      "Industry or business domain of the role, used for benchmarking language and benefits.",
    example: "",
  },
  {
    id: "seniorityLevel",
    label: "Seniority Level",
    required: true,
    description:
      "Career positioning. Align this with the Title to ensure the job appears in the correct salary band filters (entry, mid, senior, lead, executive).",
    example: "mid",
  },
  {
    id: "employmentType",
    label: "Employment Type",
    required: true,
    description:
      "Engagement model. Most high-quality talent filters for 'full_time'. Use 'contract' only if it offers a premium rate.",
    example: "full_time",
  },
  {
    id: "workModel",
    label: "Work Model",
    required: false,
    description:
      "Flexibility Selling Point. 'Remote' or 'Hybrid' are massive CTR boosters. Be explicit to attract modern talent.",
    example: "hybrid",
  },
  {
    id: "jobDescription",
    label: "Job Description",
    required: true,
    description:
      "The 'Hook': A punchy, high-energy opening that sells the mission and impact immediately. Must grab attention in the first 2 lines of a mobile preview.",
    example: "Lead the team delivering AI-assisted hiring tools...",
  },
  {
    id: "coreDuties",
    label: "Core Duties",
    required: false,
    description:
      "The 'Challenge': 3-5 bullet points selling the professional growth and impact. Use strong action verbs that imply ownership and autonomy.",
    example: ["Design scalable APIs", "Partner with product on roadmaps"],
  },
  {
    id: "mustHaves",
    label: "Must-have Qualifications",
    required: false,
    description:
      "The 'Filter': Key hard skills and tech stacks that candidates scan for. Optimizes matching algorithms on job boards.",
    example: ["3+ years with Node.js", "Experience with Firestore at scale"],
  },
  {
    id: "benefits",
    label: "Benefits & Perks",
    required: false,
    description:
      "The 'Closer': Tangible value props that differentiate the offer (Equity, Remote, Bonus). Vague perks lower conversion.",
    example: ["Flexible hybrid schedule", "Equity refresh annually"],
  },
  {
    id: "currency",
    label: "Compensation Currency",
    required: false,
    description: "ISO currency code for salary messaging.",
    example: "USD",
  },
  {
    id: "salary",
    label: "Salary or Range",
    required: false,
    description:
      "The 'Magnet': Transparent ranges increase CTR by ~40%. Use competitive figures formatted clearly.",
    example: "$120,000 – $140,000",
  },
  {
    id: "salaryPeriod",
    label: "Salary Period",
    required: false,
    description: "Cadence for salary context (per year, monthly, hourly).",
    example: "per year",
  },
];

export const JOB_REQUIRED_FIELDS = JOB_FIELD_GUIDE.filter(
  (field) => field.required
).map((field) => field.id);

export const JOB_FIELD_IDS = JOB_FIELD_GUIDE.map((field) => field.id);

export function normaliseCandidates(rawCandidates = []) {
  if (!Array.isArray(rawCandidates)) {
    return [];
  }

  return rawCandidates
    .filter((candidate) => {
      if (!candidate || typeof candidate.fieldId !== "string") {
        return false;
      }
      if (!JOB_FIELD_IDS.includes(candidate.fieldId)) {
        return false;
      }
      if (candidate.value === undefined) {
        return false;
      }
      return true;
    })
    .map((candidate) => ({
      fieldId: candidate.fieldId,
      value: candidate.value,
      rationale: candidate.rationale ?? "",
      confidence:
        typeof candidate.confidence === "number" &&
        candidate.confidence >= 0 &&
        candidate.confidence <= 1
          ? candidate.confidence
          : undefined,
      source: candidate.source ?? "expert-assistant",
    }));
}

export function normaliseRefinedJob(refinedJob, baseJob = {}) {
  const result = {};
  JOB_FIELD_IDS.forEach((fieldId) => {
    const candidate = refinedJob?.[fieldId];
    let value = candidate;

    if (value === undefined || value === null || value === "") {
      value = baseJob?.[fieldId];
    }

    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) => (typeof item === "string" ? item.trim() : item))
        .filter((item) => {
          if (item === undefined || item === null) return false;
          if (typeof item === "string") {
            return item.trim().length > 0;
          }
          return true;
        })
        .map((item) => (typeof item === "string" ? item.trim() : item));
      if (cleaned.length > 0) {
        result[fieldId] = cleaned;
      }
      return;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        result[fieldId] = trimmed;
      }
      return;
    }

    if (value !== undefined && value !== null) {
      result[fieldId] = value;
    }
  });

  return result;
}
