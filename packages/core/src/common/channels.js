import { z } from "zod";

export const CHANNEL_CATALOG = [
  {
    id: "LINKEDIN_JOBS",
    name: "LinkedIn Jobs/Ads",
    geo: "global",
    strengths: ["tech", "corporate", "professional", "senior", "startup"],
    media: ["image", "text"],
    notes: "Best for professional & senior IC roles; strong intent traffic."
  },
  {
    id: "INDEED_SPONSORED",
    name: "Indeed (Sponsored Jobs)",
    geo: "global",
    strengths: ["hourly", "healthcare", "corporate", "logistics_trades", "high_volume"],
    media: ["image", "text"],
    notes: "Largest active seeker base; works across most industries."
  },
  {
    id: "ZIPRECRUITER",
    name: "ZipRecruiter",
    geo: "us_only",
    strengths: ["hourly", "corporate", "logistics_trades", "high_volume"],
    media: ["image", "text"],
    notes: "US-centric distribution network; strong for SMB and volume."
  },
  {
    id: "GOOGLE_FOR_JOBS",
    name: "Google for Jobs (via schema)",
    geo: "global",
    strengths: ["all"],
    media: ["text"],
    notes: "Enable JobPosting structured data on your careers site; free aggregation."
  },
  {
    id: "WELLFOUND",
    name: "Wellfound (AngelList Talent)",
    geo: "global",
    strengths: ["startup", "tech", "product", "design"],
    media: ["image", "text"],
    notes: "Strong founder/operator audience."
  },
  {
    id: "YC_WAAS",
    name: "YC Work at a Startup",
    geo: "global",
    strengths: ["startup", "tech", "product"],
    media: ["image", "text"],
    notes: "High-signal engineering & product talent; YC ecosystem."
  },
  {
    id: "CRUNCHBOARD",
    name: "TechCrunch CrunchBoard",
    geo: "global",
    strengths: ["startup", "tech", "product", "marketing"],
    media: ["image", "text"],
    notes: "Syndicates on TechCrunch; tech audience."
  },
  {
    id: "WWR",
    name: "We Work Remotely",
    geo: "global",
    strengths: ["remote", "tech", "product", "support", "marketing"],
    media: ["image", "text"],
    notes: "Remote-first roles across functions."
  },
  {
    id: "REMOTE_OK",
    name: "Remote OK",
    geo: "global",
    strengths: ["remote", "tech", "product", "design"],
    media: ["image", "text"],
    notes: "Large remote audience; simple posting."
  },
  {
    id: "REMOTIVE",
    name: "Remotive",
    geo: "global",
    strengths: ["remote", "tech", "marketing", "ops"],
    media: ["image", "text"],
    notes: "Curated remote board."
  },
  {
    id: "HIMALAYAS",
    name: "Himalayas",
    geo: "global",
    strengths: ["remote", "tech", "product", "design"],
    media: ["image", "text"],
    notes: "Remote-only job board with rich company pages."
  },
  {
    id: "DRIBBBLE_JOBS",
    name: "Dribbble Jobs",
    geo: "global",
    strengths: ["creative", "design", "brand", "ui_ux"],
    media: ["image", "text"],
    notes: "Go-to for designers; portfolio-driven."
  },
  {
    id: "BEHANCE_JOBS",
    name: "Behance Jobs",
    geo: "global",
    strengths: ["creative", "design", "video", "brand"],
    media: ["image", "text"],
    notes: "Creative talent tied to portfolios."
  },
  {
    id: "CORE77_COROFLOT",
    name: "Core77 / Coroflot",
    geo: "global",
    strengths: ["creative", "industrial_design", "product_design"],
    media: ["image", "text"],
    notes: "Niche but high-signal industrial/product design."
  },
  {
    id: "CLIMATEBASE",
    name: "Climatebase",
    geo: "global",
    strengths: ["climate", "sustainability", "cleantech", "engineering"],
    media: ["image", "text"],
    notes: "Mission-driven climate talent."
  },
  {
    id: "TECH_LADIES",
    name: "Tech Ladies",
    geo: "global",
    strengths: ["tech", "product", "design", "marketing"],
    media: ["image", "text"],
    notes: "Community + job board; DEI-forward."
  },
  {
    id: "WOMENTECH",
    name: "WomenTech Network",
    geo: "global",
    strengths: ["tech", "product", "data", "security"],
    media: ["image", "text"],
    notes: "Events + job distribution to women in tech community."
  },
  {
    id: "BUILTIN",
    name: "Built In",
    geo: "us_only",
    strengths: ["tech", "startup", "product", "data"],
    media: ["image", "text"],
    notes: "US tech hubs + remote."
  },
  {
    id: "DICE",
    name: "Dice",
    geo: "us_only",
    strengths: ["tech", "security", "data", "it"],
    media: ["image", "text"],
    notes: "Established US tech specialist."
  },
  {
    id: "LEVELS_FYI_JOBS",
    name: "Levels.fyi Jobs",
    geo: "global",
    strengths: ["tech", "senior", "compensation_transparent"],
    media: ["image", "text"],
    notes: "Tech audience researching comp; free employer posts."
  },
  {
    id: "REED",
    name: "Reed.co.uk",
    geo: "uk_only",
    strengths: ["corporate", "hourly", "healthcare", "logistics_trades"],
    media: ["image", "text"],
    notes: "Broad UK reach."
  },
  {
    id: "TOTALJOBS",
    name: "Totaljobs",
    geo: "uk_only",
    strengths: ["corporate", "hourly", "logistics_trades"],
    media: ["image", "text"],
    notes: "Large UK multi-sector audience."
  },
  {
    id: "CV_LIBRARY",
    name: "CV-Library",
    geo: "uk_only",
    strengths: ["corporate", "hourly", "logistics_trades", "engineering"],
    media: ["image", "text"],
    notes: "Strong UK database + alerts."
  },
  {
    id: "GOV_UK_FIND_A_JOB",
    name: "GOV.UK – Find a job",
    geo: "uk_only",
    strengths: ["hourly", "public_sector", "entry_level"],
    media: ["text", "image"],
    notes: "Free government service (England, Scotland, Wales)."
  },
  {
    id: "NHS_JOBS",
    name: "NHS Jobs",
    geo: "uk_only",
    strengths: ["healthcare", "allied_health", "support_services"],
    media: ["text", "image"],
    notes: "Official health service hiring platform."
  },
  {
    id: "ADZUNA_UK",
    name: "Adzuna (UK)",
    geo: "uk_only",
    strengths: ["corporate", "hourly", "tech"],
    media: ["image", "text"],
    notes: "Job search engine with employer solutions."
  },
  {
    id: "WORK_IN_STARTUPS_UK",
    name: "Work In Startups (UK)",
    geo: "uk_only",
    strengths: ["startup", "tech", "product", "marketing"],
    media: ["image", "text"],
    notes: "Niche UK startup board."
  },
  {
    id: "META_FB_IG_LEAD",
    name: "Facebook/Instagram Lead Ads",
    geo: "global",
    strengths: ["hourly", "healthcare", "logistics_trades", "retail", "hospitality", "high_volume"],
    media: ["video", "image"],
    notes: "Select Special Ad Category: Employment; rapid apply via instant forms and Instagram Reels placements."
  },
  {
    id: "FACEBOOK_JOBS_US",
    name: "Jobs on Facebook (US)",
    geo: "us_only",
    strengths: ["hourly", "local", "retail", "hospitality", "trades", "logistics_trades"],
    media: ["image", "text"],
    notes: "US-only native listings integrated near Marketplace."
  },
  {
    id: "NEXTDOOR_BUSINESS",
    name: "Nextdoor Business Posts/Ads",
    geo: "us_uk",
    strengths: ["local", "trades", "home_services", "retail", "hourly"],
    media: ["image", "text"],
    notes: "Hyperlocal reach; great for neighborhood hiring."
  },
  {
    id: "TIKTOK_LEAD",
    name: "TikTok Lead Generation",
    geo: "global",
    strengths: ["hourly", "early_career", "creative", "marketing", "employer_brand"],
    media: ["video"],
    notes: "Instant Form; HEC (employment) policies may restrict targeting in some regions."
  },
  {
    id: "X_HIRING",
    name: "X (Twitter) Hiring",
    geo: "global",
    strengths: ["tech", "media", "startup", "executive"],
    media: ["text", "image", "video"],
    notes: "Requires Verified Organization to add Jobs tab; short video posts drive executive/tech reach."
  },
  {
    id: "REDDIT_ADS",
    name: "Reddit Ads (to niche communities)",
    geo: "global",
    strengths: ["tech", "gaming", "security", "specialist", "remote"],
    media: ["text", "image"],
    notes: "Lead Gen ads or community posts (follow subreddit rules)."
  },
  {
    id: "YOUTUBE_LEAD",
    name: "YouTube + Lead Form",
    geo: "global",
    strengths: ["healthcare", "engineering", "corporate", "employer_brand", "hourly"],
    media: ["video"],
    notes: "Shorts + in-stream video; strong for storytelling and shift roles."
  },
  {
    id: "SNAPCHAT_LEADS",
    name: "Snapchat Leads",
    geo: "global",
    strengths: ["hourly", "early_career", "retail", "hospitality"],
    media: ["video"],
    notes: "In-app lead forms with autofill; fast apply."
  },
  {
    id: "THREADS_ADS",
    name: "Threads (via Meta placements)",
    geo: "global",
    strengths: ["creative", "marketing", "brand", "startup"],
    media: ["image", "text"],
    notes: "Use via Meta Ads Manager as an additional placement."
  },
  {
    id: "WHATSAPP_CTW",
    name: "Click-to-WhatsApp (via Meta)",
    geo: "global",
    strengths: ["hourly", "local", "high_volume", "logistics_trades"],
    media: ["text", "image"],
    notes: "Apply-by-chat for quick screening; add auto-reply with prescreen questions."
  },
  {
    id: "PINTEREST_LEADS",
    name: "Pinterest Lead Ads",
    geo: "global",
    strengths: ["creative", "design", "fashion", "retail", "marketing"],
    media: ["image", "video"],
    notes: "Lifestyle/visual audiences; works for brand/creative hiring."
  }
];

export const CHANNEL_IDS = CHANNEL_CATALOG.map((channel) => channel.id);

export const CHANNEL_CATALOG_MAP = CHANNEL_CATALOG.reduce((acc, channel) => {
  acc[channel.id] = channel;
  return acc;
}, {});

export const ChannelIdEnum = z.enum(CHANNEL_IDS);
