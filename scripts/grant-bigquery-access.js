#!/usr/bin/env node

import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "@wizard/utils";

const logger = createLogger("grant-access");

async function grantDatasetAccess() {
  try {
    const serviceAccountPath = resolve(process.cwd(), "config/service-account.json");
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`Service account file not found: ${serviceAccountPath}`);
    }

    const serviceAccountJson = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    const projectId = "botson-playground";
    const datasetId = "llm_analytics";
    const serviceAccountEmail = serviceAccountJson.client_email;

    const bigquery = new BigQuery({
      projectId,
      credentials: serviceAccountJson,
    });

    const dataset = bigquery.dataset(datasetId);
    const [metadata] = await dataset.getMetadata();

    logger.info({ currentAccess: metadata.access }, "Current dataset access");

    // Check if the service account already has access
    const hasAccess = metadata.access?.some(
      (entry) => entry.userByEmail === serviceAccountEmail && entry.role === "WRITER"
    );

    if (hasAccess) {
      logger.info(`Service account ${serviceAccountEmail} already has WRITER access`);
      return;
    }

    // Add the service account with WRITER role
    metadata.access.push({
      role: "WRITER",
      userByEmail: serviceAccountEmail,
    });

    await dataset.setMetadata({ access: metadata.access });

    logger.info(
      {
        serviceAccountEmail,
        role: "WRITER",
        dataset: `${projectId}:${datasetId}`,
      },
      "✅ Successfully granted BigQuery dataset access"
    );

    logger.info("\nNow run the test script to verify:");
    logger.info("  node scripts/verify-bigquery-permissions.js\n");
  } catch (error) {
    logger.error({ err: error }, "❌ Failed to grant dataset access");

    if (error.code === 403) {
      logger.error("\nYou don't have permissions to modify dataset access.");
      logger.error("Please ask a project owner to grant access manually in the Google Cloud Console:");
      logger.error("  1. Go to https://console.cloud.google.com/bigquery");
      logger.error("  2. Select the 'llm_analytics' dataset");
      logger.error("  3. Click 'SHARE' → 'Permissions'");
      logger.error("  4. Add: wizard-admin@botson-playground.iam.gserviceaccount.com");
      logger.error("  5. Grant role: BigQuery Data Editor\n");
    }

    process.exit(1);
  }
}

grantDatasetAccess();
