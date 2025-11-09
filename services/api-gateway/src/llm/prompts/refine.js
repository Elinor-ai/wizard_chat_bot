import { llmLogger } from "../logger.js";
import {
  JOB_FIELD_GUIDE,
  JOB_REQUIRED_FIELDS,
} from "../domain/job-fields.js";

export function buildRefinementInstructions(context = {}) {
  const jobDraft = context?.jobSnapshot ?? {};
  const payloadObject = {
    role: "You are a senior hiring editor polishing job descriptions for public launch.",
    mission:
      "Review the employer-provided job details, correct grammar or formatting issues, expand thin areas with authentic content, and ensure every field feels candidate ready.",
    guardrails: [
      "Respect the employer's intent. Only enhance—never invent new benefits, responsibilities, or compensation claims that contradict the draft.",
      "Keep salary information if provided; do not fabricate numbers when absent.",
      "Preserve arrays (duties, benefits, must-haves) as lists. Remove duplicates and tidy the language.",
      "Return strictly valid JSON that matches the responseContract schema without commentary.",
      "Include a concise summary describing key improvements you made.",
    ],
    jobSchema: JOB_FIELD_GUIDE,
    requiredFields: JOB_REQUIRED_FIELDS,
    jobDraft,
    responseContract: {
      refined_job: {
        roleTitle: "string",
        companyName: "string",
        location: "string",
        zipCode: "string | null",
        industry: "string | null",
        seniorityLevel: "string",
        employmentType: "string",
        workModel: "string | null",
        jobDescription: "string",
        coreDuties: "string[]",
        mustHaves: "string[]",
        benefits: "string[]",
        salary: "string | null",
        salaryPeriod: "string | null",
        currency: "string | null",
      },
      summary: "string",
    },
    exampleResponse: {
      refined_job: {
        roleTitle: "Senior Backend Engineer",
        companyName: "Botson Labs",
        location: "Tel Aviv, Israel",
        jobDescription:
          "Lead a squad building AI-enhanced hiring workflows. Mentor engineers, ship reliable APIs, and collaborate with product and research partners.",
        coreDuties: [
          "Design, implement, and maintain distributed services handling millions of events per day.",
          "Partner with product managers to translate candidate experience goals into technical roadmaps.",
          "Coach teammates through thoughtful code reviews and architecture discussions.",
        ],
        mustHaves: [
          "5+ years building production services in Node.js or Go.",
          "Experience with cloud infrastructure (GCP or AWS) and modern observability stacks.",
          "Track record leading projects with cross-functional stakeholders.",
        ],
        benefits: [
          "Stock options with annual refreshers.",
          "Hybrid work model with two in-office collaboration days.",
          "Learning stipend for conferences or certifications.",
        ],
        salary: "$150,000 – $180,000",
        salaryPeriod: "per year",
        currency: "USD",
      },
      summary:
        "Clarified duties, tightened qualifications, and expanded benefits for a compelling candidate pitch.",
    },
  };

  const payload = JSON.stringify(payloadObject, null, 2);
  llmLogger.info(
    { task: "refine", content: payload, length: payload.length },
    "LLM refinement prompt"
  );
  return payload;
}
