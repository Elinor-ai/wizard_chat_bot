import fs from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";
import { z } from "zod";
import { loadEnv, createLogger } from "@wizard/utils";

const bigQueryConfigSchema = z.object({
  projectId: z.string().min(1, "BigQuery projectId required"),
  serviceAccountPath: z
    .string()
    .min(1, "BigQuery service account JSON required"),
  datasetId: z.string().min(1, "BigQuery datasetId required"),
  location: z.string().optional().default("US"),
});

let bigQuerySingleton;
let bigQueryConfigSingleton;

function initializeBigQuery(config, logger) {
  if (bigQuerySingleton) {
    return {
      bigQueryClient: bigQuerySingleton,
      parsedConfig: bigQueryConfigSingleton,
    };
  }

  const parsedConfig = bigQueryConfigSchema.parse(config);
  const { projectId, serviceAccountPath } = parsedConfig;

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `BigQuery adapter requires a service account JSON at ${serviceAccountPath}.`
    );
  }

  const serviceAccountJson = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8")
  );

  bigQuerySingleton = new BigQuery({
    projectId,
    credentials: serviceAccountJson,
  });
  bigQueryConfigSingleton = parsedConfig;

  logger.info(
    {
      projectId,
      serviceAccountEmail: serviceAccountJson.client_email,
      serviceAccountPath,
    },
    "Initialized BigQuery client"
  );

  return { bigQueryClient: bigQuerySingleton, parsedConfig };
}

function normalizeSchemaType(type) {
  const normalized = String(type ?? "")
    .trim()
    .toUpperCase();
  switch (normalized) {
    case "NUMERIC":
    case "BIGNUMERIC":
    case "FLOAT":
    case "FLOAT64":
      return "Float";
    case "INTEGER":
    case "INT64":
      return "Integer";
    case "BOOLEAN":
    case "BOOL":
      return "Boolean";
    case "TIMESTAMP":
      return "Timestamp";
    case "DATE":
      return "Date";
    case "DATETIME":
      return "Datetime";
    case "TIME":
      return "Time";
    case "STRING":
      return "String";
    default:
      return normalized || "Unknown";
  }
}

function isNumericType(type) {
  const normalized = String(type ?? "")
    .trim()
    .toUpperCase();
  return [
    "NUMERIC",
    "BIGNUMERIC",
    "FLOAT",
    "FLOAT64",
    "INTEGER",
    "INT64",
  ].includes(normalized);
}

function convertNumericFields(row, schemaFields) {
  if (!row || !schemaFields?.length) {
    return row;
  }
  const numericFields = new Set(
    schemaFields
      .filter((field) => isNumericType(field.type))
      .map((field) => field.name)
  );
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (numericFields.has(key)) {
        const asNumber = Number(value);
        if (Number.isFinite(asNumber)) {
          return [key, asNumber];
        }
      }
      return [key, value];
    })
  );
}

export function createBigQueryAdapter(options = {}) {
  const env = loadEnv();
  const logger = createLogger("bigquery-adapter");
  logger.info(
    { envProject: env.BIGQUERY_PROJECT_ID ?? env.FIRESTORE_PROJECT_ID },
    "Loaded BigQuery env config"
  );

  const rootDir = process.env.WIZARD_ROOT_DIR ?? process.cwd();
  const candidateServiceAccountPaths = [
    options.serviceAccountPath,
    env.GOOGLE_APPLICATION_CREDENTIALS,
    env.BIGQUERY_SERVICE_ACCOUNT_PATH,
    "config/service-account.json",
    "packages/data/config/service-account.json",
  ]
    .filter(Boolean)
    .map((value) => (isAbsolute(value) ? value : resolve(rootDir, value)));

  const resolvedServiceAccountPath =
    candidateServiceAccountPaths.find((path) => fs.existsSync(path)) ??
    candidateServiceAccountPaths[0];

  if (!resolvedServiceAccountPath || !fs.existsSync(resolvedServiceAccountPath)) {
    throw new Error(
      `BigQuery adapter requires a service account JSON. Tried: ${candidateServiceAccountPaths.join(
        ", "
      )}`
    );
  }

  const config = {
    projectId:
      options.projectId ??
      env.BIGQUERY_PROJECT_ID ??
      env.FIRESTORE_PROJECT_ID,
    datasetId: options.datasetId ?? env.BIGQUERY_DATASET_ID ?? "llm_analytics",
    serviceAccountPath: resolvedServiceAccountPath,
    location: options.location ?? env.BIGQUERY_LOCATION ?? "US",
  };

  const { bigQueryClient, parsedConfig } = initializeBigQuery(config, logger);
  const { datasetId, projectId, location } = parsedConfig;
  const usageLogsTable =
    options.usageLogsTable ??
    env.BIGQUERY_LLM_USAGE_TABLE ??
    "usage_logs";

  function transformRowForBigQuery(row) {
    // Create a new object with only the fields that should be in BigQuery
    const transformed = {};

    // Generate unique ID if not provided
    transformed.id = row.id ? String(row.id) : randomUUID();

    // Handle each field according to BigQuery schema expectations
    if (row.userId !== undefined && row.userId !== null) transformed.user_id = String(row.userId);
    if (row.jobId !== undefined && row.jobId !== null) transformed.job_id = String(row.jobId);
    if (row.taskType !== undefined && row.taskType !== null) transformed.task_type = String(row.taskType);
    if (row.provider !== undefined && row.provider !== null) transformed.provider = String(row.provider);
    if (row.model !== undefined && row.model !== null) transformed.model = String(row.model);

    // Token fields (integers)
    if (row.inputTokens !== undefined && row.inputTokens !== null) transformed.input_tokens = Number(row.inputTokens);
    if (row.outputTokens !== undefined && row.outputTokens !== null) transformed.output_tokens = Number(row.outputTokens);
    if (row.totalTokens !== undefined && row.totalTokens !== null) transformed.total_tokens = Number(row.totalTokens);
    if (row.thoughtsTokens !== undefined && row.thoughtsTokens !== null) transformed.thoughts_tokens = Number(row.thoughtsTokens);
    if (row.cachedTokens !== undefined && row.cachedTokens !== null) transformed.cached_tokens = Number(row.cachedTokens);

    // Cost fields (floats)
    if (row.inputCostPerMillionUsd !== undefined && row.inputCostPerMillionUsd !== null) {
      transformed.input_cost_per_million_usd = Number(row.inputCostPerMillionUsd);
    }
    if (row.outputCostPerMillionUsd !== undefined && row.outputCostPerMillionUsd !== null) {
      transformed.output_cost_per_million_usd = Number(row.outputCostPerMillionUsd);
    }
    if (row.cachedInputCostPerMillionUsd !== undefined && row.cachedInputCostPerMillionUsd !== null) {
      transformed.cached_input_cost_per_million_usd = Number(row.cachedInputCostPerMillionUsd);
    }
    if (row.imageCostPerUnitUsd !== undefined && row.imageCostPerUnitUsd !== null) {
      transformed.image_cost_per_unit_usd = Number(row.imageCostPerUnitUsd);
    }
    if (row.videoCostPerSecondUsd !== undefined && row.videoCostPerSecondUsd !== null) {
      transformed.video_cost_per_second_usd = Number(row.videoCostPerSecondUsd);
    }
    if (row.groundingSearchQueries !== undefined && row.groundingSearchQueries !== null) {
      transformed.grounding_search_queries = Number(row.groundingSearchQueries);
    }
    if (row.groundingSearchCostPerQueryUsd !== undefined && row.groundingSearchCostPerQueryUsd !== null) {
      transformed.grounding_search_cost_per_query_usd = Number(row.groundingSearchCostPerQueryUsd);
    }
    if (row.estimatedCostUsd !== undefined && row.estimatedCostUsd !== null) {
      transformed.estimated_cost_usd = Number(row.estimatedCostUsd);
    }
    if (row.creditsUsed !== undefined && row.creditsUsed !== null) {
      transformed.credits_used = Number(row.creditsUsed);
    }
    if (row.usdPerCredit !== undefined && row.usdPerCredit !== null) {
      transformed.usd_per_credit = Number(row.usdPerCredit);
    }
    if (row.tokenCreditRatio !== undefined && row.tokenCreditRatio !== null) {
      transformed.token_credit_ratio = Number(row.tokenCreditRatio);
    }

    // String fields
    if (row.pricingPlan !== undefined && row.pricingPlan !== null) transformed.pricing_plan = String(row.pricingPlan);
    if (row.status !== undefined && row.status !== null) transformed.status = String(row.status);
    if (row.errorReason !== undefined && row.errorReason !== null) transformed.error_reason = String(row.errorReason);

    // Timestamp and Date fields
    const timestamp = row.timestamp
      ? (row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp))
      : new Date();
    transformed.timestamp = timestamp.toISOString();
    // Date field for partitioning (yyyy-mm-dd format)
    transformed.date = timestamp.toISOString().split('T')[0];

    // Metadata as JSON - BigQuery JSON type requires stringified JSON for insert()
    if (row.metadata !== undefined && row.metadata !== null) {
      transformed.metadata = typeof row.metadata === 'string'
        ? row.metadata
        : JSON.stringify(row.metadata);
    }

    return transformed;
  }

  async function insertRows(tableName, rows) {
    if (!tableName) {
      throw new Error("tableName is required to insert rows into BigQuery");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("rows must be a non-empty array to insert into BigQuery");
    }
    try {
      const dataset = bigQueryClient.dataset(datasetId);
      const table = dataset.table(tableName);

      // Transform rows to match BigQuery schema (camelCase -> snake_case)
      const transformedRows = rows.map(transformRowForBigQuery);

      await table.insert(transformedRows);
      logger.info(
        { tableName, datasetId, rowCount: rows.length },
        "BigQuery rows inserted"
      );
      return { inserted: rows.length };
    } catch (error) {
      logger.error(
        { err: error, tableName, datasetId },
        "BigQuery row insert failed"
      );
      throw new Error(`Error inserting rows to BigQuery: ${error.message}`);
    }
  }

  async function query(queryText) {
    if (!queryText) {
      return { data: [], schema: [] };
    }
    try {
      const [job] = await bigQueryClient.createQueryJob({
        query: queryText,
        location,
      });
      const [rows] = await job.getQueryResults();
      const destinationTable =
        job.metadata?.configuration?.query?.destinationTable;
      let schemaFields = [];

      if (destinationTable?.datasetId && destinationTable?.tableId) {
        const table = bigQueryClient
          .dataset(destinationTable.datasetId)
          .table(destinationTable.tableId);
        const [metadata] = await table.getMetadata();
        schemaFields = metadata?.schema?.fields ?? [];
      }

      const normalizedSchema = schemaFields.map((field) => ({
        name: field.name,
        type: normalizeSchemaType(field.type),
      }));
      const processedRows = rows.map((row) =>
        convertNumericFields(row, schemaFields)
      );

      return { data: processedRows, schema: normalizedSchema };
    } catch (error) {
      logger.error({ err: error }, "BigQuery query failed");
      return { data: [], schema: [] };
    }
  }

  async function addDocument(data) {
    if (!data || typeof data !== "object") {
      throw new Error("data is required to add a document to BigQuery");
    }
    await insertRows(usageLogsTable, [data]);
    return { inserted: 1 };
  }

  return {
    client: bigQueryClient,
    projectId,
    datasetId,
    location,
    usageLogsTable,
    insertRows,
    addDocument,
    query,
  };
}
