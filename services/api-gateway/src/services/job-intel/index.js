/**
 * @file index.js
 * Job Intel Service - exports for job discovery functionality.
 *
 * This module exports:
 * - runJobIntelAgentOnce: Entry point for job_intel_agent task
 * - inferJobDiscoveryStrategy: Strategy inference based on company characteristics
 * - runJobDiscoveryForCompany: Reusable job discovery pipeline
 * - discoverJobsForCompany: Pure discovery function (no Firestore writes)
 */

export {
  runJobIntelAgentOnce,
  inferJobDiscoveryStrategy,
} from "./job-intel-service.js";
export {
  runJobDiscoveryForCompany,
  discoverJobsForCompany,
} from "./job-discovery-service.js";
