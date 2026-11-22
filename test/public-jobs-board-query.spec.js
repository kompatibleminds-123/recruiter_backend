const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

async function run() {
  const elements = new Map();
  const makeElement = () => ({
    value: "",
    textContent: "",
    innerHTML: "",
    addEventListener() {},
    querySelectorAll() { return []; },
    setAttribute() {}
  });
  [
    "jobsFavicon",
    "jobsTitle",
    "jobsSubtitle",
    "keywordSearch",
    "locationSearch",
    "jobsStatus",
    "jobsList",
    "jobSpotlight"
  ].forEach((id) => elements.set(id, makeElement()));

  let requestedUrl = "";
  const context = {
    URLSearchParams,
    encodeURIComponent,
    console,
    document: {
      documentElement: { style: { setProperty() {} } },
      getElementById(id) { return elements.get(id) || null; },
      title: ""
    },
    fetch: async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          result: { companyName: "Kompatible Minds", jobs: [] }
        })
      };
    },
    window: {
      location: {
        pathname: "/jobs/company/kompatible-minds",
        search: "?search_keywords=SAP+ABAP&search_location=Noida"
      },
      setInterval() { return 1; },
      clearInterval() {}
    }
  };

  const script = fs.readFileSync(path.join(__dirname, "..", "public", "jobs-board.js"), "utf8");
  vm.runInNewContext(script, context, { filename: "jobs-board.js" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(elements.get("keywordSearch").value, "SAP ABAP");
  assert.strictEqual(elements.get("locationSearch").value, "Noida");
  assert.strictEqual(requestedUrl, "/public/company-jobs/kompatible-minds?mode=anonymous");
  console.log("public jobs board query prefill test passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
