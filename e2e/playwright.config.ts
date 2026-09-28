import { defineConfig, devices } from "@playwright/test";

// Two servers: the static landing page and the agent backend (offline: no API keys,
// so intake uses the offline classifier and drafting uses the template drafter).
const SITE = "http://localhost:4173";
const AGENT_PORT = process.env.E2E_AGENT_PORT ?? "8787";
const AGENT = `http://localhost:${AGENT_PORT}`;
const channel = process.env.PW_CHANNEL; // e.g. "chrome" to use an installed browser locally

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: SITE, trace: "retain-on-failure", ...(channel ? { channel } : {}) },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) } },
    { name: "mobile", use: { ...devices["Pixel 7"], ...(channel ? { channel } : {}) } },
  ],
  webServer: [
    { command: "python3 -m http.server 4173 --bind 127.0.0.1", cwd: "..", url: SITE, reuseExistingServer: !process.env.CI, stdout: "ignore", stderr: "ignore" },
    {
      command: "npx tsx src/server.ts",
      cwd: "../agent",
      url: `${AGENT}/`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: AGENT_PORT, ALLOWED_ORIGINS: `${SITE},http://127.0.0.1:4173`, TYPESAFE_API_KEY: "", ANTHROPIC_API_KEY: "" },
    },
  ],
});
