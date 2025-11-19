import axios from "axios";
import { GoogleAuth } from "google-auth-library";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID ?? "botson-playground";
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";

  if (!projectId) {
    console.error("GOOGLE_CLOUD_PROJECT_ID is required");
    process.exit(1);
  }

  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    if (!accessToken?.token) {
      throw new Error("Failed to obtain access token");
    }

    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models`;
    const response = await axios.get(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
      },
    });

    const models = response.data?.models ?? [];
    if (models.length === 0) {
      console.log("No models returned.");
      return;
    }

    console.log(`Found ${models.length} publisher models in ${location}:`);
    const highlight = [];
    for (const model of models) {
      const name = model?.name ?? "(unknown)";
      const displayName = model?.displayName ?? "(no display name)";
      console.log(`- ${name} :: ${displayName}`);
      const lower = (name ?? "").toLowerCase();
      if (
        lower.includes("video") ||
        lower.includes("veo") ||
        lower.includes("imagen")
      ) {
        highlight.push(name);
      }
    }

    if (highlight.length > 0) {
      console.log("\nHighlighted models (video/veo/imagen):");
      highlight.forEach((modelName) => console.log(`* ${modelName}`));
    }
  } catch (error) {
    console.error(
      "Failed to list Vertex models:",
      error?.response?.data ?? error
    );
    process.exit(1);
  }
}

main();
