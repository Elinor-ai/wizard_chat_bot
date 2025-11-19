# Company Intelligence Layer – Functional Spec

> **Audience:** Humans + AI assistants (Codex, etc.)  
> **Purpose:** This file is the **source of truth** for how the “company intelligence” layer should behave across backend + frontend.

If you are an AI assistant working on this repo, **read and follow this spec** when touching:

- `packages/core/src/schemas/company.js`
- `packages/core/src/schemas/user.js`
- `packages/core/src/schemas/job.js`
- `packages/data/src/index.js`
- `services/api-gateway/src/services/company-intel.js`
- `services/api-gateway/src/routes/auth.js`
- `services/api-gateway/src/routes/companies.js`
- `services/api-gateway/src/routes/users.js` (where relevant to mainCompanyId)
- Any React components/hooks that render company modals or call `/companies/*`
- Any UI that launches the wizard (“Launch Wizard”) or chooses a company context

---

## 1. High-Level Purpose

We want to turn **login + job creation** into a **data-intelligence entry point**:

- Recruiter logs in (email/password or Google).
- We infer their **main company** from the email domain (when applicable).
- We:

  1. Confirm with the user that this is really their company.
  2. Enrich the company profile from the web (Brandfetch + our own “agent” tools).
  3. Discover existing open jobs for that company (if any).
  4. Let the UI:
     - Skip or shorten the wizard when jobs already exist.
     - Brand all generated assets based on the company profile.
     - Allow **agencies / multi-brand users** to recruit for multiple companies.

Constraints:

- **Login must remain fast** → enrichment/discovery is **async**, never blocks auth.
- No fake data:
  - **No placeholder URLs** like `https://example.com/...`.
  - Only show jobs if we have **real, meaningful data**.
- All behavior should be driven by **company + job documents in Firestore**, not by ad hoc in-memory state.
- The system must support:

  - Normal companies (user recruits only for their own company).
  - Agencies / groups (user recruits for multiple companies, choosing per wizard).

---

## 2. Architecture Context

Monorepo components:

- `apps/web` – Next.js 14 (React 18) app with marketing + console, NextAuth, React Query.
- `services/api-gateway` – Express API gateway, Firestore adapter, LLM client, main REST surface.
- `packages/core` – Shared schemas (users, jobs, LLM artifacts, and **companies**).
- `packages/data` – Firestore adapter (`createFirestoreAdapter`) using `firebase-admin`.
- Other services (wizard-chat, asset-generation, campaign-orchestrator, publishing, screening, credits) currently exist as **stubs**.

The **company-intel** layer lives mostly in:

- `packages/core/src/schemas/company.js`
- `packages/core/src/schemas/user.js`
- `packages/core/src/schemas/job.js`
- `packages/data/src/index.js`
- `services/api-gateway/src/services/company-intel.js`
- `services/api-gateway/src/routes/auth.js`
- `services/api-gateway/src/routes/companies.js`
- `services/api-gateway/src/routes/users.js`
- UI components/hooks in `apps/web` that implement:
  - Company approval modals
  - Company intel modal
  - Settings → Companies
  - Launch Wizard → company selection

---

## 3. Data Model

### 3.1 User additions (multi-company support)

Users are stored in `"users"` with `UserSchema` (`packages/core/src/schemas/user.js`).

**Legacy field (kept for compatibility):**

- `user.profile.companyDomain` (optional string)
  - The domain inferred from the email address:
    - `stav@botson.ai` → `botson.ai`.
  - Set only for **non-generic** domains (`gmail.com`, `outlook.com`, etc. are skipped).
  - Still useful as a hint, but no longer the primary source of truth.

**New core fields:**

- `user.profile.mainCompanyId` (string | null)
  - The primary company this user belongs to (often derived from email domain on first login).
  - Used as the **default** when no explicit company is specified (login intel, /companies/me, etc.).

- `user.profile.companyIds` (array<string>)
  - The list of **all company IDs** this user can recruit for.
  - Must always include `mainCompanyId` if one exists.
  - Supports:
    - Agencies recruiting for multiple client companies.
    - Groups / multi-brand organizations.

Rules:

- On login, if `mainCompanyId` is missing but `companyDomain` is non-generic:
  - Resolve or create a company by that domain.
  - Set `mainCompanyId` to that company’s ID.
  - Initialize `companyIds = [mainCompanyId]` if empty.
- Settings → Companies must allow the user to choose which of `companyIds` is the main company (updating `mainCompanyId`).

### 3.2 Company document schema

Stored in the `"companies"` collection, defined in `packages/core/src/schemas/company.js`.

**Core identity:**

- `id` (string) – Firestore doc ID.
- `primaryDomain` (string) – e.g. `"botson.ai"`.
- `additionalDomains` (array<string>) – optional aliases.
- `name` (string | null) – company name (may start as a guess).
- `companyType` (string | null) – e.g. `"company" | "agency" | "freelancer" | null`.
- `industry` (string | null) or `industries` (array) depending on implementation.

**Size & location:**

- `employeeCountBucket` (string | null) – e.g. `"1-10"`, `"11-50"`, `"51-200"`.
- `hqCountry` (string | null).
- `hqCity` (string | null).
- Optional:
  - `hqCountryCode` (string | null).
  - `hqRegion`, `hqState` (string | null).

**Branding (root-level high-level fields):**

- `website` (string | null) – canonical URL, e.g. `"https://botson.ai"`.
- `tagline` (string | null).
- `toneOfVoice` (string | null) – e.g. `"innovative and data-driven"`.

**Nested `brand` object (Brandfetch + branding info):**

A dedicated nested object to hold purely **brand-related** fields:

```js
brand: {
  name: string | null,         // Brand name (may mirror company name)
  domain: string | null,       // Domain used for Brandfetch lookups (e.g. botson.ai)

  logoUrl: string | null,      // Primary logo URL (from Brandfetch logos)
  iconUrl: string | null,      // Icon URL if available
  bannerUrl: string | null,    // Banner / cover image (from Brandfetch images)

  colors: {
    primary: string | null,    // primary hex color
    secondary: string | null,  // secondary hex color
    palette: string[]          // all hex colors we keep
  },

  fonts: {
    primary: string | null,    // main font name
    secondary: string | null,  // secondary font name
    all: string[]              // all font names from Brandfetch
  },

  toneOfVoiceHint: string | null // textual hint about brand tone (can be derived later)
}
Socials (root-level nested object):

All optional strings:

socials.linkedin

socials.facebook

socials.instagram

socials.twitter

socials.tiktok

socials.youtube

(others may be added later).

These may come from Brandfetch links or from the agent’s web-search tools.

Enrichment & job status:

All enrichment state lives on the company doc (no dedicated companyEnrichmentJobs collection):

enrichmentStatus – "PENDING" | "READY" | "FAILED".

enrichmentQueuedAt, enrichmentStartedAt, enrichmentCompletedAt, enrichmentLockedAt (timestamps).

enrichmentAttempts (number).

enrichmentError – e.g. { reason: string, message: string, occurredAt: timestamp } | null.

lastEnrichedAt (timestamp | null).

jobDiscoveryStatus – "UNKNOWN" | "FOUND_JOBS" | "NOT_FOUND".

jobDiscoveryQueuedAt, jobDiscoveryAttempts, lastJobDiscoveryAt (timestamps).

sourcesUsed (array<string>) – coarse list, e.g. ["brandfetch", "website", "linkedin"].

confidenceScore (number | null) – 0–1.

Per-field evidence (field sources):

To track where specific values came from:

js
Copy code
fieldSources: {
  [fieldName: string]: {
    value?: any,             // optional copy of value (or omit if redundant)
    sources: string[]        // e.g. ["brandfetch", "linkedin-company-page"]
  }
}
Examples:

fieldSources.employeeCountBucket = { value: "1-10", sources: ["linkedin-company-page"] }

fieldSources.hqCity = { value: "Tel Aviv", sources: ["brandfetch"] }

fieldSources.brand.colors.primary = { value: "#123456", sources: ["brandfetch"] }

Approvals:

nameConfirmed (boolean) – user confirmed initial company name.

profileConfirmed (boolean) – user confirmed enriched profile for this company.

Audit:

createdAt (timestamp).

updatedAt (timestamp).

createdByUserId (string | null) – who created this company record.

3.3 Company job schema (discovered jobs)
Collection: "companyJobs" (or a subcollection under companies, implementation detail).
Schema defined in packages/core/src/schemas/company.js as CompanyJob (or similar).

Fields:

id (string) – job doc ID.

companyId (string) – ID of the company.

companyDomain (string) – redundant but helpful.

source (string) – "careers-site" | "linkedin" | "linkedin-post" | "other".

externalId (string | null) – ID from source if available.

title (string) – job title.

location (string | null).

description (string | null) – snippet or full description.

url (string | null) – MUST be real, clickable URL if present.

postedAt (timestamp | null).

discoveredAt (timestamp).

isActive (boolean).

Important rule:
Do not create placeholder jobs with fake URLs such as https://example.com/....
If no real jobs are found, companyJobs stays empty, and the UI must hide the “Open postings” section.

3.4 Job schema (wizard-created jobs)
Jobs created by the wizard live in a normal "jobs" collection (packages/core/src/schemas/job.js).

Required additions:

companyId (string | null)

The company this job is for.

Required for new jobs where we know the company context.

Optional denormalized fields:

companyName (string | null) – copy of company name at creation time.

Rules:

When launching the wizard, we must know which company the job is for (see multi-company flows below).

/wizard/draft and related endpoints must attach companyId to each job.

If companyId is missing (legacy), default to user.profile.mainCompanyId.

3.5 Company enrichment lifecycle (single collection)
All enrichment + job-discovery state is tracked on the companies collection:

No separate companyEnrichmentJobs collection.

The company doc itself is the “job” and the “result”.

Key fields:

enrichmentStatus, enrichmentQueuedAt, enrichmentStartedAt, enrichmentCompletedAt, enrichmentError.

jobDiscoveryStatus, jobDiscoveryQueuedAt, lastJobDiscoveryAt.

fieldSources, sourcesUsed, confidenceScore.

nameConfirmed, profileConfirmed.

4. Backend Flows
4.1 Auth → domain association and main company
Auth routes live in services/api-gateway/src/routes/auth.js.

For email/password login and Google OAuth, behavior:

User authenticates normally (password or Google).

Extract email domain:

stav@botson.ai → botson.ai.

If the domain is generic (e.g. gmail.com, outlook.com, yahoo.com):

Do not set companyDomain.

Do not create a company implicitly.

If the domain is non-generic:

Set user.profile.companyDomain = domain if not already set (legacy).

Use company-intel helpers to ensure a companies doc exists with primaryDomain = domain. If not, create it:

primaryDomain = domain

brand.domain = domain

name = null or a domain-derived guess.

enrichmentStatus = "PENDING" (or "NEW").

jobDiscoveryStatus = "UNKNOWN".

nameConfirmed = false

profileConfirmed = false

createdByUserId = user.id

Link the user to this company:

If profile.mainCompanyId is null, set it to this company’s ID.

Ensure this company’s ID is included in profile.companyIds.

Rules:

Do NOT run full enrichment in the auth route.

Only mark the company as needing enrichment (via enqueueCompanyEnrichment) once the user has passed the first approval (name confirmation).

4.2 First approval – confirm company name before enrichment (main company)
Goal: avoid wasting enrichment calls and mis-associating users with the wrong company.

Flow:

After login, the console front-end fetches /companies/me, which returns the user’s main company:

This uses user.profile.mainCompanyId if present.

If missing, the backend may fall back to companyDomain → primaryDomain.

If:

The user has a main company, AND

nameConfirmed !== true,

Then show First Approval Modal.

First Approval Modal:

Displays:

Guessed company name (from company.name or derived from domain).

Domain (company.primaryDomain).

Provides:

✅ Yes, that’s my company

❌ No / Edit

Backend endpoint:

POST /companies/me/confirm-name

Request body:

jsonc
Copy code
// user accepts guessed name
{ "approved": true }

// user corrects name + location
{
  "approved": false,
  "name": "Correct Company Ltd.",
  "country": "Israel",
  "city": "Tel Aviv",
  "domain": "correct-company.com" // optional for corrections
}
Behavior:

If approved: true:

Set nameConfirmed = true.

If name is null, keep existing guess or derive from domain.

After this, call enqueueCompanyEnrichment(company) to queue enrichment.

If approved: false:

Update:

name = provided name.

hqCountry / hqCity from country / city.

Optionally update primaryDomain and brand.domain if user corrected domain.

Set nameConfirmed = true.

Call enqueueCompanyEnrichment(company).

enqueueCompanyEnrichment(company):

Sets enrichmentStatus = "PENDING".

Sets enrichmentQueuedAt = now.

Clears previous enrichmentError if any.

Does not perform heavy work inline.

Login must never wait for enrichment.

4.3 Enrichment pipeline (Brandfetch + agent tools)
The enrichment pipeline is implemented in services/api-gateway/src/services/company-intel.js.

Top-level function:

runCompanyEnrichmentOnce(companyDoc)

This must not be invoked from auth routes. It is intended to be called from:

A worker/cron job, or

A manual debug route.

The pipeline:

Pre-checks:

If enrichmentStatus is not "PENDING", or if there is a lock, skip.

Set enrichmentStartedAt = now.

Brandfetch integration (first step):

If company.brand.domain or company.primaryDomain is available and non-generic:

Call Brandfetch:

js
Copy code
const url = `https://api.brandfetch.io/v2/brands/${domain}`;
const response = await fetch(url, {
  method: 'GET',
  headers: {
    Authorization: 'Bearer <BRANDFETCH_TOKEN>'
  }
});
const brandfetchData = await response.json();
Map Brandfetch data into the company doc via a helper like:

applyBrandfetchToCompany(company, brandfetchData)

Mapping rules:

Root-level:

company.name if currently null.

company.description / company.longDescription (if you store both).

company.industry or industries list from company.industries in Brandfetch.

hqCountry, hqCity, hqCountryCode from company.location.

companyType from company.kind if meaningful.

company.brand nested:

brand.name

brand.domain

brand.logoUrl, brand.iconUrl, brand.bannerUrl from logos / images.

brand.colors.primary, secondary, palette from colors.

brand.fonts.primary, secondary, all from fonts.

Optionally brand.toneOfVoiceHint from Brandfetch descriptions.

Socials:

Map Brandfetch links array into company.socials.*:

twitter, facebook, etc.

For each field set from Brandfetch, update fieldSources accordingly, e.g.:

js
Copy code
fieldSources.name = { value: company.name, sources: ["brandfetch"] }
fieldSources.brand.colors.primary = { value: "#133864", sources: ["brandfetch"] }
Add "brandfetch" to sourcesUsed if any mapping was applied.

If Brandfetch fails (no data, 404, network error):

Log structured error, set enrichmentError if needed.

Continue to our own agent-based enrichment without Brandfetch data.

Agent-based / web-based enrichment (second step):

Use helper tools (see section 6) to:

searchCompanyOnWeb({ domain, name, locationHints })

fetchWebsite(company) / fetchHtml(url)

extractBrandFromHtml(html)

extractSocialLinksFromResults(results, html)

discoverCareerPage({ domain, html, searchResults })

discoverJobsFromLinkedInJobs(company, linkedinUrl)

discoverJobsFromLinkedInFeed(company, linkedinUrl) (for job posts, not just Jobs tab).

Fill any missing or low-confidence fields in the company:

website if Brandfetch didn’t set it.

Additional socials (e.g. LinkedIn company page).

employeeCountBucket.

Additional location details.

toneOfVoice (root) and/or brand.toneOfVoiceHint.

Update fieldSources for each field updated here with sources such as:

"website-homepage-html"

"linkedin-company-page"

"web-search-result:google"

Update sourcesUsed to include these sources.

Job discovery (third step):

Call discoverJobsForCompany(company) which:

Uses careers page, LinkedIn Jobs and possibly LinkedIn posts:

discoverJobsFromCareersPage(...)

discoverJobsFromLinkedInJobs(...)

discoverJobsFromLinkedInFeed(...) (posts that look like hiring announcements).

Returns an array of real job objects with:

title, source, url (or null), location, description, postedAt.

Call saveDiscoveredJobs(company, jobs) to:

Write jobs into companyJobs.

Set:

If jobs.length > 0:

jobDiscoveryStatus = "FOUND_JOBS"

Else:

jobDiscoveryStatus = "NOT_FOUND"

Always update lastJobDiscoveryAt = now.

Jobs must not be placeholders; if nothing real is found, they are simply not created.

Completion:

Set:

enrichmentStatus = "READY" (or "FAILED" on fatal error).

enrichmentCompletedAt = now.

lastEnrichedAt = now.

Increment enrichmentAttempts.

Log a structured summary including fieldSources for debugging.

The pipeline must be robust: exceptions should be caught and recorded in enrichmentError, not crash the process.

## 5. API Endpoints

All under `services/api-gateway/src/routes/companies.js` and `services/api-gateway/src/routes/users.js`, mounted in `server.js`.

### 5.1 `GET /companies/me`

- **Auth required** (`requireAuth`).
- Returns the user’s **main company**.

Resolution order:

1. If `req.user.profile.mainCompanyId` is set:
   - Load that company by ID from `companies`.
2. Else, if `req.user.profile.companyDomain` is non-generic:
   - Find `companies` by `primaryDomain = companyDomain`.
   - If found, treat as main company.
3. If no company can be resolved:
   - Return `404` or `{ company: null }` with a clear status.

Response:

```jsonc
{
  "company": {
    "id": "...",
    "primaryDomain": "botson.ai",
    "name": "Botson AI",
    "nameConfirmed": true,
    "profileConfirmed": false,
    "enrichmentStatus": "PENDING" | "READY" | "FAILED",
    "jobDiscoveryStatus": "UNKNOWN" | "FOUND_JOBS" | "NOT_FOUND",
    "brand": { /* brand sub-document */ },
    "socials": { /* social links */ },
    "fieldSources": { /* evidence */ },
    // ... all other fields per Company schema
  }
}
5.2 GET /companies/me/jobs
Auth required.

Uses the same main-company resolution as /companies/me.

Fetches related companyJobs for that company.

Response:

js
Copy code
{
  "jobs": [
    {
      "id": "...",
      "companyId": "...",
      "source": "careers-site",
      "title": "Senior Backend Engineer",
      "url": "https://real.company/careers/123",
      "location": "Tel Aviv, Israel",
      "description": "...",
      "isActive": true,
      "postedAt": "...",
      "discoveredAt": "..."
    }
  ]
}
If no jobs exist, return "jobs": [].

5.3 GET /companies/my-companies
Auth required.

Returns all companies linked to the user:

Query by user.profile.companyIds, or

Use createdByUserId = req.user.id in addition as needed.

Response:

jsonc
Copy code
{
  "companies": [
    {
      "id": "...",
      "name": "Main Company",
      "primaryDomain": "main.com",
      "isMain": true,
      // ... subset or full Company document
    },
    {
      "id": "...",
      "name": "Client A Ltd.",
      "primaryDomain": "client-a.com",
      "isMain": false
    }
  ]
}
The backend doesn’t need to literally store isMain; you can compute it by comparing each company.id to user.profile.mainCompanyId.

5.4 POST /companies
Auth required.

Creates a new company initiated by the user (used for agencies / additional client companies).

Request body (typical):

jsonc
Copy code
{
  "name": "Client A Ltd.",
  "domain": "client-a.com",
  "country": "Israel",
  "city": "Tel Aviv",
  "companyType": "company"
}
Behavior:

Create a companies doc with:

primaryDomain = domain

brand.domain = domain

name, hqCountry, hqCity, companyType from body.

createdByUserId = user.id.

nameConfirmed = true (user explicitly provided name).

profileConfirmed = false.

enrichmentStatus = "PENDING" (or "NEW") and jobDiscoveryStatus = "UNKNOWN".

Link this company to the user:

Add company.id to user.profile.companyIds (if not present).

If mainCompanyId is null, set it to this company’s ID.

Trigger enrichment:

Call enqueueCompanyEnrichment(company) after creation.

Response: the created company document.

5.5 POST /companies/me/confirm-name
Auth required.

Confirms or corrects the main company’s name (and optionally domain/HQ info).

Request body:

jsonc
Copy code
// user accepts guessed name
{ "approved": true }

// user corrects name + location (+ optional domain)
{
  "approved": false,
  "name": "Correct Company Ltd.",
  "country": "Israel",
  "city": "Tel Aviv",
  "domain": "correct-company.com"
}
Behavior:

See section 4.2 First approval.

Always updates nameConfirmed = true.

Enqueues enrichment afterward via enqueueCompanyEnrichment(company).

Response: updated company object.

5.6 POST /companies/me/confirm-profile
Auth required.

Confirms or corrects the enriched profile of the main company.

Request body:

jsonc
Copy code
// user accepts enriched profile
{ "approved": true }

// user corrects some fields
{
  "approved": false,
  "name": "Correct Company Ltd.",
  "country": "Israel",
  "city": "Ramat Gan"
  // additional corrections allowed
}
Behavior:

If approved: true:

Set profileConfirmed = true.

If approved: false:

Apply corrections.

Optionally reset enrichmentStatus = "PENDING" and re-enqueue enrichment with new hints.

Response: updated company object.

5.7 PATCH /companies/:companyId
Auth required.

Used primarily by Settings → Companies to edit company fields.

Behavior:

Validate that the user is allowed to edit this company (e.g., it’s in companyIds or they created it).

Accept a subset of Company fields to update, e.g.:

name, companyType, industry, employeeCountBucket

hqCountry, hqCity

website

tagline, toneOfVoice

socials.*

brand.* (logo, colors, fonts)

Do not automatically reset nameConfirmed or profileConfirmed here; these edits are considered “manual improvements.”

Response: updated company object.

5.8 PATCH /users/me/main-company
Auth required.

Sets user.profile.mainCompanyId to one of the companies in companyIds.

Request body:

jsonc
Copy code
{
  "companyId": "..." 
}
Behavior:

Validate that companyId is in user.profile.companyIds.

Update mainCompanyId.

/companies/me will now resolve to this company.

Response: updated user profile or a simple success status.

6. Agent Tools & company-intel.js
The file services/api-gateway/src/services/company-intel.js exposes small, composable helpers.

6.1 Domain & company linkage
normalizeEmailDomain(email):

Returns { localPart, domain }.

isGenericDomain(domain):

Returns true for gmail.com, outlook.com, etc.

ensureCompanyForDomain({ domain, userId }):

Gets or creates a companies doc with primaryDomain = domain.

Sets basic fields (domain, createdByUserId).

Does not run full enrichment yet.

Returns the company doc.

6.2 Enrichment orchestration
enqueueCompanyEnrichment(company):

Marks the company as needing enrichment on the company doc itself:

enrichmentStatus = "PENDING".

enrichmentQueuedAt = now.

Clears enrichmentError.

Does not do heavy work.

runCompanyEnrichmentOnce(company):

Performs a single enrichment pass:

Guard / lock.

Brandfetch integration (if domain available).

Agent / web-based enrichment.

Job discovery.

Update statuses & timestamps.

Catches errors and records them in enrichmentError instead of throwing to caller.

Logging:

Each run should log a structured summary, e.g.:

js
Copy code
console.log("[company-intel] enrichment completed", {
  companyId: company.id,
  enrichmentStatus: company.enrichmentStatus,
  jobDiscoveryStatus: company.jobDiscoveryStatus,
  sourcesUsed: company.sourcesUsed,
  fieldSources: company.fieldSources
});
6.3 Job discovery
discoverJobsForCompany(company):

Orchestrates:

discoverJobsFromCareersPage(company)

discoverJobsFromLinkedInJobs(company)

discoverJobsFromLinkedInFeed(company) (for job-looking posts)

Returns an array of real jobs, or an empty array.

saveDiscoveredJobs(company, jobs):

Writes jobs into companyJobs.

Updates:

jobDiscoveryStatus and lastJobDiscoveryAt.

6.4 Brandfetch helper
fetchBrandfetchData(domain):

Wraps the Brandfetch API call, handles errors and HTTP statuses.

Returns null on failure.

applyBrandfetchToCompany(company, brandfetchData):

Maps fields into the company doc and updates fieldSources + sourcesUsed.

Only fills missing fields (unless we explicitly want Brandfetch to override low-quality values).

7. Frontend Behavior
Frontend code lives in apps/web (Next.js 14 + React 18 + React Query).

7.1 Data fetching & modal auto-open rules
On console load (authenticated):

Fetch /companies/me and store in React Query.

Behavior:

If there is no company for the user:

Do nothing (no auto modal, no intel).

If nameConfirmed !== true:

Show First Approval Modal.

Else if nameConfirmed === true and enrichmentStatus === "PENDING":

Show a small bottom-right status indicator (spinner / “Company intel running…”).

Poll /companies/me until enrichmentStatus is "READY" or "FAILED".

Once enrichmentStatus === "READY" and profileConfirmed !== true:

Automatically open CompanyIntelModal in approval mode (see below) exactly once.

When profileConfirmed === true:

Do not auto-open the modal anymore on future logins/refreshes.

Keep the bottom-right indicator/pill to allow manual opening.

No full page refresh should be required; all state changes should be driven by React Query refetching and local modal state.

7.2 First Approval Modal (Name)
Trigger: company exists but nameConfirmed !== true.

Shows:

Guessed name.

Domain.

Possibly a “company setup” form (name, country, city, domain).

Actions:

✅ Yes → POST /companies/me/confirm-name with { approved: true }.

❌ No → show inputs for name, country, city, domain → POST /companies/me/confirm-name with { approved: false, ... }.

After success:

Close modal.

The backend enqueues enrichment.

UI transitions into enrichment-pending state (popover/pill with spinner).

7.3 CompanyIntelModal – second approval & read-only modes
There is one primary modal component (e.g. CompanyIntelModal) that behaves in two modes:

Approval mode (second approval):

Trigger: nameConfirmed === true, enrichmentStatus === "READY", profileConfirmed !== true.

Auto-opens the first time these conditions are met.

Shows:

Company snapshot:

Name, domain, website, HQ, social links, headcount, brand colors, fonts, tagline, tone of voice.

Optionally show fieldSources for debugging or as tooltips.

Summary of discovered jobs (count, sources).

Provides approval CTA:

✅ Yes, this is my company → POST /companies/me/confirm-profile with { approved: true }.

❌ No / Fix → show correction inputs → POST /companies/me/confirm-profile with { approved: false, ... }.

After a successful approval/correction:

Set profileConfirmed = true in state.

Close modal.

Do not auto-open again for this company.

Read-only mode:

Trigger: user manually opens intel (via bottom-right pill or Settings → Companies).

Only available when profileConfirmed === true.

Shows the same snapshot but without approval CTAs.

Acts as a reference view of the company data and brand.

7.4 Jobs in UI (discovered jobs)
After profileConfirmed === true:

The app may call /companies/me/jobs.

If jobs.length > 0:

Show an “Open postings” section in the relevant UI (dashboard, wizard intro, etc.).

Each job:

Displays title, source, location (if present).

Uses url as a link when non-null, opening in a new tab.

If jobs.length === 0:

Do not render an “Open postings” list.

Fall back to the standard wizard flow.

7.5 Wizard vs “Use existing postings”
The wizard is the main job-intake flow. Company intel may shorten it:

If:

profileConfirmed === true, and

jobDiscoveryStatus === "FOUND_JOBS", and

/companies/me/jobs returns jobs,

The UI can offer options like:

“Use an existing posting as a base” (select a discovered job).

“Create a new job from scratch.”

This is optional sugar; the core requirement is that nothing breaks if job discovery finds nothing.

7.6 Settings → Companies tab
The console’s Settings area must include a “Companies” tab.

Behavior:

On load:

Fetch /companies/my-companies and user profile (to know mainCompanyId).

Display:

A list of companies:

Name

Domain

Some key fields (industry, HQ, type)

A badge or label for the main company.

Actions:

Selecting a company:

Shows a details/edit form with editable Company fields:

Name, companyType, industry, employeeCountBucket

HQ country/city

Website

Tagline, toneOfVoice

Social links

Brand logo/icon/banner URLs, colors, fonts (if present)

On save:

Call PATCH /companies/:companyId.

Update React Query cache.

Set as main company:

Button or toggle on each company row.

Calls PATCH /users/me/main-company with that companyId.

Updates UI to reflect new main company.

These settings do not reset nameConfirmed or profileConfirmed; they allow the user to refine agent and Brandfetch results.

7.7 Launch Wizard → company selection (multi-company)
When the user clicks “Launch Wizard”:

Instead of going directly into the wizard route:

Open a CompanySelectionModal.

CompanySelectionModal:

Fetches /companies/my-companies.

Lists all companies (from user.profile.companyIds) with:

Name

Domain

Maybe “main” badge.

Allows selection of one company to use as the wizard context.

Provides an “Add new company” button.

If the user selects an existing company:

Close the modal.

Navigate to the wizard with that companyId (e.g. /wizard?companyId=... or via context).

The wizard and backend must associate all created jobs with this companyId.

If the user clicks “Add new company”:

Open the Company Setup modal (re-using the first-approval UI components as needed).

Require:

Company name

Domain

HQ country + city (if possible)

On submit:

Call POST /companies to create the new company.

Add to user.profile.companyIds.

Trigger enrichment for this company.

Treat this company as “selected” and continue to the wizard with its companyId.

Enrichment and second-approval for additional companies:

Brandfetch + agent enrichment still run for newly created companies.

profileConfirmed logic applies per company.

However, we generally should not spam users with auto-open modals for every company; we can:

Auto-open once right after creating a new company, or

Let the user inspect via Settings → Companies and CompanyIntelModal on demand.

The main requirement: every job created by the wizard must be linked to a specific companyId.

8. Rules for AI Assistants (Codex, etc.)
If you’re an AI model modifying this repo:

Treat this file as the authoritative spec for company-intel and multi-company behavior.

When asked to “improve company-intel” or “fix company modal/job discovery”:

Use the data models and flows described here.

Prefer ID-based company linkage (mainCompanyId, companyIds, job.companyId) over just domains.

Do not:

Reintroduce placeholder jobs with fake URLs (e.g. https://example.com/...).

Block auth/login routes on enrichment work.

Break existing wizard endpoints or flows.

Add secondary enrichment-job collections (all state lives on the companies docs).

If you need to change behavior that contradicts this spec:

Update both this spec and the code together so they stay in sync.

markdown
Copy code

---

Now your spec is up to date with:

- Single `companies` collection (no enrichment jobs collection).
- Brandfetch integration + `brand` nested object.
- Field evidence tracking.
- Multi-company users (`mainCompanyId`, `companyIds`).
- Company selection before launching the wizard.
- All modal/auto-open rules.