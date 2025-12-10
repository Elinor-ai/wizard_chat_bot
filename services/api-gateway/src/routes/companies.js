/**
 * @file companies.js
 * Company API Router
 *
 * ARCHITECTURE:
 * - PROTECTED: This router is mounted behind requireAuth middleware in server.js.
 *   The router assumes req.user is already set and does NOT verify JWTs directly.
 * - All LLM calls go through HTTP POST /api/llm.
 * - All Firestore access goes through company-repository.js and user-repository.js.
 * - This router does NOT import or call llmClient directly.
 * - This router does NOT access firestore directly.
 * - Background enrichment tasks call /api/llm with taskType: "company_intel".
 */

import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError, loadEnv } from "@wizard/utils";
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
import {
  getCompanyById,
  getCompanyByDomain,
  saveCompany,
  getCompanyRefreshed,
  listDiscoveredJobs,
  listCompanyJobs,
  subscribeToCompany,
  subscribeToDiscoveredJobs,
  getUserForCompanyResolution,
  listCompaniesForUser,
  sanitizeCompanyRecord
} from "../services/repositories/index.js";
import { linkCompanyToUser } from "../services/repositories/index.js";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get auth token from request
 * @param {Request} req
 * @returns {string|null}
 */
function getAuthToken(req) {
  return req.user?.token ?? null;
}

/**
 * Trigger company enrichment via HTTP POST /api/llm
 * This is the ONLY way this router triggers LLM operations.
 *
 * @param {object} options
 * @param {string} options.apiBaseUrl - Base URL for internal API calls
 * @param {string} options.authToken - Bearer token for authentication
 * @param {string} options.companyId - Company ID to enrich
 * @param {object} options.logger - Logger instance
 * @returns {Promise<object|null>} - The enrichment result or null on failure
 */
async function triggerCompanyEnrichmentViaHttp({ apiBaseUrl, authToken, companyId, logger }) {
  if (!authToken) {
    logger?.warn?.({ companyId }, "company.enrichment.skipped_no_auth");
    return null;
  }

  const url = `${apiBaseUrl}/api/llm`;

  try {
    logger?.info?.({ companyId }, "company.enrichment.http_request");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        taskType: "company_intel",
        context: { companyId },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger?.warn?.(
        { companyId, status: response.status, error: errorText },
        "company.enrichment.http_error"
      );
      return null;
    }

    const data = await response.json();
    logger?.info?.(
      { companyId, hasResult: !!data?.result },
      "company.enrichment.http_success"
    );
    return data?.result ?? null;
  } catch (err) {
    logger?.error?.(
      { companyId, err },
      "company.enrichment.http_failed"
    );
    return null;
  }
}

const PLACEHOLDER_URL_PATTERNS = [/example\.com/i, /sample/i, /placeholder/i, /dummy/i];
const DomainStringSchema = z
  .string()
  .min(3)
  .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
  .transform((value) => value.trim().toLowerCase());

/**
 * Resolve company context for authenticated user via repository
 */
async function resolveCompanyContext({ firestore, user, logger }) {
  // Get user via repository
  const userDoc = await getUserForCompanyResolution(firestore, user.id);
  if (!userDoc) {
    throw httpError(404, "User context not found");
  }
  let rawCompany = null;
  const profileCompanyId =
    userDoc.profile?.mainCompanyId ??
    userDoc.profile?.companyId ??
    null;
  let lookupDomain = userDoc.profile?.companyDomain?.toLowerCase?.() ?? null;

  // Get company by ID via repository
  if (profileCompanyId) {
    rawCompany = await getCompanyById(firestore, profileCompanyId);
  }

  // Fallback to domain lookup via repository
  if (!rawCompany) {
    const domainFromProfile = userDoc.profile?.companyDomain ?? null;
    const fallbackDomain = extractEmailDomain(userDoc.auth?.email ?? user.email ?? null);
    const domain = (domainFromProfile || fallbackDomain || "").toLowerCase();
    lookupDomain = domain;
    if (!domain || isGenericEmailDomain(domain)) {
      throw httpError(404, "No company associated with this account");
    }
    rawCompany = await getCompanyByDomain(firestore, domain);
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

/**
 * Resolve company context for a specific company ID via repository
 */
async function resolveCompanyContextForUser({ firestore, user, logger, companyId }) {
  if (!companyId) {
    return resolveCompanyContext({ firestore, user, logger });
  }
  // Use repository function to list companies for user
  const companies = await listCompaniesForUser({ firestore, user, logger });
  const targetCompany = companies.find((company) => company.id === companyId);
  if (!targetCompany) {
    throw httpError(404, "Company not found");
  }
  return targetCompany;
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

function mapDiscoveredJobForResponse(job) {
  if (!job) return null;
  const context = job.importContext ?? {};
  return {
    id: job.id,
    roleTitle: job.roleTitle ?? "",
    companyName: job.companyName ?? "",
    location: job.location ?? "",
    status: job.status ?? "draft",
    source: context.source ?? context.externalSource ?? null,
    externalUrl: context.sourceUrl ?? context.externalUrl ?? null,
    importContext: {
      ...context,
      discoveredAt: context.discoveredAt ?? null,
      originalPostedAt: context.originalPostedAt ?? null,
      overallConfidence: context.overallConfidence ?? null
    },
    createdAt: job.createdAt ?? null,
    updatedAt: job.updatedAt ?? null
  };
}

function mapLegacyJobForResponse(job) {
  if (!job) return null;
  return {
    id: job.id,
    roleTitle: job.title ?? "",
    companyName: job.companyName ?? "",
    location: job.location ?? "",
    status: "draft",
    source: job.source ?? "other",
    externalUrl: job.url ?? null,
    importContext: {
      source: job.source ?? "other",
      sourceUrl: job.url ?? null,
      discoveredAt: job.discoveredAt ?? null,
      originalPostedAt: job.postedAt ?? null,
      companyJobId: job.id
    },
    createdAt: job.discoveredAt ?? null,
    updatedAt: job.discoveredAt ?? null
  };
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
  city: z.string().optional(),
  companyId: z.string().optional()
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

export function companiesRouter({ firestore, bigQuery, logger }) {
  const router = Router();

  // Determine API base URL for internal HTTP calls (same pattern as golden-interview)
  const env = loadEnv();
  const port = Number(env.PORT ?? 4000);
  const apiBaseUrl = `http://127.0.0.1:${port}`;

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
      // Load jobs via repository
      const discoveredJobs = await listDiscoveredJobs(firestore, company.id);
      let jobs;
      if (discoveredJobs.length > 0) {
        jobs = discoveredJobs
          .map(mapDiscoveredJobForResponse)
          .filter(Boolean);
      } else {
        const legacy = normalizeCompanyJobs(await listCompanyJobs(firestore, company.id));
        jobs = legacy.map(mapLegacyJobForResponse).filter(Boolean);
      }
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

  router.get(
    "/stream/:companyId",
    wrapAsync(async (req, res) => {
      const user = req.user;
      if (!user) {
        throw httpError(401, "Unauthorized");
      }
      const { companyId } = req.params;
      if (!companyId) {
        throw httpError(400, "Company identifier required");
      }
      // Get companies via repository
      const companies = await listCompaniesForUser({ firestore, user, logger });
      const targetCompany = companies.find((company) => company.id === companyId);
      if (!targetCompany) {
        throw httpError(404, "Company not found");
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": req.headers.origin || "*",
        "Access-Control-Allow-Credentials": "true"
      });
      res.flushHeaders?.();

      const sendEvent = (event, payload) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      sendEvent("company_updated", { company: targetCompany });
      // Load jobs via repository
      const existingJobs =
        (await listDiscoveredJobs(firestore, companyId))
          .map(mapDiscoveredJobForResponse)
          .filter(Boolean) ?? [];
      sendEvent("jobs_updated", { jobs: existingJobs });

      const cleanups = [];
      const heartbeat = setInterval(() => {
        res.write(": ping\n\n");
      }, 25_000);
      cleanups.push(() => clearInterval(heartbeat));

      // Subscribe to company updates via repository
      const companyUnsub = subscribeToCompany(
        firestore,
        companyId,
        (doc) => {
          if (!doc) return;
          const parsed = CompanySchema.safeParse(doc);
          if (!parsed.success) {
            logger?.warn?.(
              { companyId, error: parsed.error },
              "Company stream parse failed"
            );
            return;
          }
          sendEvent("company_updated", { company: parsed.data });
        },
        (err) => {
          logger?.warn?.({ companyId, err }, "Company stream error");
        }
      );
      cleanups.push(companyUnsub);

      // Subscribe to discovered jobs via repository
      const jobsUnsub = subscribeToDiscoveredJobs(
        firestore,
        companyId,
        (docs) => {
          const mapped = docs.map(mapDiscoveredJobForResponse).filter(Boolean);
          sendEvent("jobs_updated", { jobs: mapped });
        },
        (err) => {
          logger?.warn?.({ companyId, err }, "Discovered jobs stream error");
        }
      );
      cleanups.push(jobsUnsub);

      req.on("close", () => {
        cleanups.forEach((cleanup) => {
          try {
            cleanup?.();
          } catch {
            // ignore
          }
        });
        res.end();
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

      // Save via repository and get refreshed company
      await saveCompany(firestore, company.id, updates);
      const refreshed = await getCompanyRefreshed(firestore, company.id);

      // Extract auth token before sending response (needed for background HTTP call)
      const authToken = getAuthToken(req);

      res.json({
        company: refreshed,
        hasDiscoveredJobs: refreshed.jobDiscoveryStatus === "FOUND_JOBS"
      });

      // Trigger enrichment via HTTP POST /api/llm (background, fire-and-forget)
      await ensureCompanyEnrichmentQueued({ firestore, logger, company: refreshed });
      triggerCompanyEnrichmentViaHttp({
        apiBaseUrl,
        authToken,
        companyId: refreshed.id,
        logger
      }).catch((err) => {
        logger.error({ companyId: refreshed.id, err }, "Background enrichment trigger failed after name confirmation");
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
      const requestedCompanyId =
        typeof payload.companyId === "string" && payload.companyId.trim().length > 0
          ? payload.companyId.trim()
          : null;
      const company = await resolveCompanyContextForUser({
        firestore,
        user,
        logger,
        companyId: requestedCompanyId
      });
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
        // Save via repository
        await saveCompany(firestore, company.id, updates);
        const refreshed = await getCompanyRefreshed(firestore, company.id);
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

      // Save via repository
      await saveCompany(firestore, company.id, updates);
      const refreshed = await getCompanyRefreshed(firestore, company.id);
      await ensureCompanyEnrichmentQueued({ firestore, logger, company: refreshed });

      // Extract auth token before sending response (needed for background HTTP call)
      const authToken = getAuthToken(req);

      res.json({
        company: refreshed,
        hasDiscoveredJobs: refreshed.jobDiscoveryStatus === "FOUND_JOBS"
      });

      // Trigger enrichment via HTTP POST /api/llm (background, fire-and-forget)
      triggerCompanyEnrichmentViaHttp({
        apiBaseUrl,
        authToken,
        companyId: refreshed.id,
        logger
      }).catch((err) => {
        logger.error({ companyId: refreshed.id, err }, "Background enrichment trigger failed after profile update");
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
      // Save company via repository
      const savedRaw = await saveCompany(firestore, company.id, companyUpdates);
      const savedCompany = CompanySchema.parse(savedRaw);

      // Link company to user via repository
      await linkCompanyToUser(firestore, user.id, savedCompany.id, savedCompany.primaryDomain);

      await ensureCompanyEnrichmentQueued({ firestore, logger, company: savedCompany });

      // Extract auth token before sending response (needed for background HTTP call)
      const authToken = getAuthToken(req);

      res.status(201).json({ company: savedCompany });

      // Trigger enrichment via HTTP POST /api/llm (background, fire-and-forget)
      triggerCompanyEnrichmentViaHttp({
        apiBaseUrl,
        authToken,
        companyId: savedCompany.id,
        logger
      }).catch((err) => {
        logger.error(
          { companyId: savedCompany.id, err },
          "Background enrichment trigger failed after company creation"
        );
      });
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
    "/my-companies/:companyId",
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
      res.json({ company: targetCompany });
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
      // Load jobs via repository
      const discoveredJobs = await listDiscoveredJobs(firestore, companyId);
      const jobs =
        discoveredJobs.length > 0
          ? discoveredJobs.map(mapDiscoveredJobForResponse).filter(Boolean)
          : normalizeCompanyJobs(await listCompanyJobs(firestore, companyId))
              .map(mapLegacyJobForResponse)
              .filter(Boolean);
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
      // Save via repository
      await saveCompany(firestore, targetCompany.id, patch);
      const refreshed = await getCompanyRefreshed(firestore, targetCompany.id);
      res.json({ company: refreshed });
    })
  );

  return router;
}
