const noteInput = document.getElementById("noteInput");
const micButton = document.getElementById("micButton");
const parseButton = document.getElementById("parseButton");
const saveButton = document.getElementById("saveButton");
const statusMessage = document.getElementById("statusMessage");
const jsonOutput = document.getElementById("jsonOutput");
const candidateSummary = document.getElementById("candidateSummary");
const conflictSummary = document.getElementById("conflictSummary");
const mergeContext = document.getElementById("mergeContext");
const candidateNameInput = document.getElementById("candidateName");
const candidateCompanyInput = document.getElementById("candidateCompany");
const candidateRoleInput = document.getElementById("candidateRole");
const candidateExperienceInput = document.getElementById("candidateExperience");
const candidateLocationInput = document.getElementById("candidateLocation");
const candidateCurrentCtcInput = document.getElementById("candidateCurrentCtc");
const candidateExpectedCtcInput = document.getElementById("candidateExpectedCtc");
const candidateNoticePeriodInput = document.getElementById("candidateNoticePeriod");
const candidatePhoneInput = document.getElementById("candidatePhone");
const candidateEmailInput = document.getElementById("candidateEmail");
const candidateLinkedinInput = document.getElementById("candidateLinkedin");
const candidateNextActionInput = document.getElementById("candidateNextAction");
let recognition = null;
let isListening = false;
let voiceSilenceTimer = null;
let voiceRestartTimer = null;
let keepAliveUntil = 0;
let manualVoiceStop = false;
let voiceSessionActive = false;
let voiceBaseText = "";
let voiceInterimText = "";
let voiceCommittedChunks = new Set();
let voiceRequestedByUser = false;
let currentCandidateRecordId = "";
let currentCandidateCreatedAt = "";
let currentQuickCaptureUser = null;
let latestParsedCandidateDraft = null;
let latestIncomingParsedCandidate = null;
let currentLoadedCandidateBaseline = null;
let latestDraftConflicts = [];

function normalizeVoiceChunk(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeVoiceText(baseText, newChunk) {
  const base = String(baseText || "").trim();
  const chunk = String(newChunk || "").trim();
  if (!chunk) return base;
  if (!base) return chunk;

  const normalizedBase = normalizeVoiceChunk(base);
  const normalizedChunk = normalizeVoiceChunk(chunk);
  if (!normalizedChunk) return base;
  if (normalizedBase.endsWith(normalizedChunk) || normalizedBase.includes(` ${normalizedChunk} `)) {
    return base;
  }

  const baseWords = base.split(/\s+/);
  const chunkWords = chunk.split(/\s+/);
  const normalizedBaseWords = baseWords.map(normalizeVoiceChunk);
  const normalizedChunkWords = chunkWords.map(normalizeVoiceChunk);
  const maxOverlap = Math.min(normalizedBaseWords.length, normalizedChunkWords.length);

  for (let overlap = maxOverlap; overlap >= 3; overlap -= 1) {
    const baseTail = normalizedBaseWords.slice(-overlap).join(" ");
    const chunkHead = normalizedChunkWords.slice(0, overlap).join(" ");
    if (baseTail && baseTail === chunkHead) {
      const remainingWords = chunkWords.slice(overlap);
      return remainingWords.length ? `${base} ${remainingWords.join(" ")}`.trim() : base;
    }
  }

  return `${base} ${chunk}`.trim();
}

function setStatus(message, tone = "") {
  statusMessage.textContent = message || "";
  statusMessage.className = `status-message${tone ? ` ${tone}` : ""}`;
}

function renderAuthState(user) {
  currentQuickCaptureUser = user || null;
  if (parseButton) parseButton.disabled = !user;
  if (saveButton) {
    saveButton.disabled = !user || !latestParsedCandidateDraft;
    saveButton.hidden = !latestParsedCandidateDraft;
  }
  if (!user) {
    resetCurrentCandidateTracking();
  }
}

function renderJson(data) {
  if (typeof data === "string") {
    jsonOutput.textContent = data;
    return;
  }
  jsonOutput.textContent = JSON.stringify(data, null, 2);
}

function normalizeCandidateValue(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCandidateSummary(data) {
  if (!candidateSummary) return;
  const rows = [
    ["Candidate", data?.name],
    ["Company", data?.company],
    ["Role", data?.role],
    ["Experience", data?.experience],
    ["Location", data?.location],
    ["Skills", Array.isArray(data?.skills) ? data.skills.filter(Boolean).join(", ") : ""],
    ["Current CTC", data?.current_ctc],
    ["Expected CTC", data?.expected_ctc],
    ["Notice Period", data?.notice_period],
    ["Next Action", data?.next_action],
    ["Notes", data?.notes],
    ["Phone", data?.phone],
    ["Email", data?.email],
    ["LinkedIn", data?.linkedin]
  ].filter(([, value]) => String(value || "").trim());

  if (!rows.length) {
    candidateSummary.className = "candidate-summary empty";
    candidateSummary.textContent = "No captured data yet.";
    return;
  }

  candidateSummary.className = "candidate-summary";
  candidateSummary.innerHTML = `<div class="summary-grid">${rows
    .map(
      ([label, value]) =>
        `<div class="summary-row"><div class="summary-key">${escapeHtml(label)}</div><div class="summary-value">${escapeHtml(value)}</div></div>`
    )
    .join("")}</div>`;
}

function buildCandidateMerge(base, incoming, latestNoteText = "") {
  const keys = [
    "name",
    "company",
    "role",
    "experience",
    "location",
    "current_ctc",
    "expected_ctc",
    "notice_period",
    "phone",
    "email",
    "linkedin",
    "highest_education",
    "next_action"
  ];
  const merged = { ...(base || {}), ...(incoming || {}) };
  const conflicts = [];

  for (const key of keys) {
    const baseValue = normalizeCandidateValue(base?.[key]);
    const incomingValue = normalizeCandidateValue(incoming?.[key]);
    merged[key] = incomingValue || baseValue || "";
    if (baseValue && incomingValue && baseValue.toLowerCase() !== incomingValue.toLowerCase()) {
      conflicts.push({ key, from: baseValue, to: incomingValue });
    }
  }

  const existingNotes = normalizeCandidateValue(base?.notes);
  const incomingNotes = normalizeCandidateValue(incoming?.notes);
  const freshNote = normalizeCandidateValue(latestNoteText);
  merged.notes = [existingNotes, freshNote, incomingNotes]
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .join("\n");
  merged.id = normalizeCandidateValue(base?.id || incoming?.id);
  merged.created_at = normalizeCandidateValue(base?.created_at || incoming?.created_at);
  merged.source = normalizeCandidateValue(base?.source || incoming?.source || "mobile_pwa");
  return { merged, conflicts };
}

function formatConflictLabel(key) {
  const labels = {
    name: "Candidate",
    company: "Company",
    role: "Role",
    experience: "Experience",
    location: "Location",
    current_ctc: "Current CTC",
    expected_ctc: "Expected CTC",
    notice_period: "Notice period",
    phone: "Phone",
    email: "Email",
    linkedin: "LinkedIn",
    highest_education: "Highest education",
    next_action: "Next action"
  };
  return labels[key] || key;
}

function renderConflictSummary(conflicts) {
  if (!conflictSummary) return;
  const rows = Array.isArray(conflicts) ? conflicts : [];
  conflictSummary.hidden = !rows.length;
  if (!rows.length) {
    conflictSummary.innerHTML = "";
    return;
  }
  conflictSummary.innerHTML = `
    <div class="conflict-title">Conflicts detected</div>
    <ul class="conflict-list">
      ${rows
        .map(
          (entry) =>
            `<li><strong>${escapeHtml(formatConflictLabel(entry.key))}</strong>: existing "${escapeHtml(entry.from)}" -> new "${escapeHtml(entry.to)}"</li>`
        )
        .join("")}
    </ul>
  `;
}

function populateFormFromParsedResult(data) {
  if (!data || typeof data !== "object") return;
  currentCandidateRecordId = String(data.id || "").trim();
  currentCandidateCreatedAt = String(data.created_at || "").trim();
  if (candidateNameInput) candidateNameInput.value = String(data.name || "").trim();
  if (candidateCompanyInput) candidateCompanyInput.value = String(data.company || "").trim();
  if (candidateRoleInput) candidateRoleInput.value = String(data.role || "").trim();
  if (candidateExperienceInput) candidateExperienceInput.value = String(data.experience || "").trim();
  if (candidateLocationInput) candidateLocationInput.value = String(data.location || "").trim();
  if (candidateCurrentCtcInput) candidateCurrentCtcInput.value = String(data.current_ctc || "").trim();
  if (candidateExpectedCtcInput) candidateExpectedCtcInput.value = String(data.expected_ctc || "").trim();
  if (candidateNoticePeriodInput) candidateNoticePeriodInput.value = String(data.notice_period || "").trim();
  if (candidatePhoneInput) candidatePhoneInput.value = String(data.phone || "").trim();
  if (candidateEmailInput) candidateEmailInput.value = String(data.email || "").trim();
  if (candidateLinkedinInput) candidateLinkedinInput.value = String(data.linkedin || "").trim();
  if (candidateNextActionInput) candidateNextActionInput.value = String(data.next_action || "").trim();
}

function setLatestParsedCandidateDraft(data) {
  latestParsedCandidateDraft = data && typeof data === "object" ? { ...data } : null;
  if (saveButton) {
    saveButton.disabled = !currentQuickCaptureUser || !latestParsedCandidateDraft;
    saveButton.hidden = !latestParsedCandidateDraft;
  }
}

function loadCandidateIntoCapture(candidate) {
  const item = candidate && typeof candidate === "object" ? { ...candidate } : null;
  currentLoadedCandidateBaseline = item;
  currentCandidateRecordId = String(item?.id || "").trim();
  currentCandidateCreatedAt = String(item?.created_at || "").trim();
  latestIncomingParsedCandidate = null;
  latestDraftConflicts = [];
  renderConflictSummary([]);
  if (mergeContext) {
    mergeContext.hidden = !item;
    mergeContext.textContent = item ? `Updating existing draft: ${item.name || "candidate"}${item.assigned_to_name ? ` | Assigned to ${item.assigned_to_name}` : ""}` : "";
  }
  if (!item) return;
  populateFormFromParsedResult(item);
  if (noteInput) noteInput.value = "";
  setLatestParsedCandidateDraft(item);
  renderCandidateSummary(item);
  renderJson(item);
}

function buildCandidateFromReviewFields() {
  const base = latestParsedCandidateDraft && typeof latestParsedCandidateDraft === "object" ? { ...latestParsedCandidateDraft } : {};
  const notesValue = base.notes || noteInput?.value.trim() || "";
  return {
    ...base,
    id: currentCandidateRecordId || base.id || undefined,
    created_at: currentCandidateCreatedAt || base.created_at || undefined,
    source: base.source || "mobile_pwa",
    name: candidateNameInput?.value.trim() || "",
    company: candidateCompanyInput?.value.trim() || "",
    role: candidateRoleInput?.value.trim() || "",
    experience: candidateExperienceInput?.value.trim() || "",
    location: candidateLocationInput?.value.trim() || "",
    current_ctc: candidateCurrentCtcInput?.value.trim() || "",
    expected_ctc: candidateExpectedCtcInput?.value.trim() || "",
    notice_period: candidateNoticePeriodInput?.value.trim() || "",
    phone: candidatePhoneInput?.value.trim() || "",
    email: candidateEmailInput?.value.trim() || "",
    linkedin: candidateLinkedinInput?.value.trim() || "",
    next_action: candidateNextActionInput?.value.trim() || "",
    notes: notesValue,
    recruiter_id: currentQuickCaptureUser?.id || base.recruiter_id || "",
    recruiter_name: currentQuickCaptureUser?.name || base.recruiter_name || ""
  };
}

function refreshReviewPreview() {
  if (!latestParsedCandidateDraft) return;
  renderCandidateSummary(buildCandidateFromReviewFields());
}

function clearVoiceSilenceTimer() {
  if (voiceSilenceTimer) {
    window.clearTimeout(voiceSilenceTimer);
    voiceSilenceTimer = null;
  }
}

function clearVoiceRestartTimer() {
  if (voiceRestartTimer) {
    window.clearTimeout(voiceRestartTimer);
    voiceRestartTimer = null;
  }
}

function armVoiceSilenceTimer() {
  clearVoiceSilenceTimer();
  voiceSilenceTimer = window.setTimeout(() => {
    keepAliveUntil = 0;
    if (recognition && isListening) {
      manualVoiceStop = true;
      recognition.stop();
    }
  }, 7000);
}

function resetVoiceSessionState() {
  voiceSessionActive = false;
  voiceBaseText = noteInput.value.trim();
  voiceInterimText = "";
  voiceCommittedChunks.clear();
  voiceRequestedByUser = false;
}

function scheduleVoiceRestart() {
  clearVoiceRestartTimer();
  if (!recognition || !voiceRequestedByUser) return;
  if (Date.now() >= keepAliveUntil) return;
  voiceRestartTimer = window.setTimeout(() => {
    if (recognition && !isListening && voiceRequestedByUser && Date.now() < keepAliveUntil) {
      try {
        recognition.start();
      } catch {
        // Ignore restart errors from browser speech engines.
      }
    }
  }, 220);
}

function buildNoteFromForm() {
  const parts = [
    candidateNameInput?.value.trim() ? `name ${candidateNameInput.value.trim()}` : "",
    candidateCompanyInput?.value.trim() ? `company ${candidateCompanyInput.value.trim()}` : "",
    candidateRoleInput?.value.trim() ? `role ${candidateRoleInput.value.trim()}` : "",
    candidateExperienceInput?.value.trim() ? `experience ${candidateExperienceInput.value.trim()}` : "",
    candidateLocationInput?.value.trim() ? `location ${candidateLocationInput.value.trim()}` : "",
    candidateCurrentCtcInput?.value.trim() ? `current ctc ${candidateCurrentCtcInput.value.trim()}` : "",
    candidateExpectedCtcInput?.value.trim() ? `expected ctc ${candidateExpectedCtcInput.value.trim()}` : "",
    candidateNoticePeriodInput?.value.trim() ? `notice period ${candidateNoticePeriodInput.value.trim()}` : "",
    candidatePhoneInput?.value.trim() ? `phone ${candidatePhoneInput.value.trim()}` : "",
    candidateEmailInput?.value.trim() ? `email ${candidateEmailInput.value.trim()}` : "",
    candidateLinkedinInput?.value.trim() ? `linkedin ${candidateLinkedinInput.value.trim()}` : "",
    candidateNextActionInput?.value.trim() ? `next action ${candidateNextActionInput.value.trim()}` : "",
    noteInput.value.trim()
  ].filter(Boolean);

  return parts.join(". ");
}

function buildRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micButton.disabled = true;
    micButton.textContent = "Voice not supported";
    return null;
  }

  const instance = new SpeechRecognition();
  instance.lang = "en-IN";
  instance.interimResults = true;
  instance.continuous = true;
  instance.maxAlternatives = 3;

  instance.onstart = () => {
    isListening = true;
    clearVoiceRestartTimer();
    manualVoiceStop = false;
    if (!voiceSessionActive) {
      voiceSessionActive = true;
      voiceBaseText = noteInput.value.trim();
      voiceInterimText = "";
      voiceCommittedChunks = new Set();
    }
    keepAliveUntil = Date.now() + 7000;
    armVoiceSilenceTimer();
    micButton.textContent = "Listening...";
    setStatus("Voice capture started.");
  };

  instance.onend = () => {
    clearVoiceSilenceTimer();
    isListening = false;
    const shouldStayActive = voiceRequestedByUser && Date.now() < keepAliveUntil;
    if (manualVoiceStop || !shouldStayActive) {
      manualVoiceStop = false;
      resetVoiceSessionState();
      micButton.textContent = "Start voice input";
      setStatus("Voice capture stopped.");
      return;
    }

    micButton.textContent = "Listening...";
    scheduleVoiceRestart();
  };

  instance.onerror = (event) => {
    voiceInterimText = "";
    if (event?.error === "no-speech" && voiceRequestedByUser && Date.now() < keepAliveUntil) {
      scheduleVoiceRestart();
      return;
    }
    setStatus(`Voice input error: ${event.error}`, "error");
  };

  instance.onresult = (event) => {
    keepAliveUntil = Date.now() + 7000;
    armVoiceSilenceTimer();

    let committedNewText = false;
    const interimChunks = [];

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = (result[0]?.transcript || "").trim();
      if (!transcript || transcript.length < 3) continue;

      if (result.isFinal) {
        const chunkKey = transcript.toLowerCase().replace(/\s+/g, " ").trim();
        if (!voiceCommittedChunks.has(chunkKey)) {
          voiceCommittedChunks.add(chunkKey);
          voiceBaseText = mergeVoiceText(voiceBaseText, transcript);
          committedNewText = true;
        }
      } else {
        interimChunks.push(transcript);
      }
    }

    voiceInterimText = interimChunks.join(" ").trim();
    noteInput.value = mergeVoiceText(voiceBaseText, voiceInterimText);

    if (committedNewText) {
      setStatus("Voice note added to input.");
    }
  };

  return instance;
}

function stopVoiceCapture() {
  if (!recognition) return;
  voiceRequestedByUser = false;
  manualVoiceStop = true;
  keepAliveUntil = 0;
  clearVoiceSilenceTimer();
  clearVoiceRestartTimer();
  voiceInterimText = "";
  noteInput.value = voiceBaseText || noteInput.value.trim();
  if (isListening) {
    recognition.stop();
  } else {
    resetVoiceSessionState();
    micButton.textContent = "Start voice input";
  }
}

function resetCurrentCandidateTracking() {
  currentCandidateRecordId = "";
  currentCandidateCreatedAt = "";
  currentLoadedCandidateBaseline = null;
  latestIncomingParsedCandidate = null;
  latestDraftConflicts = [];
  setLatestParsedCandidateDraft(null);
  renderConflictSummary([]);
  if (mergeContext) {
    mergeContext.hidden = true;
    mergeContext.textContent = "";
  }
  renderCandidateSummary(null);
  renderJson("No parsed data yet.");
}

function buildQuickCapturePayload(noteText) {
  return {
    id: currentCandidateRecordId || undefined,
    created_at: currentCandidateCreatedAt || undefined,
    noteText,
    source: "mobile_pwa",
    client_name: "",
    jd_title: candidateRoleInput?.value.trim() || "",
    recruiter_id: currentQuickCaptureUser?.id || "",
    recruiter_name: currentQuickCaptureUser?.name || ""
  };
}

async function parseNoteForReview() {
  if (!currentQuickCaptureUser) {
    setStatus("Login required first.", "error");
    return;
  }
  stopVoiceCapture();
  const noteText = buildNoteFromForm();
  if (!noteText) {
    setStatus("Please enter or dictate a candidate note first.", "error");
    return;
  }
  parseButton.disabled = true;
  if (saveButton) saveButton.disabled = true;
  setStatus("Parsing candidate note for review...");

  try {
    const payload = await callQuickCaptureApi("/parse-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...buildQuickCapturePayload(noteText),
        preview: true
      })
    });
    latestIncomingParsedCandidate = payload.result || null;
    const mergeResult =
      currentLoadedCandidateBaseline
        ? buildCandidateMerge(currentLoadedCandidateBaseline, payload.result, noteInput?.value.trim() || "")
        : { merged: payload.result, conflicts: [] };
    latestDraftConflicts = mergeResult.conflicts || [];
    renderJson({
      merged: mergeResult.merged,
      parsed_note: payload.result,
      conflicts: latestDraftConflicts
    });
    populateFormFromParsedResult(mergeResult.merged);
    setLatestParsedCandidateDraft(mergeResult.merged);
    renderConflictSummary(latestDraftConflicts);
    refreshReviewPreview();
    if (latestDraftConflicts.length) {
      const labels = latestDraftConflicts.map((entry) => formatConflictLabel(entry.key)).join(", ");
      setStatus(`Parsed with conflicts in: ${labels}. Review before saving.`, "error");
    } else {
      setStatus("Candidate parsed and merged. Review the summary, edit if needed, then save.", "success");
    }
  } catch (error) {
    latestIncomingParsedCandidate = null;
    latestDraftConflicts = [];
    renderConflictSummary([]);
    setLatestParsedCandidateDraft(null);
    setStatus(String(error.message || error), "error");
  } finally {
    parseButton.disabled = !currentQuickCaptureUser;
    if (saveButton) saveButton.disabled = !currentQuickCaptureUser || !latestParsedCandidateDraft;
  }
}

async function saveCandidateAfterReview() {
  const liveUser = await getQuickCaptureCurrentUser();
  if (!liveUser) {
    renderAuthState(null);
    setStatus("Session expired. Please login again.", "error");
    window.location.href = "/quick-capture/";
    return;
  }
  renderAuthState(liveUser);
  if (!currentQuickCaptureUser) {
    setStatus("Login required first.", "error");
    return;
  }
  if (!latestParsedCandidateDraft) {
    setStatus("Parse the note for review before saving.", "error");
    return;
  }

  stopVoiceCapture();
  parseButton.disabled = true;
  saveButton.disabled = true;
  setStatus("Saving candidate...");

  try {
    const wasExistingRecord = Boolean(currentCandidateRecordId);
    if (latestDraftConflicts.length) {
      const conflictText = latestDraftConflicts
        .map((entry) => `${formatConflictLabel(entry.key)}: "${entry.from}" -> "${entry.to}"`)
        .join("\n");
      const confirmed = window.confirm(`These values conflict with the existing draft:\n\n${conflictText}\n\nSave merged candidate anyway?`);
      if (!confirmed) {
        setStatus("Save cancelled. Review conflicts first.", "error");
        return;
      }
    }
    const payload = await callQuickCaptureApi("/candidates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        candidate: {
          ...buildCandidateFromReviewFields()
        }
      })
    });

    renderJson(payload.result);
    loadCandidateIntoCapture(payload.result);
    setLatestParsedCandidateDraft(payload.result);
    refreshReviewPreview();
    latestDraftConflicts = [];
    renderConflictSummary([]);
    if (noteInput) noteInput.value = "";
    if (wasExistingRecord) {
      setStatus("Candidate updated.", "success");
    } else {
      setStatus("Candidate saved.", "success");
    }
  } catch (error) {
    setStatus(String(error.message || error), "error");
  } finally {
    parseButton.disabled = !currentQuickCaptureUser;
    saveButton.disabled = !currentQuickCaptureUser || !latestParsedCandidateDraft;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/quick-capture/sw.js").catch(() => {});
  });
}

recognition = buildRecognition();

micButton.addEventListener("click", () => {
  if (!recognition) return;
  if (isListening) {
    stopVoiceCapture();
    return;
  }
  voiceRequestedByUser = true;
  keepAliveUntil = Date.now() + 7000;
  recognition.start();
});

parseButton.addEventListener("click", parseNoteForReview);
saveButton.addEventListener("click", saveCandidateAfterReview);

async function bootstrapAuthState() {
  const user = await getQuickCaptureCurrentUser();
  renderAuthState(user);
  if (!user) {
    window.location.href = "/quick-capture/";
    return;
  }
  const candidateId = new URLSearchParams(window.location.search).get("candidateId");
  if (candidateId) {
    try {
      const payload = await callQuickCaptureApi(`/candidates?id=${encodeURIComponent(candidateId)}&limit=1`, { method: "GET" });
      const item = Array.isArray(payload.result) ? payload.result[0] : null;
      if (item) {
        loadCandidateIntoCapture(item);
        setStatus(`Loaded existing draft for ${item.name || "candidate"}. Add your new note, then parse for review.`, "success");
        return;
      }
    } catch (error) {
      setStatus(String(error.message || error), "error");
      return;
    }
  }
  setStatus("Quick capture is ready.", "success");
}

[
  candidateNameInput,
  candidateCompanyInput,
  candidateRoleInput,
  candidateExperienceInput,
  candidateLocationInput,
  candidateCurrentCtcInput,
  candidateExpectedCtcInput,
  candidateNoticePeriodInput,
  candidatePhoneInput,
  candidateEmailInput,
  candidateLinkedinInput,
  candidateNextActionInput,
  noteInput
].forEach((element) => {
  if (!element) return;
  element.addEventListener("input", refreshReviewPreview);
});

bootstrapAuthState().catch(() => {
  renderAuthState(null);
  window.location.href = "/quick-capture/";
});
