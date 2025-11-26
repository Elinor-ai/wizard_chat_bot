import dotenv from "dotenv";
import pino from "pino";
import pretty from "pino-pretty";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

let pinoElastic = null;

try {
  const module = await import("pino-elasticsearch");
  pinoElastic = module.default ?? module;
} catch (error) {
  if (!/Cannot find/.test(error.message)) {
    // eslint-disable-next-line no-console
    console.warn("Failed to load pino-elasticsearch", error);
  }
}

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("4000"),
  FIRESTORE_PROJECT_ID: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export function loadEnv(options = {}) {
  if (!process.env._WIZARD_ENV_LOADED) {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const defaultPath = resolve(moduleDir, "../../../.env");
    const path = options.path ?? process.env.WIZARD_ENV_PATH ?? defaultPath;
    dotenv.config({ ...options, path });
    process.env._WIZARD_ENV_LOADED = "true";
    if (!process.env._WIZARD_ENV_PATH) {
      process.env._WIZARD_ENV_PATH = path;
    }
    if (!process.env.WIZARD_ROOT_DIR) {
      process.env.WIZARD_ROOT_DIR = dirname(path);
    }
  }
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export function createLogger(name = "app", opts = {}) {
  const level = opts.level ?? "info";
  const streams = [];

  if (process.env.NODE_ENV !== "production") {
    streams.push({ stream: pretty({ colorize: true }), level });
  }

  if (process.env.ELASTICSEARCH_URL && pinoElastic) {
    try {
      const elasticStream = pinoElastic({
        node: process.env.ELASTICSEARCH_URL,
        index: process.env.ELASTICSEARCH_INDEX ?? "wizard-logs",
        auth:
          process.env.ELASTICSEARCH_USERNAME &&
          process.env.ELASTICSEARCH_PASSWORD
            ? {
                username: process.env.ELASTICSEARCH_USERNAME,
                password: process.env.ELASTICSEARCH_PASSWORD,
              }
            : undefined,
        tls:
          process.env.ELASTICSEARCH_TLS?.toLowerCase() === "false"
            ? { rejectUnauthorized: false }
            : undefined,
      });
      streams.push({ stream: elasticStream, level });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to initialise Elasticsearch logging", error);
    }
  } else if (process.env.ELASTICSEARCH_URL && !pinoElastic) {
    // eslint-disable-next-line no-console
    console.warn(
      "ELASTICSEARCH_URL provided but pino-elasticsearch is not installed; skipping Elasticsearch logging stream."
    );
  }

  if (streams.length === 0) {
    return pino({ name, level });
  }

  return pino({ name, level }, pino.multistream(streams));
}

export function wrapAsync(handler) {
  return async function wrapped(req, res, next) {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

export function notFound(req, res, next) {
  const error = httpError(404, `Resource not found: ${req.method} ${req.url}`);
  next(error);
}

export function errorHandler(logger) {
  return (error, req, res, _next) => {
    const status = error.status ?? 500;
    if (status >= 500) {
      logger.error({ error, path: req.path }, "Unhandled error");
    }
    res.status(status).json({
      error: {
        message: error.message,
        details: error.details ?? null,
      },
    });
  };
}
