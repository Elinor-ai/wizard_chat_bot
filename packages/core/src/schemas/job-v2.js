import { z } from "zod";

const GeoSchema = z
  .object({
    latitude: z.number().optional(),
    longitude: z.number().optional()
  })
  .optional();

const LocationSchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  work_model: z.enum(["on_site", "hybrid", "remote"]).optional(),
  radius_km: z.number().optional(),
  geo: GeoSchema
});

export const JobSchemaV2 = z.object({
  schema_version: z.literal("2"),
  core: z.object({
    job_id: z.string(),
    company_id: z.string(),
    job_title: z.string(),
    job_title_variations: z.array(z.string()).default([]),
    internal_job_code: z.string().optional(),
    industry: z.string(),
    sub_industry: z.string().optional(),
    job_family: z.string(),
    seniority_level: z.enum([
      "entry",
      "mid",
      "senior",
      "lead",
      "principal",
      "executive"
    ]),
    employment_type: z.string().optional()
  }),
  location: LocationSchema.optional(),
  role_description: z.object({
    recruiter_input: z.string(),
    tldr_pitch: z.string().optional(),
    day_to_day: z.array(z.string()).default([]),
    problem_being_solved: z.string().optional(),
    impact_metrics: z.object({
      team_impact: z.string().optional(),
      company_impact: z.string().optional(),
      customer_impact: z.string().optional(),
      industry_impact: z.string().optional()
    }),
    responsibilities: z.object({
      core: z.array(z.string()).default([]),
      growth: z.array(z.string()).default([]),
      collaborative: z.array(z.string()).default([])
    }),
    first_30_60_90_days: z.object({
      days_30: z.string().optional(),
      days_60: z.string().optional(),
      days_90: z.string().optional()
    })
  }),
  team_context: z
    .object({
      reporting_structure: z
        .object({
          reports_to: z.string().optional(),
          direct_reports: z.number().optional(),
          dotted_line: z.array(z.string()).default([])
        })
        .optional(),
      collaboration_style: z.string().optional()
    })
    .optional(),
  compensation: z
    .object({
      salary_range: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
          currency: z.string().optional(),
          period: z.enum(["hour", "month", "year"]).optional(),
          display_strategy: z
            .enum(["show_full", "show_min", "show_competitive", "hide"])
            .optional(),
          overtime_eligible: z.boolean().optional()
        })
        .optional(),
      equity: z
        .object({
          offered: z.boolean().optional(),
          type: z.enum(["stock_options", "rsu", "phantom", "none"]).optional(),
          range: z.string().optional(),
          stage_context: z.string().optional()
        })
        .optional(),
      bonus_structure: z
        .object({
          type: z.enum(["performance", "signing", "annual", "quarterly"]).optional(),
          potential: z.string().optional()
        })
        .optional(),
      total_comp_range: z
        .object({
          min: z.number().optional(),
          max: z.number().optional()
        })
        .optional()
    })
    .optional(),
  benefits: z
    .object({
      standout_benefits: z.array(z.string()).default([])
    })
    .optional(),
  requirements: z
    .object({
      hard_requirements: z
        .object({
          technical_skills: z
            .object({
              must_have: z.array(z.string()).default([])
            })
            .optional(),
          certifications: z.array(z.string()).default([]),
          dealbreakers: z.array(z.string()).default([]),
          legal: z
            .object({
              work_authorization: z.array(z.string()).default([]),
              other_notes: z.string().optional()
            })
            .optional()
        })
        .optional(),
      preferred_qualifications: z
        .object({
          skills: z.array(z.string()).default([]),
          experiences: z.array(z.string()).default([])
        })
        .optional()
    })
    .optional(),
  application_process: z
    .object({
      apply_method: z.string().optional(),
      internal_form_id: z.string().optional(),
      external_url: z.string().optional(),
      steps: z.array(z.string()).default([]),
      total_timeline: z.string().optional(),
      start_date: z
        .object({
          target: z.string().optional(),
          flexibility: z.string().optional()
        })
        .optional()
    })
    .optional(),
  company_context: z
    .object({
      branding: z
        .object({
          logo_url: z.string().optional(),
          color: z.string().optional()
        })
        .optional(),
      company_name: z.string().optional(),
      company_tagline: z.string().optional(),
      dei_commitment: z.string().optional()
    })
    .optional(),
  metadata: z.object({
    created_at: z.number(),
    updated_at: z.number(),
    created_by: z.string(),
    extraction_source: z.enum([
      "manual_form",
      "ats_import",
      "jd_upload",
      "conversational_intake"
    ]),
    completeness_score: z.number().optional(),
    llm_generation_hints: z
      .object({
        tone: z
          .enum(["professional", "casual", "inspiring", "technical", "urgent"])
          .or(z.string())
          .optional(),
        length_preference: z
          .enum(["concise", "detailed", "comprehensive"])
          .optional(),
        emphasis_areas: z.array(z.string()).optional(),
        avoid_phrases: z.array(z.string()).optional()
      })
      .optional(),
    tags: z.array(z.string()).default([]),
    approval_status: z.enum([
      "draft",
      "pending_review",
      "approved",
      "live",
      "archived"
    ])
  })
});

export const JobDraftV2 = JobSchemaV2;
