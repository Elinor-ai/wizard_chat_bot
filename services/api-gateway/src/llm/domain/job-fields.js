export const JOB_FIELD_GUIDE = [
  {
    id: "roleTitle",
    label: "Role Title",
    required: true,
    description:
      "The job title candidates search for; keep it clear and industry-standard.",
    example: "Senior Backend Engineer",
  },
  {
    id: "companyName",
    label: "Company Name",
    required: true,
    description: "The employer or brand the candidate will work for.",
    example: "Botson Labs",
  },
  {
    id: "location",
    label: "Primary Location",
    required: true,
    description:
      "City, region, or 'Remote' descriptor candidates need for the commute expectation.",
    example: "Tel Aviv, Israel",
  },
  {
    id: "zipCode",
    label: "Postal Code",
    required: false,
    description:
      "ZIP or postal code for precise geo-targeting or compensation benchmarking.",
    example: "94107",
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
      "Candidate experience expectation (entry, mid, senior, lead, executive).",
    example: "mid",
  },
  {
    id: "employmentType",
    label: "Employment Type",
    required: true,
    description:
      "Engagement type advertised to candidates (full_time, part_time, contract, temporary, seasonal, intern).",
    example: "full_time",
  },
  {
    id: "workModel",
    label: "Work Model",
    required: false,
    description: "Primary work arrangement (on_site, hybrid, remote).",
    example: "hybrid",
  },
  {
    id: "jobDescription",
    label: "Job Description",
    required: true,
    description:
      "Narrative summary explaining mission, impact, and what success looks like in the role.",
    example: "Lead the team delivering AI-assisted hiring tools...",
  },
  {
    id: "coreDuties",
    label: "Core Duties",
    required: false,
    description:
      "Bullet-friendly list of daily responsibilities or ownership areas.",
    example: ["Design scalable APIs", "Partner with product on roadmaps"],
  },
  {
    id: "mustHaves",
    label: "Must-have Qualifications",
    required: false,
    description:
      "Non-negotiable skills, experiences, or certifications candidates must bring.",
    example: ["3+ years with Node.js", "Experience with Firestore at scale"],
  },
  {
    id: "benefits",
    label: "Benefits & Perks",
    required: false,
    description:
      "Meaningful benefits that differentiate the role (one item per perk).",
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
      "Compensation figure candidates should see, ideally formatted with units.",
    example: "$120,000 – $140,000",
  },
  {
    id: "salaryPeriod",
    label: "Salary Period",
    required: false,
    description: "Cadence for salary (per year, monthly, hourly, per shift).",
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
