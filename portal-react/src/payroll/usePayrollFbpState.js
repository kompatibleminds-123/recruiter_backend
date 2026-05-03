import { useState } from "react";

export default function usePayrollFbpState({ viewMode = "all" } = {}) {
  const [fbpHeads, setFbpHeads] = useState([]);
  const [fbpDeclarations, setFbpDeclarations] = useState([]);
  const [fbpApprovalAmounts, setFbpApprovalAmounts] = useState({});
  const [payrollPayslips, setPayrollPayslips] = useState([]);
  const [fbpForm, setFbpForm] = useState({
    id: "",
    headName: "",
    monthlyLimit: "",
    annualLimit: "",
    proofRequired: true,
    taxableIfUnclaimed: true,
    active: true
  });
  const [declarationForm, setDeclarationForm] = useState({
    employeeId: "",
    headId: "",
    declaredAmount: "",
    notes: "",
    docLabel: "",
    docUrl: "",
    docNote: ""
  });
  const [declarationDocUploading, setDeclarationDocUploading] = useState(false);

  const showFbpHeads = viewMode === "all" || viewMode === "fbp";
  const showFbpClaims = viewMode === "all" || viewMode === "fbp";
  const showPayslips = viewMode === "all" || viewMode === "payslips" || viewMode === "documents";

  return {
    fbpHeads, setFbpHeads,
    fbpDeclarations, setFbpDeclarations,
    fbpApprovalAmounts, setFbpApprovalAmounts,
    payrollPayslips, setPayrollPayslips,
    fbpForm, setFbpForm,
    declarationForm, setDeclarationForm,
    declarationDocUploading, setDeclarationDocUploading,
    showFbpHeads, showFbpClaims, showPayslips
  };
}
