(function () {
  const $ = (id) => document.getElementById(id);
  const cssEscape = (value) => {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value || ""));
    return String(value || "").replace(/["\\]/g, "\\$&");
  };

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
    if ((parts[0] === "apply" || parts[0] === "apply-public") && parts[1]) return decodeURIComponent(parts[1]);
    return new URLSearchParams(window.location.search).get("jobId") || "";
  }

  function isPublicApplyMode() {
    const pathname = window.location.pathname || "";
    const parts = pathname.split("/").filter(Boolean);
    return parts[0] === "apply-public";
  }

  function getApplyAssignment() {
    const params = new URLSearchParams(window.location.search);
    return {
      // Support both old (rid/sig) and short (r/s) query params.
      rid: String(params.get("r") || params.get("rid") || "").trim(),
      sig: String(params.get("s") || params.get("sig") || "").trim()
    };
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
    const publicMode = isPublicApplyMode();
    const url = publicMode
      ? `/public/jobs/${encodeURIComponent(jobId)}?mode=public`
      : `/public/jobs/${encodeURIComponent(jobId)}`;
    const response = await fetch(url);
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

  function isHtmlLike(value) {
    return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
  }

  function sanitizeAllowedHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const blocked = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "meta", "link"]);
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
    const remove = [];
    while (walker.nextNode()) {
      const el = walker.currentNode;
      const tag = String(el.tagName || "").toLowerCase();
      if (blocked.has(tag)) {
        remove.push(el);
        continue;
      }
      Array.from(el.attributes || []).forEach((attr) => {
        const name = String(attr.name || "").toLowerCase();
        const value = String(attr.value || "");
        if (name.startsWith("on")) el.removeAttribute(attr.name);
        if ((name === "href" || name === "src") && /^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
      });
    }
    remove.forEach((el) => el.remove());
    return template.innerHTML;
  }

  function applyBranding(job) {
    const board = job?.jobBoard && typeof job.jobBoard === "object" ? job.jobBoard : {};
    const root = document.documentElement;
    const hexToRgb = (hex) => {
      const raw = String(hex || "").trim().replace(/^#/, "");
      if (!/^[0-9a-f]{3,8}$/i.test(raw)) return null;
      const normalized = raw.length === 3
        ? raw.split("").map((ch) => ch + ch).join("")
        : raw.slice(0, 6);
      const int = Number.parseInt(normalized, 16);
      if (!Number.isFinite(int)) return null;
      return {
        r: (int >> 16) & 255,
        g: (int >> 8) & 255,
        b: int & 255
      };
    };
    const rgba = (hex, alpha) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return "";
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    };
    const mixHex = (hexA, hexB, weight = 0.5) => {
      const a = hexToRgb(hexA);
      const b = hexToRgb(hexB);
      if (!a || !b) return "";
      const w = Math.min(1, Math.max(0, Number(weight) || 0));
      const toHex = (n) => Math.round(n).toString(16).padStart(2, "0");
      const r = a.r + (b.r - a.r) * w;
      const g = a.g + (b.g - a.g) * w;
      const bl = a.b + (b.b - a.b) * w;
      return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
    };
    const bgColor = String(board.backgroundColor || "").trim();
    const cardColor = String(board.cardBackgroundColor || "").trim();
    const primaryColor = String(board.primaryColor || board.buttonColor || "").trim();
    const buttonColor = String(board.buttonColor || board.primaryColor || "").trim();
    const lineColor = mixHex(cardColor || bgColor, buttonColor || primaryColor, 0.22);
    const softColor = rgba(cardColor || "#ffffff", 0.72);
    const glowColor = rgba(primaryColor || buttonColor, 0.12);
    const ringColor = rgba(buttonColor || primaryColor, 0.24);
    const fieldBg = mixHex(cardColor || "#ffffff", "#ffffff", 0.55) || "#ffffff";
    const topBg = mixHex(bgColor || "#f6f1e8", "#ffffff", 0.45);
    const map = {
      "--brand": buttonColor,
      "--brand-dark": primaryColor,
      "--bg": bgColor,
      "--bg-top": topBg,
      "--bg-glow": glowColor,
      "--card": cardColor,
      "--soft": softColor,
      "--line": lineColor,
      "--field-bg": fieldBg,
      "--ring": ringColor,
      "--ink": board.textColor,
      "--muted": board.mutedTextColor
    };
    Object.entries(map).forEach(([key, value]) => {
      const safe = String(value || "").trim();
      if (/^#[0-9a-f]{3,8}$/i.test(safe)) root.style.setProperty(key, safe);
    });
    const favicon = String(board.faviconDataUrl || board.logoDataUrl || "").trim();
    if (favicon) {
      const node = $("applyFavicon");
      if (node) node.setAttribute("href", favicon);
    }
    document.title = `${job?.title || "Apply"} | RecruitDesk`;
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
            ${isHtmlLike(section.body) ? `<div>${sanitizeAllowedHtml(section.body)}</div>` : `<p>${escapeHtml(section.body)}</p>`}
          </section>
        `).join("")}
      </div>
    `;
  }

  function normalizeApplyFields(fields) {
    return (Array.isArray(fields) ? fields : [])
      .filter((field) => field && field.enabled !== false)
      .map((field, index) => {
        const label = String(field.label || `Custom field ${index + 1}`).trim();
        const id = String(field.id || label || `custom_field_${index + 1}`)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || `custom_field_${index + 1}`;
        const type = ["text", "textarea", "select", "checkbox"].includes(String(field.type || "").trim())
          ? String(field.type || "").trim()
          : "text";
        const options = Array.isArray(field.options)
          ? field.options
          : String(field.options || "").split(/\r?\n|,/);
        return {
          id,
          label,
          type,
          placeholder: String(field.placeholder || "").trim(),
          required: field.required === true,
          conditionalOnId: String(field.conditionalOnId || field.conditional_on_id || "").trim(),
          conditionalValue: String(field.conditionalValue || field.conditional_value || "").trim(),
          options: options.map((item) => String(item || "").trim()).filter(Boolean)
        };
      })
      .filter((field) => field.id && field.label)
      .slice(0, 12);
  }

  function renderCustomFields(job) {
    const wrap = $("customFieldsWrap");
    if (!wrap) return;
    const fields = normalizeApplyFields(job.jobApplyFields || []);
    wrap.innerHTML = fields.map((field) => {
      const domId = `custom_${field.id}`;
      const required = field.required ? "required" : "";
      const conditionalAttrs = field.conditionalOnId
        ? ` data-conditional-on="${escapeHtml(field.conditionalOnId)}" data-conditional-value="${escapeHtml(field.conditionalValue)}"`
        : "";
      const hiddenStyle = field.conditionalOnId ? ` style="display:none;"` : "";
      const common = `id="${escapeHtml(domId)}" data-custom-field="${escapeHtml(field.id)}" data-custom-label="${escapeHtml(field.label)}"${conditionalAttrs} ${required}`;
      if (field.type === "textarea") {
        return `<div class="full" data-custom-field-wrap="${escapeHtml(field.id)}"${hiddenStyle}><label for="${escapeHtml(domId)}">${escapeHtml(field.label)}</label><textarea ${common} placeholder="${escapeHtml(field.placeholder)}"></textarea></div>`;
      }
      if (field.type === "select") {
        return `<div data-custom-field-wrap="${escapeHtml(field.id)}"${hiddenStyle}><label for="${escapeHtml(domId)}">${escapeHtml(field.label)}</label><select ${common}><option value="">Select</option>${field.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select></div>`;
      }
      if (field.type === "checkbox") {
        return `<div class="full" data-custom-field-wrap="${escapeHtml(field.id)}"${hiddenStyle}><label style="display:flex;align-items:center;gap:10px;"><input style="width:auto;" type="checkbox" ${common} /> ${escapeHtml(field.label)}</label></div>`;
      }
      return `<div data-custom-field-wrap="${escapeHtml(field.id)}"${hiddenStyle}><label for="${escapeHtml(domId)}">${escapeHtml(field.label)}</label><input ${common} placeholder="${escapeHtml(field.placeholder)}" /></div>`;
    }).join("");
    updateConditionalCustomFields();
    wrap.querySelectorAll("[data-custom-field]").forEach((node) => {
      node.addEventListener("change", updateConditionalCustomFields);
      node.addEventListener("input", updateConditionalCustomFields);
    });
  }

  function updateConditionalCustomFields() {
    document.querySelectorAll("[data-conditional-on]").forEach((node) => {
      const dependsOn = String(node.getAttribute("data-conditional-on") || "").trim();
      const expected = String(node.getAttribute("data-conditional-value") || "").trim().toLowerCase();
      const wrap = document.querySelector(`[data-custom-field-wrap="${cssEscape(String(node.getAttribute("data-custom-field") || ""))}"]`);
      const source = document.querySelector(`[data-custom-field="${cssEscape(dependsOn)}"]`);
      const current = source?.type === "checkbox" ? (source.checked ? "true" : "false") : String(source?.value || "").trim();
      const visible = Boolean(source) && (!expected || current.toLowerCase() === expected);
      if (wrap) wrap.style.display = visible ? "" : "none";
      node.disabled = !visible;
      if (!visible) {
        if (node.type === "checkbox") node.checked = false;
        else node.value = "";
      }
    });
  }

  function readCustomFields() {
    const out = {};
    document.querySelectorAll("[data-custom-field]").forEach((node) => {
      const key = String(node.getAttribute("data-custom-field") || "").trim();
      const label = String(node.getAttribute("data-custom-label") || key).trim();
      if (!key) return;
      const wrap = document.querySelector(`[data-custom-field-wrap="${cssEscape(key)}"]`);
      if (wrap && wrap.style.display === "none") return;
      const value = node.type === "checkbox" ? Boolean(node.checked) : String(node.value || "").trim();
      out[label || key] = value;
    });
    return out;
  }

  function renderJob(job) {
    applyBranding(job);
    $("jobTitle").textContent = job.title || "Apply";
    renderJobDescription(job);
    renderCustomFields(job);
    const meta = $("jobMeta");
    if (!meta) return;
    const chips = [];
    // Public (anonymous) apply links never show the client name.
    if (!isPublicApplyMode() && job.clientName) chips.push(`Client: ${job.clientName}`);
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
        const assignment = getApplyAssignment();

        const payload = {
          jdTitle: job.title || "",
          // Do not rely on clientName coming from the browser; backend will set it from the job record.
          sourcePlatform: "hosted_apply",
          sourceLabel: "RecruitDesk Apply Link",
          jobPageUrl: window.location.href,
          assignedToUserId: assignment.rid,
          assignedToSig: assignment.sig,
          candidateName: $("candidateName").value.trim(),
          email: $("email").value.trim(),
          phone: $("phone").value.trim(),
          location: $("location").value.trim(),
          currentCompany: $("currentCompany").value.trim(),
          currentDesignation: $("currentDesignation").value.trim(),
          totalExperience: $("totalExperience").value.trim(),
          noticePeriod: $("noticePeriod").value.trim(),
          screeningAnswers: $("screeningAnswers").value.trim(),
          customFields: readCustomFields(),
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
