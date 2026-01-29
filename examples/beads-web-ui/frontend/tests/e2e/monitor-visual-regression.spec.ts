import { test, expect, Page } from "@playwright/test"

/**
 * Mock issues for Monitor Dashboard visual regression tests.
 * Consistent data ensures deterministic screenshots.
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

const mockLoomStatus = {
  agents: [
    {
      name: "dev1",
      status: "working",
      branch: "feature-1",
      task: "bd-001",
      ahead: 0,
      behind: 0,
      last_seen: "2026-01-24T12:00:00Z",
    },
    {
      name: "dev2",
      status: "idle",
      branch: "main",
      task: "",
      ahead: 0,
      behind: 0,
      last_seen: "2026-01-24T11:30:00Z",
    },
  ],
  tasks: {
    needs_planning: 2,
    ready_to_implement: 3,
    in_progress: 1,
    need_review: 1,
    blocked: 0,
  },
  agent_tasks: {
    dev1: {
      id: "bd-001",
      title: "Implement feature X",
      priority: 2,
    },
  },
  sync: {
    db_synced: true,
    db_last_sync: "2026-01-24T12:00:00Z",
    git_needs_push: 0,
    git_needs_pull: 0,
  },
  stats: {
    open: 10,
    closed: 5,
    total: 15,
    completion: 33,
  },
  timestamp: "2026-01-24T12:00:00Z",
}

const mockLoomTasks = {
  needs_planning: [
    { id: "bd-010", title: "Plan new feature", priority: 2 },
    { id: "bd-011", title: "Design API", priority: 1 },
  ],
  ready_to_implement: [
    { id: "bd-020", title: "Implement login", priority: 1 },
    { id: "bd-021", title: "Add tests", priority: 2 },
    { id: "bd-022", title: "Fix bug", priority: 3 },
  ],
  in_progress: [{ id: "bd-001", title: "Implement feature X", priority: 2 }],
  needs_review: [{ id: "bd-030", title: "Review PR", priority: 2 }],
  blocked: [],
}

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
 * Set up all API mocks for Monitor Dashboard visual regression tests.
 */
async function setupMocks(
  page: Page,
  options?: { loomServerAvailable?: boolean }
) {
  const { loomServerAvailable = true } = options ?? {}

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

  // Mock loom server API
  if (loomServerAvailable) {
    await page.route("**/localhost:9000/api/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockLoomStatus),
      })
    })

    await page.route("**/localhost:9000/api/tasks", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockLoomTasks),
      })
    })
  } else {
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
}

/**
 * Navigate to monitor view and wait for API responses.
 */
async function navigateAndWait(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/ready") && res.status() === 200
    ),
    page.goto("/?view=monitor"),
  ])
  expect(response.ok()).toBe(true)
}

/**
 * Wait for content to stabilize before taking a screenshot.
 */
async function waitForStableContent(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(100)
}

test.describe("Visual Regression - Monitor Dashboard Layout", () => {
  test.describe("default 2x2 grid at 1280x720", () => {
    test.use({ viewport: { width: 1280, height: 720 } })

    test("default 2x2 grid layout", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page)

      // Wait for dashboard to render
      const dashboard = page.getByTestId("monitor-dashboard")
      await expect(dashboard).toBeVisible()

      // Wait for loom API responses so panels are populated
      await page.waitForResponse(
        (res) => res.url().includes("/api/status") && res.status() === 200,
        { timeout: 10000 }
      )
      await page.waitForResponse(
        (res) => res.url().includes("/api/tasks") && res.status() === 200,
        { timeout: 10000 }
      )

      await waitForStableContent(page)

      // Verify all 4 panel headings visible before screenshot
      await expect(
        page.getByRole("heading", { name: "Agent Activity" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Work Pipeline" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Project Health" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Blocking Dependencies" })
      ).toBeVisible()

      await expect(page).toHaveScreenshot("monitor-default-grid.png", {
        // Higher threshold for MiniDependencyGraph canvas rendering differences
        maxDiffPixels: 500,
      })
    })
  })

  // NOTE: Connection banner visual regression test is not included here.
  // The ConnectionBanner requires !isConnected && agents.length > 0, but
  // fetchStatus() catches all errors internally and returns { agents: [] },
  // so useAgents never sets isConnected=false. The banner cannot be triggered
  // in E2E. The component is covered by unit tests in ConnectionBanner.test.tsx.

  test.describe("responsive layout at 1024px", () => {
    test.use({ viewport: { width: 1024, height: 768 } })

    test("tablet layout at 1024px", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page)

      const dashboard = page.getByTestId("monitor-dashboard")
      await expect(dashboard).toBeVisible()

      // Wait for loom API responses
      await page.waitForResponse(
        (res) => res.url().includes("/api/status") && res.status() === 200,
        { timeout: 10000 }
      )
      await page.waitForResponse(
        (res) => res.url().includes("/api/tasks") && res.status() === 200,
        { timeout: 10000 }
      )

      await page.waitForTimeout(500)
      await waitForStableContent(page)

      // Verify all panels visible
      await expect(
        page.getByRole("heading", { name: "Agent Activity" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Work Pipeline" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Project Health" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Blocking Dependencies" })
      ).toBeVisible()

      await expect(page).toHaveScreenshot("monitor-responsive-1024.png", {
        maxDiffPixels: 500,
      })
    })
  })

  test.describe("responsive layout at 768px", () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test("mobile layout at 768px", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page)

      const dashboard = page.getByTestId("monitor-dashboard")
      await expect(dashboard).toBeVisible()

      // Wait for loom API responses
      await page.waitForResponse(
        (res) => res.url().includes("/api/status") && res.status() === 200,
        { timeout: 10000 }
      )
      await page.waitForResponse(
        (res) => res.url().includes("/api/tasks") && res.status() === 200,
        { timeout: 10000 }
      )

      await page.waitForTimeout(500)
      await waitForStableContent(page)

      // Verify all panels visible (stacked vertically)
      await expect(
        page.getByRole("heading", { name: "Agent Activity" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Work Pipeline" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Project Health" })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", { name: "Blocking Dependencies" })
      ).toBeVisible()

      await expect(page).toHaveScreenshot("monitor-responsive-768.png", {
        // Full page to capture all stacked panels
        fullPage: true,
        maxDiffPixels: 500,
      })
    })
  })
})
