import "dotenv/config";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("OPENAI_API_KEY is not set. Add it to your environment before running this script.");
  process.exit(1);
}

const client = new OpenAI({ apiKey });

async function main() {
  console.log("Creating sample embeddings with OpenAI…");

  const response = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: [
      "Modern L-shaped sofa with washable covers.",
      "Diamond-encrusted luxury watch named Aurora Royale.",
    ],
  });

  response.data.forEach((item, index) => {
    console.log(`Embedding ${index}:`, item.embedding.length, "dimensions");
  });
}

main().catch((error) => {
  console.error("Embedding request failed:", error);
  process.exit(1);
});
