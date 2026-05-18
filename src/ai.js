function buildQuestionOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["fitSummary", "matchLevel", "topStrengths", "topRisks", "questions"],
    properties: {
      fitSummary: { type: "string" },
      matchLevel: {
        type: "string",
        enum: ["strong", "medium", "weak"]
      },
      topStrengths: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string" }
      },
      topRisks: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string" }
      },
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 2,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "question", "why", "whatToListenFor", "signal"],
          properties: {
            category: { type: "string" },
            question: { type: "string" },
            why: { type: "string" },
            whatToListenFor: { type: "string" },
            signal: {
              type: "string",
              enum: ["green", "yellow", "red"]
            }
          }
        }
      }
    }
  };
}

function getCurrentDateContext() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    formatted: now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    })
  };
}

function buildCandidateNormalizationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "email",
      "phone",
      "current_company",
      "current_designation",
      "work_experience",
      "education",
      "linkedin",
      "current_location",
      "current_role_is_active",
      "raw_current_role_hint",
      "current_role_as_written"
    ],
    properties: {
      name: { type: ["string", "null"] },
      email: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      linkedin: { type: ["string", "null"] },
      current_company: { type: ["string", "null"] },
      current_designation: { type: ["string", "null"] },
      current_location: { type: ["string", "null"] },
      current_role_is_active: { type: ["boolean", "null"] },
      raw_current_role_hint: { type: ["string", "null"] },
      current_role_as_written: { type: ["string", "null"] },
      work_experience: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["company", "designation", "location", "start_date", "end_date", "section_hint"],
          properties: {
            company: { type: ["string", "null"] },
            designation: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            start_date: { type: ["string", "null"] },
            end_date: { type: ["string", "null"] },
            section_hint: { type: ["string", "null"] }
          }
        }
      },
      education: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["degree", "institution", "year"],
          properties: {
            degree: { type: ["string", "null"] },
            institution: { type: ["string", "null"] },
            year: { type: ["string", "null"] }
          }
        }
      }
    }
  };
}

function parseStructuredOutput(data) {
  const outputText =
    data.output_text ||
    data.resultText ||
    data.output
      ?.flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text || "")
      .join("") ||
    "";

  if (!outputText && data.result && typeof data.result === "object") {
    return data.result;
  }

  if (!outputText) {
    throw new Error("The AI response came back empty.");
  }

  return JSON.parse(outputText);
}

function assertStrictSchemaCompatibility(schema, path = "root") {
  if (!schema || typeof schema !== "object") return;
  const rawType = schema.type;
  const typeList = Array.isArray(rawType) ? rawType : [rawType];
  const isObjectSchema = typeList.includes("object");

  if (isObjectSchema && schema.properties) {
    const propertyKeys = Object.keys(schema.properties || {});
    const required = Array.isArray(schema.required) ? schema.required : [];
    const missingRequired = propertyKeys.filter((key) => !required.includes(key));
    if (missingRequired.length) {
      throw new Error(`Strict schema mismatch at ${path}: required is missing keys: ${missingRequired.join(", ")}`);
    }
    if (schema.additionalProperties !== false) {
      throw new Error(`Strict schema mismatch at ${path}: additionalProperties must be false`);
    }
  }

  if (schema.properties && typeof schema.properties === "object") {
    Object.entries(schema.properties).forEach(([key, child]) => {
      assertStrictSchemaCompatibility(child, `${path}.properties.${key}`);
    });
  }
  if (schema.items) {
    assertStrictSchemaCompatibility(schema.items, `${path}.items`);
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((child, idx) => assertStrictSchemaCompatibility(child, `${path}.anyOf[${idx}]`));
  }
  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((child, idx) => assertStrictSchemaCompatibility(child, `${path}.oneOf[${idx}]`));
  }
}

async function callOpenAiJsonSchema({ apiKey, prompt, model, schemaName, schema }) {
  if (!apiKey) {
    throw new Error("Missing OpenAI API key for backend generation.");
  }
  assertStrictSchemaCompatibility(schema, schemaName || "json_schema");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4.1-mini",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return parseStructuredOutput(data);
}

async function uploadFileToOpenAi({ apiKey, uploadedFile }) {
  if (!apiKey) {
    throw new Error("Missing OpenAI API key for backend file parsing.");
  }
  if (!uploadedFile?.fileData) {
    throw new Error("Missing uploaded CV file for backend file parsing.");
  }

  const formData = new FormData();
  formData.append("purpose", "user_data");
  formData.append(
    "file",
    new Blob(
      [Buffer.from(String(uploadedFile.fileData || ""), "base64")],
      { type: uploadedFile.mimeType || "application/octet-stream" }
    ),
    uploadedFile.filename || "resume.pdf"
  );

  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI file upload failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function callOpenAiFileJsonSchema({ apiKey, prompt, model, schemaName, schema, uploadedFile }) {
  assertStrictSchemaCompatibility(schema, schemaName || "json_schema");
  const uploaded = await uploadFileToOpenAi({ apiKey, uploadedFile });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              file_id: uploaded.id
            },
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI file request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return parseStructuredOutput(data);
}

async function callOpenAiImageJsonSchema({ apiKey, prompt, model, schemaName, schema, image }) {
  if (!apiKey) {
    throw new Error("Missing OpenAI API key for backend image parsing.");
  }
  assertStrictSchemaCompatibility(schema, schemaName || "json_schema");
  if (!image?.fileData) {
    throw new Error("Missing image data for backend image parsing.");
  }
  const mimeType = String(image.mimeType || "image/png").trim() || "image/png";
  const base64 = String(image.fileData || "").trim().replace(/^data:[^;]+;base64,/i, "");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: dataUrl },
            { type: "input_text", text: prompt }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI image request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return parseStructuredOutput(data);
}

async function callOpenAiQuestions({ apiKey, prompt, model }) {
  return callOpenAiJsonSchema({
    apiKey,
    prompt,
    model,
    schemaName: "recruiter_question_output",
    schema: buildQuestionOutputSchema()
  });
}

function buildCandidateNormalizationPrompt({ rawText, sourceType, filename, fallbackFields }) {
  const currentDate = getCurrentDateContext();
  return [
    "You are a deterministic resume parsing engine for recruiter workflows.",
    "Your task is to extract commercially reliable candidate JSON from resume content.",
    "Accuracy priority: currentCompany, currentDesignation, complete employment timeline.",
    "",
    "STRICT EXTRACTION BOUNDARIES",
    "1. Extract companies ONLY from employment/work experience sections.",
    "2. Never extract company from addresses, dates, emails, phone lines, responsibilities, project descriptions, taglines, product descriptions, or education lines.",
    "3. If uncertain about company or designation, return null instead of guessing.",
    "4. current_company must come from the latest role by chronology or a Present/Current/Till Date role.",
    "5. current_designation must belong to the same experience item as current_company.",
    "",
    "EXPERIENCE RULES",
    "1. Build work_experience as a complete job timeline before finalizing current role.",
    "2. Each experience item should include company and date range when available.",
    "3. Keep full designation text; do not truncate meaningful suffixes.",
    "4. Ignore project bullets, responsibility bullets, and organization taglines as job headers.",
    "5. Preserve separate jobs; do not merge unrelated roles.",
    "",
    "EDUCATION RULES",
    "1. Extract education ONLY from sections titled Education, Academic Qualification, Qualifications, or Academics.",
    "2. Do not infer education from summary/objective/projects/responsibilities.",
    "",
    "STRICT RULES:",
    "1. Extract information exactly as written in the resume.",
    "2. Do NOT calculate total experience.",
    "3. Do NOT estimate durations.",
    "4. Do NOT merge jobs together.",
    "5. Extract EVERY job separately in the work_experience array.",
    "6. If a job says 'Present', 'Till date', or 'Currently working', set end_date = 'Present'.",
    "7. Normalize all dates to YYYY-MM format if possible.",
    "8. If a date cannot be normalized, return it exactly as written.",
    "9. Do NOT invent or guess any missing information.",
    "10. If any field is not available return null.",
    "11. Return ONLY valid JSON.",
    "12. Do NOT include explanations, comments, or markdown.",
    "13. Preserve company names, titles, and locations exactly as they appear.",
    "14. Separate designation and location if both appear in the same line.",
    "15. Extract all education entries from education sections only.",
    "16. Extract phone numbers and email addresses if present.",
    "",
    "Return JSON strictly in the following schema:",
    "{",
    '  "name": string | null,',
    '  "email": string | null,',
    '  "phone": string | null,',
    '  "linkedin": string | null,',
    '  "current_company": string | null,',
    '  "current_designation": string | null,',
    '  "current_location": string | null,',
    '  "current_role_is_active": boolean | null,',
    '  "raw_current_role_hint": string | null,',
    '  "current_role_as_written": string | null,',
    '  "work_experience": [{"company": string | null, "designation": string | null, "location": string | null, "start_date": string | null, "end_date": string | null, "section_hint": string | null}],',
    '  "education": [{"degree": string | null, "institution": string | null, "year": string | null}]',
    "}",
    "",
    "Important parsing guidelines:",
    "- 'Working with' usually indicates current employment.",
    "- 'Worked with' indicates past employment.",
    "- If both designation and location appear in the same line, split them logically.",
    "- Ignore job responsibilities, bullet points, achievements, project descriptions, and tagline text when extracting company.",
    "- Only extract structured career entries.",
    "- Maintain the chronological order as found in the resume.",
    `- Assume today is ${currentDate.formatted} only for understanding whether a role marked Present is current. Do not use today to invent dates.`,
    "- Education, internship, volunteering, student roles, trainee roles, articleship, campus roles, fellowships, and non-career activities must not be included in work_experience.",
    "- For current_company/current_designation, use the latest actual career role from work_experience.",
    "",
    "SOURCE TYPE:",
    sourceType || "",
    "",
    "FILENAME:",
    filename || "",
    "",
    "FALLBACK EXTRACTED FIELDS:",
    JSON.stringify(fallbackFields || {}, null, 2),
    "",
    "RAW CANDIDATE TEXT:",
    String(rawText || "").slice(0, 32000)
  ].join("\n");
}

function convertAiResumeJsonToInternalShape(result, fallbackFields = {}) {
  const experiences = Array.isArray(result?.work_experience) ? result.work_experience : [];
  const timeline = experiences
    .map((item) => ({
      company: item?.company == null ? "" : String(item.company).trim(),
      designation: item?.designation == null ? "" : String(item.designation).trim(),
      start: item?.start_date == null ? "" : String(item.start_date).trim(),
      end: item?.end_date == null ? "" : String(item.end_date).trim(),
      duration: ""
    }))
    .filter((item) => item.company || item.designation || item.start || item.end);
  const education = Array.isArray(result?.education) ? result.education : [];
  const topEducation = education.find((item) =>
    [item?.degree, item?.institution, item?.year].some((value) => String(value || "").trim())
  ) || null;
  const highestEducation = topEducation
    ? (topEducation.degree == null ? "" : String(topEducation.degree).trim())
    : "";

  return {
    candidateName: result?.name == null ? String(fallbackFields?.candidateName || "").trim() : String(result.name).trim(),
    totalExperience: "",
    currentOrgTenure: "",
    currentCompany: result?.current_company == null ? "" : String(result.current_company).trim(),
    currentDesignation: result?.current_designation == null ? "" : String(result.current_designation).trim(),
    emailId: result?.email == null ? "" : String(result.email).trim(),
    phoneNumber: result?.phone == null ? "" : String(result.phone).trim(),
    linkedinUrl: result?.linkedin == null ? "" : String(result.linkedin).trim(),
    highestEducation,
    education: education.map((item) => ({
      degree: item?.degree == null ? "" : String(item.degree).trim(),
      institution: item?.institution == null ? "" : String(item.institution).trim(),
      year: item?.year == null ? "" : String(item.year).trim()
    })),
    timeline,
    gaps: []
  };
}

async function normalizeCandidateWithAi({ apiKey, model, rawText, sourceType, filename, fallbackFields }) {
  const prompt = buildCandidateNormalizationPrompt({
    rawText,
    sourceType,
    filename,
    fallbackFields
  });

  const result = await callOpenAiJsonSchema({
    apiKey,
    prompt,
    model,
    schemaName: "candidate_normalization_output",
    schema: buildCandidateNormalizationSchema()
  });
  return convertAiResumeJsonToInternalShape(result, fallbackFields);
}

async function normalizeCandidateFileWithAi({ apiKey, model, uploadedFile, sourceType, filename, fallbackFields }) {
  const prompt = buildCandidateNormalizationPrompt({
    rawText:
      "Use the uploaded CV file as the primary source of truth. Use the fallback fields only if something is unclear in the file.",
    sourceType,
    filename,
    fallbackFields
  });

  const result = await callOpenAiFileJsonSchema({
    apiKey,
    prompt,
    model,
    uploadedFile,
    schemaName: "candidate_normalization_output",
    schema: buildCandidateNormalizationSchema()
  });
  return convertAiResumeJsonToInternalShape(result, fallbackFields);
}

function buildLinkedInAssistSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "company", "role", "location", "linkedin", "email", "phone", "currentCtc", "expectedCtc", "noticePeriod", "highestEducation", "totalExperience"],
    properties: {
      name: { type: ["string", "null"] },
      company: { type: ["string", "null"] },
      role: { type: ["string", "null"] },
      location: { type: ["string", "null"] },
      linkedin: { type: ["string", "null"] },
      email: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      currentCtc: { type: ["string", "null"] },
      expectedCtc: { type: ["string", "null"] },
      noticePeriod: { type: ["string", "null"] },
      highestEducation: { type: ["string", "null"] },
      totalExperience: { type: ["string", "null"] }
    }
  };
}

function buildLinkedInAssistPrompt() {
  return [
    "You are extracting candidate identity hints from a screenshot of a candidate card.",
    "Return only JSON in the provided schema.",
    "",
    "Rules:",
    "- If linkedin profile URL is visible anywhere, return it in linkedin.",
    "- Otherwise set linkedin = null.",
    "- Extract name, current company, role/designation, location, email, phone, CTC, expected CTC, notice period, highest qualification, and total experience when visible.",
    "- CTC can be shown as one line like `11.5 lacs (expects 16 lacs)`; split into currentCtc and expectedCtc when possible.",
    "- totalExperience can be forms like `11y` or `7 years 5 months`.",
    "- Do not guess missing fields; return null when not present.",
    "",
    "Output schema:",
    JSON.stringify(buildLinkedInAssistSchema(), null, 2)
  ].join("\n");
}

async function extractLinkedInAssistFromScreenshotWithAi({ apiKey, model, uploadedFile }) {
  const prompt = buildLinkedInAssistPrompt();

  // Screenshots are images (png/jpg). Use vision input_image instead of file uploads,
  // because OpenAI file-based "input_file" supports only a subset of formats (not png).
  return callOpenAiImageJsonSchema({
    apiKey,
    prompt,
    model: model || "gpt-4o-mini",
    image: uploadedFile,
    schemaName: "linkedin_assist_from_screenshot",
    schema: buildLinkedInAssistSchema()
  });
}

module.exports = {
  callOpenAiJsonSchema,
  callOpenAiImageJsonSchema,
  callOpenAiQuestions,
  normalizeCandidateWithAi,
  normalizeCandidateFileWithAi,
  extractLinkedInAssistFromScreenshotWithAi
};
