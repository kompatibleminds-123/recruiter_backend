import React from "react";

export default function PayrollRunsSection({ visible = true, kicker = "Payroll Run", title = "Payroll Run", children = null }) {
  if (!visible) return null;
  return (
    <section className="panel">
      <div className="section-kicker">{kicker}</div>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
