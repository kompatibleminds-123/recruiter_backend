(function () {
  const rolesNode = document.getElementById("roles");
  const summaryNode = document.getElementById("summary");
  const statusNode = document.getElementById("status");
  const subtitleNode = document.getElementById("subtitle");

  function getToken() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("token") || "").trim();
  }

  function formatDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString();
  }

  function renderSummary(summary, clientName) {
    summaryNode.innerHTML = `
      <article class="metric">
        <div class="metric-label">Total roles</div>
        <div class="metric-value">${summary.totalRoles || 0}</div>
      </article>
      <article class="metric">
        <div class="metric-label">Shared candidates</div>
        <div class="metric-value">${summary.totalCandidates || 0}</div>
      </article>
      <article class="metric">
        <div class="metric-label">Scope</div>
        <div class="metric-value" style="font-size:16px;line-height:1.4">${clientName || "All clients"}</div>
      </article>
    `;
  }

  function renderRoles(roles) {
    if (!roles.length) {
      rolesNode.innerHTML = "<article class='role-card'>No shared candidates available yet.</article>";
      return;
    }

    rolesNode.innerHTML = roles.map((group) => `
      <article class="role-card">
        <h2 class="role-title">${group.role} (${group.count})</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Company</th>
                <th>Experience</th>
                <th>Location</th>
                <th>Status</th>
                <th>Shared on</th>
              </tr>
            </thead>
            <tbody>
              ${group.candidates.map((candidate) => `
                <tr>
                  <td>${candidate.candidateName || "-"}</td>
                  <td>${candidate.currentCompany || "-"}</td>
                  <td>${candidate.experience || "-"}</td>
                  <td>${candidate.location || "-"}</td>
                  <td>${candidate.status || "-"}</td>
                  <td>${formatDate(candidate.sharedAt)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    `).join("");
  }

  async function load() {
    const token = getToken();
    if (!token) {
      statusNode.textContent = "Missing token in URL. Ask your recruiter to resend the portal link.";
      return;
    }
    try {
      const response = await fetch(`/client-portal/data?token=${encodeURIComponent(token)}`);
      const json = await response.json();
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.error || `HTTP ${response.status}`);
      }
      const result = json.result || {};
      subtitleNode.textContent = result.clientName
        ? `Showing shared candidates for ${result.clientName} across roles.`
        : "Showing all shared candidates across roles.";
      renderSummary(result.summary || {}, result.clientName || "");
      renderRoles(Array.isArray(result.roles) ? result.roles : []);
      statusNode.textContent = "";
    } catch (error) {
      statusNode.textContent = String(error?.message || error);
    }
  }

  load();
})();
