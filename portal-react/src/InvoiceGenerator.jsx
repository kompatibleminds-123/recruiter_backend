import React, { useEffect, useMemo, useState } from "react";

const EMPTY_PROFILE = {
  legalName: "", tradeName: "", address: "", cin: "", pan: "", gstin: "", state: "", stateCode: "",
  bankAccountName: "", bankAccountNumber: "", bankIfsc: "", bankName: "", bankBranch: "",
  defaultHsnSac: "998311", defaultGstRate: 18, logoDataUrl: "", signatureDataUrl: ""
};
const EMPTY_CLIENT = { legalName: "", address: "", gstin: "", state: "", stateCode: "" };

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

export default function InvoiceGenerator({ token, api, clients = [] }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [clientProfiles, setClientProfiles] = useState({});
  const [billingRules, setBillingRules] = useState({});
  const [clientName, setClientName] = useState("");
  const [client, setClient] = useState(EMPTY_CLIENT);
  const [invoice, setInvoice] = useState({
    invoiceNumber: "", invoiceDate: new Date().toISOString().slice(0, 10), candidateName: "",
    serviceDescription: "HR Consulting Services", annualCtc: "", feePercent: "8.33", taxableAmount: "",
    hsnSac: "998311", gstRate: "18", taxMode: "auto", notes: ""
  });
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api("/company/reports/invoice/settings", token)
      .then((result) => {
        if (!active) return;
        const nextProfile = { ...EMPTY_PROFILE, ...(result?.invoiceProfile || {}) };
        setProfile(nextProfile);
        setClientProfiles(result?.invoiceClientProfiles || {});
        setBillingRules(result?.clientBillingRules || {});
        setInvoice((current) => ({
          ...current,
          hsnSac: nextProfile.defaultHsnSac || current.hsnSac,
          gstRate: String(nextProfile.defaultGstRate ?? current.gstRate)
        }));
      })
      .catch((error) => active && setStatus({ text: error.message, kind: "error" }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api, token]);

  const clientOptions = useMemo(() => Array.from(new Set([
    ...clients.map((item) => String(item?.name || item || "").trim()),
    ...Object.keys(clientProfiles)
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b)), [clients, clientProfiles]);

  const computedTaxable = useMemo(() => {
    const manual = Number(String(invoice.taxableAmount || "").replace(/,/g, ""));
    if (manual > 0) return manual;
    const ctc = Number(String(invoice.annualCtc || "").replace(/,/g, ""));
    const fee = Number(invoice.feePercent || 0);
    return ctc > 0 && fee > 0 ? ctc * fee / 100 : 0;
  }, [invoice.annualCtc, invoice.feePercent, invoice.taxableAmount]);

  const selectClient = (name) => {
    setClientName(name);
    setClient({ ...EMPTY_CLIENT, ...(clientProfiles[name] || {}), legalName: clientProfiles[name]?.legalName || name });
    const rule = billingRules[name];
    if (rule?.type === "percentage" && Number(rule.value) > 0) {
      setInvoice((current) => ({ ...current, feePercent: String(rule.value), taxableAmount: "" }));
    } else if (rule?.type === "flat" && Number(rule.value) > 0) {
      setInvoice((current) => ({ ...current, feePercent: "", taxableAmount: String(rule.value) }));
    }
  };
  const updateProfile = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const updateClient = (key, value) => setClient((current) => ({ ...current, [key]: value }));
  const updateInvoice = (key, value) => setInvoice((current) => ({ ...current, [key]: value }));

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
      await saveSettings({ quiet: true });
      const result = await api("/company/reports/invoice/pdf", token, "POST", {
        invoice: { ...invoice, clientName, taxableAmount: computedTaxable }
      });
      const file = dataUrlToFile(`data:${result.mimeType};base64,${result.fileData}`, result.filename || "invoice.pdf");
      if (action === "share" && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `Invoice ${invoice.invoiceNumber}`, files: [file] });
        setStatus({ text: "Invoice shared.", kind: "success" });
      } else {
        downloadFile(file);
        setStatus({ text: action === "share" ? "Direct sharing is not supported here, so the PDF was downloaded for sharing." : "Invoice PDF downloaded.", kind: "success" });
      }
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
        <h3>Create invoice</h3>
        <div className="form-grid three-col">
          <label><span>Client *</span><select value={clientName} onChange={(e) => selectClient(e.target.value)}><option value="">Select client</option>{clientOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>Invoice number *</span><input value={invoice.invoiceNumber} onChange={(e) => updateInvoice("invoiceNumber", e.target.value)} placeholder="KM/26-27/00021" /></label>
          <label><span>Invoice date *</span><input type="date" value={invoice.invoiceDate} onChange={(e) => updateInvoice("invoiceDate", e.target.value)} /></label>
          <label><span>Client legal name</span><input value={client.legalName} onChange={(e) => updateClient("legalName", e.target.value)} /></label>
          <label><span>Client GSTIN</span><input value={client.gstin} onChange={(e) => updateClient("gstin", e.target.value.toUpperCase())} /></label>
          <label><span>Client state</span><input value={client.state} onChange={(e) => updateClient("state", e.target.value)} /></label>
          <label><span>Client state code</span><input value={client.stateCode} onChange={(e) => updateClient("stateCode", e.target.value)} placeholder="e.g. 29" /></label>
          <label className="span-all"><span>Client billing address *</span><textarea rows="3" value={client.address} onChange={(e) => updateClient("address", e.target.value)} /></label>
          <label><span>Candidate / reference *</span><input value={invoice.candidateName} onChange={(e) => updateInvoice("candidateName", e.target.value)} /></label>
          <label><span>Annual CTC (Rs.)</span><input type="number" min="0" value={invoice.annualCtc} onChange={(e) => updateInvoice("annualCtc", e.target.value)} /></label>
          <label><span>Recruitment fee %</span><input type="number" min="0" step="0.01" value={invoice.feePercent} onChange={(e) => updateInvoice("feePercent", e.target.value)} /></label>
          <label><span>Taxable amount (optional override)</span><input type="number" min="0" value={invoice.taxableAmount} onChange={(e) => updateInvoice("taxableAmount", e.target.value)} placeholder={computedTaxable ? computedTaxable.toFixed(2) : "Auto from CTC and fee"} /></label>
          <label><span>GST rate %</span><input type="number" min="0" value={invoice.gstRate} onChange={(e) => updateInvoice("gstRate", e.target.value)} /></label>
          <label><span>Tax type</span><select value={invoice.taxMode} onChange={(e) => updateInvoice("taxMode", e.target.value)}><option value="auto">Auto from state codes</option><option value="igst">IGST</option><option value="cgst_sgst">CGST + SGST</option><option value="none">No GST</option></select></label>
          <label className="span-all"><span>Notes / payment terms</span><textarea rows="2" value={invoice.notes} onChange={(e) => updateInvoice("notes", e.target.value)} /></label>
        </div>
        <div className="invoice-total-preview"><span>Taxable amount</span><strong>Rs. {computedTaxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div className="button-row">
          <button disabled={working} onClick={() => void generate("download")}>{working ? "Generating..." : "Generate & Download PDF"}</button>
          <button className="ghost-btn" disabled={working} onClick={() => void generate("share")}>Share invoice</button>
        </div>
      </div>
      {status.text ? <div className={`status ${status.kind || ""}`}>{status.text}</div> : null}
    </div>
  );
}
