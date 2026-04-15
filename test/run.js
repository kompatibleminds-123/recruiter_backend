const path = require("path");

const specs = [
  "./search-normalize.spec.js",
  "./search-hybrid.spec.js"
];

async function main() {
  for (const rel of specs) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const mod = require(path.join(__dirname, rel));
    if (!mod || typeof mod.run !== "function") {
      throw new Error(`Invalid spec module: ${rel}`);
    }
    // Support both sync and async specs.
    await mod.run();
    process.stdout.write(`ok ${rel}\n`);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

