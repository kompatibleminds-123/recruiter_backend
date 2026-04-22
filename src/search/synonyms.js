// Deterministic recruitment ontology used by normalization + synonym expansion.
// This is safe to keep always-on (cost-free) and shared by both Boolean and Natural search.
const DEFAULT_SYNONYMS = {
  locations: {
    // Delhi / NCR
    "delhi": "delhi",
    "new delhi": "delhi",
    "ncr": ["delhi", "gurgaon", "noida", "faridabad", "ghaziabad"],
    "delhi ncr": ["delhi", "gurgaon", "noida", "faridabad", "ghaziabad"],
    "gurgaon": ["gurgaon", "gurugram", "ggn"],
    "gurugram": ["gurgaon", "gurugram", "ggn"],
    "gurgram": ["gurgaon", "gurugram", "ggn"],
    "ggn": ["gurgaon", "gurugram", "ggn"],
    "noida": ["noida", "greater noida"],
    "greater noida": ["noida", "greater noida"],
    "faridabad": "faridabad",
    "ghaziabad": "ghaziabad",

    // Major metros
    "bangalore": ["bangalore", "bengaluru", "blr"],
    "bengaluru": ["bangalore", "bengaluru", "blr"],
    "blr": ["bangalore", "bengaluru", "blr"],
    "mumbai": ["mumbai", "bombay", "navi mumbai", "thane"],
    "bombay": ["mumbai", "bombay", "navi mumbai", "thane"],
    "navi mumbai": ["mumbai", "navi mumbai"],
    "thane": ["mumbai", "thane"],
    "pune": ["pune", "hinjewadi"],
    "hinjewadi": ["pune", "hinjewadi"],
    "hyderabad": ["hyderabad", "hitech city", "gachibowli"],
    "hitech city": ["hyderabad", "hitech city", "gachibowli"],
    "gachibowli": ["hyderabad", "gachibowli"],
    "chennai": "chennai",
    "kolkata": ["kolkata", "calcutta"],
    "calcutta": ["kolkata", "calcutta"],
    "ahmedabad": "ahmedabad",
    "jaipur": "jaipur",
    "indore": "indore",
    "chandigarh": ["chandigarh", "tricity", "mohali"],
    "tricity": ["chandigarh", "tricity", "mohali"],
    "mohali": ["chandigarh", "mohali", "tricity"],
    "lucknow": "lucknow",
    "kochi": ["kochi", "cochin"],
    "cochin": ["kochi", "cochin"],
    "coimbatore": "coimbatore",
    "nagpur": "nagpur",
    "surat": "surat",
    "vadodara": ["vadodara", "baroda"],
    "baroda": ["vadodara", "baroda"],

    // Work modes
    "remote": ["remote", "work from home", "wfh"],
    "hybrid": "hybrid",
    "onsite": "onsite"
  },
  experienceLevels: {
    fresher: { min: 0, max: 1 },
    "entry level": { min: 0, max: 2 },
    trainee: { min: 0, max: 2 },
    junior: { min: 0, max: 2 },
    "mid level": { min: 3, max: 5 },
    "mid-level": { min: 3, max: 5 },
    midlevel: { min: 3, max: 5 },
    senior: { min: 6, max: null },
    sr: { min: 6, max: null },
    lead: { min: 8, max: null },
    "team lead": { min: 8, max: null },
    "tech lead": { min: 8, max: null },
    architect: { min: 10, max: null },
    "solution architect": { min: 10, max: null },
    "enterprise architect": { min: 10, max: null }
  },
  // Canonical skill -> list of variants that should be treated as the same intent.
  skills: {
    // Languages / backend stacks
    java: ["core java", "j2ee", "spring", "spring boot", "hibernate", "microservices", "maven"],
    nodejs: ["node", "node js", "node.js", "express", "nestjs", "backend javascript", "node developer", "nodejs developer"],
    javascript: ["js", "ecmascript"],
    typescript: ["ts", "typescript frontend"],
    python: ["django", "flask", "fastapi", "pandas", "numpy"],
    php: ["laravel", "codeigniter"],
    dotnet: ["dotnet", ".net", "asp.net", "aspnet", "c#", "c sharp", "csharp", "mvc", ".net core", "dotnet core", "asp.net core"],
    ruby: ["rails", "ruby on rails"],
    golang: ["go", "go lang", "go-language", "go developer", "golang developer"],
    rust: ["rustlang"],

    // Frontend
    react: ["reactjs", "react js", "redux", "nextjs", "next js", "jsx", "frontend react engineer", "react developer"],
    angular: ["angularjs", "angular js", "typescript frontend"],
    vue: ["vuejs", "vue js"],

    // Mobile
    android: ["kotlin", "java android"],
    ios: ["swift", "objective c", "objective-c"],
    flutter: ["dart"],
    "react native": ["rn mobile", "react-native"],

    // QA
    "qa manual": ["qa", "manual tester", "testing", "software tester"],
    "automation qa": ["selenium", "cypress", "playwright", "automation tester", "testng"],
    "performance testing": ["jmeter", "loadrunner"],

    // DevOps / cloud
    devops: ["sre", "platform engineer", "dev ops", "devops engineer"],
    aws: ["amazon web services", "ec2", "s3", "lambda"],
    azure: ["microsoft azure"],
    gcp: ["google cloud"],
    docker: ["containers"],
    kubernetes: ["k8s"],
    cicd: ["ci/cd", "ci cd", "jenkins", "github actions", "gitlab ci"],

    // Databases / data
    sql: ["mysql", "postgresql", "postgres", "mssql", "sql server"],
    nosql: ["mongodb", "mongo", "cassandra", "dynamodb", "redis"],
    kafka: ["apache kafka"],
    "data engineering": ["data engineer", "etl", "spark", "pyspark", "airflow"],
    bi: ["power bi", "tableau", "looker", "reporting analyst"],

    // AI/ML
    "ai/ml": ["machine learning", "ml", "ai", "nlp", "llm", "deep learning", "tensorflow", "pytorch"],
    genai: ["openai", "langchain", "rag", "vector db", "vector database", "embeddings"],

    // Apps
    erp: ["sap", "oracle apps", "dynamics"],
    crm: ["salesforce", "zoho crm", "hubspot"]
  }
};

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function expandSkillTerms(terms, synonyms = DEFAULT_SYNONYMS) {
  const input = Array.isArray(terms) ? terms : [];
  const normalized = input.map((t) => normalizeToken(t)).filter(Boolean);
  const expanded = new Set();
  normalized.forEach((t) => expanded.add(t));

  const skillMap = synonyms?.skills || {};
  const canonicalByVariant = new Map();
  Object.entries(skillMap).forEach(([canonical, variants]) => {
    const key = normalizeToken(canonical);
    canonicalByVariant.set(key, key);
    (Array.isArray(variants) ? variants : []).forEach((variant) => {
      canonicalByVariant.set(normalizeToken(variant), key);
    });
  });

  normalized.forEach((t) => {
    const canonical = canonicalByVariant.get(t);
    if (canonical) expanded.add(canonical);
  });

  // If recruiter typed a canonical term, also include its variants for matching in free text.
  normalized.forEach((t) => {
    Object.entries(skillMap).forEach(([canonical, variants]) => {
      const canonicalKey = normalizeToken(canonical);
      if (t !== canonicalKey) return;
      (Array.isArray(variants) ? variants : []).forEach((variant) => expanded.add(normalizeToken(variant)));
    });
  });

  return Array.from(expanded).filter(Boolean);
}

function mapLocationAlias(value, synonyms = DEFAULT_SYNONYMS) {
  const token = normalizeToken(value);
  if (!token) return { canonical: "", variants: [] };
  const mapping = synonyms?.locations || {};
  const mapped = mapping[token];
  if (!mapped) return { canonical: token, variants: [] };
  if (Array.isArray(mapped)) {
    const variants = mapped.map((v) => normalizeToken(v)).filter(Boolean);
    // Prefer a real city name as canonical so "Delhi NCR" queries don't fail the strict `filters.location` check.
    const canonical = variants[0] || token;
    return { canonical, variants: Array.from(new Set([canonical, ...variants])).filter(Boolean) };
  }
  return { canonical: normalizeToken(mapped), variants: [] };
}

function inferExperienceRangeFromText(normalizedQuery, synonyms = DEFAULT_SYNONYMS) {
  const lower = normalizeToken(normalizedQuery);
  if (!lower) return null;
  const levels = synonyms?.experienceLevels || {};
  for (const [label, range] of Object.entries(levels)) {
    const token = normalizeToken(label);
    if (!token) continue;
    if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
      return { min: range?.min ?? null, max: range?.max ?? null, label: token };
    }
  }
  return null;
}

module.exports = {
  DEFAULT_SYNONYMS,
  expandSkillTerms,
  inferExperienceRangeFromText,
  mapLocationAlias,
  normalizeToken
};
