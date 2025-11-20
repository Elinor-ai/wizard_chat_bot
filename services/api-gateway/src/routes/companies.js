import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import {
  CompanySchema,
  CompanyDiscoveredJobSchema,
  CompanyEnrichmentStatusEnum,
  CompanyJobDiscoveryStatusEnum,
  CompanyTypeEnum
} from "@wizard/core";
import {
  extractEmailDomain,
  isGenericEmailDomain,
  ensureCompanyEnrichmentQueued,
  ensureCompanyForDomain
} from "../services/company-intel.js";

const PLACEHOLDER_URL_PATTERNS = [/example\.com/i, /sample/i, /placeholder/i, /dummy/i];
const DomainStringSchema = z
  .string()
  .min(3)
  .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
  .transform((value) => value.trim().toLowerCase());

function ensureEnumValue(enumShape, value, fallback) {
  const allowed = Object.values(enumShape.enum ?? {});
  return allowed.includes(value) ? value : fallback;
}

function sanitizeCompanyRecord(rawCompany, fallbackDomain = "") {
  const fallbackDate = new Date();
  const normalizedDomain =
    typeof rawCompany.primaryDomain === "string" && rawCompany.primaryDomain.trim().length > 0
      ? rawCompany.primaryDomain.toLowerCase()
      : (fallbackDomain ?? "").toLowerCase();
  return {
    ...rawCompany,
    name: typeof rawCompany.name === "string" ? rawCompany.name : "",
    primaryDomain: normalizedDomain,
    additionalDomains: Array.isArray(rawCompany.additionalDomains)
      ? rawCompany.additionalDomains.filter((domain) => typeof domain === "string" && domain.trim())
      : [],
    enrichmentStatus: ensureEnumValue(
      CompanyEnrichmentStatusEnum,
      rawCompany.enrichmentStatus,
      CompanyEnrichmentStatusEnum.enum.PENDING
    ),
    jobDiscoveryStatus: ensureEnumValue(
      CompanyJobDiscoveryStatusEnum,
      rawCompany.jobDiscoveryStatus,
      CompanyJobDiscoveryStatusEnum.enum.UNKNOWN
    ),
    companyType: ensureEnumValue(CompanyTypeEnum, rawCompany.companyType, CompanyTypeEnum.enum.company),
    createdAt: rawCompany.createdAt ?? rawCompany.updatedAt ?? fallbackDate,
    updatedAt: rawCompany.updatedAt ?? rawCompany.createdAt ?? fallbackDate
  };
}

async function resolveCompanyContext({ firestore, user, logger }) {
  const userDoc = await firestore.getDocument("users", user.id);
  if (!userDoc) {
    throw httpError(404, "User context not found");
  }
  let rawCompany = null;
  const profileCompanyId =
    userDoc.profile?.mainCompanyId ??
    userDoc.profile?.companyId ??
    null;
  let lookupDomain = userDoc.profile?.companyDomain?.toLowerCase?.() ?? null;

  if (profileCompanyId) {
    rawCompany = await firestore.getDocument("companies", profileCompanyId);
  }

  if (!rawCompany) {
    const domainFromProfile = userDoc.profile?.companyDomain ?? null;
    const fallbackDomain = extractEmailDomain(userDoc.auth?.email ?? user.email ?? null);
    const domain = (domainFromProfile || fallbackDomain || "").toLowerCase();
    lookupDomain = domain;
    if (!domain || isGenericEmailDomain(domain)) {
      throw httpError(404, "No company associated with this account");
    }
    rawCompany = await firestore.getCompanyByDomain(domain);
    if (!rawCompany) {
      throw httpError(404, "Company not found for this domain");
    }
  }

  if (!rawCompany) {
    throw httpError(404, "Company record missing");
  }
  const sanitized = sanitizeCompanyRecord(rawCompany, lookupDomain);
  const parsed = CompanySchema.safeParse(sanitized);
  if (!parsed.success) {
    logger?.error?.(
      {
        userId: user.id,
        companyId: rawCompany?.id ?? null,
        issues: parsed.error?.flatten?.()
      },
      "Company record invalid"
    );
    throw httpError(500, "Company record invalid");
  }
  return parsed.data;
}

function normalizeCompanyJobs(jobs = []) {
  return jobs
    .map((job) => {
      const parsed = CompanyDiscoveredJobSchema.safeParse(job);
      return parsed.success ? parsed.data : null;
    })
    .filter((job) => {
      if (!job) return false;
      if (!job.url) return true;
      const url = String(job.url).toLowerCase();
      return !PLACEHOLDER_URL_PATTERNS.some((pattern) => pattern.test(url));
    });
}

export async function listCompaniesForUser({ firestore, user, logger }) {
  const userDoc = await firestore.getDocument("users", user.id);
  if (!userDoc) {
    throw httpError(404, "User context not found");
  }

  const companies = new Map();
  const collect = (rawCompany) => {
    if (!rawCompany?.id) {
      return;
    }
    const sanitized = sanitizeCompanyRecord(rawCompany, rawCompany.primaryDomain);
    const parsed = CompanySchema.safeParse(sanitized);
    if (!parsed.success) {
      logger?.error?.(
        { userId: user.id, companyId: rawCompany.id, issues: parsed.error?.flatten?.() },
        "User company record invalid"
      );
      return;
    }
    companies.set(parsed.data.id, parsed.data);
  };

  const profileCompanyIds = Array.isArray(userDoc.profile?.companyIds)
    ? userDoc.profile.companyIds.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  const mainCompanyId = userDoc.profile?.mainCompanyId ?? null;
  const uniqueCompanyIds = new Set(profileCompanyIds);
  if (typeof mainCompanyId === "string" && mainCompanyId.trim().length > 0) {
    uniqueCompanyIds.add(mainCompanyId.trim());
  }
  for (const companyId of uniqueCompanyIds) {
    const direct = await firestore.getDocument("companies", companyId);
    collect(direct);
  }

  const domain = userDoc.profile?.companyDomain ?? null;
  if (domain) {
    const fromDomain = await firestore.getCompanyByDomain(domain);
    collect(fromDomain);
  }

  const created = await firestore.queryDocuments("companies", "createdByUserId", "==", user.id);
  created.forEach(collect);

  return Array.from(companies.values());
}

function buildCompanyUpdatePatch(payload) {
  const stringFields = [
    "name",
    "industry",
    "employeeCountBucket",
    "hqCountry",
    "hqCity",
    "website",
    "logoUrl",
    "tagline",
    "toneOfVoice",
    "primaryColor",
    "secondaryColor",
    "fontFamilyPrimary"
  ];
  const patch = {};
  stringFields.forEach((field) => {
    if (payload[field] === undefined) {
      return;
    }
    const value = payload[field];
    patch[field] = typeof value === "string" ? value.trim() : value;
  });
  if (payload.companyType) {
    patch.companyType = payload.companyType;
  }
  if (payload.socials) {
    const socials = {};
    Object.entries(payload.socials).forEach(([key, value]) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      socials[key] = trimmed;
    });
    patch.socials = socials;
  }
  patch.updatedAt = new Date();
  return patch;
}

const confirmNameSchema = z.object({
  approved: z.boolean(),
  name: z.string().min(2).optional(),
  hqCountry: z.string().optional(),
  hqCity: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  primaryDomain: DomainStringSchema.optional()
});

const confirmProfileSchema = z.object({
  approved: z.boolean(),
  name: z.string().optional(),
  hqCountry: z.string().optional(),
  hqCity: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional()
});

const socialUpdateSchema = z
  .object({
    linkedin: z.string().url().optional(),
    facebook: z.string().url().optional(),
    instagram: z.string().url().optional(),
    tiktok: z.string().url().optional(),
    twitter: z.string().url().optional()
  })
  .partial();

const companyUpdateSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    companyType: CompanyTypeEnum.optional(),
    industry: z.string().max(200).optional(),
    employeeCountBucket: z.string().max(100).optional(),
    hqCountry: z.string().max(120).optional(),
    hqCity: z.string().max(120).optional(),
    website: z.string().max(2048).optional(),
    logoUrl: z.string().max(2048).optional(),
    tagline: z.string().max(280).optional(),
    toneOfVoice: z.string().max(280).optional(),
    primaryColor: z.string().max(64).optional(),
    secondaryColor: z.string().max(64).optional(),
    fontFamilyPrimary: z.string().max(160).optional(),
    primaryDomain: DomainStringSchema.optional(),
    socials: socialUpdateSchema.optional()
  })
  .strict();

const createCompanySchema = z.object({
  primaryDomain: DomainStringSchema,
  name: z.string().min(2).optional(),
  hqCountry: z.string().optional(),
  hqCity: z.string().optional()
});

export function companiesRouter({ firestore, logger }) {
  const router = Router();

  router.get(
    "/me",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const company = await resolveCompanyContext({ firestore, user, logger });
      logger?.info?.({ userId: user.id, companyId: company.id }, "Fetched company overview");
      res.json({
        company,
        hasDiscoveredJobs: company.jobDiscoveryStatus === "FOUND_JOBS"
      });
    })
  );

  router.get(
    "/me/jobs",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const company = await resolveCompanyContext({ firestore, user, logger });
      const rawJobs = await firestore.listCompanyJobs(company.id);
      const jobs = normalizeCompanyJobs(rawJobs);
      logger?.info?.(
        { userId: user.id, companyId: company.id, jobCount: jobs.length },
        "Fetched discovered company jobs"
      );
      res.json({
        companyId: company.id,
        jobs
      });
    })
  );

  router.post(
    "/me/confirm-name",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const payload = confirmNameSchema.parse(req.body ?? {});
      const company = await resolveCompanyContext({ firestore, user, logger });
      const countryInput =
        typeof (payload.hqCountry ?? payload.country) === "string"
          ? payload.hqCountry ?? payload.country
          : undefined;
      const cityInput =
        typeof (payload.hqCity ?? payload.city) === "string"
          ? payload.hqCity ?? payload.city
          : undefined;

      if (company.nameConfirmed && payload.approved) {
        return res.json({
          company,
          hasDiscoveredJobs: company.jobDiscoveryStatus === "FOUND_JOBS"
        });
      }

      if (!payload.approved && !payload.name) {
        throw httpError(400, "Company name is required when correcting");
      }

      const updates = {
        updatedAt: new Date()
      };

      if (!company.nameConfirmed || !payload.approved) {
        updates.nameConfirmed = true;
      }

      if (!payload.approved) {
        updates.name = payload.name;
        if (cityInput !== undefined) {
          updates.hqCity = cityInput;
        }
        if (countryInput !== undefined) {
          updates.hqCountry = countryInput;
        }
        if (cityInput !== undefined || countryInput !== undefined) {
          updates.locationHint =
            [cityInput, countryInput].filter((value) => value && value.length > 0).join(", ") ||
            company.locationHint ||
            "";
        }
      }

      if (payload.primaryDomain) {
        const normalized = payload.primaryDomain;
        if (normalized !== company.primaryDomain) {
          const previousDomains = Array.isArray(company.additionalDomains)
            ? company.additionalDomains.filter((value) => typeof value === "string" && value.length > 0)
            : [];
          if (company.primaryDomain) {
            previousDomains.push(company.primaryDomain);
          }
          updates.primaryDomain = normalized;
          updates.additionalDomains = Array.from(new Set(previousDomains));
          if (!company.website) {
            updates.website = `https://${normalized}`;
          }
        }
      }

      if (
        payload.approved === false ||
        company.enrichmentStatus !== CompanyEnrichmentStatusEnum.enum.READY
      ) {
        updates.enrichmentStatus = CompanyEnrichmentStatusEnum.enum.PENDING;
        updates.profileConfirmed = false;
      }

      await firestore.saveCompanyDocument(company.id, updates);
      const refreshed = CompanySchema.parse(await firestore.getDocument("companies", company.id));
      await ensureCompanyEnrichmentQueued({ firestore, logger, company: refreshed });

      res.json({
        company: refreshed,
        hasDiscoveredJobs: refreshed.jobDiscoveryStatus === "FOUND_JOBS"
      });
    })
  );

  router.post(
    "/me/confirm-profile",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const payload = confirmProfileSchema.parse(req.body ?? {});
      const company = await resolveCompanyContext({ firestore, user, logger });
      const countryInput =
        typeof (payload.hqCountry ?? payload.country) === "string"
          ? payload.hqCountry ?? payload.country
          : undefined;
      const cityInput =
        typeof (payload.hqCity ?? payload.city) === "string"
          ? payload.hqCity ?? payload.city
          : undefined;

      const updates = {
        updatedAt: new Date()
      };

      if (payload.approved) {
        updates.profileConfirmed = true;
        await firestore.saveCompanyDocument(company.id, updates);
        const refreshed = CompanySchema.parse(await firestore.getDocument("companies", company.id));
        return res.json({
          company: refreshed,
          hasDiscoveredJobs: refreshed.jobDiscoveryStatus === "FOUND_JOBS"
        });
      }

      if (payload.name) {
        updates.name = payload.name;
      }
      if (cityInput !== undefined) {
        updates.hqCity = cityInput;
      }
      if (countryInput !== undefined) {
        updates.hqCountry = countryInput;
      }
      if (cityInput !== undefined || countryInput !== undefined) {
        updates.locationHint =
          [cityInput, countryInput].filter((value) => value && value.length > 0).join(", ") ||
          company.locationHint ||
          "";
      }

      updates.profileConfirmed = false;
      updates.enrichmentStatus = CompanyEnrichmentStatusEnum.enum.PENDING;
      updates.jobDiscoveryStatus = CompanyJobDiscoveryStatusEnum.enum.UNKNOWN;
      updates.lastEnrichedAt = null;
      updates.lastJobDiscoveryAt = null;

      await firestore.saveCompanyDocument(company.id, updates);
      const refreshed = CompanySchema.parse(await firestore.getDocument("companies", company.id));
      await ensureCompanyEnrichmentQueued({ firestore, logger, company: refreshed });

      res.json({
        company: refreshed,
        hasDiscoveredJobs: refreshed.jobDiscoveryStatus === "FOUND_JOBS"
      });
    })
  );

  router.post(
    "/my-companies",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const payload = createCompanySchema.parse(req.body ?? {});
      const normalizedDomain = payload.primaryDomain;
      const result = await ensureCompanyForDomain({
        firestore,
        logger,
        domain: normalizedDomain,
        createdByUserId: user.id,
        autoEnqueue: false,
        nameHint: payload.name,
        locationHint: [payload.hqCity, payload.hqCountry].filter(Boolean).join(", ")
      });
      if (!result?.company) {
        throw httpError(500, "Unable to create company");
      }
      const company = result.company;
      const companyUpdates = {
        updatedAt: new Date(),
        nameConfirmed: true,
        profileConfirmed: false,
        primaryDomain: normalizedDomain,
        name: payload.name ?? company.name ?? "",
        hqCountry: payload.hqCountry ?? company.hqCountry ?? "",
        hqCity: payload.hqCity ?? company.hqCity ?? "",
        locationHint:
          [payload.hqCity, payload.hqCountry].filter((value) => value && value.length > 0).join(", ") ||
          company.locationHint ||
          ""
      };
      const savedCompany = CompanySchema.parse(
        await firestore.saveCompanyDocument(company.id, companyUpdates)
      );
      await ensureCompanyEnrichmentQueued({ firestore, logger, company: savedCompany });

      const userDoc = await firestore.getDocument("users", user.id);
      if (!userDoc) {
        throw httpError(404, "User not found");
      }
      const existingProfile = userDoc.profile ?? {};
      const companyIds = Array.isArray(existingProfile.companyIds)
        ? [...existingProfile.companyIds]
        : [];
      if (!companyIds.includes(savedCompany.id)) {
        companyIds.push(savedCompany.id);
      }
      const nextProfile = {
        ...existingProfile,
        companyIds,
        companyDomain: existingProfile.companyDomain ?? savedCompany.primaryDomain,
        mainCompanyId: existingProfile.mainCompanyId ?? savedCompany.id
      };
      await firestore.saveDocument("users", user.id, {
        profile: nextProfile,
        updatedAt: new Date()
      });

      res.status(201).json({ company: savedCompany });
    })
  );

  router.get(
    "/my-companies",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const companies = await listCompaniesForUser({ firestore, user, logger });
      res.json({ companies });
    })
  );

  router.get(
    "/my-companies/:companyId/jobs",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const { companyId } = req.params;
      if (!companyId) {
        throw httpError(400, "Company identifier required");
      }
      const companies = await listCompaniesForUser({ firestore, user, logger });
      const targetCompany = companies.find((company) => company.id === companyId);
      if (!targetCompany) {
        throw httpError(404, "Company not found");
      }
      const rawJobs = await firestore.listCompanyJobs(companyId);
      const jobs = normalizeCompanyJobs(rawJobs);
      logger?.info?.(
        { userId: user.id, companyId, jobCount: jobs.length },
        "Fetched jobs for selected company"
      );
      res.json({ companyId, jobs });
    })
  );

  router.patch(
    "/my-companies/:companyId",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const payload = companyUpdateSchema.parse(req.body ?? {});
      if (Object.keys(payload).length === 0) {
        throw httpError(400, "No updates provided");
      }

      const companies = await listCompaniesForUser({ firestore, user, logger });
      const targetCompany = companies.find((company) => company.id === req.params.companyId);
      if (!targetCompany) {
        throw httpError(404, "Company not found");
      }

      const patch = buildCompanyUpdatePatch(payload);
      if (payload.primaryDomain && payload.primaryDomain !== targetCompany.primaryDomain) {
        const previousDomains = Array.isArray(targetCompany.additionalDomains)
          ? targetCompany.additionalDomains.filter((value) => typeof value === "string" && value.length > 0)
          : [];
        if (targetCompany.primaryDomain) {
          previousDomains.push(targetCompany.primaryDomain);
        }
        patch.primaryDomain = payload.primaryDomain;
        patch.additionalDomains = Array.from(new Set(previousDomains));
        if (!targetCompany.website) {
          patch.website = `https://${payload.primaryDomain}`;
        }
      }
      await firestore.saveCompanyDocument(targetCompany.id, patch);
      const refreshed = CompanySchema.parse(
        await firestore.getDocument("companies", targetCompany.id)
      );
      res.json({ company: refreshed });
    })
  );

  return router;
}
