const noteInput = document.getElementById("noteInput");
const micButton = document.getElementById("micButton");
const submitButton = document.getElementById("submitButton");
const statusMessage = document.getElementById("statusMessage");
const jsonOutput = document.getElementById("jsonOutput");
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
let lastVoiceFinalTranscript = "";
let voiceSilenceTimer = null;
let keepAliveUntil = 0;
let manualVoiceStop = false;

function setStatus(message, tone = "") {
  statusMessage.textContent = message || "";
  statusMessage.className = `status-message${tone ? ` ${tone}` : ""}`;
}

function renderJson(data) {
  jsonOutput.textContent = JSON.stringify(data, null, 2);
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

  instance.onstart = () => {
    isListening = true;
    manualVoiceStop = false;
    lastVoiceFinalTranscript = "";
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
    micButton.textContent = "Start voice input";
  };

  instance.onerror = (event) => {
    setStatus(`Voice input error: ${event.error}`, "error");
  };

  instance.onresult = (event) => {
    keepAliveUntil = Date.now() + 10000;
    armVoiceSilenceTimer();
    const finalTranscript = Array.from(event.results)
      .filter((result) => result.isFinal)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();

    if (finalTranscript && finalTranscript !== lastVoiceFinalTranscript) {
      noteInput.value = noteInput.value ? `${noteInput.value} ${finalTranscript}`.trim() : finalTranscript;
      lastVoiceFinalTranscript = finalTranscript;
      setStatus("Voice note added to input.");
    }
  };

  return instance;
}

async function submitNote() {
  const noteText = buildNoteFromForm();
  if (!noteText) {
    setStatus("Please enter or dictate a candidate note first.", "error");
    return;
  }

  submitButton.disabled = true;
  setStatus("Parsing and saving candidate note...");

  try {
    const response = await fetch("/parse-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        noteText,
        source: "mobile_pwa"
      })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to parse the note.");
    }

    renderJson(payload.result);
    setStatus("Candidate note parsed and saved successfully.", "success");
    if (candidateNameInput) candidateNameInput.value = "";
    if (candidateCompanyInput) candidateCompanyInput.value = "";
    if (candidateRoleInput) candidateRoleInput.value = "";
    if (candidateExperienceInput) candidateExperienceInput.value = "";
    if (candidateCurrentCtcInput) candidateCurrentCtcInput.value = "";
    if (candidateExpectedCtcInput) candidateExpectedCtcInput.value = "";
    if (candidateNoticePeriodInput) candidateNoticePeriodInput.value = "";
    if (candidateNextActionInput) candidateNextActionInput.value = "";
    noteInput.value = "";
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
    manualVoiceStop = true;
    keepAliveUntil = 0;
    clearVoiceSilenceTimer();
    recognition.stop();
    return;
  }
  keepAliveUntil = Date.now() + 10000;
  recognition.start();
});

submitButton.addEventListener("click", submitNote);
