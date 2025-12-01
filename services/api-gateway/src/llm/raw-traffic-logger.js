import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestContext } from "./request-context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../../..");
const LOG_DIR = path.join(ROOT_DIR, "logs");
const LOG_FILE = path.join(LOG_DIR, "llm_traffic_audit.jsonl");
const IMAGE_DATA_PLACEHOLDER = "<BASE64_IMAGE_DATA_OMITTED>";
const BASE64_LENGTH_THRESHOLD = 1024;
const BASE64_REGEX = /^[A-Za-z0-9+/=_-]+$/;
const IMAGE_BASE64_KEYS = new Set([
  "bytesBase64Encoded",
  "b64_json",
  "imageBase64",
  "base64",
  "base64Image",
  "base64_image",
  "dataUri",
  "dataURL",
  "data_url",
]);

async function ensureLogDir() {
  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
  } catch {
    // swallow
  }
}

function sanitizePayload(payload, { redactImages = false } = {}) {
  if (!redactImages) {
    return payload;
  }

  const seen = new WeakSet();

  const visit = (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      const compact = value.replace(/\s+/g, "");
      if (
        compact.length >= BASE64_LENGTH_THRESHOLD &&
        BASE64_REGEX.test(compact)
      ) {
        return IMAGE_DATA_PLACEHOLDER;
      }
      return value;
    }

    if (typeof value !== "object") return value;

    if (seen.has(value)) {
      return null;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => visit(item));
    }

    const clone = {};
    for (const [key, val] of Object.entries(value)) {
      if (
        key === "inlineData" &&
        val &&
        typeof val === "object" &&
        typeof val.data === "string"
      ) {
        const { data, ...rest } = val;
        clone[key] = {
          ...rest,
          ...(data ? { data: IMAGE_DATA_PLACEHOLDER } : {}),
        };
        continue;
      }

      if (IMAGE_BASE64_KEYS.has(key) && typeof val === "string") {
        clone[key] = IMAGE_DATA_PLACEHOLDER;
        continue;
      }

      clone[key] = visit(val);
    }

    return clone;
  };

  return visit(payload);
}

export async function logRawTraffic({
  taskId = "unknown",
  direction,
  payload,
  endpoint,
  providerEndpoint,
}) {
  try {
    await ensureLogDir();
    const shouldRedactImages =
      typeof taskId === "string" && taskId.toLowerCase().includes("image");
    const safePayload = sanitizePayload(payload, {
      redactImages: shouldRedactImages,
    });
    const routePath = endpoint ?? getRequestContext()?.route ?? null;
    const entry = {
      timestamp: new Date().toISOString(),
      taskId,
      direction,
      ...(routePath ? { endpoint: routePath } : {}),
      ...(providerEndpoint ? { providerEndpoint } : {}),
      payload: safePayload
    };
    const line = `${JSON.stringify(entry)}\n`;
    await fs.promises.appendFile(LOG_FILE, line, "utf8");
  } catch {
    // avoid breaking the main flow if logging fails
  }
}
