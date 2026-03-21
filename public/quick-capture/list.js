const candidateList = document.getElementById("candidateList");
const listStatus = document.getElementById("listStatus");
const refreshButton = document.getElementById("refreshButton");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return value;
  }
}

function renderCandidates(items) {
  if (!items.length) {
    candidateList.innerHTML = '<div class="candidate-card"><p>No candidates saved yet.</p></div>';
    return;
  }

  candidateList.innerHTML = items
    .map((candidate) => {
      const skills = Array.isArray(candidate.skills) ? candidate.skills.filter(Boolean) : [];
      return `
        <article class="candidate-card">
          <h3>${escapeHtml(candidate.name || "Unnamed candidate")}</h3>
          <p class="card-meta">
            ${escapeHtml(candidate.role || "Role not captured")}
            ${candidate.company ? ` • ${escapeHtml(candidate.company)}` : ""}
          </p>
          <div class="pill-row">
            ${skills.map((skill) => `<span class="pill">${escapeHtml(skill)}</span>`).join("")}
          </div>
          <div class="detail-grid">
            <div><strong>Experience:</strong> ${escapeHtml(candidate.experience || "-")}</div>
            <div><strong>Current CTC:</strong> ${escapeHtml(candidate.current_ctc || "-")}</div>
            <div><strong>Expected CTC:</strong> ${escapeHtml(candidate.expected_ctc || "-")}</div>
            <div><strong>Notice Period:</strong> ${escapeHtml(candidate.notice_period || "-")}</div>
            <div><strong>Notes:</strong> ${escapeHtml(candidate.notes || "-")}</div>
            <div><strong>Next Action:</strong> ${escapeHtml(candidate.next_action || "-")}</div>
            <div><strong>Added:</strong> ${escapeHtml(formatDate(candidate.created_at))}</div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadCandidates() {
  listStatus.textContent = "Loading candidates...";
  listStatus.className = "status-message";
  refreshButton.disabled = true;

  try {
    const response = await fetch("/candidates");
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to load candidates.");
    }
    renderCandidates(Array.isArray(payload.result) ? payload.result : []);
    listStatus.textContent = `Loaded ${Array.isArray(payload.result) ? payload.result.length : 0} candidates.`;
  } catch (error) {
    listStatus.textContent = String(error.message || error);
    listStatus.className = "status-message error";
  } finally {
    refreshButton.disabled = false;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/quick-capture/sw.js").catch(() => {});
  });
}

refreshButton.addEventListener("click", loadCandidates);
loadCandidates();
