import React from "react";

export default function PayrollCompensationSection({ visible = true, kicker = "Compensation", title = "Compensation", children = null }) {
  if (!visible) return null;
  return (
    <section className="panel">
      <div className="section-kicker">{kicker}</div>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
