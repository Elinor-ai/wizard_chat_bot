import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY missing from environment");
    process.exit(1);
  }

  try {
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const models = response.data?.models ?? [];
    console.log(`Fetched ${models.length} models:`);
    const videoLike = [];
    for (const model of models) {
      const name = model?.name ?? "(unknown)";
      const methods = model?.supportedGenerationMethods ?? [];
      console.log(`- ${name} => ${methods.join(", ")}`);
      const lowerName = name.toLowerCase();
      const debugText = `${lowerName} ${methods.join(" ").toLowerCase()}`;
      if (
        debugText.includes("video") ||
        debugText.includes("veo") ||
        debugText.includes("predict")
      ) {
        videoLike.push(name);
      }
    }

    if (videoLike.length > 0) {
      console.log("\nPotential video-capable models:");
      videoLike.forEach((modelName) => console.log(`* ${modelName}`));
    } else {
      console.log("\nNo obvious video models detected in this response.");
    }
  } catch (error) {
    console.error("Failed to fetch model list:", error?.response?.data ?? error);
    process.exit(1);
  }
}

main();
