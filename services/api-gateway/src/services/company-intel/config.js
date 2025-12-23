/**
 * @file config.js
 * Configuration constants for company intel services.
 * Extracted from company-intel.js for better modularity.
 */

export const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "pm.me",
  "live.com",
  "msn.com",
  "mail.com",
  "gmx.com"
]);

export const KNOWN_SOCIAL_HOSTS = [
  "linkedin.com",
  "lnkd.in",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com"
];

export const COMMON_CAREER_PATHS = [
  "/careers",
  "/jobs",
  "/join-us",
  "/joinus",
  "/work-with-us",
  "/team#jobs"
];

export const TRUSTED_JOB_HOSTS = [
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "workable.com",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "smartrecruiters.com",
  "breezy.hr",
  "myworkdayjobs.com",
  "indeed.com",
  "glassdoor.com",
  "linkedin.com",
  "lnkd.in",
  "angel.co",
  "eightfold.ai"
];

export const JOB_URL_RED_FLAGS = [
  "example",
  "sample",
  "placeholder",
  "dummy",
  "lorem",
  "acme"
];

export const SOCIAL_LINK_KEYS = [
  { key: "linkedin", aliases: ["linkedin"] },
  { key: "facebook", aliases: ["facebook"] },
  { key: "instagram", aliases: ["instagram"] },
  { key: "twitter", aliases: ["twitter", "x"] },
  { key: "tiktok", aliases: ["tiktok"] },
  { key: "youtube", aliases: ["youtube", "yt"] }
];

// API Configuration
export const hasFetchSupport = typeof fetch === "function";
// Web fetch is enabled by default - no need for explicit opt-in flag
export const ALLOW_WEB_FETCH = hasFetchSupport;

export const BRANDFETCH_API_URL = "https://api.brandfetch.io/v2/brands";
export const BRANDFETCH_API_TOKEN =
  "mrzkuqeDHxVfPF2xEOGgtPCPRP6jpIyCpMd0XJ1Gvf4=";
export const BRAND_SOURCE = "brandfetch";

export const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID ?? null;
export const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY ?? null;
export const SERP_API_KEY = process.env.SERP_API_KEY ?? null;
export const SERP_API_ENGINE = process.env.SERP_API_ENGINE ?? "google";

// LinkedIn Constants
export const MAX_LINKEDIN_JOBS = 8;
export const LINKEDIN_JOB_HINTS = [/\/jobs\//i, /currentjob/i, /viewjob/i, /apply/i];
export const LINKEDIN_HIRING_PHRASES = [
  "we're hiring",
  "we\u2019re hiring",
  "hiring",
  "join our team",
  "open role",
  "open roles",
  "looking for",
  "apply now"
];
export const LINKEDIN_HIRING_REGEX = new RegExp(
  LINKEDIN_HIRING_PHRASES.join("|"),
  "gi"
);

// System Constants
export const DISCOVERED_JOB_OWNER_FALLBACK = "system_company_intel";
export const STUCK_ENRICHMENT_THRESHOLD_MS = 10 * 60 * 1000;

// Job Source Priority for merging
export const JOB_SOURCE_PRIORITY = {
  "careers-site": 3,
  linkedin: 2,
  "linkedin-post": 1,
  other: 0,
  "intel-agent": 0
};
