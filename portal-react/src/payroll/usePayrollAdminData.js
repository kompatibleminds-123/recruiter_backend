import { useEffect, useMemo } from "react";
import usePayrollSettingsState from "./usePayrollSettingsState";
import usePayrollRunsState from "./usePayrollRunsState";
import usePayrollFbpState from "./usePayrollFbpState";

export default function usePayrollAdminData({ token, employees = [], users = [], viewMode = "all", api }) {
  function round2(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  function calculateCompFromTemplate({ annualCtc, templateConfig = {} }) {
    const annual = Math.max(0, Number(annualCtc || 0));
    const monthlyCtc = round2(annual / 12);
    const basicPct = Number(templateConfig.basic_percent_of_ctc ?? 35);
    const hraPctBasic = Number(templateConfig.hra_percent_of_basic ?? 50);
    const employerPfPctBasic = Number(templateConfig.employer_pf_percent_of_basic ?? 12);
    const employeePfPctBasic = Number(templateConfig.employee_pf_percent_of_basic ?? 12);
    const gratuityPctBasicAnnual = Number(templateConfig.gratuity_percent_of_basic_annual ?? 4.81);
    const fbpMonthly = Number(templateConfig.default_fbp_monthly ?? 0);
    const healthAnnual = Number(templateConfig.default_health_insurance_annual ?? 0);
    const employeeEsiPctGross = Number(templateConfig.employee_esi_percent_of_gross ?? 0.75);
    const employerEsiPctGross = Number(templateConfig.employer_esi_percent_of_gross ?? 3.25);
    const esiGrossThreshold = Number(templateConfig.esi_gross_threshold ?? 21000);
    const employeeLwfMonthly = Number(templateConfig.employee_lwf_monthly ?? 10);
    const employerLwfMonthly = Number(templateConfig.employer_lwf_monthly ?? 20);
    const professionalTaxMonthly = Number(templateConfig.professional_tax_monthly ?? 200);

    const basicMonthly = round2(monthlyCtc * (basicPct / 100));
    const hraMonthly = round2(basicMonthly * (hraPctBasic / 100));
    const employerPfMonthly = round2(basicMonthly * (employerPfPctBasic / 100));
    const employeePfMonthly = round2(basicMonthly * (employeePfPctBasic / 100));
    const gratuityMonthly = round2((basicMonthly * 12 * (gratuityPctBasicAnnual / 100)) / 12);
    const healthInsuranceMonthly = round2(healthAnnual / 12);
    const fixedEmployerCost = round2(employerPfMonthly + gratuityMonthly + healthInsuranceMonthly + employerLwfMonthly);
    const grossWithoutEsi = round2(Math.max(0, monthlyCtc - fixedEmployerCost));
    let specialAllowanceMonthly = round2(
      Math.max(0, grossWithoutEsi - basicMonthly - hraMonthly - fbpMonthly)
    );
    let provisionalGross = Math.max(0, round2(basicMonthly + hraMonthly + fbpMonthly + specialAllowanceMonthly));
    let esiApplicable = provisionalGross <= esiGrossThreshold;
    let employerEsiMonthly = esiApplicable ? round2(provisionalGross * (employerEsiPctGross / 100)) : 0;
    let employeeEsiMonthly = esiApplicable ? round2(provisionalGross * (employeeEsiPctGross / 100)) : 0;
    if (esiApplicable && employerEsiMonthly > 0) {
      const grossWithEsi = round2(Math.max(0, monthlyCtc - fixedEmployerCost - employerEsiMonthly));
      specialAllowanceMonthly = round2(Math.max(0, grossWithEsi - basicMonthly - hraMonthly - fbpMonthly));
      provisionalGross = Math.max(0, round2(basicMonthly + hraMonthly + fbpMonthly + specialAllowanceMonthly));
      esiApplicable = provisionalGross <= esiGrossThreshold;
      employerEsiMonthly = esiApplicable ? round2(provisionalGross * (employerEsiPctGross / 100)) : 0;
      employeeEsiMonthly = esiApplicable ? round2(provisionalGross * (employeeEsiPctGross / 100)) : 0;
    }

    return {
      monthlyCtc,
      basicMonthly,
      hraMonthly,
      fbpMonthly,
      specialAllowanceMonthly: Math.max(0, specialAllowanceMonthly),
      employerPfMonthly,
      employeePfMonthly,
      employerEsiMonthly,
      employeeEsiMonthly,
      employerLwfMonthly,
      employeeLwfMonthly,
      professionalTaxMonthly,
      gratuityMonthly,
      healthInsuranceMonthly,
      otherAllowanceMonthly: 0
    };
  }
  function rebalanceSpecialAllowance(formState) {
    const monthlyCtc = round2(Number(formState?.monthlyCtc || 0));
    const basic = round2(Number(formState?.basicMonthly || 0));
    const hra = round2(Number(formState?.hraMonthly || 0));
    const fbp = round2(Number(formState?.fbpMonthly || 0));
    const otherAllowance = round2(Number(formState?.otherAllowanceMonthly || 0));
    const employerPf = round2(Number(formState?.employerPfMonthly || 0));
    const employerEsi = round2(Number(formState?.employerEsiMonthly || 0));
    const employerLwf = round2(Number(formState?.employerLwfMonthly || 0));
    const gratuity = round2(Number(formState?.gratuityMonthly || 0));
    const health = round2(Number(formState?.healthInsuranceMonthly || 0));
    if (monthlyCtc <= 0) return formState;
    const targetGross = round2(Math.max(0, monthlyCtc - employerPf - employerEsi - employerLwf - gratuity - health));
    const special = round2(Math.max(0, targetGross - basic - hra - fbp - otherAllowance));
    return { ...formState, specialAllowanceMonthly: special };
  }
  function updateCompField(key, value, options = {}) {
    const { rebalance = false } = options;
    setCompForm((current) => {
      const next = { ...current, [key]: value };
      return rebalance ? rebalanceSpecialAllowance(next) : next;
    });
  }

  const {
    settings, setSettings,
    compItems, setCompItems,
    salaryTemplates, setSalaryTemplates,
    compForm, setCompForm,
    templateForm, setTemplateForm,
    accessControl, setAccessControl,
    showFoundation, showAccessControl, showTemplates, showCompensation
  } = usePayrollSettingsState({ viewMode });
  const {
    payrollMonth, setPayrollMonth,
    payrollYear, setPayrollYear,
    payrollInputs, setPayrollInputs,
    payrollRuns, setPayrollRuns,
    selectedRunId, setSelectedRunId,
    selectedRunDetail, setSelectedRunDetail,
    runActionStatus, setRunActionStatus,
    status, setStatus,
    suggestRecalculateAfterFbp, setSuggestRecalculateAfterFbp,
    showInputs, showRuns
  } = usePayrollRunsState({ viewMode });
  const {
    fbpHeads, setFbpHeads,
    fbpDeclarations, setFbpDeclarations,
    fbpApprovalAmounts, setFbpApprovalAmounts,
    payrollPayslips, setPayrollPayslips,
    fbpForm, setFbpForm,
    declarationForm, setDeclarationForm,
    declarationDocUploading, setDeclarationDocUploading,
    showFbpHeads, showFbpClaims, showPayslips
  } = usePayrollFbpState({ viewMode });

  async function loadPayrollFoundation() {
    const [settingsResult, compResult, fbpResult, templateResult] = await Promise.all([
      api("/company/payroll/settings", token).catch(() => null),
      api("/company/payroll/compensation", token).catch(() => ({ items: [] })),
      api("/company/payroll/fbp-heads", token).catch(() => ({ items: [] })),
      api("/company/payroll/templates", token).catch(() => ({ items: [] }))
    ]);
    if (settingsResult) setSettings((current) => ({ ...current, ...settingsResult }));
    setCompItems(Array.isArray(compResult?.items) ? compResult.items : []);
    setFbpHeads(Array.isArray(fbpResult?.items) ? fbpResult.items : []);
    setSalaryTemplates(Array.isArray(templateResult?.items) ? templateResult.items : []);
  }
  async function loadPayrollExecutionData(nextMonth = payrollMonth, nextYear = payrollYear) {
    const [inputResult, runResult, declarationResult, payslipResult] = await Promise.all([
      api(`/company/payroll/inputs?payrollMonth=${Number(nextMonth)}&payrollYear=${Number(nextYear)}`, token).catch(() => ({ items: [] })),
      api("/company/payroll/runs", token).catch(() => ({ items: [] })),
      api("/company/payroll/fbp-declarations", token).catch(() => ({ items: [] })),
      api("/company/payroll/payslips", token).catch(() => ({ items: [] }))
    ]);
    setPayrollInputs(Array.isArray(inputResult?.items) ? inputResult.items : []);
    const runs = Array.isArray(runResult?.items) ? runResult.items : [];
    setPayrollRuns(runs);
    setFbpDeclarations(Array.isArray(declarationResult?.items) ? declarationResult.items : []);
    setPayrollPayslips(Array.isArray(payslipResult?.items) ? payslipResult.items : []);
    if (!selectedRunId && runs[0]?.id) setSelectedRunId(runs[0].id);
  }

  useEffect(() => {
    void loadPayrollFoundation().catch((error) => setStatus(String(error?.message || error)));
  }, [token]);
  useEffect(() => {
    void loadPayrollExecutionData().catch((error) => setStatus(String(error?.message || error)));
  }, [token, payrollMonth, payrollYear]);
  useEffect(() => {
    if (!selectedRunId) return;
    void api(`/company/payroll/runs?runId=${encodeURIComponent(selectedRunId)}`, token)
      .then((detail) => setSelectedRunDetail(detail || { run: null, items: [] }))
      .catch((error) => setStatus(String(error?.message || error)));
  }, [selectedRunId, token]);

  async function saveSettings() {
    try {
      setStatus("Saving payroll settings...");
      await api("/company/payroll/settings", token, "POST", settings);
      setStatus("Payroll settings saved.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  async function savePayrollAccessControl() {}

  async function saveComp() {
    try {
      setStatus("Saving compensation...");
      await api("/company/payroll/compensation", token, "POST", {
        ...compForm,
        annualCtc: Number(compForm.annualCtc || 0),
        monthlyCtc: Number(compForm.monthlyCtc || 0),
        basicMonthly: Number(compForm.basicMonthly || 0),
        basicAnnual: Number(compForm.basicMonthly || 0) * 12,
        hraMonthly: Number(compForm.hraMonthly || 0),
        hraAnnual: Number(compForm.hraMonthly || 0) * 12,
        fbpMonthly: Number(compForm.fbpMonthly || 0),
        fbpAnnual: Number(compForm.fbpMonthly || 0) * 12,
        specialAllowanceMonthly: Number(compForm.specialAllowanceMonthly || 0),
        specialAllowanceAnnual: Number(compForm.specialAllowanceMonthly || 0) * 12,
        employerPfMonthly: Number(compForm.employerPfMonthly || 0),
        employerPfAnnual: Number(compForm.employerPfMonthly || 0) * 12,
        employeePfMonthly: Number(compForm.employeePfMonthly || 0),
        employeePfAnnual: Number(compForm.employeePfMonthly || 0) * 12,
        employerEsiMonthly: Number(compForm.employerEsiMonthly || 0),
        employerEsiAnnual: Number(compForm.employerEsiMonthly || 0) * 12,
        employeeEsiMonthly: Number(compForm.employeeEsiMonthly || 0),
        employeeEsiAnnual: Number(compForm.employeeEsiMonthly || 0) * 12,
        employerLwfMonthly: Number(compForm.employerLwfMonthly || 0),
        employerLwfAnnual: Number(compForm.employerLwfMonthly || 0) * 12,
        employeeLwfMonthly: Number(compForm.employeeLwfMonthly || 0),
        employeeLwfAnnual: Number(compForm.employeeLwfMonthly || 0) * 12,
        professionalTaxMonthly: Number(compForm.professionalTaxMonthly || 0),
        professionalTaxAnnual: Number(compForm.professionalTaxMonthly || 0) * 12,
        gratuityMonthly: Number(compForm.gratuityMonthly || 0),
        gratuityAnnual: Number(compForm.gratuityMonthly || 0) * 12,
        healthInsuranceMonthly: Number(compForm.healthInsuranceMonthly || 0),
        healthInsuranceAnnual: Number(compForm.healthInsuranceMonthly || 0) * 12,
        otherAllowanceMonthly: Number(compForm.otherAllowanceMonthly || 0)
        ,otherAllowanceAnnual: Number(compForm.otherAllowanceMonthly || 0) * 12
      });
      await loadPayrollFoundation();
      setStatus("Compensation saved.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  function autoFillCompensation(templateCode, annualCtcValue) {
    const annualCtc = Number(annualCtcValue || 0);
    const template = salaryTemplates.find((item) => item.code === templateCode);
    if (!template || !annualCtc || templateCode === "custom") return;
    const auto = calculateCompFromTemplate({ annualCtc, templateConfig: template.config || {} });
    setCompForm((c) => ({
      ...c,
      templateCode,
      annualCtc,
      monthlyCtc: auto.monthlyCtc,
      basicMonthly: auto.basicMonthly,
      hraMonthly: auto.hraMonthly,
      fbpMonthly: auto.fbpMonthly,
      specialAllowanceMonthly: auto.specialAllowanceMonthly,
      employerPfMonthly: auto.employerPfMonthly,
      employeePfMonthly: auto.employeePfMonthly,
      employerEsiMonthly: auto.employerEsiMonthly,
      employeeEsiMonthly: auto.employeeEsiMonthly,
      employerLwfMonthly: auto.employerLwfMonthly,
      employeeLwfMonthly: auto.employeeLwfMonthly,
      professionalTaxMonthly: auto.professionalTaxMonthly,
      gratuityMonthly: auto.gratuityMonthly,
      healthInsuranceMonthly: auto.healthInsuranceMonthly,
      otherAllowanceMonthly: auto.otherAllowanceMonthly
    }));
  }

  async function saveFbpHead() {
    try {
      setStatus("Saving FBP head...");
      await api("/company/payroll/fbp-heads", token, "POST", {
        ...fbpForm,
        monthlyLimit: Number(fbpForm.monthlyLimit || 0),
        annualLimit: Number(fbpForm.annualLimit || 0)
      });
      setFbpForm({ id: "", headName: "", monthlyLimit: "", annualLimit: "", proofRequired: true, taxableIfUnclaimed: true, active: true });
      await loadPayrollFoundation();
      setStatus("FBP head saved.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  async function saveTemplate() {
    try {
      setStatus("Saving salary template...");
      await api("/company/payroll/templates", token, "POST", {
        id: templateForm.id || undefined,
        code: templateForm.code,
        name: templateForm.name,
        description: templateForm.description,
        active: templateForm.active,
        config: {
          basic_percent_of_ctc: Number(templateForm.basicPercentOfCtc || 0),
          hra_percent_of_basic: Number(templateForm.hraPercentOfBasic || 0),
          employer_pf_percent_of_basic: Number(templateForm.employerPfPercentOfBasic || 0),
          employee_pf_percent_of_basic: Number(templateForm.employeePfPercentOfBasic || 0),
          employer_esi_percent_of_gross: Number(templateForm.employerEsiPercentOfGross || 0),
          employee_esi_percent_of_gross: Number(templateForm.employeeEsiPercentOfGross || 0),
          employer_lwf_monthly: Number(templateForm.employerLwfMonthly || 0),
          employee_lwf_monthly: Number(templateForm.employeeLwfMonthly || 0),
          professional_tax_monthly: Number(templateForm.professionalTaxMonthly || 0),
          gratuity_percent_of_basic_annual: Number(templateForm.gratuityPercentOfBasicAnnual || 0),
          default_fbp_monthly: Number(templateForm.defaultFbpMonthly || 0),
          default_health_insurance_annual: Number(templateForm.defaultHealthInsuranceAnnual || 0)
        }
      });
      setTemplateForm({
        id: "", code: "", name: "", description: "",
        basicPercentOfCtc: 35, hraPercentOfBasic: 50, employerPfPercentOfBasic: 12, employeePfPercentOfBasic: 12,
        employerEsiPercentOfGross: 3.25, employeeEsiPercentOfGross: 0.75, employerLwfMonthly: 20, employeeLwfMonthly: 10, professionalTaxMonthly: 200,
        gratuityPercentOfBasicAnnual: 4.81, defaultFbpMonthly: 0, defaultHealthInsuranceAnnual: 0, active: true
      });
      await loadPayrollFoundation();
      setStatus("Salary template saved.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  async function saveCompanyFbpHeadDeactivate(headId) {
    try {
      const row = fbpHeads.find((item) => item.id === headId);
      if (!row) return;
      setStatus("Updating FBP head...");
      await api("/company/payroll/fbp-heads", token, "POST", {
        ...row,
        active: false
      });
      await loadPayrollFoundation();
      setStatus("FBP head deactivated.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  const inputByEmployee = useMemo(() => {
    const map = new Map();
    (payrollInputs || []).forEach((item) => map.set(String(item.employeeId || ""), item));
    return map;
  }, [payrollInputs]);
  const userNameById = useMemo(() => {
    const map = new Map();
    (users || []).forEach((u) => {
      const id = String(u?.id || "").trim();
      if (!id) return;
      map.set(id, String(u?.name || u?.email || "").trim() || id);
    });
    return map;
  }, [users]);
  const adminUsers = useMemo(
    () => (users || []).filter((u) => String(u?.role || "").toLowerCase() === "admin"),
    [users]
  );
  const toggleAccessId = (key, userId, checked) => {
    const safeId = String(userId || "").trim();
    if (!safeId) return;
    setAccessControl((current) => {
      const set = new Set((Array.isArray(current[key]) ? current[key] : []).map((id) => String(id || "").trim()).filter(Boolean));
      if (checked) set.add(safeId); else set.delete(safeId);
      return { ...current, [key]: Array.from(set) };
    });
  };
  async function savePayrollInputRow(employeeId) {
    try {
      const existing = inputByEmployee.get(String(employeeId || "")) || {};
      setStatus("Saving payroll input...");
      await api("/company/payroll/inputs", token, "POST", {
        ...existing,
        employeeId,
        payrollMonth,
        payrollYear
      });
      if (selectedRunId) {
        // Keep the currently selected run totals in sync with latest input edits.
        await api("/company/payroll/runs/calculate", token, "POST", { payrollRunId: selectedRunId });
      }
      await loadPayrollExecutionData(payrollMonth, payrollYear);
      if (selectedRunId) {
        const detail = await api(`/company/payroll/runs?runId=${encodeURIComponent(selectedRunId)}`, token).catch(() => null);
        if (detail) setSelectedRunDetail(detail);
      }
      setStatus("Payroll input saved.");
      setRunActionStatus(selectedRunId ? "Inputs saved and selected run recalculated." : "Inputs saved.");
    } catch (error) {
      setStatus(String(error?.message || error));
      setRunActionStatus("");
    }
  }
  function setInputField(employeeId, key, value) {
    const current = inputByEmployee.get(String(employeeId || "")) || {
      employeeId,
      payrollMonth,
      payrollYear,
      totalCalendarDays: 30,
      workingDays: 22,
      payableDays: 30,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      absentDays: 0,
      holidays: 0,
      overtimeAmount: 0,
      arrearsAmount: 0,
      bonusAmount: 0,
      otherEarnings: 0,
      otherDeductions: 0,
      professionalTax: 0,
      tdsAmount: 0,
      approvedReimbursements: 0,
      remarks: ""
    };
    const next = { ...current, [key]: value };
    const total = Math.max(1, Number(next.totalCalendarDays || 0) || 1);
    const unpaid = Math.max(0, Number(next.unpaidLeaveDays || 0) || 0);
    if (key === "unpaidLeaveDays" || key === "totalCalendarDays") {
      next.payableDays = Math.max(0, Math.min(Number(next.payableDays || total), total - unpaid));
    }
    setPayrollInputs((list) => {
      const rest = (list || []).filter((item) => String(item.employeeId || "") !== String(employeeId || ""));
      return [...rest, next];
    });
  }
  async function createRunDraft() {
    try {
      setStatus("Creating payroll run draft...");
      setRunActionStatus("Creating draft...");
      await api("/company/payroll/runs/draft", token, "POST", { payrollMonth, payrollYear });
      await loadPayrollExecutionData(payrollMonth, payrollYear);
      setStatus("Payroll run draft created.");
      setRunActionStatus("Draft created.");
    } catch (error) {
      setStatus(String(error?.message || error));
      setRunActionStatus("");
    }
  }
  async function runAction(action) {
    try {
      if (!selectedRunId) throw new Error("Select a payroll run first.");
      const endpoint = action === "calculate"
        ? "/company/payroll/runs/calculate"
        : action === "approve"
          ? "/company/payroll/runs/approve"
          : "/company/payroll/runs/lock";
      setStatus(`Running ${action}...`);
      setRunActionStatus(`Running ${action}...`);
      await api(endpoint, token, "POST", { payrollRunId: selectedRunId, reason: action === "lock" ? "Locked by admin action" : "" });
      await loadPayrollExecutionData(payrollMonth, payrollYear);
      const detail = await api(`/company/payroll/runs?runId=${encodeURIComponent(selectedRunId)}`, token);
      setSelectedRunDetail(detail || { run: null, items: [] });
      setStatus(`Payroll run ${action} complete.`);
      setRunActionStatus(`Payroll run ${action} complete.`);
    } catch (error) {
      setStatus(String(error?.message || error));
      setRunActionStatus("");
    }
  }
  async function rollbackRunToCalculated() {
    try {
      if (!selectedRunId) throw new Error("Select a payroll run first.");
      setRunActionStatus("Reverting run to calculated...");
      await api("/company/payroll/runs/set-status", token, "POST", {
        payrollRunId: selectedRunId,
        status: "calculated",
        reason: "Manual rollback by admin"
      });
      await loadPayrollExecutionData(payrollMonth, payrollYear);
      const detail = await api(`/company/payroll/runs?runId=${encodeURIComponent(selectedRunId)}`, token).catch(() => null);
      if (detail) setSelectedRunDetail(detail);
      setRunActionStatus("Run moved back to calculated.");
    } catch (error) {
      setStatus(String(error?.message || error));
      setRunActionStatus("");
    }
  }
  async function deleteSelectedRun() {
    try {
      if (!selectedRunId) throw new Error("Select a payroll run first.");
      const ok = typeof window === "undefined" ? true : window.confirm("Delete selected payroll run? This cannot be undone.");
      if (!ok) return;
      setStatus("Deleting payroll run...");
      await api("/company/payroll/runs/delete", token, "POST", { payrollRunId: selectedRunId });
      await loadPayrollExecutionData(payrollMonth, payrollYear);
      setSelectedRunDetail({ run: null, items: [] });
      setSelectedRunId("");
      setRunActionStatus("Payroll run deleted.");
      setStatus("Payroll run deleted.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  async function submitFbpDeclaration() {
    try {
      const employeeId = String(declarationForm.employeeId || "").trim();
      if (!employeeId) throw new Error("Select employee.");
      const selectedHead = (fbpHeads || []).find((item) => String(item.id || "") === String(declarationForm.headId || "")) || null;
      const headName = selectedHead?.headName || String(declarationForm.headId || "").trim();
      if (!headName) throw new Error("Select FBP head.");
      const docs = String(declarationForm.docUrl || "").trim()
        ? [{
          label: String(declarationForm.docLabel || "Document").trim() || "Document",
          url: String(declarationForm.docUrl || "").trim(),
          note: String(declarationForm.docNote || "").trim()
        }]
        : [];
      await api("/company/payroll/fbp-declarations", token, "POST", {
        employeeId,
        payrollMonth,
        payrollYear,
        headId: String(selectedHead?.id || "").trim(),
        headName,
        declaredAmount: Number(declarationForm.declaredAmount || 0) || 0,
        notes: String(declarationForm.notes || "").trim(),
        docs
      });
      await loadPayrollExecutionData(payrollMonth, payrollYear);
      setDeclarationForm((current) => ({ ...current, declaredAmount: "", notes: "", docLabel: "", docUrl: "", docNote: "" }));
      setStatus("FBP declaration submitted.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  async function uploadDeclarationDoc(file) {
    try {
      if (!file) return;
      setDeclarationDocUploading(true);
      setStatus("Uploading FBP proof document...");
      const fileData = await fileToBase64(file);
      if (!fileData) throw new Error("Unable to read file data.");
      const result = await api("/company/payroll/fbp-doc/upload", token, "POST", {
        file: {
          filename: file.name || "fbp-proof.bin",
          mimeType: file.type || "application/octet-stream",
          fileData
        }
      });
      setDeclarationForm((current) => ({
        ...current,
        docLabel: current.docLabel || String(result?.filename || file.name || "Document"),
        docUrl: String(result?.url || "").trim()
      }));
      setStatus("FBP proof uploaded.");
    } catch (error) {
      setStatus(String(error?.message || error));
    } finally {
      setDeclarationDocUploading(false);
    }
  }
  async function reviewDeclaration(id, action) {
    try {
      const item = (fbpDeclarations || []).find((row) => String(row.id || "") === String(id || ""));
      if (!item) throw new Error("Declaration not found.");
      if (action === "approve") {
        const overrideAmountRaw = fbpApprovalAmounts[String(id || "")];
        const overrideAmount = overrideAmountRaw == null || overrideAmountRaw === ""
          ? Number(item.declaredAmount || 0) || 0
          : Number(overrideAmountRaw || 0) || 0;
        await api("/company/payroll/fbp-declarations/approve", token, "POST", {
          declarationId: id,
          approvedAmount: overrideAmount
        });
      } else {
        const rejectionReason = typeof window !== "undefined" ? (window.prompt("Rejection reason", "Insufficient proof") || "").trim() : "Rejected";
        if (!rejectionReason) throw new Error("Rejection reason required.");
        await api("/company/payroll/fbp-declarations/reject", token, "POST", {
          declarationId: id,
          rejectionReason
        });
      }
      await loadPayrollExecutionData(payrollMonth, payrollYear);
      setFbpApprovalAmounts((current) => {
        const next = { ...current };
        delete next[String(id || "")];
        return next;
      });
      setSuggestRecalculateAfterFbp(Boolean(selectedRunId));
      setStatus(`Declaration ${action}d.`);
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  async function publishPayslipsForSelectedRun() {
    try {
      if (!selectedRunId) throw new Error("Select payroll run first.");
      const result = await api("/company/payroll/payslips/publish", token, "POST", {
        payrollRunId: selectedRunId,
        payrollMonth,
        payrollYear
      });
      await loadPayrollExecutionData(payrollMonth, payrollYear);
      if (result?.alreadyPublished) {
        setStatus("Payslips already published for this run. Create a new run version to republish.");
      } else {
        setStatus(`Payslips published (${Number(result?.publishedCount || 0)} employees).`);
      }
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }


  return {
    settings, setSettings, compItems, setCompItems, fbpHeads, setFbpHeads, salaryTemplates, setSalaryTemplates,
    payrollMonth, setPayrollMonth, payrollYear, setPayrollYear, payrollInputs, setPayrollInputs, payrollRuns, setPayrollRuns,
    fbpDeclarations, setFbpDeclarations, fbpApprovalAmounts, setFbpApprovalAmounts, payrollPayslips, setPayrollPayslips,
    selectedRunId, setSelectedRunId, selectedRunDetail, setSelectedRunDetail, runActionStatus, setRunActionStatus, status, setStatus,
    compForm, setCompForm, fbpForm, setFbpForm, templateForm, setTemplateForm, declarationForm, setDeclarationForm,
    declarationDocUploading, setDeclarationDocUploading, suggestRecalculateAfterFbp, setSuggestRecalculateAfterFbp,
    accessControl, setAccessControl, showFoundation, showAccessControl, showTemplates, showCompensation, showInputs, showRuns, showFbpHeads, showFbpClaims, showPayslips,
    loadPayrollFoundation, loadPayrollExecutionData, saveSettings, savePayrollAccessControl, saveComp, autoFillCompensation, saveFbpHead, saveTemplate, saveCompanyFbpHeadDeactivate,
    inputByEmployee, userNameById, savePayrollInputRow, setInputField, createRunDraft, runAction, rollbackRunToCalculated, deleteSelectedRun, submitFbpDeclaration, uploadDeclarationDoc, reviewDeclaration, publishPayslipsForSelectedRun,
    updateCompField
  };
}
