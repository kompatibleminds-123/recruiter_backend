(function () {
  const $ = (id) => document.getElementById(id);

  async function readJsonSafely(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch (_error) {
      return {
        ok: false,
        error: text || `HTTP ${response.status}`
      };
    }
  }

  function setStatus(message, kind) {
    const node = $("applyStatus");
    if (!node) return;
    node.textContent = String(message || "");
    node.className = `status ${kind || ""}`.trim();
  }

  function getJobId() {
    const pathname = window.location.pathname || "";
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "apply" && parts[1]) return decodeURIComponent(parts[1]);
    return new URLSearchParams(window.location.search).get("jobId") || "";
  }

  async function readFileAsBase64(file) {
    if (!file) return null;
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileData: btoa(binary)
    };
  }

  async function loadJob(jobId) {
    const response = await fetch(`/public/jobs/${encodeURIComponent(jobId)}`);
    const data = await readJsonSafely(response);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Could not load this job. This link may be stale or the JD is not published in backend.");
    }
    return data.result || {};
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeJobText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function buildStructuredSections(job) {
    const description = normalizeJobText(job.jobDescription || "");
    return [
      { heading: "About Company", body: String(job.aboutCompany || "").trim() },
      { heading: "Job Description", body: description },
      { heading: "Must-have Skills", body: String(job.mustHaveSkills || "").trim() },
      { heading: "Location", body: String(job.location || "").trim() },
      { heading: "Work Mode", body: String(job.workMode || "").trim() }
    ].filter((section) => String(section.body || "").trim());
  }

  function renderJobDescription(job) {
    const node = $("jobDescription");
    if (!node) return;
    const sections = buildStructuredSections(job);
    if (!sections.length) {
      node.textContent = "Complete the form below to apply.";
      return;
    }
    node.innerHTML = `
      <div class="job-copy">
        ${sections.map((section) => `
          <section class="job-copy-section">
            <h3>${escapeHtml(section.heading)}</h3>
            <p>${escapeHtml(section.body)}</p>
          </section>
        `).join("")}
      </div>
    `;
  }

  function renderJob(job) {
    $("jobTitle").textContent = job.title || "Apply";
    renderJobDescription(job);
    const meta = $("jobMeta");
    if (!meta) return;
    const chips = [];
    if (job.clientName) chips.push(`Client: ${job.clientName}`);
    if (job.location) chips.push(`Location: ${job.location}`);
    if (job.workMode) chips.push(`Work mode: ${job.workMode}`);
    meta.innerHTML = chips.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("");
  }

  async function init() {
    const jobId = getJobId();
    if (!jobId) {
      setStatus("Missing job link.", "error");
      return;
    }
    let job = null;
    try {
      job = await loadJob(jobId);
      renderJob(job);
    } catch (error) {
      setStatus(String(error?.message || error), "error");
      return;
    }

    $("applyForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = $("applySubmit");
      try {
        submit.disabled = true;
        setStatus("Submitting application...");

        const cvFile = $("cvFile")?.files?.[0] || null;
        const file = await readFileAsBase64(cvFile);

        const payload = {
          jdTitle: job.title || "",
          clientName: job.clientName || "",
          sourcePlatform: "hosted_apply",
          sourceLabel: "RecruitDesk Apply Link",
          jobPageUrl: window.location.href,
          candidateName: $("candidateName").value.trim(),
          email: $("email").value.trim(),
          phone: $("phone").value.trim(),
          location: $("location").value.trim(),
          currentCompany: $("currentCompany").value.trim(),
          currentDesignation: $("currentDesignation").value.trim(),
          totalExperience: $("totalExperience").value.trim(),
          noticePeriod: $("noticePeriod").value.trim(),
          screeningAnswers: $("screeningAnswers").value.trim(),
          skills: $("skills").value.split(",").map((item) => item.trim()).filter(Boolean),
          file
        };

        const response = await fetch(`/public/jobs/${encodeURIComponent(jobId)}/apply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const data = await readJsonSafely(response);
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Application failed.");
        }
        setStatus("Application submitted successfully.", "ok");
        $("applyForm").reset();
      } catch (error) {
        setStatus(String(error?.message || error), "error");
      } finally {
        submit.disabled = false;
      }
    });
  }

  init().catch((error) => setStatus(String(error?.message || error), "error"));
})();
