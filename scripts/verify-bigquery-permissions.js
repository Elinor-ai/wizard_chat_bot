#!/usr/bin/env node

import { createBigQueryAdapter } from "@wizard/data";
import { createLogger } from "@wizard/utils";

const logger = createLogger("bigquery-test");

async function verifyBigQueryPermissions() {
  try {
    logger.info("Testing BigQuery connection and permissions...");

    const bigQuery = createBigQueryAdapter();

    logger.info({
      projectId: bigQuery.projectId,
      datasetId: bigQuery.datasetId,
      table: bigQuery.usageLogsTable,
    }, "BigQuery adapter initialized");

    // Test data that matches your schema
    const testData = {
      id: `test_${Date.now()}`,
      userId: "test-user-123",
      jobId: "test-job-456",
      taskType: "test",
      provider: "openai",
      model: "gpt-4",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cachedTokens: 0,
      inputCostPerMillionUsd: 30.0,
      outputCostPerMillionUsd: 60.0,
      cachedInputCostPerMillionUsd: 15.0,
      imageCostPerUnitUsd: null,
      videoCostPerSecondUsd: null,
      estimatedCostUsd: 0.0075,
      creditsUsed: 0.075,
      pricingPlan: "standard",
      usdPerCredit: 0.1,
      tokenCreditRatio: 2000.0,
      status: "success",
      errorReason: null,
      timestamp: new Date(),
      metadata: { finishReason: "stop" }
    };

    logger.info("Attempting to insert test row...");
    await bigQuery.addDocument(testData);

    logger.info("✅ SUCCESS! BigQuery permissions are configured correctly");
    logger.info("Test data inserted successfully");

    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "❌ FAILED! BigQuery test failed");

    if (error.message?.includes("Permission") || error.message?.includes("denied")) {
      logger.error("\n=== PERMISSION ERROR ===");
      logger.error("The service account lacks the required permissions.");
      logger.error("\nTo fix this, run one of the following commands:\n");
      logger.error("Option 1 - Grant at project level (recommended):");
      logger.error("  gcloud projects add-iam-policy-binding botson-playground \\");
      logger.error("    --member='serviceAccount:wizard-admin@botson-playground.iam.gserviceaccount.com' \\");
      logger.error("    --role='roles/bigquery.dataEditor'\n");
      logger.error("Option 2 - Grant at dataset level:");
      logger.error("  bq update --dataset \\");
      logger.error("    --add-access-entry role=WRITER,userByEmail=wizard-admin@botson-playground.iam.gserviceaccount.com \\");
      logger.error("    botson-playground:llm_analytics\n");
    } else {
      logger.error("This might be a data format or schema mismatch issue.");
      logger.error("Check the BigQuery table schema matches the data being inserted.");
    }

    process.exit(1);
  }
}

verifyBigQueryPermissions();
