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

export default function InvoicesPage({ token, api, clients = [] }) {
  const [tab, setTab] = useState("create");
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [data, setData] = useState({ invoices: [], analytics: { invoiceCount: 0, taxableAmount: 0, gstAmount: 0, totalAmount: 0, byMonth: [], byClient: [] } });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [history, setHistory] = useState({ invoiceNumber: "", invoiceDate: "", clientName: "", candidateName: "", annualCtc: "", feePercent: "", taxableAmount: "", gstRate: "18", taxMode: "auto" });
  const [historyFile, setHistoryFile] = useState(null);
  const [bulkRows, setBulkRows] = useState([]);

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

  useEffect(() => { if (tab === "register" || tab === "analytics") void loadInvoices(); }, [tab, loadInvoices]);

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

  const readBulkInvoices = async (fileList) => {
    const files = Array.from(fileList || []).slice(0, 20);
    if (!files.length) return;
    setLoading(true); setStatus({ text: "Reading invoice PDFs...", kind: "" });
    const rows = [];
    for (const sourceFile of files) {
      try {
        const file = await readPdf(sourceFile);
        const preview = await api("/company/invoices/historical/preview", token, "POST", { file });
        rows.push({ id: `${Date.now()}-${rows.length}`, file, invoice: preview.invoice || {}, missingFields: preview.missingFields || [], state: preview.status || "needs_review", error: "" });
      } catch (error) {
        rows.push({ id: `${Date.now()}-${rows.length}`, file: null, filename: sourceFile.name, invoice: {}, missingFields: [], state: "error", error: error.message });
      }
    }
    setBulkRows(rows);
    setStatus({ text: `${rows.length} invoice PDFs processed. Review the extracted values before importing.`, kind: "success" });
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
        {[{ id: "create", label: "Create Invoice" }, { id: "register", label: "Invoice Register" }, { id: "historical", label: "Historical Entry" }, { id: "analytics", label: "Analytics" }].map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
    </section>

    {tab === "create" ? <InvoiceGenerator token={token} api={api} clients={clients} onSaved={() => { setTab("register"); }} /> : null}

    {tab === "register" ? <section className="panel">
      <div className="invoice-register-toolbar">
        <label><span>Financial year</span><select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>{fyOptions.map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}</select></label>
        <div className="button-row"><button className="ghost-btn" disabled={loading} onClick={() => void loadInvoices()}>{loading ? "Loading..." : "Refresh"}</button><button disabled={!data.invoices.length} onClick={() => downloadInvoiceExcel(financialYear, data.invoices)}>Download Excel</button></div>
      </div>
      <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Invoice</th><th>Date</th><th>Client</th><th>Candidate</th><th>Source</th><th>Taxable</th><th>GST</th><th>Total</th><th>PDF</th></tr></thead><tbody>
        {data.invoices.length ? data.invoices.map((item) => <tr key={item.id}><td>{item.invoiceNumber}</td><td>{item.invoiceDate}</td><td>{item.clientName}</td><td>{item.candidateName || "-"}</td><td>{item.source}</td><td>{money(item.taxableAmount)}</td><td>{money(Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0))}</td><td><strong>{money(item.total)}</strong></td><td><div className="button-row tight"><button className="ghost-btn" onClick={() => void downloadStoredInvoice(item)}>Download</button><button className="danger-btn" onClick={() => void deleteInvoice(item)}>Delete</button></div></td></tr>) : <tr><td colSpan="9">{loading ? "Loading invoices..." : "No finalized invoices in this financial year."}</td></tr>}
      </tbody></table></div>
    </section> : null}

    {tab === "historical" ? <section className="panel"><h2>Bulk upload historical invoices</h2><p className="muted">Select up to 20 text PDFs. Review every extracted value before importing; no AI is used.</p>
      <div className="invoice-bulk-upload"><input type="file" accept="application/pdf" multiple disabled={loading} onChange={(e) => void readBulkInvoices(e.target.files)} /><button disabled={loading || !bulkRows.some(bulkRowReady)} onClick={() => void importBulkInvoices()}>{loading ? "Processing..." : "Import reviewed invoices"}</button></div>
      {bulkRows.length ? <div className="table-wrap"><table className="dashboard-table invoice-review-table"><thead><tr><th>PDF</th><th>Invoice no.</th><th>Date</th><th>Client</th><th>Candidate</th><th>Taxable</th><th>GST %</th><th>Status</th></tr></thead><tbody>{bulkRows.map((row) => <tr key={row.id}><td>{row.file?.filename || row.filename}</td><td><input value={row.invoice.invoiceNumber || ""} onChange={(e) => updateBulkInvoice(row.id, "invoiceNumber", e.target.value)} /></td><td><input type="date" value={row.invoice.invoiceDate || ""} onChange={(e) => updateBulkInvoice(row.id, "invoiceDate", e.target.value)} /></td><td><select value={row.invoice.clientName || ""} onChange={(e) => updateBulkInvoice(row.id, "clientName", e.target.value)}><option value="">Select client</option>{clients.map((item) => <option key={String(item?.name || item)} value={String(item?.name || item)}>{String(item?.name || item)}</option>)}</select></td><td><input value={row.invoice.candidateName || ""} onChange={(e) => updateBulkInvoice(row.id, "candidateName", e.target.value)} /></td><td><input type="number" min="0" value={row.invoice.taxableAmount || ""} onChange={(e) => updateBulkInvoice(row.id, "taxableAmount", e.target.value)} /></td><td><input type="number" min="0" value={row.invoice.gstRate ?? 18} onChange={(e) => updateBulkInvoice(row.id, "gstRate", e.target.value)} /></td><td><span className={`invoice-import-state ${row.state}`}>{row.state === "imported" ? "Imported" : row.error || (bulkRowReady(row) ? "Ready" : "Needs review")}</span></td></tr>)}</tbody></table></div> : null}
      <hr className="invoice-section-divider" /><h2>Add one invoice manually</h2><p className="muted">The original PDF and invoice number will be preserved.</p><div className="form-grid three-col">
      <label><span>Invoice number *</span><input value={history.invoiceNumber} onChange={(e) => setHistory((current) => ({ ...current, invoiceNumber: e.target.value }))} /></label>
      <label><span>Invoice date *</span><input type="date" value={history.invoiceDate} onChange={(e) => setHistory((current) => ({ ...current, invoiceDate: e.target.value }))} /></label>
      <label><span>Client *</span><select value={history.clientName} onChange={(e) => setHistory((current) => ({ ...current, clientName: e.target.value }))}><option value="">Select client</option>{clients.map((item) => <option key={String(item?.name || item)} value={String(item?.name || item)}>{String(item?.name || item)}</option>)}</select></label>
      <label><span>Candidate/reference</span><input value={history.candidateName} onChange={(e) => setHistory((current) => ({ ...current, candidateName: e.target.value }))} /></label>
      <label><span>Annual CTC</span><input type="number" min="0" value={history.annualCtc} onChange={(e) => setHistory((current) => ({ ...current, annualCtc: e.target.value }))} /></label>
      <label><span>Fee %</span><input type="number" min="0" step="0.01" value={history.feePercent} onChange={(e) => setHistory((current) => ({ ...current, feePercent: e.target.value }))} /></label>
      <label><span>Taxable amount *</span><input type="number" min="0" value={history.taxableAmount} onChange={(e) => setHistory((current) => ({ ...current, taxableAmount: e.target.value }))} /></label>
      <label><span>GST rate %</span><input type="number" min="0" value={history.gstRate} onChange={(e) => setHistory((current) => ({ ...current, gstRate: e.target.value }))} /></label>
      <label><span>Tax type</span><select value={history.taxMode} onChange={(e) => setHistory((current) => ({ ...current, taxMode: e.target.value }))}><option value="auto">Auto</option><option value="igst">IGST</option><option value="cgst_sgst">CGST + SGST</option><option value="none">No GST</option></select></label>
      <label className="span-all"><span>Original invoice PDF *</span><input type="file" accept="application/pdf" onChange={(e) => readPdf(e.target.files?.[0]).then(setHistoryFile).catch((error) => setStatus({ text: error.message, kind: "error" }))} />{historyFile ? <small>{historyFile.filename}</small> : null}</label>
    </div><div className="button-row"><button disabled={loading} onClick={() => void saveHistorical()}>{loading ? "Saving..." : "Save historical invoice"}</button></div></section> : null}

    {tab === "analytics" ? <section className="panel"><div className="invoice-register-toolbar"><label><span>Financial year</span><select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>{fyOptions.map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}</select></label><button disabled={loading} onClick={() => void loadInvoices()}>Refresh</button></div>
      <div className="invoice-kpis"><div><span>Invoices</span><strong>{Number(analytics.invoiceCount || 0)}</strong></div><div><span>Taxable billing</span><strong>{money(analytics.taxableAmount)}</strong></div><div><span>GST</span><strong>{money(analytics.gstAmount)}</strong></div><div><span>Total invoiced</span><strong>{money(analytics.totalAmount)}</strong></div></div>
      <div className="form-grid two-col"><div><h3>Monthly invoicing</h3><div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Month</th><th>Total</th></tr></thead><tbody>{(analytics.byMonth || []).map((row) => <tr key={row.month}><td>{row.month}</td><td>{money(row.totalAmount)}</td></tr>)}</tbody></table></div></div><div><h3>Client-wise billing</h3><div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Client</th><th>Total</th></tr></thead><tbody>{(analytics.byClient || []).map((row) => <tr key={row.clientName}><td>{row.clientName}</td><td>{money(row.totalAmount)}</td></tr>)}</tbody></table></div></div></div>
    </section> : null}
    {status.text ? <div className={`status ${status.kind || ""}`}>{status.text}</div> : null}
  </div>;
}
