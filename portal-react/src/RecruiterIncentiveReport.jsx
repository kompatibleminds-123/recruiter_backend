import React, { useEffect, useState } from "react";
import { reportingMonth, financialYearForMonth, startedFinancialYearMonths, financialYearLabel } from "./incentive-financial-year.mjs";

const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const lakhs = (value) => `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} L`;
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (value) => `${monthNames[Number(String(value).slice(5, 7)) - 1]} ${String(value).slice(0, 4)}`;

export default function RecruiterIncentiveReport({ token, api, onExport }) {
  const [data, setData] = useState({ rows: [], missingJoiningDate: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => reportingMonth());
  const [year, setYear] = useState(() => financialYearForMonth(reportingMonth()));
  const [recruiter, setRecruiter] = useState("");
  const [expanded, setExpanded] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    // Reveal a new month even if the report remains open across month-end.
    const timer = setInterval(() => setCurrentMonth(reportingMonth()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api("/company/reports/recruiter-incentives", token).then((response) => {
      if (active) setData(response?.result || response);
    }).catch((cause) => {
      if (active) { setData({ rows: [], missingJoiningDate: 0 }); setError(String(cause?.message || cause)); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, revision]);
  const currentYear = financialYearForMonth(currentMonth);
  const years = [...new Set([currentYear, year, ...(data.rows || []).map((row) => financialYearForMonth(row.month))])].filter((value) => value <= currentYear).sort().reverse();
  const visibleMonths = startedFinancialYearMonths(year, currentMonth);
  const rows = (data.rows || []).filter((row) => visibleMonths.includes(row.month) && (!month || row.month === month) && (!recruiter || (row.recruiterId || row.recruiterName) === recruiter))
    .sort((a, b) => a.month.localeCompare(b.month) || a.recruiterName.localeCompare(b.recruiterName));
  const monthGroups = visibleMonths.map((key) => {
    const index = Number(key.slice(5, 7)) - 1;
    const calendarYear = Number(key.slice(0, 4));
    const items = rows.filter((row) => row.month === key);
    return { key, label: monthLabel(key), items,
      salaryMonth: index === 11 ? `January ${calendarYear + 1}` : `${monthNames[index + 1]} ${calendarYear}`,
      total: items.reduce((sum, row) => sum + Number(row.incentiveInr || 0), 0),
      pending: items.filter((row) => row.ctcPending || !row.recruiterId).length };
  }).filter((group) => !month || group.key === month);
  const recruiters = [...new Map((data.rows || []).map((row) => [row.recruiterId || row.recruiterName, row.recruiterName])).entries()];
  const amount = (row) => row.ctcPending ? "CTC pending" : !row.recruiterId ? "Recruiter mapping pending" : inr(row.incentiveInr);
  const exportReport = (type) => onExport(type, {
    title: `Recruiter Incentives FY ${financialYearLabel(year)}`, subtitle: "Joined candidates only, grouped by actual joining month. Incentive payable in the following salary month.",
    headers: ["Joining Month", "Salary Month", "Recruiter", "Joined", "Total CTC", "Target", "CTC Pending", "Incentive"],
    rows: rows.map((row) => [monthLabel(row.month), monthLabel(row.salaryMonth), row.recruiterName, row.joined, lakhs(row.totalCtcLakhs), "10 L", row.ctcPending, amount(row)])
  });
  return <div className="stack-list compact">
    <p className="muted">FY {financialYearLabel(year)} · Only started months are shown · ₹10 L monthly target · Payable in the following month's salary.</p>
    <details><summary>View incentive rules</summary><p className="muted">Only Joined candidates count, using actual joining month and offer CTC. Up to ₹10 L: ₹0 · Above ₹10–15 L: ₹500 · Above ₹15–20 L: ₹1,000 · Above ₹20–25 L: ₹1,500 · Above ₹25 L: (CTC in lakhs − 10) × ₹100.</p></details>
    <div className="form-grid three-col">
      <label><span>Financial year</span><select value={year} onChange={(event) => { setYear(event.target.value); setMonth(""); }}>{years.map((value) => <option key={value} value={value}>{financialYearLabel(value)}</option>)}</select></label>
      <label><span>Joining month</span><select value={month} onChange={(event) => setMonth(event.target.value)}><option value="">All started months</option>{visibleMonths.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label>
      <label><span>Recruiter</span><select value={recruiter} onChange={(event) => setRecruiter(event.target.value)}><option value="">All recruiters</option>{recruiters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <div className="button-row align-end"><button disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? "Loading..." : "Refresh"}</button><button className="ghost-btn" onClick={() => { setYear(currentYear); setMonth(""); setRecruiter(""); }}>Reset</button></div>
    </div>
    {error ? <div className="status error" role="alert">{error}</div> : null}
    {data.missingJoiningDate > 0 ? <p className="status-note">{data.missingJoiningDate} joined record(s) excluded because an actual joining date is missing. Update the joining date to include them.</p> : null}
    <div className="button-row"><button disabled={loading || Boolean(error) || !rows.length} onClick={() => exportReport("excel")}>Download Excel</button><button className="ghost-btn" disabled={loading || Boolean(error) || !rows.length} onClick={() => exportReport("pdf")}>Download PDF</button></div>
    {loading ? <p role="status">Loading recruiter incentives...</p> : !error && monthGroups.map((group) => <section className="item-card" key={group.key} aria-label={`${group.label} incentives`}>
      <div className="item-card__top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div><h3 style={{ marginBottom: 4 }}>{group.label}</h3><p className="muted" style={{ margin: 0 }}>Salary month: {group.salaryMonth}</p></div>
        {group.items.length ? <div style={{ textAlign: "right" }}><div className="muted">{group.pending ? "Calculated incentive subtotal" : "Total incentive"}</div><strong style={{ fontSize: "1.25rem" }}>{inr(group.total)}</strong>{group.pending ? <div className="muted">{group.pending} recruiter record(s) pending</div> : null}</div> : null}
      </div>
      {group.items.length ? <div className="table-wrap" style={{ marginTop: 14 }}><table className="dashboard-table">
        <thead><tr><th>Recruiter</th><th>Joined</th><th>Total joined CTC</th><th>Target</th><th>CTC pending</th><th>Incentive</th><th>Details</th></tr></thead>
        <tbody>{group.items.map((row) => <React.Fragment key={row.key}>
          <tr><td>{row.recruiterName}</td><td>{row.joined}</td><td>{lakhs(row.totalCtcLakhs)}</td><td>10 L</td><td>{row.ctcPending}</td><td><strong>{amount(row)}</strong></td><td><button className="table-metric-btn" onClick={() => setExpanded(expanded === row.key ? "" : row.key)}>{expanded === row.key ? "Hide" : "View"}</button></td></tr>
          {expanded === row.key ? <tr><td colSpan={7}><div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Candidate</th><th>Client</th><th>Role / JD</th><th>Joined on</th><th>Offer CTC</th></tr></thead><tbody>{row.candidates.map((candidate) => <tr key={candidate.assessmentId}><td>{candidate.name}</td><td>{candidate.client}</td><td>{candidate.position}</td><td>{candidate.joinedOn}</td><td>{candidate.ctcLakhs > 0 ? lakhs(candidate.ctcLakhs) : "CTC pending"}</td></tr>)}</tbody></table></div></td></tr> : null}
        </React.Fragment>)}</tbody>
      </table></div> : <p className="muted" style={{ marginBottom: 0 }}>No joined candidates for this month{recruiter ? " and recruiter" : ""}.</p>}
    </section>)}
  </div>;
}
