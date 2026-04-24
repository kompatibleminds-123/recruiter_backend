const { DEFAULT_SYNONYMS, mapLocationAlias } = require("./synonyms");
const { normalizeWhitespace, standardizeSkillAliases, standardizeLocationAliases } = require("./normalize");

const FILLER_STOP_WORDS = new Set([
  "get",
  "me",
  "show",
  "find",
  "who",
  "has",
  "have",
  "with",
  "from",
  "in",
  "at",
  "for",
  "profiles",
  "profile",
  "candidate",
  "candidates",
  "less",
  "than",
  "under",
  "below",
  "maximum",
  "max",
  "within",
  "days",
  "day",
  "notice",
  "period",
  "the",
  "a",
  "an",
  "of",
  "to",
  "by",
  "and",
  "or",
  "into",
  "please"
]);

const DOMAIN_KEYWORDS = ["fintech", "finance", "lending", "loan", "healthcare", "edtech", "proptech"];

const ROLE_FAMILY_RULES = [
  { family: "tech", regex: /\b(developer|engineer|programmer|full[\s-]?stack|backend|frontend|software)\b/i },
  { family: "sales", regex: /\b(sales|account executive|account manager|relationship manager|inside sales|field sales)\b/i },
  { family: "business_development", regex: /\b(business development|bdm|bdr|sdr|client acquisition)\b/i },
  { family: "recruitment", regex: /\b(recruiter|talent acquisition|sourcer|headhunter)\b/i }
];

const ROLE_PATTERNS = [
  { role: "nodejs developer", regex: /\b(nodejs|node)\s+(developers?|engineers?|programmers?|development)\b/i, skills: ["nodejs"] },
  { role: "react developer", regex: /\b(react|reactjs)\s+(developers?|engineers?)\b/i, skills: ["react"] },
  { role: "java developer", regex: /\bjava\s+(developers?|engineers?)\b/i, skills: ["java"] },
  { role: "python developer", regex: /\bpython\s+(developers?|engineers?)\b/i, skills: ["python"] },
  { role: "dotnet developer", regex: /\b(dotnet|\.net|asp\.net)\s+(developers?|engineers?)\b/i, skills: ["dotnet"] },
  { role: "golang developer", regex: /\b(golang|go)\s+(developers?|engineers?)\b/i, skills: ["golang"] },
  { role: "data engineer", regex: /\bdata\s+engineer\b/i, skills: ["data engineer"] },
  { role: "sales manager", regex: /\bsales\s+manager\b/i, skills: [] },
  { role: "sales", regex: /\bsales\b/i, skills: [] },
  { role: "business development", regex: /\bbusiness\s+development\b/i, skills: [] },
  { role: "recruiter", regex: /\brecruiter\b/i, skills: [] }
];

const KNOWN_ROLES_DICTIONARY = new Set([
  ...ROLE_PATTERNS.map((item) => String(item?.role || "").trim().toLowerCase()).filter(Boolean),
  "backend developer",
  "frontend developer",
  "full stack developer",
  "software engineer",
  "software developer",
  "qa engineer",
  "automation qa engineer",
  "devops engineer",
  "product manager",
  "project manager",
  "account executive",
  "account manager",
  "relationship manager",
  "business development manager",
  "hr recruiter",
  "technical recruiter",
  "talent acquisition"
]);

const ROLE_ALIAS_TO_CANONICAL = {
  "node developer": "nodejs developer",
  "nodejs developer": "nodejs developer",
  "node js developer": "nodejs developer",
  "node.js developer": "nodejs developer",
  "react developer": "react developer",
  "reactjs developer": "react developer",
  "java developer": "java developer",
  "python developer": "python developer",
  ".net developer": "dotnet developer",
  "asp.net developer": "dotnet developer",
  "dot net developer": "dotnet developer",
  "dotnet developer": "dotnet developer",
  "go developer": "golang developer",
  "golang developer": "golang developer"
};

const SKILL_PATTERNS = [
  { skill: "nodejs", regex: /\b(nodejs|node js|node\.js|node)\b/i },
  { skill: "react", regex: /\b(react|reactjs|react js|nextjs)\b/i },
  { skill: "java", regex: /\b(java|spring|spring boot)\b/i },
  { skill: "python", regex: /\b(python|django|flask|fastapi)\b/i },
  { skill: "dotnet", regex: /\b(dotnet|\.net|asp\.net|c#)\b/i },
  { skill: "golang", regex: /\b(golang|go lang|go)\b/i },
  { skill: "angular", regex: /\bangular\b/i },
  { skill: "sql", regex: /\b(sql|mysql|postgres|postgresql|sql server)\b/i },
  { skill: "mongodb", regex: /\b(mongodb|mongo)\b/i },
  { skill: "kafka", regex: /\bkafka\b/i },
  { skill: "aws", regex: /\baws|amazon web services\b/i },
  { skill: "azure", regex: /\bazure\b/i }
];

function detectSourceTypeFilter(query = "") {
  const text = String(query || "").toLowerCase();
  if (/\battempt\s+outcome\b|\bfrom\s+attempt\b/.test(text)) return "captured";
  if (/\bassessment\s+status\b|\bfrom\s+assessment\b/.test(text)) return "assessment";
  if (/\bcaptured\s+notes?\b|\bcaptured\s+note\b|\bnotes?\s+captured\b/.test(text)) return "captured";
  if (/\bapplied\b|\bapplicants?\b|\bwebsite\s+apply\b|\bhosted\s+apply\b/.test(text)) return "applied";
  if (/\bassessments?\b|\bconverted\b|\bshared\b|\bcv shared\b|\bcv to be shared\b/.test(text)) return "assessment";
  return "";
}

function detectStatusFields(query = "") {
  const text = String(query || "").toLowerCase();
  const detailedStatuses = [];
  let attemptOutcome = "";
  let assessmentStatus = "";

  if (/\bduplicate(?:s)?\b/.test(text)) {
    detailedStatuses.push("duplicate");
    attemptOutcome = "Duplicate";
    assessmentStatus = "Duplicate";
  }
  if (/\bfeedback awaited\b|\bawaiting feedback\b|\bawaited feedback\b/.test(text)) {
    detailedStatuses.push("feedback awaited");
    assessmentStatus = "Feedback awaited";
  }
  if (/\bnot received\b|\bnot responding\b|\bno response\b|\bno answer\b|\bnr\b/.test(text)) {
    detailedStatuses.push("not received");
    attemptOutcome = "Not responding";
  }
  if (/\bbusy\b|\bcall busy\b/.test(text)) {
    detailedStatuses.push("busy");
    attemptOutcome = "Busy";
  }
  if (/\bnot reachable\b|\bunreachable\b/.test(text)) {
    detailedStatuses.push("not reachable");
    attemptOutcome = "Not reachable";
  }
  if (/\bdisconnected\b/.test(text)) {
    detailedStatuses.push("disconnected");
    attemptOutcome = "Disconnected";
  }
  if (/\bcall later\b|\bcall back later\b/.test(text)) {
    detailedStatuses.push("call later");
    attemptOutcome = "Call later";
  }

  return {
    detailedStatuses: Array.from(new Set(detailedStatuses)),
    attemptOutcome,
    assessmentStatus
  };
}

function dedupeAdjacentWords(value = "") {
  let text = String(value || "");
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/\b([a-z0-9#+.]+)(?:\s+\1\b)+/gi, "$1");
  }
  return text;
}

function normalizeParserQuery(rawQuery, synonyms = DEFAULT_SYNONYMS) {
  let query = String(rawQuery || "").toLowerCase();
  query = query.replace(/[|]/g, " ");
  query = query.replace(/[;]+/g, ",");
  query = query.replace(/[(){}\[\]]/g, " ");
  query = query.replace(/\s*\/\s*/g, " / ");
  query = query.replace(/\s*,\s*/g, ", ");
  query = query.replace(/\bless\s+less\s+than\b/g, "less than");
  query = normalizeWhitespace(query);
  query = dedupeAdjacentWords(query);
  query = standardizeSkillAliases(query);
  query = standardizeLocationAliases(query, synonyms);
  query = normalizeWhitespace(query);
  return query;
}

function buildLocationAliasEntries(synonyms = DEFAULT_SYNONYMS) {
  const entries = [];
  const mapping = synonyms?.locations || {};
  Object.keys(mapping).forEach((alias) => {
    const aliasToken = String(alias || "").trim().toLowerCase();
    if (!aliasToken) return;
    const mapped = mapLocationAlias(aliasToken, synonyms);
    if (!mapped?.canonical) return;
    entries.push({
      alias: aliasToken,
      canonical: String(mapped.canonical || "").trim().toLowerCase()
    });
  });
  return entries.sort((a, b) => b.alias.length - a.alias.length);
}

function extractLocations(query, synonyms = DEFAULT_SYNONYMS) {
  const entries = buildLocationAliasEntries(synonyms);
  const found = [];
  for (const entry of entries) {
    const escaped = entry.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = query.match(new RegExp(`\\b${escaped}\\b`, "i"));
    if (match && typeof match.index === "number") {
      found.push({ canonical: entry.canonical, index: match.index });
    }
  }
  return Array.from(
    new Set(
      found
        .sort((a, b) => a.index - b.index)
        .map((item) => item.canonical)
    )
  );
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractNoticePeriod(query = "") {
  const text = String(query || "").toLowerCase();
  if (!text) return { maxNoticeDays: null, servingNotice: false };
  if (/\b(immediate joiner|immediate joining|immediate)\b/.test(text)) {
    return { maxNoticeDays: 0, servingNotice: false };
  }

  const servingNotice = /\b(serving notice|on notice)\b/.test(text);
  const patterns = [
    /\b(?:less than|under|below|max|maximum|within)\s+(\d{1,3})\s*(day|days|month|months)\b/i,
    /\b(\d{1,3})\s*(day|days|month|months)\s+(?:notice period|notice)\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = parseNumber(match[1]);
    if (amount == null) continue;
    const unit = String(match[2] || "days").toLowerCase();
    const multiplier = unit.startsWith("month") ? 30 : 1;
    return { maxNoticeDays: Math.round(amount * multiplier), servingNotice };
  }

  return { maxNoticeDays: null, servingNotice };
}

function cleanupResidualText(query = "", locations = []) {
  let residual = String(query || "").toLowerCase();
  locations.forEach((loc) => {
    const escaped = String(loc || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    residual = residual.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  });

  residual = residual
    .replace(/\b(?:less than|under|below|max|maximum|within)\s+\d{1,3}\s*(?:day|days|month|months)\b/gi, " ")
    .replace(/\b\d{1,3}\s*(?:day|days|month|months)\s+(?:notice|notice period)\b/gi, " ")
    .replace(/\b(?:immediate joiner|immediate joining|immediate|serving notice|on notice)\b/gi, " ")
    .replace(/\b(?:current ctc|expected ctc|ctc|salary|package)\b[^,;]*/gi, " ")
    .replace(/[,+/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = residual.split(/\s+/).filter(Boolean);
  return tokens.filter((token) => !FILLER_STOP_WORDS.has(token)).join(" ");
}

function detectDomainKeywords(query = "") {
  const text = String(query || "").toLowerCase();
  return DOMAIN_KEYWORDS.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

function detectRoleAndSkills(cleanedText = "", fullQuery = "") {
  const roleSource = `${String(cleanedText || "")} ${String(fullQuery || "")}`.trim();
  const text = roleSource.toLowerCase();
  let role = "";
  const skillSet = new Set();

  for (const rule of ROLE_PATTERNS) {
    if (rule.regex.test(text)) {
      role = rule.role;
      (rule.skills || []).forEach((skill) => skillSet.add(skill));
      break;
    }
  }

  for (const skillRule of SKILL_PATTERNS) {
    if (skillRule.regex.test(text)) skillSet.add(skillRule.skill);
  }

  if (!role) {
    if (/\bdeveloper\b|\bengineer\b/.test(text)) {
      const firstSkill = Array.from(skillSet)[0] || "";
      if (firstSkill && !["sql", "azure", "aws", "mongodb", "kafka"].includes(firstSkill)) {
        role = `${firstSkill} developer`;
      } else {
        role = "developer";
      }
    } else if (/\bsales\b/.test(text)) {
      role = "sales";
    }
  }

  const roleFamilies = [];
  ROLE_FAMILY_RULES.forEach((rule) => {
    if (rule.regex.test(`${text} ${role}`)) roleFamilies.push(rule.family);
  });

  return {
    role: String(role || "").trim(),
    roleFamilies: Array.from(new Set(roleFamilies)),
    skills: Array.from(skillSet)
  };
}

function sanitizeSkillTokens(skills = []) {
  return Array.from(
    new Set(
      (Array.isArray(skills) ? skills : [])
        .map((skill) => String(skill || "").trim().toLowerCase())
        .filter(Boolean)
        .filter((skill) => !FILLER_STOP_WORDS.has(skill))
        .filter((skill) => !/^(has|have|who|than|under|below|max|maximum|within|less)$/i.test(skill))
    )
  );
}

function normalizeRoleToken(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveKnownRole(value = "") {
  const normalized = normalizeRoleToken(value);
  if (!normalized) return "";
  const aliasHit = ROLE_ALIAS_TO_CANONICAL[normalized];
  if (aliasHit) return aliasHit;
  if (KNOWN_ROLES_DICTIONARY.has(normalized)) return normalized;
  return "";
}

function parseDeterministicRecruiterQuery(rawQuery = "", synonyms = DEFAULT_SYNONYMS) {
  const normalizedQuery = normalizeParserQuery(rawQuery, synonyms);
  const locations = extractLocations(normalizedQuery, synonyms);
  const notice = extractNoticePeriod(normalizedQuery);
  const cleanedText = cleanupResidualText(normalizedQuery, locations);
  const roleSkill = detectRoleAndSkills(cleanedText, normalizedQuery);
  const domainKeywords = detectDomainKeywords(normalizedQuery);
  const skills = sanitizeSkillTokens(roleSkill.skills);
  const sourceTypeFilter = detectSourceTypeFilter(normalizedQuery);
  const statuses = detectStatusFields(normalizedQuery);

  return {
    normalizedQuery,
    cleanedText,
    role: roleSkill.role,
    roleFamilies: roleSkill.roleFamilies,
    locations,
    location: locations.length ? locations[0] : "",
    skills,
    domainKeywords,
    maxNoticeDays: typeof notice.maxNoticeDays === "number" ? notice.maxNoticeDays : null,
    servingNotice: Boolean(notice.servingNotice),
    sourceTypeFilter,
    detailedStatuses: statuses.detailedStatuses,
    attemptOutcome: statuses.attemptOutcome,
    assessmentStatus: statuses.assessmentStatus
  };
}

module.exports = {
  normalizeParserQuery,
  extractLocations,
  extractNoticePeriod,
  parseDeterministicRecruiterQuery,
  resolveKnownRole,
  KNOWN_ROLES_DICTIONARY
};
