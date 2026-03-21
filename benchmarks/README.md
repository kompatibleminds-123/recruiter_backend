# CV Benchmark Notes

This folder is for repeatable CV parsing checks.

Each case should define:
- `label`
- `filePath`
- `expected`

Recommended expected fields:
- `candidateName`
- `emailId`
- `phoneNumber`
- `currentCompany`
- `currentDesignation`
- `totalExperience`
- `averageTenurePerCompany`
- `currentOrgTenure`

Purpose:
- compare backend parse output against known recruiter-reviewed truth
- catch regressions after parser or prompt changes
- prefer blank over wrong for low-confidence fields

Suggested workflow:
1. add 10-20 real recruiter CVs here
2. manually confirm expected values once
3. run the benchmark script after parser or prompt changes
