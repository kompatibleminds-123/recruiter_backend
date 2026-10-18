const crypto = require("crypto");

function plainText(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function buildJobBooleanSource(job = {}) {
  return {
    title: plainText(job.title),
    mustHaveSkills: plainText(job.mustHaveSkills || job.must_have_skills),
    jobDescription: plainText(job.jobDescription || job.job_description)
  };
}

function buildJobBooleanFingerprint(job = {}) {
  const source = buildJobBooleanSource(job);
  const normalized = [source.title, source.mustHaveSkills, source.jobDescription]
    .map((value) => value.toLowerCase())
    .join("\n---\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function hasBalancedSyntax(query = "") {
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < query.length; index += 1) {
    const char = query[index];
    if (char === '"' && query[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0 && !quoted;
}

function normalizeBooleanOptions(options = []) {
  const seen = new Set();
  return (Array.isArray(options) ? options : [])
    .map((option, index) => {
      const query = String(option?.query || option?.boolean || option?.value || "")
        .replace(/```(?:text)?|```/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const key = query.toLowerCase();
      if (!query || query.length > 700 || !hasBalancedSyntax(query) || seen.has(key)) return null;
      seen.add(key);
      return {
        label: String(option?.label || `Option ${index + 1}`).trim().slice(0, 80),
        query,
        rationale: String(option?.rationale || "").trim().slice(0, 240)
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function getCachedJobBooleanState(job = {}, existingJob = null) {
  const sourceHash = buildJobBooleanFingerprint(job);
  const existingOptions = normalizeBooleanOptions(existingJob?.generatedBooleanOptions);
  const incomingOptions = normalizeBooleanOptions(job?.generatedBooleanOptions || job?.generated_boolean_options);
  const existingSourceHash = String(existingJob?.booleanSourceHash || existingJob?.boolean_source_hash || "").trim()
    || (existingOptions.length >= 3 && existingJob ? buildJobBooleanFingerprint(existingJob) : "");
  const incomingSourceHash = String(job?.booleanSourceHash || job?.boolean_source_hash || "").trim();
  if (existingSourceHash === sourceHash && existingOptions.length >= 3) {
    return { sourceHash, options: existingOptions, sourceJob: existingJob };
  }
  if (incomingSourceHash === sourceHash && incomingOptions.length >= 3) {
    return { sourceHash, options: incomingOptions, sourceJob: job };
  }
  return null;
}

function buildJobBooleanSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["options"],
    properties: {
      options: {
        type: "array",
        minItems: 3,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "query", "rationale"],
          properties: {
            label: { type: "string" },
            query: { type: "string" },
            rationale: { type: "string" }
          }
        }
      }
    }
  };
}

function buildJobBooleanPrompt(job = {}) {
  const source = buildJobBooleanSource(job);
  return [
    "You are a senior recruitment sourcer creating practical Boolean searches for LinkedIn, Naukri, and resume databases.",
    "Return 4 distinct, high-quality options. Do not return commentary outside the JSON schema.",
    "",
    "Quality rules:",
    "- Use only role titles, credible alternate titles, core skills, platforms, and domain terms supported by the JD.",
    "- Quote every multi-word term. Use uppercase AND/OR and balanced parentheses.",
    "- Keep each query useful and concise (normally 2-5 groups, maximum 700 characters).",
    "- Do not add generic buzzwords, soft skills, responsibilities, locations, salary, notice period, or guessed technologies.",
    "- Do not use NOT unless the JD explicitly requires excluding a clearly different role.",
    "- Avoid repeating equivalent terms merely to make a query longer.",
    "- The four options should be: Balanced, Strict must-have, Wider talent pool, and Alternate titles focused.",
    "- Each rationale must briefly explain when that option is useful.",
    "",
    `Job title: ${source.title || "Not provided"}`,
    `Must-have skills: ${source.mustHaveSkills || "Not separately provided"}`,
    `Job description: ${source.jobDescription || "Not provided"}`
  ].join("\n");
}

async function generateJobBooleanOptions({ job, apiKey, model, callOpenAiJsonSchema }) {
  if (typeof callOpenAiJsonSchema !== "function") throw new Error("OpenAI JSON generator is unavailable.");
  const source = buildJobBooleanSource(job);
  if (!source.title || !source.jobDescription) throw new Error("Job title and description are required for Boolean generation.");
  const result = await callOpenAiJsonSchema({
    apiKey,
    model: model || "gpt-4.1-mini",
    prompt: buildJobBooleanPrompt(job),
    schemaName: "job_boolean_options",
    schema: buildJobBooleanSchema()
  });
  const options = normalizeBooleanOptions(result?.options);
  if (options.length < 3) throw new Error("OpenAI returned fewer than 3 valid Boolean options.");
  return options;
}

module.exports = {
  buildJobBooleanFingerprint,
  buildJobBooleanPrompt,
  buildJobBooleanSchema,
  buildJobBooleanSource,
  generateJobBooleanOptions,
  getCachedJobBooleanState,
  normalizeBooleanOptions
};
