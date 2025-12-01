import fs from "node:fs";
import { resolve } from "node:path";
import admin from "firebase-admin";
import { z } from "zod";
import { loadEnv, createLogger } from "@wizard/utils";

const COMPANY_COLLECTION = "companies";
const COMPANY_JOBS_COLLECTION = "companyJobs";
const DISCOVERED_JOBS_COLLECTION = "discoveredJobs";
const LLM_USAGE_COLLECTION = "LLMsUsage";

const firestoreConfigSchema = z.object({
  projectId: z.string().min(1, "Firestore projectId required"),
  serviceAccountPath: z.string().optional(),
  emulatorHost: z.string().optional(),
});

let firestoreSingleton;

function initializeFirebase(
  { projectId, serviceAccountPath, emulatorHost },
  logger
) {
  if (firestoreSingleton) {
    return firestoreSingleton;
  }

  if (admin.apps.length === 0) {
    const hasServiceAccount =
      serviceAccountPath && fs.existsSync(serviceAccountPath);

    if (hasServiceAccount) {
      const serviceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, "utf8")
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
      });
    } else if (
      process.env.GOOGLE_APPLICATION_CREDENTIALS &&
      fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    ) {
      const serviceAccount = JSON.parse(
        fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
      });
    } else if (emulatorHost) {
      admin.initializeApp({ projectId });
      process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
      logger.info({ emulatorHost }, "Firestore emulator configured");
    } else {
      throw new Error(
        "Firestore adapter requires GOOGLE_APPLICATION_CREDENTIALS or FIRESTORE_EMULATOR_HOST to be set."
      );
    }
  }

  firestoreSingleton = admin.firestore();
  firestoreSingleton.settings({ ignoreUndefinedProperties: true });
  return firestoreSingleton;
}

export function createFirestoreAdapter(options = {}) {
  const env = loadEnv();
  const logger = createLogger("firestore-adapter");
  logger.info(
    { envProject: env.FIRESTORE_PROJECT_ID },
    "Loaded Firestore env config"
  );
  const rootDir = process.env.WIZARD_ROOT_DIR ?? process.cwd();
  const serviceAccountPathRaw =
    options.serviceAccountPath ?? env.GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccountPath = serviceAccountPathRaw
    ? resolve(rootDir, serviceAccountPathRaw)
    : undefined;

  const parsed = firestoreConfigSchema.parse({
    projectId: options.projectId ?? env.FIRESTORE_PROJECT_ID,
    serviceAccountPath,
    emulatorHost: options.emulatorHost ?? process.env.FIRESTORE_EMULATOR_HOST,
  });

  const db = initializeFirebase(parsed, logger);

  const normalize = (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value.toDate === "function") {
      return value.toDate();
    }
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => [key, normalize(val)])
      );
    }
    return value;
  };

  return {
    async saveDocument(collection, id, data) {
      const docRef = db.collection(collection).doc(id);
      await docRef.set(data, { merge: true });
      logger.info({ collection, id }, "Document saved to Firestore");
      const snapshot = await docRef.get();
      return { id, ...normalize(snapshot.data()) };
    },
    async getDocument(collection, id) {
      const docRef = db.collection(collection).doc(id);
      const snapshot = await docRef.get();
      if (!snapshot.exists) {
        return null;
      }
      return { id: snapshot.id, ...normalize(snapshot.data()) };
    },
    async queryDocuments(collection, field, operator, value) {
      const querySnap = await db
        .collection(collection)
        .where(field, operator, value)
        .get();
      return querySnap.docs.map((doc) => ({
        id: doc.id,
        ...normalize(doc.data()),
      }));
    },
    async addDocument(collection, data) {
      const docRef = await db.collection(collection).add(data);
      const snapshot = await docRef.get();
      logger.info({ collection, id: docRef.id }, "Document added to Firestore");
      return { id: snapshot.id, ...normalize(snapshot.data()) };
    },
    async createSnapshot(collection, id, payload) {
      const docRef = db.collection(collection).doc(id);
      await docRef.collection("versions").add(payload);
      logger.info({ collection, id }, "Snapshot created");
      return normalize(payload);
    },
    async listCollection(collection, filters = []) {
      let query = db.collection(collection);
      filters.forEach((filter) => {
        query = query.where(filter.field, filter.operator, filter.value);
      });
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...normalize(doc.data()),
      }));
    },
    async getCompanyByDomain(domain) {
      if (!domain) return null;
      const normalizedDomain = String(domain).trim().toLowerCase();
      if (!normalizedDomain) {
        return null;
      }
      const docs = await this.queryDocuments(
        COMPANY_COLLECTION,
        "primaryDomain",
        "==",
        normalizedDomain
      );
      return docs[0] ?? null;
    },
    async saveCompanyDocument(id, data) {
      if (!id) {
        throw new Error("Company id is required");
      }
      return this.saveDocument(COMPANY_COLLECTION, id, data);
    },
    async listCompanyJobs(companyId) {
      if (!companyId) {
        return [];
      }
      return this.queryDocuments(
        COMPANY_JOBS_COLLECTION,
        "companyId",
        "==",
        companyId
      );
    },
    async saveCompanyJob(id, data) {
      if (!id) {
        throw new Error("Company job id is required");
      }
      return this.saveDocument(COMPANY_JOBS_COLLECTION, id, data);
    },
    async listDiscoveredJobs(companyId) {
      if (!companyId) {
        return [];
      }
      return this.queryDocuments(
        DISCOVERED_JOBS_COLLECTION,
        "companyId",
        "==",
        companyId
      );
    },
    async saveDiscoveredJob(id, data) {
      if (!id) {
        throw new Error("Discovered job id is required");
      }
      return this.saveDocument(DISCOVERED_JOBS_COLLECTION, id, data);
    },
    async recordLlmUsage(entry) {
      if (!entry) {
        return null;
      }
      const payload = {
        ...entry,
        timestamp: entry.timestamp ?? new Date(),
      };
      return this.addDocument(LLM_USAGE_COLLECTION, payload);
    },
    subscribeDocument(collection, id, onChange, onError) {
      if (!collection || !id || typeof onChange !== "function") {
        return () => {};
      }
      const docRef = db.collection(collection).doc(id);
      const unsubscribe = docRef.onSnapshot(
        (snapshot) => {
          if (!snapshot.exists) {
            onChange(null);
            return;
          }
          onChange({ id: snapshot.id, ...normalize(snapshot.data()) });
        },
        (err) => {
          logger.warn({ collection, id, err }, "Firestore document subscription error");
          onError?.(err);
        }
      );
      return unsubscribe;
    },
    subscribeCollection(collection, filters = [], onChange, onError) {
      if (!collection || typeof onChange !== "function") {
        return () => {};
      }
      let query = db.collection(collection);
      filters.forEach((filter) => {
        query = query.where(filter.field, filter.operator, filter.value);
      });
      const unsubscribe = query.onSnapshot(
        (snapshot) => {
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...normalize(doc.data()),
          }));
          onChange(docs);
        },
        (err) => {
          logger.warn({ collection, filters, err }, "Firestore collection subscription error");
          onError?.(err);
        }
      );
      return unsubscribe;
    },
  };
}
