import React, { useEffect, useState } from "react";

const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const lakhs = (value) => `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} L`;

export default function RecruiterIncentiveReport({ token, api, onExport }) {
  const [data, setData] = useState({ rows: [], missingJoiningDate: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [expanded, setExpanded] = useState("");
  const [revision, setRevision] = useState(0);
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
  const rows = (data.rows || []).filter((row) => (!month || row.month === month) && (!recruiter || (row.recruiterId || row.recruiterName) === recruiter));
  const recruiters = [...new Map((data.rows || []).map((row) => [row.recruiterId || row.recruiterName, row.recruiterName])).entries()];
  const amount = (row) => row.ctcPending ? "CTC pending" : !row.recruiterId ? "Recruiter mapping pending" : inr(row.incentiveInr);
  const exportReport = (type) => onExport(type, {
    title: "Recruiter Incentives", subtitle: "Joined candidates only. Incentive payable in the following salary month.",
    headers: ["Joining Month", "Salary Month", "Recruiter", "Joined", "Total CTC", "Target", "CTC Pending", "Incentive"],
    rows: rows.map((row) => [row.month, row.salaryMonth, row.recruiterName, row.joined, lakhs(row.totalCtcLakhs), "10 L", row.ctcPending, amount(row)])
  });
  return <div className="stack-list compact">
    <p className="muted">Only candidates marked Joined count, using their actual joining month and offer CTC. August joinings earn an incentive in September salary. Monthly target: ₹10 L.</p>
    <p className="muted">Up to ₹10 L: ₹0 · Above ₹10–15 L: ₹500 · Above ₹15–20 L: ₹1,000 · Above ₹20–25 L: ₹1,500 · Above ₹25 L: (CTC in lakhs − 10) × ₹100.</p>
    <div className="form-grid three-col">
      <label><span>Joining month</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      <label><span>Recruiter</span><select value={recruiter} onChange={(event) => setRecruiter(event.target.value)}><option value="">All recruiters</option>{recruiters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <div className="button-row align-end"><button disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? "Loading..." : "Refresh"}</button><button className="ghost-btn" onClick={() => { setMonth(""); setRecruiter(""); }}>Reset</button></div>
    </div>
    {error ? <div className="status error" role="alert">{error}</div> : null}
    {data.missingJoiningDate > 0 ? <p className="status-note">{data.missingJoiningDate} joined record(s) excluded because an actual joining date is missing. Update the joining date to include them.</p> : null}
    <div className="button-row"><button disabled={loading || Boolean(error) || !rows.length} onClick={() => exportReport("excel")}>Download Excel</button><button className="ghost-btn" disabled={loading || Boolean(error) || !rows.length} onClick={() => exportReport("pdf")}>Download PDF</button></div>
    <div className="table-wrap"><table className="dashboard-table">
      <thead><tr><th>Joining month</th><th>Salary month</th><th>Recruiter</th><th>Joined</th><th>Total joined CTC</th><th>Target</th><th>CTC pending</th><th>Incentive</th><th>Details</th></tr></thead>
      <tbody>{!loading && rows.map((row) => <React.Fragment key={row.key}>
        <tr><td>{row.month}</td><td>{row.salaryMonth}</td><td>{row.recruiterName}</td><td>{row.joined}</td><td>{lakhs(row.totalCtcLakhs)}</td><td>10 L</td><td>{row.ctcPending}</td><td>{amount(row)}</td><td><button className="table-metric-btn" onClick={() => setExpanded(expanded === row.key ? "" : row.key)}>{expanded === row.key ? "Hide" : "View"}</button></td></tr>
        {expanded === row.key ? <tr><td colSpan={9}><table className="dashboard-table"><thead><tr><th>Candidate</th><th>Client</th><th>Role / JD</th><th>Joined on</th><th>Offer CTC</th></tr></thead><tbody>{row.candidates.map((candidate) => <tr key={candidate.assessmentId}><td>{candidate.name}</td><td>{candidate.client}</td><td>{candidate.position}</td><td>{candidate.joinedOn}</td><td>{candidate.ctcLakhs > 0 ? lakhs(candidate.ctcLakhs) : "CTC pending"}</td></tr>)}</tbody></table></td></tr> : null}
      </React.Fragment>)}{loading || !rows.length ? <tr><td colSpan={9}>{loading ? "Loading recruiter incentives..." : "No joined candidates for the selected filters."}</td></tr> : null}</tbody>
    </table></div>
  </div>;
}
