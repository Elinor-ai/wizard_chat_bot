export const WORK_MODEL_OPTIONS = [
  { value: "on_site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "seasonal", label: "Seasonal" },
  { value: "intern", label: "Internship" },
];

export const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "executive", label: "Executive" },
];

export const PROGRESS_TRACKING_FIELDS = [
  "roleTitle",
  "companyName",
  "location",
  "seniorityLevel",
  "employmentType",
  "jobDescription",
];

export const REQUIRED_FIELD_IDS = [
  "roleTitle",
  "companyName",
  "location",
  "seniorityLevel",
  "employmentType",
  "jobDescription",
];

export const REQUIRED_STEPS = [
  {
    id: "role-basics",
    title: "Let’s capture the headline details.",
    subtitle: "Nothing is published yet—we’re collecting the essentials.",
    fields: [
      {
        id: "roleTitle",
        label: "What job title are you hiring for?",
        helper: "Use the title candidates expect to see in listings.",
        required: true,
        placeholder:
          "Assistant Manager / Operations Lead / Sushi Chef / Product Designer",
        type: "text",
        maxLength: 120,
      },
      {
        id: "companyName",
        label: "Which company is hiring for this role?",
        helper: "We reference this name throughout the job assets.",
        required: true,
        placeholder: "Acme Kitchens / Flow Logistics / Studio W",
        type: "text",
        maxLength: 120,
      },
      {
        id: "location",
        label: "Where is the role based?",
        helper:
          "Enter a city or region, or type “Remote” if the role is fully remote.",
        required: true,
        placeholder: "Austin, TX / Remote across EU / Tel Aviv HQ",
        type: "text",
      },
    ],
  },
  {
    id: "role-details",
    title: "Set the level and format.",
    subtitle: "We’ll use this to tailor compensation ranges and messaging.",
    fields: [
      {
        id: "seniorityLevel",
        label: "What experience level are you targeting?",
        helper: "Pick the seniority that reflects day-one expectations.",
        required: true,
        type: "capsule",
        options: EXPERIENCE_LEVEL_OPTIONS,
      },
      {
        id: "employmentType",
        label: "What is the employment type?",
        helper:
          "Clarify whether this is full-time, part-time, contract, or another arrangement.",
        required: true,
        type: "capsule",
        options: EMPLOYMENT_TYPE_OPTIONS,
      },
    ],
  },
  {
    id: "job-story",
    title: "Tell the story in your own words.",
    subtitle: "We’ll polish the copy, but your voice sets the tone.",
    fields: [
      {
        id: "jobDescription",
        label: "How would you describe this role to a candidate?",
        helper:
          "Explain why the role matters, what success looks like, and the impact they’ll have.",
        required: true,
        placeholder:
          "Lead the evening service, coach a 6-person crew, and keep guest experiences seamless even on peak nights.",
        type: "textarea",
        rows: 6,
      },
    ],
  },
];

export const OPTIONAL_STEPS = [
  {
    id: "work-style",
    title: "Clarify how the work happens.",
    subtitle: "Add context so candidates can picture the environment.",
    fields: [
      {
        id: "workModel",
        label: "What is the primary work model?",
        helper:
          "Set expectations for on-site, hybrid, or remote working rhythms.",
        required: false,
        type: "capsule",
        options: WORK_MODEL_OPTIONS,
      },
      {
        id: "industry",
        label: "Which industry best describes this role?",
        helper: "Helps us suggest relevant benchmarks and examples.",
        required: false,
        placeholder: "Hospitality / Logistics / AI SaaS / Healthcare clinic",
        type: "text",
      },
      {
        id: "zipCode",
        label: "What is the ZIP or postal code for this role?",
        helper:
          "Improves location-specific benchmarks and distribution targeting.",
        required: false,
        placeholder: "78701 / 94107 / 100-0001",
        type: "text",
        maxLength: 12,
      },
    ],
  },
  {
    id: "compensation",
    title: "Dial in compensation.",
    subtitle: "Keep it transparent so the right people raise their hand.",
    fields: [
      {
        id: "currency",
        label: "What currency should we display?",
        helper: "Use an ISO currency like USD, EUR, GBP, ILS, etc.",
        required: false,
        placeholder: "USD / GBP / EUR / ILS",
        type: "text",
        maxLength: 6,
      },
      {
        id: "salary",
        label: "What’s the salary or range you want to advertise?",
        helper:
          "Example: 60,000–72,000 or 30/hour. We’ll keep formatting consistent for you.",
        required: false,
        placeholder: "60,000 – 72,000 / 30 hourly / 3,500 monthly",
        type: "text",
      },
      {
        id: "salaryPeriod",
        label: "How should we frame the pay cadence?",
        helper: "Example: per year, per month, hourly, per shift.",
        required: false,
        placeholder: "per year / hourly / per shift",
        type: "text",
      },
    ],
  },
  {
    id: "extras",
    title: "Add the finishing touches.",
    subtitle: "This is where you hook the right-fit candidates.",
    fields: [
      {
        id: "benefits",
        label: "What benefits or perks do you offer?",
        helper:
          "List each on its own line—think about what differentiates your package.",
        required: false,
        placeholder:
          "Health insurance from day one\nPaid parental leave\nQuarterly team retreats",
        type: "textarea",
        rows: 4,
        asList: true,
      },
      {
        id: "coreDuties",
        label: "What are the core responsibilities for this role?",
        helper:
          "Use quick bullet points so candidates can scan responsibilities at a glance.",
        required: false,
        placeholder:
          "Lead daily standups and unblock the team\nReview and ship features every sprint\nCoach junior teammates through code reviews",
        type: "textarea",
        rows: 4,
        asList: true,
      },
      {
        id: "mustHaves",
        label: "What must-have qualifications should candidates bring?",
        helper:
          "Call out non-negotiable skills, experience, or certifications.",
        required: false,
        placeholder:
          "Comfortable owning customer-critical projects\nAble to collaborate across time zones\nExperience with modern analytics tooling",
        type: "textarea",
        rows: 3,
        asList: true,
      },
    ],
  },
];

export const OPTIONAL_STEP_BANNERS = {
  "work-style":
    "💡 Candidates are 2.8× more likely to apply when they understand your remote policy and team structure",
  compensation:
    "💡 Jobs with salary ranges get 72% more applications and reduce back-and-forth by 3 days on average",
  schedule:
    "💡 Clarity on hours and flexibility increases match quality by 54% and reduces mis-aligned applications",
  extras:
    "💡 Clear application instructions and timeline reduce candidate drop-off by 41% and speed up hiring",
};

export const TOAST_VARIANT_CLASSES = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
};
