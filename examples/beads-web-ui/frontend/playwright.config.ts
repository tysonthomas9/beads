import { defineConfig, devices } from "@playwright/test"

const isCI = !!process.env.CI
const isIntegration = !!process.env.RUN_INTEGRATION_TESTS

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  ...(isCI && { workers: 1 }),
  reporter: isCI ? "github" : "html",
  timeout: 30000,
  expect: {
    timeout: 5000,
    toHaveScreenshot: {
      maxDiffPixels: 100, // Allow minor anti-aliasing differences
      threshold: 0.2, // Pixel color threshold
      animations: "disabled", // Disable CSS animations for consistency
    },
    toMatchSnapshot: {
      threshold: 0.2,
    },
  },

  // Snapshot configuration - platform-agnostic paths for cross-platform CI
  snapshotDir: "./tests/e2e/screenshots",
  snapshotPathTemplate: "{snapshotDir}/{testFilePath}/{arg}{ext}",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Exclude integration tests from regular runs
      testIgnore: isIntegration ? undefined : "**/*-integration.spec.ts",
    },
    {
      name: "integration",
      use: { ...devices["Desktop Chrome"] },
      // Only run integration tests when enabled
      testMatch: "**/*-integration.spec.ts",
      // Integration tests hit the actual backend
      timeout: 60000,
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 60000,
  },
})
