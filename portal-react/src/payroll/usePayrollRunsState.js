import { useState } from "react";

export default function usePayrollRunsState({ viewMode = "all" } = {}) {
  const now = new Date();
  const [payrollMonth, setPayrollMonth] = useState(now.getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(now.getFullYear());
  const [payrollInputs, setPayrollInputs] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState({ run: null, items: [] });
  const [runActionStatus, setRunActionStatus] = useState("");
  const [status, setStatus] = useState("");
  const [suggestRecalculateAfterFbp, setSuggestRecalculateAfterFbp] = useState(false);

  const showInputs = viewMode === "all" || viewMode === "attendance";
  const showRuns = viewMode === "all" || viewMode === "runs" || viewMode === "reports";

  return {
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
  };
}
