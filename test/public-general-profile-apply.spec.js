const assert = require("assert");
const fs = require("fs");
const path = require("path");

async function run() {
  const applyScript = fs.readFileSync(path.join(__dirname, "..", "public", "apply.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const portal = fs.readFileSync(path.join(__dirname, "..", "portal-react", "src", "App.jsx"), "utf8");

  assert.match(applyScript, /apply-public" && parts\[1\] === "profile"/);
  assert.match(applyScript, /\/public\/company-profile\/\$\{encodeURIComponent\(generalProfileSlug\)\}\/apply/);
  assert.match(server, /allowGeneralProfile = options\?\.allowGeneralProfile === true/);
  assert.match(server, /website_general_profile/);
  assert.match(server, /Please attach your CV/);
  assert.match(server, /Profile submission could not be accepted/);
  assert.match(portal, /Website profile/);

  console.log("public general profile application wiring test passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
