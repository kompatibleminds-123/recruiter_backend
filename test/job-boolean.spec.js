const assert = require("node:assert/strict");
const {
  buildJobBooleanFingerprint,
  buildJobBooleanPrompt,
  buildJobBooleanSchema,
  generateJobBooleanOptions,
  getCachedJobBooleanState,
  normalizeBooleanOptions
} = require("../src/job-boolean");

async function run() {
  const job = {
    title: "Senior Analytics Consultant (Fabric and AI)",
    mustHaveSkills: "Microsoft Fabric, Power BI, SQL",
    jobDescription: "<p>Build analytics solutions using Microsoft Fabric and Power BI.</p>"
  };

  assert.equal(
    buildJobBooleanFingerprint(job),
    buildJobBooleanFingerprint({ ...job, jobDescription: " Build analytics solutions using Microsoft Fabric and Power BI. " }),
    "HTML and whitespace-only differences should reuse the cached generation"
  );
  assert.notEqual(
    buildJobBooleanFingerprint(job),
    buildJobBooleanFingerprint({ ...job, mustHaveSkills: `${job.mustHaveSkills}, Azure` }),
    "meaningful sourcing input changes must invalidate the cache"
  );

  const normalized = normalizeBooleanOptions([
    { label: "Balanced", query: '("Analytics Consultant" OR "BI Consultant") AND ("Microsoft Fabric" OR "Power BI")', rationale: "Balanced role and platform coverage." },
    { label: "Duplicate", query: '("Analytics Consultant" OR "BI Consultant") AND ("Microsoft Fabric" OR "Power BI")', rationale: "Duplicate." },
    { label: "Broken", query: '("Fabric" OR "Power BI"', rationale: "Invalid parentheses." },
    { label: "Strict", query: '("Analytics Consultant") AND ("Microsoft Fabric") AND ("Power BI")', rationale: "Strict must-have option." },
    { label: "Wider", query: '("Data Consultant" OR "Analytics Engineer") AND (Fabric OR "Power BI")', rationale: "Wider pool." }
  ]);
  assert.equal(normalized.length, 3);
  assert.deepEqual(normalized.map((item) => item.label), ["Balanced", "Strict", "Wider"]);

  const cachedJob = {
    ...job,
    generatedBooleanOptions: normalized,
    booleanSourceHash: buildJobBooleanFingerprint(job),
    booleanGeneratedAt: "2026-10-18T10:00:00.000Z"
  };
  assert.equal(getCachedJobBooleanState(job, cachedJob)?.options.length, 3);
  assert.equal(
    getCachedJobBooleanState({ ...job, title: "Principal Analytics Consultant" }, cachedJob),
    null,
    "changed sourcing content must not reuse old options"
  );

  const schema = buildJobBooleanSchema();
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.options.minItems, 3);
  assert.equal(schema.properties.options.maxItems, 4);
  assert.match(buildJobBooleanPrompt(job), /Do not add generic buzzwords/i);

  let calls = 0;
  const generated = await generateJobBooleanOptions({
    job,
    apiKey: "test-key",
    model: "test-model",
    callOpenAiJsonSchema: async (request) => {
      calls += 1;
      assert.equal(request.schemaName, "job_boolean_options");
      assert.equal(request.model, "test-model");
      return {
        options: [
          { label: "Balanced", query: '("Analytics Consultant" OR "BI Consultant") AND ("Microsoft Fabric" OR "Power BI")', rationale: "Balanced." },
          { label: "Strict must-have", query: '("Analytics Consultant") AND ("Microsoft Fabric") AND ("Power BI") AND (SQL)', rationale: "Strict." },
          { label: "Wider talent pool", query: '("Data Consultant" OR "Analytics Engineer" OR "BI Developer") AND (Fabric OR "Power BI")', rationale: "Wider." },
          { label: "Alternate titles", query: '("Analytics Consultant" OR "Data Consultant" OR "Business Intelligence Consultant") AND ("Microsoft Fabric")', rationale: "Title focused." }
        ]
      };
    }
  });
  assert.equal(calls, 1);
  assert.equal(generated.length, 4);
}

module.exports = { run };
if (require.main === module) run().then(() => console.log("ok job-boolean"));
