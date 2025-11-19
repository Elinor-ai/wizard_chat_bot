import fs from "node:fs";
import path from "node:path";

async function loadBigQuery() {
  try {
    const mod = await import("@google-cloud/bigquery");
    return mod.BigQuery;
  } catch (error) {
    throw new Error(
      "Unable to load @google-cloud/bigquery. Install it with `npm install @google-cloud/bigquery`."
    );
  }
}

function resolveKeyFilename(rawPath) {
  if (!rawPath) {
    return undefined;
  }
  const resolved = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`BigQuery key file not found at ${resolved}`);
  }
  return resolved;
}

export async function createBigQueryAdapter(options = {}) {
  const BigQuery = await loadBigQuery();
  const {
    projectId = process.env.BIGQUERY_PROJECT_ID,
    datasetId = process.env.BIGQUERY_DATASET,
    tableId = process.env.BIGQUERY_TABLE,
    location = process.env.BIGQUERY_LOCATION ?? "US",
    keyFilename = resolveKeyFilename(
      options.keyFilename ?? process.env.BIGQUERY_KEYFILE ?? process.env.GOOGLE_APPLICATION_CREDENTIALS
    )
  } = options;

  if (!projectId) {
    throw new Error("BIGQUERY_PROJECT_ID (or projectId option) is required to initialize BigQuery");
  }

  const client = new BigQuery({
    projectId,
    location,
    ...(keyFilename ? { keyFilename } : {})
  });

  const resolveDatasetId = (id) => id ?? datasetId;
  const resolveTableId = (id) => id ?? tableId;

  async function ensureDataset(id = datasetId) {
    if (!id) {
      throw new Error("Dataset id is required to ensure a BigQuery dataset exists");
    }
    const dataset = client.dataset(id);
    const [exists] = await dataset.exists();
    if (!exists) {
      await dataset.create({ location });
    }
    return dataset;
  }

  async function ensureTable(schema, { dataset = datasetId, table = tableId } = {}) {
    if (!dataset || !table) {
      throw new Error("Dataset and table ids are required to ensure a BigQuery table exists");
    }
    const datasetRef = await ensureDataset(dataset);
    const tableRef = datasetRef.table(table);
    const [exists] = await tableRef.exists();
    if (!exists) {
      await tableRef.create({ schema });
    }
    return tableRef;
  }

  async function insertRows(rows, overrides = {}) {
    const targetDataset = resolveDatasetId(overrides.datasetId);
    const targetTable = resolveTableId(overrides.tableId);
    if (!targetDataset || !targetTable) {
      throw new Error("Dataset id and table id are required before inserting rows into BigQuery");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return { inserted: 0 };
    }
    const datasetRef = client.dataset(targetDataset);
    const tableRef = datasetRef.table(targetTable);
    await tableRef.insert(rows);
    return { inserted: rows.length };
  }

  return {
    client,
    projectId,
    datasetId,
    tableId,
    location,
    ensureDataset,
    ensureTable,
    insertRows
  };
}
