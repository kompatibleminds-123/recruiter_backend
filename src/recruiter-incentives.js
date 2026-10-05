function calculateIncentive(totalCtcLakhs) {
  const total = Number(totalCtcLakhs);
  if (!Number.isFinite(total) || total <= 10) return 0;
  if (total <= 15) return 500;
  if (total <= 20) return 1000;
  if (total <= 25) return 1500;
  return Math.round((total - 10) * 100 * 100) / 100;
}

function nextSalaryMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
}

// Inputs are company-scoped, normalized joining records, never expected DOJ.
function buildRecruiterIncentives(joinings = []) {
  const groups = new Map();
  const seen = new Set();
  let missingJoiningDate = 0;
  for (const candidate of joinings) {
    const date = String(candidate.joinedOn || "");
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      missingJoiningDate += 1;
      continue;
    }
    const month = date.slice(0, 7);
    // Repeated assessments for one candidate/job must not pay twice.
    const duplicateKey = JSON.stringify([candidate.candidateId || candidate.assessmentId, month, candidate.client, candidate.position]);
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    const recruiterKey = candidate.recruiterId || `name:${candidate.recruiterName || "Unassigned"}`;
    const key = JSON.stringify([month, recruiterKey]);
    if (!groups.has(key)) groups.set(key, {
      key, month, salaryMonth: nextSalaryMonth(month), recruiterId: candidate.recruiterId || "",
      recruiterName: candidate.recruiterName || "Unassigned", joined: 0,
      totalCtcLakhs: 0, ctcPending: 0, candidates: []
    });
    const row = groups.get(key);
    row.joined += 1;
    const ctc = Number(candidate.ctcLakhs);
    if (Number.isFinite(ctc) && ctc > 0) row.totalCtcLakhs += ctc;
    else row.ctcPending += 1;
    row.candidates.push(candidate);
  }
  const rows = [...groups.values()].map((row) => {
    row.totalCtcLakhs = Math.round(row.totalCtcLakhs * 100000) / 100000;
    return { ...row, targetLakhs: 10,
      incentiveInr: row.ctcPending || !row.recruiterId ? null : calculateIncentive(row.totalCtcLakhs) };
  }).sort((a, b) => b.month.localeCompare(a.month) || a.recruiterName.localeCompare(b.recruiterName));
  return { rows, missingJoiningDate };
}

module.exports = { calculateIncentive, nextSalaryMonth, buildRecruiterIncentives };
