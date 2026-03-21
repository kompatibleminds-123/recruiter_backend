const fs = require("fs");
const path = require("path");
const { parseCandidatePayload } = require("../src/parser");
const { normalizeCandidateWithAi } = require("../src/ai");

const casesPath = path.join(__dirname, "cv-test-cases.sample.json");

async function run() {
  if (!fs.existsSync(casesPath)) {
    throw new Error(`Missing benchmark file: ${casesPath}`);
  }

  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
  const apiKey = process.env.OPENAI_API_KEY || "";

  for (const testCase of cases) {
    const filePath = String(testCase.filePath || "").trim();
    if (!filePath || !fs.existsSync(filePath)) {
      console.log(`SKIP ${testCase.label}: file not found`);
      continue;
    }

    const filename = path.basename(filePath);
    const fileData = fs.readFileSync(filePath).toString("base64");
    const parsed = await parseCandidatePayload({
      sourceType: "cv",
      file: {
        filename,
        mimeType: filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
        fileData
      }
    });

    let normalized = null;
    if (apiKey && parsed.rawText) {
      normalized = await normalizeCandidateWithAi({
        apiKey,
        rawText: parsed.rawText,
        sourceType: "cv",
        filename,
        fallbackFields: {
          candidateName: parsed.candidateName,
          totalExperience: parsed.totalExperience,
          currentCompany: parsed.currentCompany,
          currentDesignation: parsed.currentDesignation,
          emailId: parsed.emailId,
          phoneNumber: parsed.phoneNumber,
          timeline: parsed.timeline,
          gaps: parsed.gaps
        }
      });
    }

    console.log(`\n=== ${testCase.label} ===`);
    console.log("Expected:", JSON.stringify(testCase.expected, null, 2));
    console.log(
      "Parser:",
      JSON.stringify(
        {
          candidateName: parsed.candidateName,
          emailId: parsed.emailId,
          phoneNumber: parsed.phoneNumber,
          currentCompany: parsed.currentCompany,
          currentDesignation: parsed.currentDesignation,
          totalExperience: parsed.totalExperience
        },
        null,
        2
      )
    );
    console.log("AI:", JSON.stringify(normalized, null, 2));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
