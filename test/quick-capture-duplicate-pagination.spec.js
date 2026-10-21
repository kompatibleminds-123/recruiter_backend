const assert = require("assert");
const { findDuplicateCandidate } = require("../src/quick-capture");

async function run() {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

  const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: `recent-${index}`, phone: `80000${String(index).padStart(5, "0")}` }));
  const olderMatch = { id: "older-match", phone: "+91 98765 43210", email: "older@example.com" };
  const requestedOffsets = [];
  global.fetch = async (requestUrl) => {
    const parsed = new URL(requestUrl);
    const offset = Number(parsed.searchParams.get("offset") || 0);
    requestedOffsets.push(offset);
    const rows = offset === 0 ? firstPage : offset === 1000 ? [olderMatch] : [];
    return { ok: true, json: async () => rows, text: async () => "" };
  };

  try {
    const duplicate = await findDuplicateCandidate({ id: "new-candidate", phone: "9876543210" }, { companyId: "company-1" });
    assert.deepEqual(requestedOffsets, [0, 1000]);
    assert.equal(duplicate?.existing?.id, "older-match");
    assert.deepEqual(duplicate?.matchBy, ["phone"]);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
}

module.exports = { run };
