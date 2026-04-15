/* global window, document */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([String(text || "")], { type: mimeType || "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildExcelHtmlFromSections({ title, subtitle, sections = [] } = {}) {
  const rowsHtml = [];
  const pushRow = (label, value, opts = {}) => {
    if (opts.isSection) {
      rowsHtml.push(`<tr><th colspan="2" style="border:1px solid #d8dee8;padding:10px 12px;background:#eaf0fb;text-align:left;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(label)}</th></tr>`);
      return;
    }
    rowsHtml.push(
      `<tr>
        <td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;font-weight:700;width:260px;background:#fbfcff;">${escapeHtml(label)}</td>
        <td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;line-height:1.45;">${escapeHtml(String(value || "")).replace(/\n/g, "<br/>")}</td>
      </tr>`
    );
  };

  (sections || []).forEach((section) => {
    if (!section) return;
    pushRow(section.title || "Section", "", { isSection: true });
    (section.rows || []).forEach((row) => {
      if (!row) return;
      pushRow(row.label || "", row.value || "");
    });
  });

  const heading = [
    title ? `<h2 style="margin:0 0 6px;font-family:Calibri,Arial,sans-serif;">${escapeHtml(title)}</h2>` : "",
    subtitle ? `<div style="margin:0 0 12px;color:#4b5563;font-family:Calibri,Arial,sans-serif;">${escapeHtml(subtitle)}</div>` : ""
  ].filter(Boolean).join("");

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Excel.Sheet" />
  <meta name="Generator" content="RecruitDesk AI" />
  <style>
    table { border-collapse: collapse; width: 100%; }
    td, th { font-family: Calibri, Arial, sans-serif; }
  </style>
</head>
<body>
  ${heading}
  <table>
    <tbody>
      ${rowsHtml.join("")}
    </tbody>
  </table>
</body>
</html>`;
}

function buildSectionDom(section) {
  const el = document.createElement("div");
  el.className = "section";
  const header = document.createElement("h2");
  header.textContent = section.title || "Section";
  el.appendChild(header);
  (section.rows || []).forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    const labelEl = document.createElement("div");
    labelEl.className = "label";
    labelEl.textContent = row.label || "";
    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = row.value == null ? "" : String(row.value);
    rowEl.appendChild(labelEl);
    rowEl.appendChild(valueEl);
    el.appendChild(rowEl);
  });
  return el;
}

function safeFilenamePart(value) {
  return String(value || "")
    .trim()
    .slice(0, 80)
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function loadSharedCandidate() {
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const sectionsEl = document.getElementById("sections");
  const cvLink = document.getElementById("cvLink");
  const downloadExcelBtn = document.getElementById("downloadExcel");

  const params = new URLSearchParams(window.location.search || "");
  const token = String(params.get("token") || "").trim();
  if (!token) {
    errorEl.style.display = "block";
    errorEl.textContent = "Missing candidate share token.";
    return;
  }

  try {
    const response = await fetch(`/shared/candidate/data?token=${encodeURIComponent(token)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    const rawText = await response.text();
    let payload = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = { ok: false, error: rawText || `HTTP ${response.status}` };
    }
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    const result = payload.result || payload;
    const profile = result.profile || {};
    const cvShareUrl = String(result.cvShareUrl || "").trim();

    titleEl.textContent = profile.title || "Candidate Profile";
    subtitleEl.textContent = profile.subtitle || "";
    if (profile.statusText) {
      statusEl.style.display = "block";
      statusEl.textContent = profile.statusText;
    }

    if (cvShareUrl) {
      cvLink.style.display = "inline-flex";
      cvLink.href = cvShareUrl;
    }

    sectionsEl.innerHTML = "";
    (profile.sections || []).forEach((section) => {
      sectionsEl.appendChild(buildSectionDom(section));
    });

    downloadExcelBtn.addEventListener("click", () => {
      const today = new Date().toISOString().slice(0, 10);
      const baseName = safeFilenamePart(profile.title) || "candidate";
      const html = buildExcelHtmlFromSections({ title: profile.title, subtitle: profile.subtitle, sections: profile.sections || [] });
      downloadTextFile(`candidate-card-${baseName}-${today}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
    });
  } catch (error) {
    errorEl.style.display = "block";
    errorEl.textContent = String(error?.message || error);
  }
}

loadSharedCandidate();

