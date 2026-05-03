import { useState } from "react";

export default function usePayrollSettingsState({ viewMode = "all" } = {}) {
  const [settings, setSettings] = useState({
    payrollEnabled: false,
    defaultFbpProofCycle: "quarterly",
    defaultMonthlyProfessionalTax: 0,
    applyLopProration: true,
    prorateHealthInsurance: false,
    prorateReimbursements: false,
    gratuityOnFullMonthlyBasic: false,
    lwfEnabled: true,
    lwfEmployeeRatePercent: 0.2,
    lwfEmployeeMonthlyCap: 34,
    lwfEmployerMultiplier: 2,
    defaultSalaryTemplateCode: "c2h_it_standard",
    policyNote: ""
  });
  const [compItems, setCompItems] = useState([]);
  const [salaryTemplates, setSalaryTemplates] = useState([]);
  const [compForm, setCompForm] = useState({
    employeeId: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    annualCtc: "",
    monthlyCtc: "",
    basicMonthly: "",
    hraMonthly: "",
    fbpMonthly: "",
    specialAllowanceMonthly: "",
    employerPfMonthly: "",
    employeePfMonthly: "",
    employerEsiMonthly: "",
    employeeEsiMonthly: "",
    employerLwfMonthly: "",
    employeeLwfMonthly: "",
    professionalTaxMonthly: "",
    gratuityMonthly: "",
    healthInsuranceMonthly: "",
    otherAllowanceMonthly: "",
    templateCode: "c2h_it_standard",
    isActive: true,
    notes: ""
  });
  const [templateForm, setTemplateForm] = useState({
    id: "",
    code: "",
    name: "",
    description: "",
    basicPercentOfCtc: 35,
    hraPercentOfBasic: 50,
    employerPfPercentOfBasic: 12,
    employeePfPercentOfBasic: 12,
    employerEsiPercentOfGross: 3.25,
    employeeEsiPercentOfGross: 0.75,
    employerLwfMonthly: 20,
    employeeLwfMonthly: 10,
    professionalTaxMonthly: 200,
    gratuityPercentOfBasicAnnual: 4.81,
    defaultFbpMonthly: 0,
    defaultHealthInsuranceAnnual: 0,
    active: true
  });
  const [accessControl, setAccessControl] = useState({
    payrollLiteEnabled: false,
    ownerAdminUserId: "",
    payrollAuthorizedUserIds: [],
    payrollApproverUserIds: [],
    payrollAccessManagerUserIds: []
  });

  const showFoundation = viewMode === "all" || viewMode === "statutory";
  const showAccessControl = viewMode === "all" || viewMode === "statutory";
  const showTemplates = viewMode === "all" || viewMode === "salary";
  const showCompensation = viewMode === "all" || viewMode === "employees" || viewMode === "salary";

  return {
    settings, setSettings,
    compItems, setCompItems,
    salaryTemplates, setSalaryTemplates,
    compForm, setCompForm,
    templateForm, setTemplateForm,
    accessControl, setAccessControl,
    showFoundation, showAccessControl, showTemplates, showCompensation
  };
}
