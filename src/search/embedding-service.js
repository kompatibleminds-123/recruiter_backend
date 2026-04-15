const crypto = require("crypto");

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

function hashText(value) {
  const raw = String(value || "");
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

async function createEmbedding({ apiKey, text, model }) {
  const input = String(text || "").trim();
  if (!apiKey) throw new Error("Missing OpenAI API key.");
  if (!input) return [];

  const selectedModel = String(model || process.env.OPENAI_EMBEDDINGS_MODEL || "text-embedding-3-small").trim();
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model: selectedModel, input })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embeddings request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const vector = json?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) return [];
  return vector.map((n) => Number(n));
}

module.exports = {
  cosineSimilarity,
  createEmbedding,
  hashText
};

