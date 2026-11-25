const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'public', 'talent-match.html'), 'utf8');

assert.ok(server.includes('talent-network'));
assert.match(server, /PUBLIC_TALENT_MATCH_RATE_LIMIT/);
assert.match(server, /collapseLatestApplicantCandidates\(rows\)/);
assert.match(server, /matchCount: count/);
assert.match(page, /Searches only return an aggregate profile count/);
assert.match(page, /Request Matching Profiles/);
assert.match(page, /\/public\/talent-network\/kompatible-minds\/match/);
const inlineScript = page.match(/<script>\s*([\s\S]*?)<\/script>/i)?.[1];
assert.ok(inlineScript, 'talent match page must contain its client script');
new Function(inlineScript);

console.log('public talent match route and page checks passed');
