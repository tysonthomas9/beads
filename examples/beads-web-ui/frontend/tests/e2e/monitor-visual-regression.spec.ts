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

/**
 * All 4 agent states for visual regression coverage:
 * working, idle, error, planning+needs-push
 */
const mockAllAgents = [
  {
    name: "dev1",
    status: "working",
    branch: "feature-x",
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
  {
    name: "dev3",
    status: "error",
    branch: "bugfix-y",
    task: "bd-003",
    ahead: 0,
    behind: 0,
    last_seen: "2026-01-24T11:00:00Z",
  },
  {
    name: "dev4",
    status: "planning",
    branch: "feature-z",
    task: "bd-004",
    ahead: 2,
    behind: 0,
    last_seen: "2026-01-24T12:05:00Z",
  },
]

const mockAllAgentTasks: Record<string, { id: string; title: string; priority: number }> = {
  dev1: { id: "bd-001", title: "Implement feature X", priority: 2 },
  dev3: { id: "bd-003", title: "Fix critical bug in authentication module", priority: 0 },
  dev4: { id: "bd-004", title: "Plan architecture redesign for scalability improvements", priority: 1 },
}

const mockLoomStatus = {
  agents: mockAllAgents,
  tasks: {
    needs_planning: 2,
    ready_to_implement: 3,
    in_progress: 1,
    need_review: 1,
    blocked: 2,
  },
  agent_tasks: mockAllAgentTasks,
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
  blocked: [
    { id: "bd-040", title: "Blocked task A", priority: 1 },
    { id: "bd-041", title: "Blocked task B", priority: 2 },
  ],
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

const mockBlockedWithBottlenecks = {
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
    {
      id: "test-4",
      title: "Another blocked task",
      status: "open",
      priority: 2,
      issue_type: "task",
      created_at: "2026-01-24T13:00:00Z",
      updated_at: "2026-01-24T13:00:00Z",
      blocked_by: ["test-1"],
    },
    {
      id: "test-5",
      title: "Third blocked task",
      status: "open",
      priority: 3,
      issue_type: "task",
      created_at: "2026-01-24T14:00:00Z",
      updated_at: "2026-01-24T14:00:00Z",
      blocked_by: ["test-1", "test-6"],
    },
  ],
}

const emptyLoomStatus = {
  agents: [],
  tasks: { needs_planning: 0, ready_to_implement: 0, in_progress: 0, need_review: 0, blocked: 0 },
  agent_tasks: {},
  sync: { db_synced: true, db_last_sync: "2026-01-24T12:00:00Z", git_needs_push: 0, git_needs_pull: 0 },
  stats: { open: 0, closed: 0, total: 0, completion: 0 },
  timestamp: "2026-01-24T12:00:00Z",
}

const emptyLoomTasks = {
  needs_planning: [],
  ready_to_implement: [],
  in_progress: [],
  needs_review: [],
  blocked: [],
}

/**
 * Set up all API mocks for Monitor Dashboard visual regression tests.
 */
async function setupMocks(
  page: Page,
  options?: {
    loomServerAvailable?: boolean
    emptyAgents?: boolean
    customAgents?: typeof mockAllAgents
    customAgentTasks?: typeof mockAllAgentTasks
    customBlockedIssues?: typeof mockBlockedIssues
    emptyStats?: boolean
  }
) {
  const { loomServerAvailable = true, emptyAgents = false, customAgents, customAgentTasks, customBlockedIssues, emptyStats = false } = options ?? {}

  // Mock beads backend API
  await page.route("**/api/ready", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: emptyStats ? [] : mockIssues }),
    })
  })

  await page.route("**/api/blocked", async (route) => {
    const blockedData = emptyStats
      ? { success: true, data: [] }
      : (customBlockedIssues ?? mockBlockedIssues)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(blockedData),
    })
  })

  await page.route("**/api/issues/graph", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: emptyStats ? [] : mockIssues }),
    })
  })

  await page.route("**/api/events", async (route) => {
    await route.abort()
  })

  await page.route("**/api/stats", async (route) => {
    const statsData = emptyStats
      ? { open: 0, closed: 0, total: 0, completion: 0 }
      : { open: 10, closed: 5, total: 15, completion: 33 }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: statsData }),
    })
  })

  // Mock loom server API
  if (loomServerAvailable) {
    await page.route("**/localhost:9000/api/status", async (route) => {
      if (emptyStats) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(emptyLoomStatus),
        })
        return
      }
      const agents = emptyAgents ? [] : (customAgents ?? mockAllAgents)
      const agentTasks = emptyAgents ? {} : (customAgentTasks ?? mockAllAgentTasks)
      const status = { ...mockLoomStatus, agents, agent_tasks: agentTasks }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(status),
      })
    })

    await page.route("**/localhost:9000/api/tasks", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyStats ? emptyLoomTasks : mockLoomTasks),
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

  // NOTE: Connection banner visual regression test is in the "Degradation Scenarios"
  // section below. It uses the connect-then-disconnect pattern from monitor-degradation.spec.ts
  // to trigger the banner (load data first, then switch loom to unavailable).

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

test.describe("Visual Regression - Agent Activity Panel", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("multiple agent states with summary", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page)

    // Wait for both loom APIs to load
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

    // Verify summary bar shows all state categories
    const agentPanel = page.getByTestId("agent-activity-panel")
    await expect(agentPanel).toBeVisible()
    await expect(agentPanel.getByText("active", { exact: true })).toBeVisible()
    await expect(agentPanel.getByText("idle", { exact: true })).toBeVisible()
    await expect(agentPanel.getByText("error", { exact: true })).toBeVisible()
    await expect(agentPanel.getByText("need push", { exact: true })).toBeVisible()

    await expect(page).toHaveScreenshot(
      "monitor-agent-activity-multiple-states.png",
      { maxDiffPixels: 500 }
    )
  })

  test("no agents found state", async ({ page }) => {
    await setupMocks(page, { emptyAgents: true })
    await navigateAndWait(page)

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

    const agentPanel = page.getByTestId("agent-activity-panel")
    await expect(agentPanel).toBeVisible()
    await expect(agentPanel.getByText("No agents found")).toBeVisible()

    await expect(page).toHaveScreenshot(
      "monitor-agent-activity-no-agents.png",
      { maxDiffPixels: 500 }
    )
  })

  test("loom server unavailable state", async ({ page }) => {
    await setupMocks(page, { loomServerAvailable: false })
    await navigateAndWait(page)

    // Wait for the loom status fetch to complete (returns invalid JSON, triggering error state)
    await page.waitForResponse(
      (res) => res.url().includes("/api/status"),
      { timeout: 10000 }
    )
    await page.waitForTimeout(500)
    await waitForStableContent(page)

    const agentPanel = page.getByTestId("agent-activity-panel")
    await expect(agentPanel).toBeVisible()

    await expect(page).toHaveScreenshot(
      "monitor-agent-activity-loom-unavailable.png",
      { maxDiffPixels: 500 }
    )
  })

  test("agent cards with task details", async ({ page }) => {
    // Use only agents with task assignments: dev1 (working) and dev4 (planning+ahead)
    const taskAgents = [mockAllAgents[0], mockAllAgents[3]]
    const taskAgentTasks = {
      dev1: mockAllAgentTasks.dev1,
      dev4: mockAllAgentTasks.dev4,
    }

    await setupMocks(page, {
      customAgents: taskAgents,
      customAgentTasks: taskAgentTasks,
    })
    await navigateAndWait(page)

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

    const agentPanel = page.getByTestId("agent-activity-panel")
    await expect(agentPanel).toBeVisible()

    // Verify task titles appear in agent cards
    await expect(agentPanel.getByText("Implement feature X")).toBeVisible()
    await expect(
      agentPanel.getByText(
        "Plan architecture redesign for scalability improvements"
      )
    ).toBeVisible()

    await expect(page).toHaveScreenshot(
      "monitor-agent-cards-with-tasks.png",
      { maxDiffPixels: 500 }
    )
  })
})

test.describe("Visual Regression - Work Pipeline Panel", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("pipeline stages with counts", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page)

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

    // Verify all pipeline stages visible with correct counts
    await expect(page.getByTestId("pipeline-stage-plan")).toBeVisible()
    await expect(page.getByTestId("pipeline-stage-plan")).toContainText("2")
    await expect(page.getByTestId("pipeline-stage-ready")).toBeVisible()
    await expect(page.getByTestId("pipeline-stage-ready")).toContainText("3")
    await expect(page.getByTestId("pipeline-stage-inProgress")).toBeVisible()
    await expect(page.getByTestId("pipeline-stage-inProgress")).toContainText("1")
    await expect(page.getByTestId("pipeline-stage-review")).toBeVisible()
    await expect(page.getByTestId("pipeline-stage-review")).toContainText("1")

    await expect(page).toHaveScreenshot(
      "monitor-work-pipeline-stages.png",
      { maxDiffPixels: 500 }
    )
  })

  test("blocked branch visible", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page)

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

    // Blocked stage should be visible (blocked: 2 in mock data)
    const blockedStage = page.getByTestId("pipeline-stage-blocked")
    await expect(blockedStage).toBeVisible()
    await expect(blockedStage).toContainText("2")

    // Branch line indicator
    const pipelinePanel = page.getByTestId("work-pipeline-panel")
    await expect(pipelinePanel.getByText("↳")).toBeVisible()

    await expect(page).toHaveScreenshot(
      "monitor-work-pipeline-blocked.png",
      { maxDiffPixels: 500 }
    )
  })

  test("oldest items table", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page)

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

    const pipelinePanel = page.getByTestId("work-pipeline-panel")

    // Verify table heading and structure
    await expect(pipelinePanel.getByText("Oldest in Each Stage")).toBeVisible()

    const table = pipelinePanel.locator("table")
    const rows = table.locator("tbody tr")
    await expect(rows).toHaveCount(4)

    // Verify representative data in rows
    await expect(rows.nth(0)).toContainText("Plan")
    await expect(rows.nth(0)).toContainText("bd-010")
    await expect(rows.nth(1)).toContainText("Ready")
    await expect(rows.nth(1)).toContainText("bd-020")
    await expect(rows.nth(2)).toContainText("In Progress")
    await expect(rows.nth(2)).toContainText("bd-001")
    await expect(rows.nth(3)).toContainText("Review")
    await expect(rows.nth(3)).toContainText("bd-030")

    // Panel-scoped screenshot for table focus
    await expect(pipelinePanel).toHaveScreenshot(
      "monitor-work-pipeline-oldest-table.png"
    )
  })
})

test.describe("Visual Regression - Project Health Panel", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("progress bar with bottleneck warnings", async ({ page }) => {
    await setupMocks(page, { customBlockedIssues: mockBlockedWithBottlenecks })
    await navigateAndWait(page)

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

    const healthPanel = page.getByTestId("project-health-panel")
    await expect(healthPanel).toBeVisible()

    // Verify bottleneck list renders (test-1 blocks 3 issues)
    await expect(healthPanel.getByText("blocks 3")).toBeVisible()

    await expect(healthPanel).toHaveScreenshot(
      "monitor-health-progress-bottlenecks.png",
      { maxDiffPixels: 100 }
    )
  })

  test("empty state with no bottlenecks", async ({ page }) => {
    await setupMocks(page, {
      emptyStats: true,
    })
    await navigateAndWait(page)

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

    const healthPanel = page.getByTestId("project-health-panel")
    await expect(healthPanel).toBeVisible()

    // Verify empty state text
    await expect(healthPanel.getByText("No bottlenecks detected")).toBeVisible()

    await expect(healthPanel).toHaveScreenshot(
      "monitor-health-empty.png",
      { maxDiffPixels: 100 }
    )
  })
})

test.describe("Visual Regression - MiniDependencyGraph", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("nodes and edges with expand button", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page)

    await page.waitForResponse(
      (res) => res.url().includes("/api/status") && res.status() === 200,
      { timeout: 10000 }
    )
    await page.waitForResponse(
      (res) => res.url().includes("/api/tasks") && res.status() === 200,
      { timeout: 10000 }
    )
    // Extra wait for ReactFlow canvas rendering
    await page.waitForTimeout(500)
    await waitForStableContent(page)

    const graphPanel = page.getByTestId("mini-dependency-graph")
    await expect(graphPanel).toBeVisible()

    // Verify expand button is present
    const expandButton = page.getByRole("button", { name: "Expand to full graph view" })
    await expect(expandButton).toBeVisible()

    // Higher tolerance for ReactFlow canvas rendering differences across runs
    await expect(graphPanel).toHaveScreenshot(
      "monitor-mini-graph-nodes-expand.png",
      { maxDiffPixels: 500, threshold: 0.2 }
    )
  })
})

test.describe("Visual Regression - Interactions", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("TaskDrawer opens from pipeline stage click", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page)

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

    // Click the Plan pipeline stage (count=2, so it's clickable)
    await page.getByTestId("pipeline-stage-plan").click()

    // Wait for drawer animation to complete
    const drawer = page.getByRole("dialog")
    await expect(drawer).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(400)

    // Verify drawer header shows planning tasks
    await expect(drawer.getByText("Needs Planning")).toBeVisible()

    await expect(page).toHaveScreenshot(
      "monitor-task-drawer-open.png",
      { maxDiffPixels: 100 }
    )
  })

  test("pipeline hover states", async ({ page }) => {
    await setupMocks(page)
    await navigateAndWait(page)

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

    // Hover over the Ready pipeline stage
    await page.getByTestId("pipeline-stage-ready").hover()
    await page.waitForTimeout(200)

    const pipelinePanel = page.getByTestId("work-pipeline-panel")
    await expect(pipelinePanel).toHaveScreenshot(
      "monitor-pipeline-hover.png",
      { maxDiffPixels: 100 }
    )
  })
})

test.describe("Visual Regression - Degradation Scenarios", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("empty state across all panels", async ({ page }) => {
    await setupMocks(page, { emptyStats: true })
    await navigateAndWait(page)

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

    // Verify empty states across panels (scope to dashboard to avoid sidebar duplicates)
    const dashboard = page.getByTestId("monitor-dashboard")
    await expect(dashboard.getByText("No agents found")).toBeVisible()
    await expect(dashboard.getByText("No bottlenecks detected")).toBeVisible()

    await expect(page).toHaveScreenshot(
      "monitor-degradation-empty.png",
      { maxDiffPixels: 500 }
    )
  })

  test("stale banner with retry button", async ({ page }) => {
    // Start with loom available so data loads
    await setupMocks(page)
    await navigateAndWait(page)

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

    // Switch loom to unavailable mid-test
    await page.unroute("**/localhost:9000/api/status")
    await page.unroute("**/localhost:9000/api/tasks")
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

    // Wait for next poll cycle to fail and trigger disconnected state
    await page.waitForResponse(
      (res) => res.url().includes("/api/status"),
      { timeout: 15000 }
    )
    await page.waitForTimeout(1000)
    await waitForStableContent(page)

    // Verify ConnectionBanner appears with retry button
    const banner = page.getByRole("alert")
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner.getByRole("button", { name: "Retry connection now" })).toBeVisible()

    await expect(page).toHaveScreenshot(
      "monitor-degradation-stale-banner.png",
      { maxDiffPixels: 500 }
    )
  })
})
