const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify(
        {
          companies: [],
          users: [],
          sessions: [],
          jobs: [],
          assessments: []
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, storedHash] = String(passwordHash || "").split(":");
  if (!salt || !storedHash) return false;
  const compareHash = crypto.pbkdf2Sync(String(password || ""), salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(compareHash, "hex"));
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    companyId: user.companyId,
    companyName: user.companyName,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function listCompaniesAndUsersSummary() {
  const store = readStore();
  return {
    companyCount: store.companies.length,
    userCount: store.users.length
  };
}

function bootstrapAdmin({ companyName, adminName, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!companyName || !adminName || !normalizedEmail || !password) {
    throw new Error("companyName, adminName, email, and password are required.");
  }

  const store = readStore();
  if (store.users.length) {
    throw new Error("Bootstrap is already completed. Use login or admin user creation instead.");
  }

  const companyId = crypto.randomUUID();
  const company = {
    id: companyId,
    name: String(companyName).trim(),
    createdAt: new Date().toISOString()
  };

  const user = {
    id: crypto.randomUUID(),
    companyId,
    companyName: company.name,
    name: String(adminName).trim(),
    email: normalizedEmail,
    role: "admin",
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  store.companies.push(company);
  store.users.push(user);
  writeStore(store);

  return {
    company,
    user: sanitizeUser(user)
  };
}

function createUser({ actorUserId, companyId, name, email, password, role }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = role === "admin" ? "admin" : "team";
  if (!actorUserId || !companyId || !name || !normalizedEmail || !password) {
    throw new Error("actorUserId, companyId, name, email, and password are required.");
  }

  const store = readStore();
  const actor = store.users.find((user) => user.id === actorUserId);
  if (!actor || actor.role !== "admin" || actor.companyId !== companyId) {
    throw new Error("Only an admin for this company can create recruiter accounts.");
  }

  if (store.users.some((user) => user.email === normalizedEmail)) {
    throw new Error("A user with this email already exists.");
  }

  const company = store.companies.find((item) => item.id === companyId);
  if (!company) {
    throw new Error("Company not found.");
  }

  const user = {
    id: crypto.randomUUID(),
    companyId,
    companyName: company.name,
    name: String(name).trim(),
    email: normalizedEmail,
    role: normalizedRole,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  store.users.push(user);
  writeStore(store);
  return sanitizeUser(user);
}

function deleteUser({ actorUserId, companyId, userId }) {
  if (!actorUserId || !companyId || !userId) {
    throw new Error("actorUserId, companyId, and userId are required.");
  }

  const store = readStore();
  const actor = store.users.find((user) => user.id === actorUserId);
  if (!actor || actor.role !== "admin" || actor.companyId !== companyId) {
    throw new Error("Only an admin for this company can delete recruiters.");
  }

  const target = store.users.find((user) => user.id === userId && user.companyId === companyId);
  if (!target) {
    throw new Error("Recruiter not found.");
  }
  if (target.role === "admin") {
    throw new Error("Admin accounts cannot be deleted from this panel.");
  }

  store.users = store.users.filter((user) => user.id !== userId);
  store.sessions = (store.sessions || []).filter((session) => session.userId !== userId);
  writeStore(store);
  return { deleted: true, userId };
}

function resetUserPassword({ actorUserId, companyId, userId, newPassword }) {
  if (!actorUserId || !companyId || !userId || !newPassword) {
    throw new Error("actorUserId, companyId, userId, and newPassword are required.");
  }

  const store = readStore();
  const actor = store.users.find((user) => user.id === actorUserId);
  if (!actor || actor.role !== "admin" || actor.companyId !== companyId) {
    throw new Error("Only an admin for this company can reset recruiter passwords.");
  }

  const target = store.users.find((user) => user.id === userId && user.companyId === companyId);
  if (!target) {
    throw new Error("Recruiter not found.");
  }
  if (target.role === "admin") {
    throw new Error("Admin passwords cannot be reset from this panel.");
  }

  target.passwordHash = hashPassword(newPassword);
  store.sessions = (store.sessions || []).filter((session) => session.userId !== userId);
  writeStore(store);
  return { reset: true, userId };
}

function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const store = readStore();
  const user = store.users.find((item) => item.email === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid email or password.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const session = {
    token,
    userId: user.id,
    companyId: user.companyId,
    createdAt: new Date().toISOString()
  };

  store.sessions = (store.sessions || []).filter((item) => item.userId !== user.id);
  store.sessions.push(session);
  writeStore(store);

  return {
    token,
    user: sanitizeUser(user)
  };
}

function getSessionUser(token) {
  if (!token) return null;
  const store = readStore();
  const session = (store.sessions || []).find((item) => item.token === token);
  if (!session) return null;
  const user = store.users.find((item) => item.id === session.userId);
  return sanitizeUser(user);
}

function requireSessionUser(token) {
  const user = getSessionUser(token);
  if (!user) {
    throw new Error("Invalid or missing session.");
  }
  return user;
}

function listCompanyUsers(companyId) {
  const store = readStore();
  return store.users
    .filter((user) => user.companyId === companyId)
    .map((user) => sanitizeUser(user));
}

function sanitizeJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    companyId: job.companyId,
    title: job.title,
    clientName: job.clientName,
    jobDescription: job.jobDescription,
    mustHaveSkills: job.mustHaveSkills,
    redFlags: job.redFlags,
    recruiterNotes: job.recruiterNotes,
    standardQuestions: job.standardQuestions,
    jdShortcuts: job.jdShortcuts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    updatedBy: job.updatedBy
  };
}

function listCompanyJobs(companyId) {
  const store = readStore();
  return (store.jobs || [])
    .filter((job) => job.companyId === companyId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .map((job) => sanitizeJob(job));
}

function saveCompanyJob({ actorUserId, companyId, job }) {
  if (!actorUserId || !companyId || !job?.title || !job?.jobDescription) {
    throw new Error("actorUserId, companyId, job title, and job description are required.");
  }

  const store = readStore();
  const actor = store.users.find((user) => user.id === actorUserId);
  if (!actor || actor.role !== "admin" || actor.companyId !== companyId) {
    throw new Error("Only an admin for this company can save or edit company JDs.");
  }

  store.jobs = Array.isArray(store.jobs) ? store.jobs : [];
  const now = new Date().toISOString();
  const existingIndex = store.jobs.findIndex((item) => item.id === job.id && item.companyId === companyId);
  const nextJob = {
    id: job.id || crypto.randomUUID(),
    companyId,
    title: String(job.title || "").trim(),
    clientName: String(job.clientName || "").trim(),
    jobDescription: String(job.jobDescription || "").trim(),
    mustHaveSkills: String(job.mustHaveSkills || "").trim(),
    redFlags: String(job.redFlags || "").trim(),
    recruiterNotes: String(job.recruiterNotes || "").trim(),
    standardQuestions: String(job.standardQuestions || "").trim(),
    jdShortcuts: String(job.jdShortcuts || "").trim(),
    createdAt: existingIndex >= 0 ? store.jobs[existingIndex].createdAt : now,
    updatedAt: now,
    updatedBy: actor.email
  };

  if (existingIndex >= 0) {
    store.jobs[existingIndex] = nextJob;
  } else {
    store.jobs.push(nextJob);
  }

  writeStore(store);
  return sanitizeJob(nextJob);
}

function deleteCompanyJob({ actorUserId, companyId, jobId }) {
  if (!actorUserId || !companyId || !jobId) {
    throw new Error("actorUserId, companyId, and jobId are required.");
  }

  const store = readStore();
  const actor = store.users.find((user) => user.id === actorUserId);
  if (!actor || actor.role !== "admin" || actor.companyId !== companyId) {
    throw new Error("Only an admin for this company can delete company JDs.");
  }

  const before = (store.jobs || []).length;
  store.jobs = (store.jobs || []).filter((job) => !(job.companyId === companyId && job.id === jobId));
  if (store.jobs.length === before) {
    throw new Error("Company JD not found.");
  }

  writeStore(store);
  return { deleted: true, jobId };
}

function sanitizeAssessment(item) {
  if (!item) return null;
  return {
    id: item.id,
    companyId: item.companyId,
    recruiterId: item.recruiterId,
    recruiterName: item.recruiterName,
    recruiterEmail: item.recruiterEmail,
    candidateName: item.candidateName,
    phoneNumber: item.phoneNumber,
    emailId: item.emailId,
    clientName: item.clientName,
    highestEducation: item.highestEducation,
    currentCompany: item.currentCompany,
    currentDesignation: item.currentDesignation,
    totalExperience: item.totalExperience,
    averageTenurePerCompany: item.averageTenurePerCompany,
    currentOrgTenure: item.currentOrgTenure,
    experienceTimeline: item.experienceTimeline,
    jdTitle: item.jdTitle,
    jobDescription: item.jobDescription,
    mustHaveSkills: item.mustHaveSkills,
    redFlags: item.redFlags,
    jdShortcuts: item.jdShortcuts,
    standardQuestions: item.standardQuestions,
    recruiterNotes: item.recruiterNotes,
    generatedAt: item.generatedAt,
    questionMode: item.questionMode,
    sections: item.sections,
    result: item.result,
    answers: item.answers,
    questionAnswerPairs: item.questionAnswerPairs
  };
}

function saveAssessment({ actorUserId, companyId, assessment }) {
  if (!actorUserId || !companyId || !assessment?.id) {
    throw new Error("actorUserId, companyId, and assessment id are required.");
  }

  const store = readStore();
  const actor = store.users.find((user) => user.id === actorUserId && user.companyId === companyId);
  if (!actor) {
    throw new Error("Authenticated recruiter not found for this company.");
  }

  store.assessments = Array.isArray(store.assessments) ? store.assessments : [];
  const now = new Date().toISOString();
  const existingIndex = store.assessments.findIndex((item) => item.id === assessment.id && item.companyId === companyId);
  const nextAssessment = {
    ...assessment,
    id: String(assessment.id).trim(),
    companyId,
    recruiterId: actor.id,
    recruiterName: actor.name,
    recruiterEmail: actor.email,
    generatedAt: assessment.generatedAt || now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    store.assessments[existingIndex] = nextAssessment;
  } else {
    store.assessments.unshift(nextAssessment);
  }

  writeStore(store);
  return sanitizeAssessment(nextAssessment);
}

function listAssessments({ actorUserId, companyId }) {
  if (!actorUserId || !companyId) {
    throw new Error("actorUserId and companyId are required.");
  }
  const store = readStore();
  const actor = store.users.find((user) => user.id === actorUserId && user.companyId === companyId);
  if (!actor) {
    throw new Error("Authenticated recruiter not found for this company.");
  }
  return (store.assessments || [])
    .filter((item) => {
      if (item.companyId !== companyId) return false;
      if (actor.role === "admin") return true;
      return item.recruiterId === actor.id;
    })
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))
    .map((item) => sanitizeAssessment(item));
}

function deleteAssessment({ actorUserId, companyId, assessmentId }) {
  if (!actorUserId || !companyId || !assessmentId) {
    throw new Error("actorUserId, companyId, and assessmentId are required.");
  }

  const store = readStore();
  const actor = store.users.find((user) => user.id === actorUserId && user.companyId === companyId);
  if (!actor) {
    throw new Error("Authenticated recruiter not found for this company.");
  }

  const before = (store.assessments || []).length;
  store.assessments = (store.assessments || []).filter((item) => {
    if (!(item.companyId === companyId && item.id === assessmentId)) return true;
    if (actor.role === "admin") return false;
    return item.recruiterId !== actor.id;
  });

  if (store.assessments.length === before) {
    throw new Error("Assessment not found or not allowed.");
  }

  writeStore(store);
  return { deleted: true, assessmentId };
}

module.exports = {
  bootstrapAdmin,
  createUser,
  deleteUser,
  deleteAssessment,
  deleteCompanyJob,
  getSessionUser,
  listCompaniesAndUsersSummary,
  listAssessments,
  listCompanyJobs,
  listCompanyUsers,
  login,
  requireSessionUser,
  resetUserPassword,
  saveAssessment,
  saveCompanyJob
};
