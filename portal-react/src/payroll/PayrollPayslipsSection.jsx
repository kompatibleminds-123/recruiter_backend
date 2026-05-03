import React from "react";

export default function PayrollPayslipsSection({ visible = true, kicker = "Payslips", title = "Payslips", children = null }) {
  if (!visible) return null;
  return (
    <section className="panel">
      <div className="section-kicker">{kicker}</div>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
