import { test, expect, Page } from "@playwright/test"

/**
 * Mock issues for degradation tests.
 */
const mockIssues = [
  {
    id: "test-1",
    title: "Feature A",
    status: "open",
    priority: 2,
    issue_type: "feature",
    created_at: "2026-01-24T10:00:00Z",
    updated_at: "2026-01-24T10:00:00Z",
    depends_on: [],
  },
  {
    id: "test-2",
    title: "Task blocked by Feature A",
    status: "open",
    priority: 1,
    issue_type: "task",
    created_at: "2026-01-24T11:00:00Z",
    updated_at: "2026-01-24T11:00:00Z",
    depends_on: [{ id: "test-1", type: "blocks" }],
  },
  {
    id: "test-3",
    title: "In Progress Task",
    status: "in_progress",
    priority: 2,
    issue_type: "task",
    created_at: "2026-01-24T12:00:00Z",
    updated_at: "2026-01-24T12:00:00Z",
    depends_on: [],
  },
]

/**
 * Mock blocked issues response.
 */
const mockBlockedIssues = {
  success: true,
  data: [
    {
      id: "test-2",
      title: "Task blocked by Feature A",
      status: "open",
      priority: 1,
      issue_type: "task",
      created_at: "2026-01-24T11:00:00Z",
      updated_at: "2026-01-24T11:00:00Z",
      blocked_by: ["test-1"],
    },
  ],
}

/**
 * Set up API mocks for degradation tests.
 * Loom server is always unavailable in these tests.
 */
async function setupMocks(page: Page) {
  // Mock beads backend API
  await page.route("**/api/ready", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: mockIssues }),
    })
  })

  await page.route("**/api/blocked", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBlockedIssues),
    })
  })

  await page.route("**/api/issues/graph", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: mockIssues }),
    })
  })

  await page.route("**/api/events", async (route) => {
    await route.abort()
  })

  await page.route("**/api/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { open: 10, closed: 5, total: 15, completion: 33 },
      }),
    })
  })

  // Loom server unavailable - return invalid JSON to trigger never_connected state
  await page.route("**/localhost:9000/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "invalid json{",
    })
  })
  await page.route("**/localhost:9000/api/tasks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "invalid json{",
    })
  })
}

/**
 * Navigate to a page and wait for API response.
 */
async function navigateAndWait(page: Page, path: string) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/ready") && res.status() === 200
    ),
    page.goto(path),
  ])
  expect(response.ok()).toBe(true)
}

test.describe("MonitorDashboard degradation", () => {
  test("shows 'Loom server not running' when never connected", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page, "/?view=monitor")

    const agentPanel = page.getByTestId("agent-activity-panel")
    await expect(agentPanel).toBeVisible()

    // Verify exact text for never_connected state
    await expect(agentPanel.getByText("Loom server not running")).toBeVisible({ timeout: 10000 })

    // Verify hint text with loom serve command
    await expect(agentPanel.getByText("loom serve --port 9000")).toBeVisible()

    // Verify Check Connection button is visible
    await expect(agentPanel.getByRole("button", { name: "Check Connection" })).toBeVisible()
  })

  test("Check Connection button is visible and clickable", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page, "/?view=monitor")

    const agentPanel = page.getByTestId("agent-activity-panel")
    await expect(agentPanel).toBeVisible()

    // Wait for never_connected state to render
    await expect(agentPanel.getByText("Loom server not running")).toBeVisible({ timeout: 10000 })

    // Locate and verify the button
    const checkButton = agentPanel.getByRole("button", { name: "Check Connection" })
    await expect(checkButton).toBeVisible()
    await expect(checkButton).toBeEnabled()

    // Click it - should not crash, panel stays in degraded state
    await checkButton.click()

    // Panel should still be visible after click (mock still returns invalid JSON)
    await expect(agentPanel).toBeVisible()
    await expect(agentPanel.getByText("Loom server not running")).toBeVisible({ timeout: 10000 })
  })

  test("Project Health and Blocking Dependencies panels still render when loom unavailable", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page, "/?view=monitor")

    const dashboard = page.getByTestId("monitor-dashboard")
    await expect(dashboard).toBeVisible()

    // All 4 panel headings should be visible
    await expect(page.getByRole("heading", { name: "Agent Activity" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Work Pipeline" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Project Health" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Blocking Dependencies" })).toBeVisible()

    // Project Health panel renders (stats come from loom, so shows defaults when unavailable)
    const healthPanel = page.getByTestId("project-health-panel")
    await expect(healthPanel).toBeVisible()
    await expect(healthPanel.getByText("0%")).toBeVisible()

    // Blocking Dependencies panel renders with content
    const miniGraph = page.getByTestId("mini-dependency-graph")
    await expect(miniGraph).toBeVisible()
  })
})
