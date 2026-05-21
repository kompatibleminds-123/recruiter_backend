(function () {
  const $ = (id) => document.getElementById(id);
  function readSlug() {
    const parts = String(window.location.pathname || "").split("/").filter(Boolean);
    if (parts[0] === "jobs" && parts[1] === "company" && parts[2]) return decodeURIComponent(parts[2]);
    return String(new URLSearchParams(window.location.search).get("slug") || "").trim();
  }
  async function readJson(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, error: text || `HTTP ${response.status}` };
    }
  }
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  async function init() {
    const slug = readSlug();
    const status = $("jobsStatus");
    const list = $("jobsList");
    if (!slug) {
      status.textContent = "Missing company slug.";
      return;
    }
    status.textContent = "Loading jobs...";
    try {
      const response = await fetch(`/public/company-jobs/${encodeURIComponent(slug)}`);
      const data = await readJson(response);
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Could not load jobs.");
      const result = data.result || {};
      const pageTitle = String(result.pageTitle || "").trim();
      const pageSubtitle = String(result.pageSubtitle || "").trim();
      $("jobsTitle").textContent = pageTitle || `${result.companyName || "Company"} Jobs`;
      $("jobsSubtitle").textContent = pageSubtitle || "Active openings";
      const jobs = Array.isArray(result.jobs) ? result.jobs : [];
      status.textContent = jobs.length ? `${jobs.length} active roles` : "No active jobs right now.";
      list.innerHTML = jobs.map((job) => `
        <article class="job-card">
          <h3>${escapeHtml(job.title)}</h3>
          <div class="job-meta">
            ${job.clientName ? `<span class="chip">${escapeHtml(job.clientName)}</span>` : ""}
            ${job.location ? `<span class="chip">${escapeHtml(job.location)}</span>` : ""}
            ${job.workMode ? `<span class="chip">${escapeHtml(job.workMode)}</span>` : ""}
          </div>
          <div class="job-actions"><a href="${escapeHtml(job.applyLink)}" target="_blank" rel="noopener noreferrer">Apply now</a></div>
        </article>
      `).join("");
    } catch (error) {
      status.textContent = String(error?.message || error);
    }
  }
  init();
})();
