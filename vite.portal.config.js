const path = require("path");
const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  root: path.resolve(__dirname, "portal-react"),
  base: "/portal-app/",
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "public", "portal-app"),
    emptyOutDir: true
  }
});
