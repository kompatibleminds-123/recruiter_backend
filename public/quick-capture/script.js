const noteInput = document.getElementById("noteInput");
const micButton = document.getElementById("micButton");
const submitButton = document.getElementById("submitButton");
const statusMessage = document.getElementById("statusMessage");
const jsonOutput = document.getElementById("jsonOutput");
const candidateSummary = document.getElementById("candidateSummary");
const candidateNameInput = document.getElementById("candidateName");
const candidateCompanyInput = document.getElementById("candidateCompany");
const candidateRoleInput = document.getElementById("candidateRole");
const candidateExperienceInput = document.getElementById("candidateExperience");
const candidateCurrentCtcInput = document.getElementById("candidateCurrentCtc");
const candidateExpectedCtcInput = document.getElementById("candidateExpectedCtc");
const candidateNoticePeriodInput = document.getElementById("candidateNoticePeriod");
const candidateNextActionInput = document.getElementById("candidateNextAction");

let recognition = null;
let isListening = false;
let voiceSilenceTimer = null;
let keepAliveUntil = 0;
let manualVoiceStop = false;
let voiceSessionActive = false;
let voiceBaseText = "";
let voiceInterimText = "";
let voiceCommittedChunks = new Set();
let currentCandidateRecordId = "";
let currentCandidateCreatedAt = "";

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

function renderJson(data) {
  jsonOutput.textContent = JSON.stringify(data, null, 2);
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

function populateFormFromParsedResult(data) {
  if (!data || typeof data !== "object") return;
  currentCandidateRecordId = String(data.id || "").trim();
  currentCandidateCreatedAt = String(data.created_at || "").trim();
  if (candidateNameInput) candidateNameInput.value = String(data.name || "").trim();
  if (candidateCompanyInput) candidateCompanyInput.value = String(data.company || "").trim();
  if (candidateRoleInput) candidateRoleInput.value = String(data.role || "").trim();
  if (candidateExperienceInput) candidateExperienceInput.value = String(data.experience || "").trim();
  if (candidateCurrentCtcInput) candidateCurrentCtcInput.value = String(data.current_ctc || "").trim();
  if (candidateExpectedCtcInput) candidateExpectedCtcInput.value = String(data.expected_ctc || "").trim();
  if (candidateNoticePeriodInput) candidateNoticePeriodInput.value = String(data.notice_period || "").trim();
  if (candidateNextActionInput) candidateNextActionInput.value = String(data.next_action || "").trim();
  if (noteInput) noteInput.value = String(data.notes || "").trim();
}

function clearVoiceSilenceTimer() {
  if (voiceSilenceTimer) {
    window.clearTimeout(voiceSilenceTimer);
    voiceSilenceTimer = null;
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
  }, 10000);
}

function buildNoteFromForm() {
  const parts = [
    candidateNameInput?.value.trim() ? `name ${candidateNameInput.value.trim()}` : "",
    candidateCompanyInput?.value.trim() ? `company ${candidateCompanyInput.value.trim()}` : "",
    candidateRoleInput?.value.trim() ? `role ${candidateRoleInput.value.trim()}` : "",
    candidateExperienceInput?.value.trim() ? `experience ${candidateExperienceInput.value.trim()}` : "",
    candidateCurrentCtcInput?.value.trim() ? `current ctc ${candidateCurrentCtcInput.value.trim()}` : "",
    candidateExpectedCtcInput?.value.trim() ? `expected ctc ${candidateExpectedCtcInput.value.trim()}` : "",
    candidateNoticePeriodInput?.value.trim() ? `notice period ${candidateNoticePeriodInput.value.trim()}` : "",
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
    manualVoiceStop = false;
    if (!voiceSessionActive) {
      voiceSessionActive = true;
      voiceBaseText = noteInput.value.trim();
      voiceInterimText = "";
      voiceCommittedChunks = new Set();
    }
    keepAliveUntil = Date.now() + 10000;
    armVoiceSilenceTimer();
    micButton.textContent = "Listening...";
    setStatus("Voice capture started.");
  };

  instance.onend = () => {
    clearVoiceSilenceTimer();
    if (!manualVoiceStop && Date.now() < keepAliveUntil) {
      window.setTimeout(() => {
        try {
          instance.start();
        } catch {
          isListening = false;
          micButton.textContent = "Start voice input";
        }
      }, 150);
      return;
    }
    isListening = false;
    manualVoiceStop = false;
    voiceSessionActive = false;
    voiceBaseText = noteInput.value.trim();
    voiceInterimText = "";
    voiceCommittedChunks.clear();
    micButton.textContent = "Start voice input";
  };

  instance.onerror = (event) => {
    voiceInterimText = "";
    setStatus(`Voice input error: ${event.error}`, "error");
  };

  instance.onresult = (event) => {
    keepAliveUntil = Date.now() + 10000;
    armVoiceSilenceTimer();

    let committedNewText = false;
    const interimChunks = [];

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = (result[0]?.transcript || "").trim();
      if (!transcript) continue;

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
  manualVoiceStop = true;
  keepAliveUntil = 0;
  clearVoiceSilenceTimer();
  voiceInterimText = "";
  noteInput.value = voiceBaseText || noteInput.value.trim();
  if (isListening) {
    recognition.stop();
  } else {
    voiceSessionActive = false;
    voiceCommittedChunks.clear();
    micButton.textContent = "Start voice input";
  }
}

function resetCurrentCandidateTracking() {
  currentCandidateRecordId = "";
  currentCandidateCreatedAt = "";
}

async function submitNote() {
  stopVoiceCapture();
  const noteText = buildNoteFromForm();
  if (!noteText) {
    setStatus("Please enter or dictate a candidate note first.", "error");
    return;
  }
  const wasUpdate = Boolean(currentCandidateRecordId);

  submitButton.disabled = true;
  setStatus("Parsing and saving candidate note...");

  try {
    const response = await fetch("/parse-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: currentCandidateRecordId || undefined,
        created_at: currentCandidateCreatedAt || undefined,
        noteText,
        source: "mobile_pwa"
      })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to parse the note.");
    }

    renderJson(payload.result);
    populateFormFromParsedResult(payload.result);
    renderCandidateSummary(payload.result);
    if (payload.duplicate) {
      setStatus(`Possible duplicate found by ${payload.duplicateBy.join(", ")}. Existing record opened instead of creating a new one.`, "error");
    } else {
      setStatus(
        wasUpdate ? "Candidate updated. You can keep editing and save again." : "Candidate saved. You can edit the fields or dictate a correction, then save again.",
        "success"
      );
    }
  } catch (error) {
    setStatus(String(error.message || error), "error");
  } finally {
    submitButton.disabled = false;
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
  keepAliveUntil = Date.now() + 10000;
  recognition.start();
});

submitButton.addEventListener("click", submitNote);
