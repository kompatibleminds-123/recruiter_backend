import process from "node:process";

function getArg(name, fallback = "") {
  const ix = process.argv.findIndex((a) => a === `--${name}`);
  if (ix >= 0 && process.argv[ix + 1]) return process.argv[ix + 1];
  return fallback;
}

const baseUrl = getArg("url", process.env.BASE_URL || "http://localhost:8787").replace(/\/+$/, "");
const email = getArg("email", process.env.ADMIN_EMAIL || "");
const password = getArg("password", process.env.ADMIN_PASSWORD || "");
const limit = Number(getArg("limit", process.env.LIMIT || "300")) || 300;
const force = getArg("force", process.env.FORCE || "false") === "true";

if (!email || !password) {
  console.error("Missing --email/--password (or ADMIN_EMAIL/ADMIN_PASSWORD env).");
  process.exit(1);
}

async function main() {
  const loginRes = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!loginRes.ok) {
    const body = await loginRes.text().catch(() => "");
    throw new Error(`Login failed (${loginRes.status}): ${body.slice(0, 200)}`);
  }
  const loginJson = await loginRes.json();
  const token = loginJson?.result?.token || loginJson?.token;
  if (!token) throw new Error("Missing token in login response.");

  const res = await fetch(`${baseUrl}/company/candidates/backfill-search-embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ limit, force })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Backfill failed (${res.status}): ${JSON.stringify(json || {}, null, 2).slice(0, 500)}`);
  }
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

