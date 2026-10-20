import React, { useEffect, useMemo, useState } from "react";

const EMPTY_PROFILE = {
  legalName: "", tradeName: "", address: "", cin: "", pan: "", gstin: "", state: "", stateCode: "",
  bankAccountName: "", bankAccountNumber: "", bankIfsc: "", bankName: "", bankBranch: "",
  defaultHsnSac: "998311", defaultGstRate: 18, logoDataUrl: "", signatureDataUrl: ""
};
const EMPTY_CLIENT = { legalName: "", address: "", gstin: "", state: "", stateCode: "" };
const EMPTY_ITEM = { candidateName: "", serviceDescription: "HR Consulting Services", annualCtc: "", feePercent: "8.33", taxableAmount: "", hsnSac: "998311" };

function itemTaxable(item) {
  const manual = Number(String(item.taxableAmount || "").replace(/,/g, ""));
  if (manual > 0) return manual;
  const ctc = Number(String(item.annualCtc || "").replace(/,/g, ""));
  const fee = Number(item.feePercent || 0);
  return ctc > 0 && fee > 0 ? ctc * fee / 100 : 0;
}

function dataUrlToFile(dataUrl, filename) {
  const [header, encoded] = String(dataUrl || "").split(",");
  const mime = header?.match(/data:([^;]+)/)?.[1] || "application/pdf";
  const bytes = atob(encoded || "");
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
  return new File([buffer], filename, { type: mime });
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readImage(file, setter, setStatus) {
  if (!file) return;
  if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
    setStatus({ text: "Please select a PNG or JPG image.", kind: "error" });
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    setStatus({ text: "Image must be smaller than 2 MB.", kind: "error" });
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setter(String(reader.result || ""));
  reader.onerror = () => setStatus({ text: "Could not read the selected image.", kind: "error" });
  reader.readAsDataURL(file);
}

function filledClientFields(value) {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {}).filter(([, field]) => String(field || "").trim()));
}

function taxModeFromStateCodes(clientStateCode, companyStateCode, currentMode = "") {
  if (String(currentMode || "") === "none") return "none";
  const clientDigits = String(clientStateCode || "").replace(/\D/g, "");
  const companyDigits = String(companyStateCode || "").replace(/\D/g, "");
  const client = clientDigits ? clientDigits.padStart(2, "0") : "";
  const company = companyDigits ? companyDigits.padStart(2, "0") : "";
  return client && company && client === company ? "cgst_sgst" : "igst";
}

export default function InvoiceGenerator({ token, api, clients = [], bootstrap = null, onSaved = null, editingInvoice = null, onCancelEdit = null }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [clientProfiles, setClientProfiles] = useState({});
  const [billingRules, setBillingRules] = useState({});
  const [clientName, setClientName] = useState("");
  const [client, setClient] = useState(EMPTY_CLIENT);
  const [invoice, setInvoice] = useState({
    invoiceNumber: "", invoiceDate: new Date().toISOString().slice(0, 10),
    items: [{ ...EMPTY_ITEM }], gstRate: "18", taxMode: "auto", notes: ""
  });
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const source = bootstrap
      ? Promise.resolve([bootstrap.settings || {}, { clients: bootstrap.clients || [] }])
      : Promise.all([
        api("/company/reports/invoice/settings", token),
        api("/company/clients", token).catch(() => ({ clients: [] }))
      ]);
    source
      .then(([result, clientResult]) => {
        if (!active) return;
        const nextProfile = { ...EMPTY_PROFILE, ...(result?.invoiceProfile || {}) };
        const masterProfiles = Object.fromEntries((clientResult?.clients || []).map((item) => [String(item?.name || "").trim(), {
          legalName: item?.billingLegalName || item?.name || "",
          address: item?.billingAddress || "",
          gstin: item?.billingGstin || "",
          state: item?.billingState || "",
          stateCode: item?.billingStateCode || ""
        }]).filter(([name]) => Boolean(name)));
        setProfile(nextProfile);
        setClientProfiles({ ...(result?.invoiceClientProfiles || {}), ...masterProfiles });
        setBillingRules(result?.clientBillingRules || {});
        setInvoice((current) => ({
          ...current,
          items: current.items.map((item) => ({ ...item, hsnSac: nextProfile.defaultHsnSac || item.hsnSac })),
          gstRate: String(nextProfile.defaultGstRate ?? current.gstRate)
        }));
      })
      .catch((error) => active && setStatus({ text: error.message, kind: "error" }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api, token, bootstrap]);

  useEffect(() => {
    // Wait for saved client profiles so historical invoices automatically load
    // the already-saved client address/GST/state details on opening Edit.
    if (!editingInvoice || loading) return;
    const next = editingInvoice.input || {};
    setClientName(next.clientName || editingInvoice.invoice?.clientName || "");
    const editClientName = next.clientName || editingInvoice.invoice?.clientName || "";
    const masterClient = clientProfiles[editClientName] || {};
    const savedClient = filledClientFields(next.clientDetails);
    const clientStateCode = masterClient.stateCode || savedClient.stateCode;
    setClient({ ...EMPTY_CLIENT, ...masterClient, ...savedClient, legalName: savedClient.legalName || masterClient.legalName || editClientName });
    setInvoice((current) => ({ ...current, ...next, taxMode: taxModeFromStateCodes(clientStateCode, profile.stateCode, next.taxMode || current.taxMode), invoiceNumber: editingInvoice.invoice?.invoiceNumber || next.invoiceNumber || "", items: Array.isArray(editingInvoice.items) && editingInvoice.items.length ? editingInvoice.items : (next.items || current.items) }));
    setReviewed(false);
  }, [editingInvoice, loading, clientProfiles, profile.stateCode]);

  const clientOptions = useMemo(() => Array.from(new Set([
    ...clients.map((item) => String(item?.name || item || "").trim()),
    ...Object.keys(clientProfiles)
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b)), [clients, clientProfiles]);

  const computedTaxable = useMemo(() => invoice.items.reduce((sum, item) => sum + itemTaxable(item), 0), [invoice.items]);

  const selectClient = (name) => {
    setClientName(name);
    const selectedClient = clientProfiles[name] || {};
    setClient({ ...EMPTY_CLIENT, ...selectedClient, legalName: selectedClient.legalName || name });
    const rule = billingRules[name];
    const clientTaxMode = taxModeFromStateCodes(selectedClient.stateCode, profile.stateCode);
    if (rule?.type === "percentage" && Number(rule.value) > 0) {
      setInvoice((current) => ({ ...current, taxMode: clientTaxMode || current.taxMode, items: current.items.map((item) => ({ ...item, feePercent: String(rule.value), taxableAmount: "" })) }));
    } else if (rule?.type === "flat" && Number(rule.value) > 0) {
      setInvoice((current) => ({ ...current, taxMode: clientTaxMode || current.taxMode, items: current.items.map((item) => ({ ...item, feePercent: "", taxableAmount: String(rule.value) })) }));
    } else if (clientTaxMode) {
      setInvoice((current) => ({ ...current, taxMode: clientTaxMode }));
    }
  };
  const updateProfile = (key, value) => {
    setProfile((current) => ({ ...current, [key]: value }));
    if (key === "stateCode") setInvoice((current) => ({ ...current, taxMode: taxModeFromStateCodes(client.stateCode, value, current.taxMode) }));
  };
  const updateClient = (key, value) => {
    setClient((current) => ({ ...current, [key]: value }));
    if (key === "stateCode") setInvoice((current) => ({ ...current, taxMode: taxModeFromStateCodes(value, profile.stateCode, current.taxMode) }));
  };
  const updateInvoice = (key, value) => { setReviewed(false); setInvoice((current) => ({ ...current, [key]: value })); };
  const updateItem = (index, key, value) => { setReviewed(false); setInvoice((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) })); };
  const addItem = () => setInvoice((current) => current.items.length >= 4 ? current : ({ ...current, items: [...current.items, { ...EMPTY_ITEM, feePercent: current.items[0]?.feePercent || "8.33", hsnSac: profile.defaultHsnSac || "998311" }] }));
  const removeItem = (index) => setInvoice((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));

  const saveSettings = async ({ quiet = false } = {}) => {
    if (!profile.legalName.trim()) throw new Error("Company legal name is required.");
    const nextClients = clientName ? { ...clientProfiles, [clientName]: { ...client, legalName: client.legalName || clientName } } : clientProfiles;
    const result = await api("/company/reports/invoice/settings", token, "POST", {
      invoiceProfile: profile,
      invoiceClientProfiles: nextClients
    });
    setProfile({ ...EMPTY_PROFILE, ...(result?.invoiceProfile || profile) });
    setClientProfiles(result?.invoiceClientProfiles || nextClients);
    if (!quiet) setStatus({ text: "Invoice settings saved.", kind: "success" });
    return result;
  };

  const generate = async (action) => {
    setStatus({ text: "", kind: "" });
    if (!clientName) { setStatus({ text: "Please select a client.", kind: "error" }); return; }
    if (!client.address.trim()) { setStatus({ text: "Please enter the client's billing address.", kind: "error" }); return; }
    setWorking(true);
    try {
      const invoicePayload = { ...invoice, items: invoice.items.map((item) => ({ ...item })), clientName, clientDetails: { ...client, legalName: client.legalName || clientName }, profileDetails: { ...profile } };
      const endpoint = action === "finalize" ? (editingInvoice?.invoice?.id ? `/company/invoices/${encodeURIComponent(editingInvoice.invoice.id)}` : "/company/invoices/finalize") : "/company/reports/invoice/pdf";
      const result = await api(endpoint, token, action === "finalize" && editingInvoice?.invoice?.id ? "PUT" : "POST", {
        invoice: invoicePayload
      });
      if (action !== "finalize") {
        const file = dataUrlToFile(`data:${result.mimeType};base64,${result.fileData}`, result.filename || "invoice.pdf");
        downloadFile(file);
      }
      setStatus({ text: action === "finalize" ? (editingInvoice ? "Corrected invoice saved." : "Invoice finalized and saved.") : "Invoice PDF downloaded.", kind: "success" });
      if (action === "finalize" && typeof onSaved === "function") onSaved(result?.invoice || null);
    } catch (error) {
      if (String(error?.name || "") !== "AbortError") setStatus({ text: error.message || String(error), kind: "error" });
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="item-card"><p className="muted">Loading invoice settings...</p></div>;

  return (
    <div className="invoice-generator stack-list">
      <div className="item-card">
        <div className="invoice-card-heading"><div><h3>Your invoice details</h3><p className="muted">Save these once. They will be used on every invoice.</p></div></div>
        <div className="form-grid three-col">
          <label><span>Company legal name *</span><input value={profile.legalName} onChange={(e) => updateProfile("legalName", e.target.value)} /></label>
          <label><span>Trade name</span><input value={profile.tradeName} onChange={(e) => updateProfile("tradeName", e.target.value)} /></label>
          <label><span>GSTIN</span><input value={profile.gstin} onChange={(e) => updateProfile("gstin", e.target.value.toUpperCase())} /></label>
          <label><span>PAN</span><input value={profile.pan} onChange={(e) => updateProfile("pan", e.target.value.toUpperCase())} /></label>
          <label><span>CIN</span><input value={profile.cin} onChange={(e) => updateProfile("cin", e.target.value.toUpperCase())} /></label>
          <label><span>State</span><input value={profile.state} onChange={(e) => updateProfile("state", e.target.value)} /></label>
          <label><span>State code</span><input value={profile.stateCode} onChange={(e) => updateProfile("stateCode", e.target.value)} placeholder="e.g. 07" /></label>
          <label className="span-all"><span>Registered address</span><textarea rows="3" value={profile.address} onChange={(e) => updateProfile("address", e.target.value)} /></label>
        </div>
        <h4>Bank details</h4>
        <div className="form-grid three-col">
          <label><span>Account name</span><input value={profile.bankAccountName} onChange={(e) => updateProfile("bankAccountName", e.target.value)} /></label>
          <label><span>Account number</span><input value={profile.bankAccountNumber} onChange={(e) => updateProfile("bankAccountNumber", e.target.value)} /></label>
          <label><span>IFSC</span><input value={profile.bankIfsc} onChange={(e) => updateProfile("bankIfsc", e.target.value.toUpperCase())} /></label>
          <label><span>Bank name</span><input value={profile.bankName} onChange={(e) => updateProfile("bankName", e.target.value)} /></label>
          <label><span>Branch</span><input value={profile.bankBranch} onChange={(e) => updateProfile("bankBranch", e.target.value)} /></label>
          <label><span>Default HSN/SAC</span><input value={profile.defaultHsnSac} onChange={(e) => updateProfile("defaultHsnSac", e.target.value)} /></label>
          <label><span>Default GST %</span><input type="number" min="0" max="100" value={profile.defaultGstRate} onChange={(e) => { updateProfile("defaultGstRate", e.target.value); updateInvoice("gstRate", e.target.value); }} /></label>
        </div>
        <div className="invoice-image-grid">
          <label><span>Company logo (PNG/JPG)</span><input type="file" accept="image/png,image/jpeg" onChange={(e) => readImage(e.target.files?.[0], (value) => updateProfile("logoDataUrl", value), setStatus)} />{profile.logoDataUrl ? <img src={profile.logoDataUrl} alt="Company logo preview" /> : null}</label>
          <label><span>Signature (PNG/JPG)</span><input type="file" accept="image/png,image/jpeg" onChange={(e) => readImage(e.target.files?.[0], (value) => updateProfile("signatureDataUrl", value), setStatus)} />{profile.signatureDataUrl ? <img src={profile.signatureDataUrl} alt="Signature preview" /> : null}</label>
        </div>
        <div className="button-row"><button className="ghost-btn" disabled={working} onClick={() => { setWorking(true); saveSettings().catch((error) => setStatus({ text: error.message, kind: "error" })).finally(() => setWorking(false)); }}>Save company details</button></div>
      </div>

      <div className="item-card">
        <h3>{editingInvoice ? `Edit invoice ${editingInvoice.invoice?.invoiceNumber || ""}` : "Create invoice"}</h3>
        {editingInvoice ? <p className="muted">Check the revised figures, review the PDF, then save the corrected invoice.</p> : null}
        <div className="form-grid three-col">
          <label><span>Client *</span><select value={clientName} onChange={(e) => selectClient(e.target.value)}><option value="">Select client</option>{clientOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>Invoice number *</span><input value={invoice.invoiceNumber} onChange={(e) => updateInvoice("invoiceNumber", e.target.value)} placeholder="KM/26-27/00021" /></label>
          <label><span>Invoice date *</span><input type="date" value={invoice.invoiceDate} onChange={(e) => updateInvoice("invoiceDate", e.target.value)} /></label>
          <label><span>Client legal name</span><input value={client.legalName} onChange={(e) => updateClient("legalName", e.target.value)} /></label>
          <label><span>Client GSTIN</span><input value={client.gstin} onChange={(e) => updateClient("gstin", e.target.value.toUpperCase())} /></label>
          <label><span>Client state</span><input value={client.state} onChange={(e) => updateClient("state", e.target.value)} /></label>
          <label><span>Client state code</span><input value={client.stateCode} onChange={(e) => updateClient("stateCode", e.target.value)} placeholder="e.g. 29" /></label>
          <label className="span-all"><span>Client billing address *</span><textarea rows="3" value={client.address} onChange={(e) => updateClient("address", e.target.value)} /></label>
          <label><span>GST rate %</span><input type="number" min="0" value={invoice.gstRate} onChange={(e) => updateInvoice("gstRate", e.target.value)} /></label>
          <label><span>Tax type</span><select value={invoice.taxMode} onChange={(e) => updateInvoice("taxMode", e.target.value)}><option value="auto">Auto from state codes</option><option value="igst">IGST</option><option value="cgst_sgst">CGST + SGST</option><option value="none">No GST</option></select></label>
          <label className="span-all"><span>Notes / payment terms</span><textarea rows="2" value={invoice.notes} onChange={(e) => updateInvoice("notes", e.target.value)} /></label>
        </div>
        <div className="invoice-line-items">
          <div className="invoice-card-heading"><div><h4>Candidate line items</h4><p className="muted">Add up to 4 candidates in one invoice.</p></div><button className="ghost-btn" type="button" disabled={invoice.items.length >= 4} onClick={addItem}>+ Add Candidate</button></div>
          {invoice.items.map((item, index) => <div className="invoice-line-item" key={index}>
            <div className="invoice-line-item-title"><strong>Candidate {index + 1}</strong>{invoice.items.length > 1 ? <button className="ghost-btn" type="button" onClick={() => removeItem(index)}>Remove</button> : null}</div>
            <div className="form-grid three-col">
              <label><span>Candidate / reference *</span><input value={item.candidateName} onChange={(e) => updateItem(index, "candidateName", e.target.value)} /></label>
              <label><span>Annual CTC (Rs.)</span><input type="number" min="0" value={item.annualCtc} onChange={(e) => updateItem(index, "annualCtc", e.target.value)} /></label>
              <label><span>Recruitment fee %</span><input type="number" min="0" step="0.01" value={item.feePercent} onChange={(e) => updateItem(index, "feePercent", e.target.value)} /></label>
              <label><span>Taxable amount (optional override)</span><input type="number" min="0" value={item.taxableAmount} onChange={(e) => updateItem(index, "taxableAmount", e.target.value)} placeholder={itemTaxable(item) ? itemTaxable(item).toFixed(2) : "Auto from CTC and fee"} /></label>
              <label><span>Service</span><input value={item.serviceDescription} onChange={(e) => updateItem(index, "serviceDescription", e.target.value)} /></label>
              <label><span>HSN/SAC</span><input value={item.hsnSac} onChange={(e) => updateItem(index, "hsnSac", e.target.value)} /></label>
            </div>
          </div>)}
        </div>
        <div className="invoice-total-preview"><span>Taxable amount</span><strong>Rs. {computedTaxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div className="button-row">
          <button className="ghost-btn" disabled={working} onClick={() => { setReviewed(true); void generate("download"); }}>{working ? "Generating..." : "Review PDF"}</button>
          <button disabled={working || !reviewed} onClick={() => void generate("finalize")}>{working ? "Saving..." : editingInvoice ? "Save corrected invoice" : "Finalize, Save & Download"}</button>
          {editingInvoice ? <button className="ghost-btn" disabled={working} onClick={onCancelEdit}>Cancel edit</button> : null}
        </div>
      </div>
      {status.text ? <div className={`status ${status.kind || ""}`}>{status.text}</div> : null}
    </div>
  );
}
