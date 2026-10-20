import React, { useCallback, useEffect, useMemo, useState } from "react";
import InvoiceGenerator from "./InvoiceGenerator";

function currentFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const start = date.getMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "-");
  const day = Number(match[3]);
  const suffix = day >= 11 && day <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, day));
  return `${day}${suffix} ${date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}, ${match[1]}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function downloadInvoiceExcel(financialYear, invoices) {
  const headers = ["Invoice number", "Date", "Client", "Candidate", "Source", "Status", "Taxable amount", "CGST", "SGST", "IGST", "Total"];
  const rows = invoices.map((item) => [item.invoiceNumber, item.invoiceDate, item.clientName, item.candidateName, item.source, item.status, item.taxableAmount, item.cgst, item.sgst, item.igst, item.total]);
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${escapeHtml(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `invoice-register-FY-${financialYear}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readPdf(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.type !== "application/pdf") { reject(new Error("Please select a PDF file.")); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error("PDF must be smaller than 12 MB.")); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ filename: file.name, mimeType: "application/pdf", fileData: String(reader.result || "").split(",")[1] || "" });
    reader.onerror = () => reject(new Error("Could not read the PDF."));
    reader.readAsDataURL(file);
  });
}

function dataUrlFile(dataUrl, filename) {
  const parts = String(dataUrl || "").split(","); const bytes = atob(parts[1] || ""); const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
  return new File([buffer], filename, { type: "application/pdf" });
}

function downloadFile(file) { const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export default function InvoicesPage({ token, api, clients = [] }) {
  const [tab, setTab] = useState("create");
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [data, setData] = useState({ invoices: [], analytics: { invoiceCount: 0, taxableAmount: 0, gstAmount: 0, totalAmount: 0, byMonth: [], byClient: [] } });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [history, setHistory] = useState({ invoiceNumber: "", invoiceDate: "", clientName: "", candidateName: "", annualCtc: "", feePercent: "", taxableAmount: "", gstRate: "18", taxMode: "auto" });
  const [historyFile, setHistoryFile] = useState(null);
  const [historyReviewed, setHistoryReviewed] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [creditNotes, setCreditNotes] = useState([]);
  const [credit, setCredit] = useState({ creditNoteNumber: "", creditNoteDate: new Date().toISOString().slice(0, 10), invoiceId: "", reason: "", taxableAmount: "", gstRate: "18", taxMode: "auto" });
  const [creditReviewed, setCreditReviewed] = useState(false);

  const fyOptions = useMemo(() => {
    const current = Number(currentFinancialYear().slice(0, 4));
    return Array.from({ length: 6 }, (_, index) => {
      const start = current - index;
      return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
    });
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api(`/company/invoices?financialYear=${encodeURIComponent(financialYear)}`, token);
      setData({ invoices: result?.invoices || [], analytics: result?.analytics || {} });
      setStatus({ text: "", kind: "" });
    } catch (error) {
      setStatus({ text: error.message, kind: "error" });
    } finally {
      setLoading(false);
    }
  }, [api, financialYear, token]);

  const loadCreditNotes = useCallback(async () => {
    try { const result = await api(`/company/credit-notes?financialYear=${encodeURIComponent(financialYear)}`, token); setCreditNotes(result?.creditNotes || []); }
    catch (error) { setStatus({ text: error.message, kind: "error" }); }
  }, [api, financialYear, token]);

  useEffect(() => { if (tab === "register" || tab === "analytics" || tab === "credit-notes") void loadInvoices(); if (tab === "credit-notes") void loadCreditNotes(); }, [tab, loadInvoices, loadCreditNotes]);

  const downloadStoredInvoice = async (invoice) => {
    try {
      const response = await fetch(`/company/invoices/${encodeURIComponent(invoice.id)}/pdf?download=1`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || "Could not download invoice.");
      const blob = await response.blob();
      const file = new File([blob], invoice.filename || `${invoice.invoiceNumber}.pdf`, { type: "application/pdf" });
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.name; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (String(error?.name || "") !== "AbortError") setStatus({ text: error.message, kind: "error" });
    }
  };

  const deleteInvoice = async (invoice) => {
    if (!window.confirm(`Delete invoice ${invoice.invoiceNumber}? Its stored PDF will also be removed.`)) return;
    try {
      await api(`/company/invoices/${encodeURIComponent(invoice.id)}`, token, "DELETE");
      setStatus({ text: `Invoice ${invoice.invoiceNumber} deleted.`, kind: "success" });
      await loadInvoices();
    } catch (error) {
      setStatus({ text: error.message, kind: "error" });
    }
  };

  const editInvoice = async (invoice) => {
    try {
      setLoading(true);
      const result = await api(`/company/invoices/${encodeURIComponent(invoice.id)}`, token);
      setEditingInvoice(result); setTab("create"); setStatus({ text: "Edit the figures, review the PDF, then save the corrected invoice.", kind: "" });
    } catch (error) { setStatus({ text: error.message, kind: "error" }); } finally { setLoading(false); }
  };

  const selectCreditInvoice = (invoiceId) => {
    const invoice = data.invoices.find((item) => item.id === invoiceId);
    setCredit((current) => ({ ...current, invoiceId, taxableAmount: invoice?.taxableAmount || "", gstRate: invoice?.gstRate || "18", taxMode: invoice?.taxMode || "auto" }));
    setCreditReviewed(false);
  };

  const finalizeCredit = async () => {
    if (!creditReviewed) { setStatus({ text: "Review the credit note details before finalizing.", kind: "error" }); return; }
    try {
      setLoading(true); const result = await api("/company/credit-notes/finalize", token, "POST", { creditNote: credit });
      downloadFile(dataUrlFile(`data:${result.mimeType};base64,${result.fileData}`, result.filename || "credit-note.pdf"));
      setStatus({ text: "Credit note saved and downloaded.", kind: "success" }); setCreditNotes((current) => [result.creditNote, ...current]); setCredit((current) => ({ ...current, creditNoteNumber: "", invoiceId: "", reason: "", taxableAmount: "" })); setCreditReviewed(false);
    } catch (error) { setStatus({ text: error.message, kind: "error" }); } finally { setLoading(false); }
  };

  const downloadCreditNote = async (note) => {
    try {
      const response = await fetch(`/company/credit-notes/${encodeURIComponent(note.id)}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || "Could not download credit note.");
      downloadFile(new File([await response.blob()], note.filename || `${note.creditNoteNumber}.pdf`, { type: "application/pdf" }));
    } catch (error) { setStatus({ text: error.message, kind: "error" }); }
  };

  const deleteCreditNote = async (note) => {
    if (!window.confirm(`Delete credit note ${note.creditNoteNumber}? Its PDF will also be removed.`)) return;
    try { await api(`/company/credit-notes/${encodeURIComponent(note.id)}`, token, "DELETE"); setCreditNotes((current) => current.filter((item) => item.id !== note.id)); setStatus({ text: "Credit note deleted.", kind: "success" }); }
    catch (error) { setStatus({ text: error.message, kind: "error" }); }
  };

  const readBulkInvoices = async (fileList) => {
    const files = Array.from(fileList || []).slice(0, 20);
    if (!files.length) return;
    setLoading(true); setStatus({ text: "Reading invoice PDFs...", kind: "" });
    const rows = [];
    for (const sourceFile of files) {
      try {
        const file = await readPdf(sourceFile);
        const preview = await api("/company/invoices/historical/preview", token, "POST", { file });
        rows.push({ id: `${Date.now()}-${rows.length}`, file, invoice: preview.invoice || {}, missingFields: preview.missingFields || [], state: preview.status || "needs_review", aiAssisted: Boolean(preview.aiAssisted), error: "" });
      } catch (error) {
        rows.push({ id: `${Date.now()}-${rows.length}`, file: null, filename: sourceFile.name, invoice: {}, missingFields: [], state: "error", error: error.message });
      }
    }
    setBulkRows(rows);
    const aiAssisted = rows.filter((row) => row.aiAssisted).length;
    setStatus({ text: `${rows.length} invoice PDFs processed${aiAssisted ? `; AI completed ${aiAssisted} incomplete invoice${aiAssisted === 1 ? "" : "s"}` : ""}. Review the extracted values before importing.`, kind: "success" });
    setLoading(false);
  };

  const updateBulkInvoice = (rowId, key, value) => setBulkRows((current) => current.map((row) => {
    if (row.id !== rowId) return row;
    const invoice = { ...row.invoice, [key]: value };
    if (Array.isArray(invoice.items) && invoice.items.length === 1 && ["candidateName", "annualCtc", "feePercent", "taxableAmount"].includes(key)) {
      invoice.items = [{ ...invoice.items[0], [key]: value }];
    }
    return { ...row, invoice, state: "reviewed", error: "" };
  }));

  const bulkRowReady = (row) => Boolean(row.file && row.invoice?.invoiceNumber && row.invoice?.invoiceDate && row.invoice?.clientName && row.invoice?.candidateName && Number(row.invoice?.taxableAmount) > 0 && row.state !== "imported");

  const importBulkInvoices = async () => {
    const readyRows = bulkRows.filter(bulkRowReady);
    if (!readyRows.length) { setStatus({ text: "Complete the required fields before importing.", kind: "error" }); return; }
    setLoading(true); setStatus({ text: "Importing reviewed invoices...", kind: "" });
    let imported = 0;
    for (const row of readyRows) {
      try {
        await api("/company/invoices/historical", token, "POST", { invoice: row.invoice, file: row.file });
        imported += 1;
        setBulkRows((current) => current.map((item) => item.id === row.id ? { ...item, state: "imported", error: "" } : item));
      } catch (error) {
        setBulkRows((current) => current.map((item) => item.id === row.id ? { ...item, state: "error", error: error.message } : item));
      }
    }
    setStatus({ text: `${imported} of ${readyRows.length} invoices imported.`, kind: imported === readyRows.length ? "success" : "error" });
    setLoading(false);
  };

  const saveHistorical = async () => {
    setLoading(true); setStatus({ text: "", kind: "" });
    try {
      if (!historyReviewed) throw new Error("Review the historical invoice before saving.");
      if (!historyFile) throw new Error("Please select the original invoice PDF.");
      await api("/company/invoices/historical", token, "POST", { invoice: history, file: historyFile });
      setStatus({ text: "Historical invoice saved.", kind: "success" });
      setHistory({ invoiceNumber: "", invoiceDate: "", clientName: "", candidateName: "", annualCtc: "", feePercent: "", taxableAmount: "", gstRate: "18", taxMode: "auto" });
      setHistoryFile(null);
      setTab("register");
    } catch (error) {
      setStatus({ text: error.message, kind: "error" });
    } finally {
      setLoading(false);
    }
  };

  const analytics = data.analytics || {};
  return <div className="page-grid invoice-module">
    <section className="panel">
      <div className="section-kicker">Finance</div><h2>Invoices</h2><p className="muted">Create, store and analyse finalized invoices. Admin access only.</p>
      <div className="reports-view-tabs">
        {[{ id: "create", label: "Create Invoice" }, { id: "register", label: "Invoice Register" }, { id: "historical", label: "Historical Entry" }, { id: "credit-notes", label: "Credit Notes" }, { id: "analytics", label: "Analytics" }].map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
    </section>

    {tab === "create" ? <InvoiceGenerator token={token} api={api} clients={clients} editingInvoice={editingInvoice} onCancelEdit={() => { setEditingInvoice(null); setTab("register"); }} onSaved={() => { setEditingInvoice(null); setTab("register"); }} /> : null}

    {tab === "register" ? <section className="panel">
      <div className="invoice-register-toolbar">
        <label><span>Financial year</span><select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>{fyOptions.map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}</select></label>
        <div className="button-row"><button className="ghost-btn" disabled={loading} onClick={() => void loadInvoices()}>{loading ? "Loading..." : "Refresh"}</button><button disabled={!data.invoices.length} onClick={() => downloadInvoiceExcel(financialYear, data.invoices)}>Download Excel</button></div>
      </div>
      <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Invoice</th><th>Date</th><th>Client</th><th>Candidate</th><th>Source</th><th>Taxable</th><th>GST</th><th>Total</th><th>PDF</th></tr></thead><tbody>
        {data.invoices.length ? data.invoices.map((item) => <tr key={item.id}><td>{item.invoiceNumber}</td><td>{displayDate(item.invoiceDate)}</td><td>{item.clientName}</td><td>{item.candidateName || "-"}</td><td>{item.source}</td><td>{money(item.taxableAmount)}</td><td>{money(Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0))}</td><td><strong>{money(item.total)}</strong></td><td><div className="button-row tight"><button className="ghost-btn" onClick={() => void downloadStoredInvoice(item)}>Download</button><button className="ghost-btn" onClick={() => void editInvoice(item)}>Edit</button><button className="danger-btn" onClick={() => void deleteInvoice(item)}>Delete</button></div></td></tr>) : <tr><td colSpan="9">{loading ? "Loading invoices..." : "No finalized invoices in this financial year."}</td></tr>}
      </tbody></table></div>
    </section> : null}

    {tab === "historical" ? <section className="panel"><h2>Bulk upload historical invoices</h2><p className="muted">Select up to 20 text PDFs. Review every extracted value before importing; no AI is used.</p>
      <div className="invoice-bulk-upload"><input type="file" accept="application/pdf" multiple disabled={loading} onChange={(e) => void readBulkInvoices(e.target.files)} /><button disabled={loading || !bulkRows.some(bulkRowReady)} onClick={() => void importBulkInvoices()}>{loading ? "Processing..." : "Import reviewed invoices"}</button></div>
      {bulkRows.length ? <div className="table-wrap"><table className="dashboard-table invoice-review-table"><thead><tr><th>PDF</th><th>Invoice no.</th><th>Date</th><th>Client</th><th>Candidate</th><th>Taxable</th><th>GST %</th><th>Status</th></tr></thead><tbody>{bulkRows.map((row) => <tr key={row.id}><td>{row.file?.filename || row.filename}</td><td><input value={row.invoice.invoiceNumber || ""} onChange={(e) => updateBulkInvoice(row.id, "invoiceNumber", e.target.value)} /></td><td><input type="date" value={row.invoice.invoiceDate || ""} onChange={(e) => updateBulkInvoice(row.id, "invoiceDate", e.target.value)} /><small>{displayDate(row.invoice.invoiceDate)}</small></td><td><select value={row.invoice.clientName || ""} onChange={(e) => updateBulkInvoice(row.id, "clientName", e.target.value)}><option value="">Select client</option>{clients.map((item) => <option key={String(item?.name || item)} value={String(item?.name || item)}>{String(item?.name || item)}</option>)}</select></td><td><input value={row.invoice.candidateName || ""} onChange={(e) => updateBulkInvoice(row.id, "candidateName", e.target.value)} /></td><td><input type="number" min="0" value={row.invoice.taxableAmount || ""} onChange={(e) => updateBulkInvoice(row.id, "taxableAmount", e.target.value)} /></td><td><input type="number" min="0" value={row.invoice.gstRate ?? 18} onChange={(e) => updateBulkInvoice(row.id, "gstRate", e.target.value)} /></td><td><span className={`invoice-import-state ${row.state}`}>{row.state === "imported" ? "Imported" : row.error || (bulkRowReady(row) ? "Ready" : "Needs review")}</span></td></tr>)}</tbody></table></div> : null}
      <hr className="invoice-section-divider" /><h2>Add one invoice manually</h2><p className="muted">The original PDF and invoice number will be preserved.</p><div className="form-grid three-col">
      <label><span>Invoice number *</span><input value={history.invoiceNumber} onChange={(e) => { setHistory((current) => ({ ...current, invoiceNumber: e.target.value })); setHistoryReviewed(false); }} /></label>
      <label><span>Invoice date *</span><input type="date" value={history.invoiceDate} onChange={(e) => { setHistory((current) => ({ ...current, invoiceDate: e.target.value })); setHistoryReviewed(false); }} /></label>
      <label><span>Client *</span><select value={history.clientName} onChange={(e) => { setHistory((current) => ({ ...current, clientName: e.target.value })); setHistoryReviewed(false); }}><option value="">Select client</option>{clients.map((item) => <option key={String(item?.name || item)} value={String(item?.name || item)}>{String(item?.name || item)}</option>)}</select></label>
      <label><span>Candidate/reference</span><input value={history.candidateName} onChange={(e) => setHistory((current) => ({ ...current, candidateName: e.target.value }))} /></label>
      <label><span>Annual CTC</span><input type="number" min="0" value={history.annualCtc} onChange={(e) => setHistory((current) => ({ ...current, annualCtc: e.target.value }))} /></label>
      <label><span>Fee %</span><input type="number" min="0" step="0.01" value={history.feePercent} onChange={(e) => setHistory((current) => ({ ...current, feePercent: e.target.value }))} /></label>
      <label><span>Taxable amount *</span><input type="number" min="0" value={history.taxableAmount} onChange={(e) => setHistory((current) => ({ ...current, taxableAmount: e.target.value }))} /></label>
      <label><span>GST rate %</span><input type="number" min="0" value={history.gstRate} onChange={(e) => setHistory((current) => ({ ...current, gstRate: e.target.value }))} /></label>
      <label><span>Tax type</span><select value={history.taxMode} onChange={(e) => setHistory((current) => ({ ...current, taxMode: e.target.value }))}><option value="auto">Auto</option><option value="igst">IGST</option><option value="cgst_sgst">CGST + SGST</option><option value="none">No GST</option></select></label>
      <label className="span-all"><span>Original invoice PDF *</span><input type="file" accept="application/pdf" onChange={(e) => readPdf(e.target.files?.[0]).then(setHistoryFile).catch((error) => setStatus({ text: error.message, kind: "error" }))} />{historyFile ? <small>{historyFile.filename}</small> : null}</label>
    </div><div className="button-row"><button className="ghost-btn" disabled={loading || !historyFile} onClick={() => { setHistoryReviewed(true); setStatus({ text: "Historical entry reviewed. Confirm save when ready.", kind: "success" }); }}>Review Entry</button><button disabled={loading || !historyReviewed} onClick={() => void saveHistorical()}>{loading ? "Saving..." : "Confirm Import"}</button></div></section> : null}

    {tab === "credit-notes" ? <section className="panel"><h2>Add Credit Note</h2><p className="muted">Select the invoice here; invoice rows stay clean. The credit total cannot exceed the original invoice total.</p><div className="form-grid three-col">
      <label><span>Financial year</span><select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>{fyOptions.map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}</select></label>
      <label><span>Credit note number *</span><input value={credit.creditNoteNumber} onChange={(e) => { setCredit((current) => ({ ...current, creditNoteNumber: e.target.value })); setCreditReviewed(false); }} placeholder="CN/26-27/00001" /></label>
      <label><span>Credit note date *</span><input type="date" value={credit.creditNoteDate} onChange={(e) => { setCredit((current) => ({ ...current, creditNoteDate: e.target.value })); setCreditReviewed(false); }} /></label>
      <label className="span-all"><span>Original invoice *</span><select value={credit.invoiceId} onChange={(e) => selectCreditInvoice(e.target.value)}><option value="">Select invoice</option>{data.invoices.map((item) => <option key={item.id} value={item.id}>{item.invoiceNumber} — {item.clientName} — {money(item.total)}</option>)}</select></label>
      <label><span>Taxable credit amount *</span><input type="number" min="0" value={credit.taxableAmount} onChange={(e) => { setCredit((current) => ({ ...current, taxableAmount: e.target.value })); setCreditReviewed(false); }} /></label>
      <label><span>GST rate %</span><input type="number" min="0" value={credit.gstRate} onChange={(e) => { setCredit((current) => ({ ...current, gstRate: e.target.value })); setCreditReviewed(false); }} /></label>
      <label><span>Tax type</span><select value={credit.taxMode} onChange={(e) => { setCredit((current) => ({ ...current, taxMode: e.target.value })); setCreditReviewed(false); }}><option value="auto">Auto / invoice tax type</option><option value="igst">IGST</option><option value="cgst_sgst">CGST + SGST</option><option value="none">No GST</option></select></label>
      <label className="span-all"><span>Reason *</span><textarea rows="2" value={credit.reason} onChange={(e) => { setCredit((current) => ({ ...current, reason: e.target.value })); setCreditReviewed(false); }} placeholder="CTC correction, replacement, overbilling adjustment..." /></label>
    </div><div className="button-row"><button className="ghost-btn" disabled={loading} onClick={() => { setCreditReviewed(true); setStatus({ text: "Review complete. Finalize to save and download the credit note PDF.", kind: "success" }); }}>Review Credit Note</button><button disabled={loading || !creditReviewed} onClick={() => void finalizeCredit()}>{loading ? "Saving..." : "Finalize & Download"}</button></div>
    <h3>Credit Note Register</h3><div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Credit Note</th><th>Date</th><th>Invoice</th><th>Client</th><th>Reason</th><th>Total Credit</th><th>Actions</th></tr></thead><tbody>{creditNotes.length ? creditNotes.map((item) => <tr key={item.id}><td>{item.creditNoteNumber}</td><td>{displayDate(item.creditNoteDate)}</td><td>{item.invoiceNumber}</td><td>{item.clientName}</td><td>{item.reason}</td><td>{money(item.total)}</td><td><div className="button-row tight"><button className="ghost-btn" onClick={() => void downloadCreditNote(item)}>Download</button><button className="danger-btn" onClick={() => void deleteCreditNote(item)}>Delete</button></div></td></tr>) : <tr><td colSpan="7">No credit notes in this financial year.</td></tr>}</tbody></table></div></section> : null}

    {tab === "analytics" ? <section className="panel"><div className="invoice-register-toolbar"><label><span>Financial year</span><select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>{fyOptions.map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}</select></label><button disabled={loading} onClick={() => void loadInvoices()}>Refresh</button></div>
      <div className="invoice-kpis"><div><span>Invoices</span><strong>{Number(analytics.invoiceCount || 0)}</strong></div><div><span>Taxable billing</span><strong>{money(analytics.taxableAmount)}</strong></div><div><span>GST</span><strong>{money(analytics.gstAmount)}</strong></div><div><span>Total invoiced</span><strong>{money(analytics.totalAmount)}</strong></div></div>
      <div className="form-grid two-col"><div><h3>Monthly invoicing</h3><div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Month</th><th>Total</th></tr></thead><tbody>{(analytics.byMonth || []).map((row) => <tr key={row.month}><td>{row.month}</td><td>{money(row.totalAmount)}</td></tr>)}</tbody></table></div></div><div><h3>Client-wise billing</h3><div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Client</th><th>Total</th></tr></thead><tbody>{(analytics.byClient || []).map((row) => <tr key={row.clientName}><td>{row.clientName}</td><td>{money(row.totalAmount)}</td></tr>)}</tbody></table></div></div></div>
    </section> : null}
    {status.text ? <div className={`status ${status.kind || ""}`}>{status.text}</div> : null}
  </div>;
}
