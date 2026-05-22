(function () {
  const $ = (id) => document.getElementById(id);
  let allJobs = [];
  let activeJobId = "";
  let boardLogoUrl = "/portal-app/favicon.png";
  let spotlightTimer = null;

  function readSlug() {
    const parts = String(window.location.pathname || "").split("/").filter(Boolean);
    if (parts[0] === "jobs" && parts[1] === "company" && parts[2]) return decodeURIComponent(parts[2]);
    return String(new URLSearchParams(window.location.search).get("slug") || "").trim();
  }

  function readMode() {
    return String(new URLSearchParams(window.location.search).get("mode") || "").trim().toLowerCase() === "client"
      ? "client"
      : "anonymous";
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

  function compactText(value, max = 170) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trim()}...`;
  }

  function jobSearchHay(job) {
    return [
      job.title,
      job.companyLine,
      job.location,
      job.workMode
    ].join(" ").toLowerCase();
  }

  function applyBoardTheme(result) {
    const root = document.documentElement;
    const themeMap = {
      "--brand": result.buttonColor || result.primaryColor,
      "--brand-dark": result.primaryColor || result.buttonColor,
      "--paper": result.backgroundColor,
      "--panel": result.cardBackgroundColor,
      "--ink": result.textColor,
      "--muted": result.mutedTextColor
    };
    Object.entries(themeMap).forEach(([key, value]) => {
      const safe = String(value || "").trim();
      if (/^#[0-9a-f]{3,8}$/i.test(safe)) root.style.setProperty(key, safe);
    });
    const favicon = String(result.faviconDataUrl || result.logoDataUrl || "").trim();
    if (favicon) {
      const node = $("jobsFavicon");
      if (node) node.setAttribute("href", favicon);
    }
  }

  function stopSpotlightRotation() {
    if (spotlightTimer) window.clearInterval(spotlightTimer);
    spotlightTimer = null;
  }

  function startSpotlightRotation(jobs) {
    stopSpotlightRotation();
    const rotatingJobs = (Array.isArray(jobs) ? jobs : []).slice(0, 7);
    if (rotatingJobs.length <= 1) return;
    spotlightTimer = window.setInterval(() => {
      const currentIndex = rotatingJobs.findIndex((job) => String(job.id) === activeJobId);
      const nextJob = rotatingJobs[(currentIndex + 1 + rotatingJobs.length) % rotatingJobs.length] || rotatingJobs[0];
      activeJobId = String(nextJob?.id || "");
      renderJobs({ restartRotation: false });
    }, 5500);
  }

  function renderSpotlight(job) {
    const target = $("jobSpotlight");
    if (!target) return;
    if (!job) {
      target.innerHTML = `
        <div class="spotlight-empty">
          <strong>No job selected</strong>
          <span>Choose a role from the list to preview details.</span>
        </div>
      `;
      return;
    }
    target.innerHTML = `
      <h2>${escapeHtml(job.title)}</h2>
      <div class="job-meta spotlight-meta">
        ${job.workMode ? `<span class="chip">${escapeHtml(job.workMode)}</span>` : ""}
        ${job.location ? `<span class="chip">${escapeHtml(job.location)}</span>` : ""}
      </div>
      ${job.companyLine ? `<p>${escapeHtml(compactText(job.companyLine, 260))}</p>` : ""}
      <a class="apply-btn apply-btn--wide" href="${escapeHtml(job.publicApplyLink || job.applyLink)}" target="_blank" rel="noopener noreferrer">Apply For This Job</a>
    `;
  }

  function renderJobs(options = {}) {
    const restartRotation = options.restartRotation !== false;
    const status = $("jobsStatus");
    const list = $("jobsList");
    const keyword = String($("keywordSearch")?.value || "").trim().toLowerCase();
    const location = String($("locationSearch")?.value || "").trim().toLowerCase();
    const jobs = allJobs.filter((job) => {
      const keywordOk = !keyword || jobSearchHay(job).includes(keyword);
      const locationOk = !location || String(`${job.location || ""} ${job.workMode || ""}`).toLowerCase().includes(location);
      return keywordOk && locationOk;
    });
    if (status) status.textContent = jobs.length ? `${jobs.length} active role${jobs.length === 1 ? "" : "s"}` : "No matching jobs right now.";
    if (!list) return;
    list.innerHTML = jobs.map((job) => `
      <article class="job-card${String(job.id) === activeJobId ? " active" : ""}" data-job-id="${escapeHtml(job.id)}">
        <div class="job-logo" aria-hidden="true"><img src="${escapeHtml(boardLogoUrl)}" alt="" /></div>
        <div class="job-main">
          <h3>${escapeHtml(job.title)}</h3>
          ${job.companyLine ? `<p class="job-company">${escapeHtml(compactText(job.companyLine, 110))}</p>` : ""}
          <div class="job-meta">
            ${job.location ? `<span class="meta-line"><span class="meta-icon">LOC</span>${escapeHtml(job.location)}</span>` : ""}
            ${job.workMode ? `<span class="chip">${escapeHtml(job.workMode)}</span>` : ""}
          </div>
        </div>
        <a class="apply-pill" href="${escapeHtml(job.publicApplyLink || job.applyLink)}" target="_blank" rel="noopener noreferrer">Apply</a>
      </article>
    `).join("");
    list.querySelectorAll(".job-card").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target && event.target.closest("a")) return;
        const id = String(card.getAttribute("data-job-id") || "");
        activeJobId = id;
        renderJobs({ restartRotation: false });
        startSpotlightRotation(jobs);
        renderSpotlight(jobs.find((job) => String(job.id) === id) || jobs[0] || null);
      });
    });
    if (!jobs.some((job) => String(job.id) === activeJobId)) activeJobId = String(jobs[0]?.id || "");
    renderSpotlight(jobs.find((job) => String(job.id) === activeJobId) || jobs[0] || null);
    if (restartRotation) startSpotlightRotation(jobs);
  }

  async function init() {
    const slug = readSlug();
    const mode = readMode();
    const status = $("jobsStatus");
    if (!slug) {
      status.textContent = "Missing company slug.";
      return;
    }
    status.textContent = "Loading jobs...";
    try {
      const response = await fetch(`/public/company-jobs/${encodeURIComponent(slug)}?mode=${encodeURIComponent(mode)}`);
      const data = await readJson(response);
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Could not load jobs.");
      const result = data.result || {};
      const pageTitle = String(result.pageTitle || "").trim();
      const pageSubtitle = String(result.pageSubtitle || "").trim();
      applyBoardTheme(result);
      $("jobsTitle").textContent = pageTitle || `${result.companyName || "Company"} Jobs`;
      $("jobsSubtitle").textContent = pageSubtitle || "Active openings";
      document.title = `${pageTitle || `${result.companyName || "Company"} Jobs`}`;
      boardLogoUrl = String(result.logoDataUrl || "").trim() || "/portal-app/favicon.png";
      allJobs = Array.isArray(result.jobs) ? result.jobs : [];
      activeJobId = String(allJobs[0]?.id || "");
      ["keywordSearch", "locationSearch"].forEach((id) => {
        const input = $(id);
        if (input) input.addEventListener("input", () => renderJobs());
      });
      renderJobs();
    } catch (error) {
      status.textContent = String(error?.message || error);
      renderSpotlight(null);
    }
  }

  init();
})();
