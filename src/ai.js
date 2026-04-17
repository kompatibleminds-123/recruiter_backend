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
          required: ["company", "designation", "location", "start_date", "end_date"],
          properties: {
            company: { type: ["string", "null"] },
            designation: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            start_date: { type: ["string", "null"] },
            end_date: { type: ["string", "null"] }
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

async function callOpenAiJsonSchema({ apiKey, prompt, model, schemaName, schema }) {
  if (!apiKey) {
    throw new Error("Missing OpenAI API key for backend generation.");
  }

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
    "You are a deterministic resume parsing engine.",
    "Your task is to read resume text and extract structured information in JSON format.",
    "",
    "SANITIZATION RULES",
    "1. If a company line contains '-', treat text before '-' as the company name when that line mixes company with extra text.",
    "2. If a company line contains '|', treat text before '|' as the company name when that line mixes company with extra text.",
    "3. Normalize date ranges to 'Month YYYY - Month YYYY' only when they can be normalized confidently. Otherwise return the date exactly as written.",
    "",
    "PARSING RULES",
    "1. Scan the entire resume first.",
    "2. Detect all employment date ranges.",
    "3. Associate each detected date range with the nearest company and role appearing above it.",
    "4. Build the complete work experience list before producing output.",
    "5. The latest start date, or a role ending in 'Present', determines the most recent job.",
    "",
    "Before extracting any information, scan the entire resume and identify all employment date ranges.",
    "A date range is any text pattern representing employment duration, such as Month YYYY - Month YYYY, Month YYYY - Present, or YYYY - YYYY.",
    "For every detected date range, associate it with the nearest company name and job title appearing above it.",
    "Create a complete list of all work experience entries before producing the final output.",
    "Determine the most recent job only after the full list of experiences is identified.",
    "Ignore summary statements like 'X years of experience' when determining employment chronology.",
    "Do not stop parsing after detecting a few roles; ensure the full employment timeline is captured.",
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
    "15. Extract all education entries.",
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
    '  "work_experience": [{"company": string | null, "designation": string | null, "location": string | null, "start_date": string | null, "end_date": string | null}],',
    '  "education": [{"degree": string | null, "institution": string | null, "year": string | null}]',
    "}",
    "",
    "Important parsing guidelines:",
    "- 'Working with' usually indicates current employment.",
    "- 'Worked with' indicates past employment.",
    "- If both designation and location appear in the same line, split them logically.",
    "- Ignore job responsibilities, bullet points, achievements, and descriptions.",
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
    required: ["name", "company", "role", "location", "linkedin"],
    properties: {
      name: { type: ["string", "null"] },
      company: { type: ["string", "null"] },
      role: { type: ["string", "null"] },
      location: { type: ["string", "null"] },
      linkedin: { type: ["string", "null"] }
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
    "- Extract name, current company, role/designation, and location as visible on the card.",
    "- Do not guess missing fields; return null when not present.",
    "",
    "Output schema:",
    JSON.stringify(buildLinkedInAssistSchema(), null, 2)
  ].join("\n");
}

async function extractLinkedInAssistFromScreenshotWithAi({ apiKey, model, uploadedFile }) {
  const prompt = buildLinkedInAssistPrompt();
  return callOpenAiFileJsonSchema({
    apiKey,
    prompt,
    model: model || "gpt-4o-mini",
    uploadedFile,
    schemaName: "linkedin_assist_from_screenshot",
    schema: buildLinkedInAssistSchema()
  });
}

module.exports = {
  callOpenAiJsonSchema,
  callOpenAiQuestions,
  normalizeCandidateWithAi,
  normalizeCandidateFileWithAi,
  extractLinkedInAssistFromScreenshotWithAi
};
