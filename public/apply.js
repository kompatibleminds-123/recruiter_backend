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

  function renderJob(job) {
    $("jobTitle").textContent = job.title || "Apply";
    $("jobDescription").textContent = job.jobDescription || "Complete the form below to apply.";
    const meta = $("jobMeta");
    if (!meta) return;
    const chips = [];
    if (job.clientName) chips.push(`Client: ${job.clientName}`);
    if (job.mustHaveSkills) chips.push(`Must have: ${job.mustHaveSkills}`);
    meta.innerHTML = chips.map((item) => `<span class="chip">${item}</span>`).join("");
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
