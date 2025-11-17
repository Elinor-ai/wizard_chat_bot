# Company Intelligence Layer – Functional Spec

> **Audience:** Humans + AI assistants (Codex, etc.)  
> **Purpose:** This file is the **source of truth** for how the “company intelligence” layer should behave across backend + frontend.

If you are an AI assistant working on this repo, **read and follow this spec** when touching:

- `packages/core/src/schemas/company.js`
- `packages/core/src/schemas/user.js` (companyDomain)
- `packages/data/src/index.js` (companies / companyJobs / enrichmentJobs adapters)
- `services/api-gateway/src/services/company-intel.js`
- `services/api-gateway/src/routes/auth.js`
- `services/api-gateway/src/routes/companies.js`
- Any React components/hooks that render company modals or call `/companies/*`

---

## 1. High-Level Purpose

We want to turn **login** into a **data-intelligence entry point**:

- Recruiter logs in (email/password or Google).
- We extract their **email domain** and infer a **company**.
- We:

  1. Confirm with the user that this is really their company.
  2. Enrich the company profile from the web.
  3. Discover existing open jobs for that company (if any).
  4. Let the UI:
     - Skip or shorten the wizard when jobs already exist.
     - Brand all generated assets based on the company profile.

Constraints:

- **Login must remain fast** → enrichment/discovery is **async**.
- No fake data:
  - **No placeholder URLs** like `https://example.com/...`.
  - Only show jobs if we have **real, clickable URLs**.
- All behavior should be driven by **company + job documents in Firestore**, not by ad hoc state.

---

## 2. Architecture Context

Monorepo components (already in place):

- `apps/web` – Next.js 14 (React 18) app with marketing + console, NextAuth, React Query.
- `services/api-gateway` – Express API gateway, Firestore adapter, LLM client, main REST surface.
- `packages/core` – Shared schemas (users, jobs, LLM artifacts, and now **companies**).
- `packages/data` – Firestore adapter (`createFirestoreAdapter`) using `firebase-admin`.
- Other services (wizard-chat, asset-generation, campaign-orchestrator, publishing, screening, credits) exist as **stubs** for now.

The **company-intel** layer lives mostly in:

- `packages/core/src/schemas/company.js`
- `packages/data/src/index.js`
- `services/api-gateway/src/services/company-intel.js`
- `services/api-gateway/src/routes/auth.js`
- `services/api-gateway/src/routes/companies.js`

---

## 3. Data Model

### 3.1 User additions

Users are stored in `"users"` with `UserSchema` (in `packages/core/src/schemas/user.js`).

Company linkage:

- `user.profile.companyDomain` (optional string)
  - The domain inferred from the email address:
    - `stav@botson.ai` → `botson.ai`.
  - Only set for **non-generic** domains (not `gmail.com`, `outlook.com`, etc.).
  - This is the primary link between a user and their company.

Later we might add:

- `user.profile.companyId` as a direct reference to a `companies` doc.
  - If this exists, use it as the canonical link.
  - If not, derive company via `companyDomain`.

### 3.2 Company document schema

Stored in the `"companies"` collection, schema in `packages/core/src/schemas/company.js`.

Core identity:

- `id` (string) – Firestore doc ID.
- `primaryDomain` (string) – e.g. `"botson.ai"`.
- `additionalDomains` (array<string>) – optional aliases.
- `name` (string | null) – company name (may start as a guess).
- `companyType` (string | null) – `"company" | "agency" | "freelancer" | null`.
- `industry` (string | null).

Size & location:

- `employeeCountBucket` (string | null) – e.g. `"1-10"`, `"11-50"`, `"51-200"`.
- `hqCountry` (string | null).
- `hqCity` (string | null).

Brand:

- `website` (string | null) – e.g. `"https://botson.ai"`.
- `logoUrl` (string | null).
- `primaryColor` (string | null).
- `secondaryColor` (string | null).
- `fontFamilyPrimary` (string | null).
- `toneOfVoice` (string | null) – e.g. `"innovative and data-driven"`.
- `tagline` (string | null).

Socials (all optional strings):

- `socials.linkedin`
- `socials.facebook`
- `socials.instagram`
- `socials.twitter`
- `socials.tiktok`
- (others may be added later).

Enrichment & job status:

- `enrichmentStatus` (string) – `"PENDING" | "READY" | "FAILED"`.
- `jobDiscoveryStatus` (string) – `"UNKNOWN" | "FOUND_JOBS" | "NOT_FOUND"`.

Approvals (important for UX & cost control):

- `nameConfirmed` (boolean) – has the user confirmed the initial company *name*?
- `profileConfirmed` (boolean) – has the user confirmed the enriched *profile*?

Enrichment metadata:

- `lastEnrichedAt` (timestamp | null).
- `lastJobDiscoveryAt` (timestamp | null).
- `confidenceScore` (number | null) – 0–1.
- `sourcesUsed` (array<string>) – e.g. `["website", "search", "linkedin"]`.

Audit:

- `createdAt` (timestamp).
- `updatedAt` (timestamp).
- `createdByUserId` (string | null).

### 3.3 Company job schema (discovered jobs)

Collection: either `"companyJobs"` or a subcollection under `companies`.  
Schema is defined in `packages/core/src/schemas/company.js` as `CompanyJob` (or equivalent).

Fields:

- `companyId` (string) – ID of the company.
- `companyDomain` (string) – redundant but useful for queries.
- `source` (string) – `"careers-site" | "linkedin" | "other"`; no `"stub"` in real data.
- `externalId` (string | null) – ID from source if available.
- `title` (string) – job title.
- `location` (string | null).
- `description` (string | null) – snippet or full description (optional).
- `url` (string | null) – **MUST be real, clickable URL**, not placeholder.
- `postedAt` (timestamp | null).
- `discoveredAt` (timestamp).
- `isActive` (boolean) – if job appears open/visible.

**Important rule:**  
Do **not** create placeholder jobs with fake URLs like `https://example.com/...`.  
If no real jobs are found, return **zero** jobs and the UI must hide the “Open postings” section.

### 3.4 Company enrichment lifecycle (on the company doc)

All enrichment + job-discovery state must live directly on the `companies` document. Keep the company record as the single source of truth with fields like:

- `enrichmentStatus` – `"PENDING" | "READY" | "FAILED"`.
- `enrichmentQueuedAt`, `enrichmentStartedAt`, `enrichmentCompletedAt`, `enrichmentLockedAt`.
- `enrichmentAttempts` (number) and `enrichmentError` `{ reason, message, occurredAt }`.
- `lastEnrichedAt`, `sourcesUsed`, `confidenceScore`.
- `jobDiscoveryStatus`, `jobDiscoveryQueuedAt`, `jobDiscoveryAttempts`, `lastJobDiscoveryAt`.
- `nameConfirmed`, `profileConfirmed`, and other metadata listed above.

No secondary enrichment collection should exist—the company document itself tracks progress and can be extended with more enrichment metadata as needed.

---

## 4. Backend Flows

### 4.1 Auth → domain association

Auth routes live in `services/api-gateway/src/routes/auth.js`.

For **email/password login** and **Google OAuth**, behavior:

1. User authenticates as usual (password or Google).
2. Extract email domain:
   - `stav@botson.ai` → `botson.ai`.
3. If the domain is **generic** (e.g. `gmail.com`, `outlook.com`, `yahoo.com`, etc.):
   - Do **not** set `companyDomain`.
   - Do **not** create a company.
4. If the domain is **non-generic**:
   - Set `user.profile.companyDomain = domain` (if not already set).
   - Ensure a `companies` document exists with `primaryDomain = domain`. If not, create it:
     - `primaryDomain = domain`
     - `name` = null or a guess.
     - `enrichmentStatus = "PENDING"` (or `"NEW"` if you want an intermediate state).
     - `jobDiscoveryStatus = "UNKNOWN"`.
     - `nameConfirmed = false`
     - `profileConfirmed = false`
   - **Do NOT run full enrichment yet** (see first approval flow below).
5. Login must **not be blocked** by any enrichment logic.

Helpers performing this logic live in `services/api-gateway/src/services/company-intel.js`.

### 4.2 First approval – confirm company name **before** enrichment

Goal: don’t waste enrichment calls on the wrong company.

Flow:

1. After login, frontend console fetches `/companies/me`.
2. If:

   - The user has a `companyDomain`, AND  
   - The company exists, AND  
   - `nameConfirmed !== true`,

   Then show **First Approval Modal**:

   - Shows:
     - Guessed company name (from `company.name`, or a domain-derived guess).
     - The domain.
   - Buttons:
     - ✅ **Yes, that’s my company**
     - ❌ **No / Edit**

3. Backend support:

   - Add/keep an endpoint, e.g. `POST /companies/me/confirm-name`.
   - Request body:
     - Case 1 – user confirms:
       - `{ approved: true }`
     - Case 2 – user edits:
       - `{ approved: false, name: "Correct Name", country: "Country", city: "City" }`
   - Behavior:
     - If `approved: true`:
       - Set `nameConfirmed = true`.
       - If `name` is null/empty, keep current name or derive from domain.
       - Now safe to **trigger enrichment** if `enrichmentStatus` is `"PENDING"` or `"NEW"`.
     - If `approved: false`:
       - Update:
         - `name` = provided `name`.
         - `hqCountry` / `hqCity` from `country` / `city` (or store as hints).
       - Set `nameConfirmed = true`.
       - Trigger enrichment using **user-provided name/location** as hints.

### 4.3 Enrichment pipeline (stub + future agents)

Triggered only **after** `nameConfirmed = true`.

Implemented in `services/api-gateway/src/services/company-intel.js`:

- `enqueueCompanyEnrichment(companyId | domain)`:
  - Mark the company as needing enrichment (e.g., `enrichmentStatus = "PENDING"`).
  - Update metadata directly on the company doc (`enrichmentQueuedAt = now`, clear `enrichmentError`, etc.).
  - Do **not** create a secondary job document; the company record itself represents the queue.

- `runCompanyEnrichmentOnce(companyDoc)`:
  - **Must not be called in the auth request path**.
  - Called by:
    - A worker process, cron job, or a debug/manual route.
  - Responsibilities:
    1. Use tools (see section 6) to:
       - Infer `website` (e.g. `https://<primaryDomain>`).
       - Fetch homepage HTML.
       - Extract name, tagline, maybe location.
       - Search the web for:
         - Company website.
         - Social accounts (especially LinkedIn).
       - Fill `socials` and brand fields where possible.
    2. Update the company doc:
       - `enrichmentStatus = "READY"` (or `"FAILED"` on error).
       - `lastEnrichedAt = now`.
       - `confidenceScore` set to a rough value.
       - `sourcesUsed` list.
    3. Call `discoverJobsForCompany(company)` (see next section).

In early versions, this can be **stubbed**:

- At minimum:
  - Set `website = https://<primaryDomain>` if empty.
  - Set `enrichmentStatus = "READY"`.
  - Set `lastEnrichedAt` and low `confidenceScore`.
- But agents / future improvements should plug into this function.

### 4.4 Job discovery pipeline

Lives alongside enrichment in `company-intel.js`.

Function: `discoverJobsForCompany(company)`:

- **Must not** create placeholder jobs.
- Uses:

  - Company website and discovered `careerPageUrl` to scrape job cards.
  - Web search to discover LinkedIn job listings or a careers page.
  - Any connectors we add later.

Returns: an array of **real** job objects:

- Each job must have a meaningful `title`; if `url` is present, it must be a real URL.

Then `saveDiscoveredJobs(company, jobs)`:

- Writes jobs to the `companyJobs` collection with:

  - `companyId`, `companyDomain`
  - `source`
  - `title`, `location`, `description`, `url`, `postedAt`, `discoveredAt`, `isActive`

Company-level updates:

- If `jobs.length > 0`:

  - `jobDiscoveryStatus = "FOUND_JOBS"`
  - `lastJobDiscoveryAt = now`

- Else:

  - `jobDiscoveryStatus = "NOT_FOUND"`
  - `lastJobDiscoveryAt = now`

**UI rule:**  
If `/companies/me/jobs` returns an empty array, do **not** render any “Open postings”/job list.

### 4.5 Second approval – confirm enriched profile

After enrichment completes:

1. Backend:

   - `/companies/me` now returns company with:
     - `enrichmentStatus = "READY"`.
     - Some fields filled in (website, socials, maybe jobs discovered).

2. Frontend:

   - If:
     - `nameConfirmed === true`, AND
     - `profileConfirmed !== true`, AND
     - `enrichmentStatus === "READY"`,
   - Show **Second Approval Modal**:

     - Display key profile fields:
       - Name
       - Domain
       - Website
       - HQ location (if known)
       - Socials (links)
       - Number of open jobs discovered

     - Ask:
       > “Is this your company?”

     - Buttons:
       - ✅ Yes, this is my company
       - ❌ No / This is wrong

3. Backend endpoint:

   - `POST /companies/me/confirm-profile`
   - Request body:
     - `{ approved: true }`  
     - OR `{ approved: false, name?: ..., country?: ..., city?: ... }`
   - Behavior:
     - If `approved: true`:
       - Set `profileConfirmed = true`.
     - If `approved: false`:
       - Update fields with corrections.
       - Optionally:
         - Reset `enrichmentStatus = "PENDING"`.
         - Re-enqueue enrichment with new hints.

After `profileConfirmed = true`, the platform can safely use this company profile for:

- Branding
- Job list prefill
- Channel recommendations and creative tone

---

## 5. API Endpoints

All under `services/api-gateway/src/routes/companies.js`, mounted in `server.js`.

### 5.1 `GET /companies/me`

- **Auth required** (`requireAuth`).
- Determine company from:
  - `req.user.profile.companyId` if present, else
  - `req.user.profile.companyDomain` → `companies.primaryDomain`.
- Returns:

  ```jsonc
  {
    "company": {
      // Full company document per schema
      "id": "...",
      "primaryDomain": "...",
      "name": "...",
      "nameConfirmed": true,
      "profileConfirmed": false,
      "enrichmentStatus": "PENDING" | "READY" | "FAILED",
      "jobDiscoveryStatus": "UNKNOWN" | "FOUND_JOBS" | "NOT_FOUND",
      // ... other fields
    }
  }

If the user has no company, return 404 or a consistent JSON null with a clear status.

5.2 GET /companies/me/jobs

Auth required.

Same company lookup as /companies/me.

Fetch related companyJobs for that company.

Return:

{
  "jobs": [
    {
      "id": "...",
      "companyId": "...",
      "title": "Senior Backend Engineer",
      "url": "https://real.company/careers/123",
      "source": "careers-site",
      "location": "Tel Aviv, Israel",
      "isActive": true,
      "postedAt": "...",
      "discoveredAt": "..."
    },
    // ...
  ]
}


If no jobs exist, return "jobs": [].

5.3 POST /companies/me/confirm-name

Auth required.

Body:

// user accepts guessed name
{ "approved": true }

// user corrects name + location
{
  "approved": false,
  "name": "Correct Company Ltd.",
  "country": "Israel",
  "city": "Tel Aviv"
}


Behavior (see section 4.2).

Response: updated company object.

5.4 POST /companies/me/confirm-profile

Auth required.

Body:

{ "approved": true }

{
  "approved": false,
  "name": "Correct Company Ltd.",
  "country": "Israel",
  "city": "Ramat Gan"
}


Behavior (see section 4.5).

Response: updated company object.

6. Agent Tools & company-intel.js

The file services/api-gateway/src/services/company-intel.js should expose small, composable helpers, not one giant monolith.

Core helpers (names can vary slightly but the responsibilities must exist):

6.1 Domain & company linkage

normalizeEmailDomain(email):

Returns { localPart, domain }.

isGenericDomain(domain):

Returns true for gmail.com, outlook.com, etc.

ensureCompanyForDomain({ domain, userId }):

Gets or creates a companies doc with primaryDomain = domain.

Sets basic fields (domain, createdByUserId).

Does not run full enrichment yet.

6.2 Enrichment orchestration

enqueueCompanyEnrichment(company):

Marks company as needing enrichment (e.g., `enrichmentStatus = "PENDING"`, `enrichmentQueuedAt = now`, clears any previous `enrichmentError`) directly on the company document. There is no separate job collection.

runCompanyEnrichmentOnce(company):

Performs one enrichment run:

Uses tools like:

searchCompanyOnWeb({ domain, name, location })

fetchWebsite(company) / fetchHtml(url)

extractBrandFromHtml(html)

extractSocialLinksFromResults(results, html)

discoverCareerPage({ domain, html, searchResults })

Updates company fields.

Calls discoverJobsForCompany(company) → saveDiscoveredJobs(...).

Sets statuses and timestamps.

Everything heavy (network calls, scraping, LLM calls) should live here or in sub-modules, not inside auth routes.

6.3 Job discovery

discoverJobsForCompany(company):

Attempts to find real jobs from:

careers page

LinkedIn jobs

other sources later

Returns clean job objects with real URLs or none.

saveDiscoveredJobs(company, jobs):

Writes into Firestore and updates company jobDiscoveryStatus.

Important:
Jobs with url = null should still be allowed, but the UI must handle them carefully; ideally, most real jobs have a URL.
Never create jobs just to “show something” (no example.com).

7. Frontend Behavior

Front-end is in apps/web (console UI using Next.js + React Query).

7.1 Data fetching

On console load (authenticated):

Fetch /companies/me (React Query or similar).

Depending on company fields:

If no company:

Do nothing for now.

If nameConfirmed !== true:

Show First Approval Modal.

Else if nameConfirmed === true and enrichmentStatus === "PENDING":

Start polling /companies/me until enrichmentStatus becomes "READY" or "FAILED".

Once enrichmentStatus === "READY" and profileConfirmed !== true:

Open the CompanyIntelModal (single modal) for second approval.

When profileConfirmed === true:

- Do **not** auto-open the modal on future refreshes/logins.
- Keep the bottom-right indicator/pill so the user can open the modal manually.
- Optionally fetch /companies/me/jobs to drive job-based flows.

No full-page refresh should be required for any of these transitions.
The UI must react to status changes and only auto-open during the first-approval flow or the second-approval flow before profileConfirmed flips to true.

7.2 First Approval Modal (Name)

Trigger: company exists, nameConfirmed !== true.

Content:

Show guessed name + domain.

Actions:

✅ Yes → POST /companies/me/confirm-name with { approved: true }.

❌ No → show form for name + location → POST /companies/me/confirm-name with { approved: false, name, country, city }.

After success:

Close modal.

Start enrichment (backend side).

Begin watching enrichmentStatus (PENDING → READY).

7.3 Second Approval Modal (Profile)

Trigger: nameConfirmed === true, enrichmentStatus === "READY", profileConfirmed !== true.

Modal rules:

- **CompanyIntelModal** is the single modal for both profile review and read-only intel.
- When profileConfirmed is false, show the snapshot plus the approval CTA directly in this modal (no second stacked modal).
- When profileConfirmed becomes true, this modal should only open on explicit user action (indicator click, settings tab, etc.).

Content:

- Name, domain, website, location, socials, tone, job count, etc.
- CTA area asking “Is this your company?” with approve + correction modes.

Actions:

- ✅ Yes → POST /companies/me/confirm-profile with { approved: true }.
- ❌ No → show correction form within the same modal → POST /companies/me/confirm-profile with corrections.

After success:

- Close modal.
- If confirmed, consider fetching /companies/me/jobs for job-driven flows.

When profileConfirmed === true:

- Modal no longer auto-opens. Users can manually reopen it via the indicator or via Settings → Companies (see 7.6).

7.4 Jobs in UI (discovered jobs)

After profileConfirmed === true:

Call /companies/me/jobs.

If jobs.length > 0:

Show “Open postings” section.

Each job:

Displays title, source, maybe location.

If url is non-null, clicking opens in new tab.

If jobs.length === 0:

Do not show an “Open postings” list.

Fallback: use wizard as usual.

7.5 Wizard vs “Skip wizard” behavior

The wizard currently controls all job creation.

With company-intel:

If profileConfirmed === true AND jobDiscoveryStatus === "FOUND_JOBS" AND there are jobs:

Offer a UI option:

“Use existing job posting as a base” (select job)

or “Create a brand-new job” (wizard).

If jobDiscoveryStatus === "NOT_FOUND" or no jobs:

Just show the normal wizard.

The existing wizard behavior must not break.

7.6 Settings → Companies tab

- Console settings must include a “Companies” tab listing every company linked to the user (via companyDomain/companyId/createdByUserId).
- Selecting a company shows a form with all editable Company schema fields:
  - name, companyType, industry, employeeCountBucket, HQ info, website, logoUrl, tagline, toneOfVoice, socials, brand colors, etc.
- Saving writes directly to the `companies` document (respecting the schema) and refreshes cached company intel data.
- This UI does **not** reset `nameConfirmed` or `profileConfirmed`; it lets users improve agent results without re-enrichment.

8. Rules for AI Assistants (Codex, etc.)

If you’re an AI model modifying this repo:

Treat this file as the authoritative spec for company-intel behavior.

When asked to “improve company-intel” or “fix company modal/job discovery”:

Use the data models and flows described here.

Do not:

Reintroduce placeholder jobs with fake URLs.

Block auth/login routes on enrichment work.

Break the existing wizard endpoints.

If you need to change behavior that contradicts this spec:

Update this spec and the code together so they stay in sync.
