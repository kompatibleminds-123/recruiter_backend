const { parseCandidatePayload } = require("../src/parser");

async function run() {
  const cases = [
    {
      name: "role_company_leakage",
      rawText: `
Experience
Technical Lead | Pine Labs
Mar 2022 - Present
Built high scale systems and reducing code review turnaround time.
Education
B.Tech Computer Science 2019
      `
    },
    {
      name: "overlap_ranges",
      rawText: `
Work Experience
Company: ABC Pvt Ltd
Role: Sales Manager
Jan 2021 - Dec 2022
Company: XYZ Technologies
Role: Senior Sales Manager
Jun 2022 - Present
      `
    },
    {
      name: "ambiguous_dates",
      rawText: `
Professional Experience
Foo Corp | Business Analyst
2021 - 2023
Bar Ltd | Senior Analyst
May 23 - Present
      `
    },
    {
      name: "multiple_current",
      rawText: `
Experience
Acme Ltd | Account Executive
Jan 2024 - Present
Beta Inc | Consultant
Mar 2025 - Present
      `
    },
    {
      name: "sentence_as_designation_noise",
      rawText: `
Experience
Pine Labs
Mar 2022 - Present
reducing code review turnaround time.
      `
    }
  ];

  for (const item of cases) {
    const parsed = await parseCandidatePayload({ sourceType: "cv", rawText: item.rawText });
    const latest = (parsed.timeline || [])[0] || {};
    console.log(`\n=== ${item.name} ===`);
    console.log(JSON.stringify({
      currentCompany: parsed.currentCompany || null,
      currentDesignation: parsed.currentDesignation || null,
      totalExperience: parsed.totalExperience || null,
      currentOrgTenure: parsed.currentOrgTenure || null,
      timelineTop: latest,
      employmentHistoryTop: (parsed.employmentHistory || [])[0] || null,
      detectedSections: Object.keys(parsed.detectedSections || {}).filter((k) => parsed.detectedSections[k])
    }, null, 2));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

