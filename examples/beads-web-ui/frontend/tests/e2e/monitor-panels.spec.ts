import { test, expect, Page } from "@playwright/test"

/**
 * Mock agents covering all status types for Agent Activity Panel tests.
 */
const mockAgents = [
  {
    name: "nova",
    status: "working",
    branch: "feature-auth",
    task: "bd-101",
    ahead: 2,
    behind: 0,
    last_seen: "2026-01-24T12:00:00Z",
  },
  {
    name: "falcon",
    status: "idle",
    branch: "main",
    task: "",
    ahead: 0,
    behind: 3,
    last_seen: "2026-01-24T11:30:00Z",
  },
  {
    name: "cobalt",
    status: "planning",
    branch: "feature-ui",
    task: "bd-102",
    ahead: 0,
    behind: 0,
    last_seen: "2026-01-24T12:01:00Z",
  },
  {
    name: "ember",
    status: "error",
    branch: "fix-bug",
    task: "bd-103",
    ahead: 1,
    behind: 1,
    last_seen: "2026-01-24T11:00:00Z",
  },
  {
    name: "jade",
    status: "ready",
    branch: "main",
    task: "",
    ahead: 0,
    behind: 0,
    last_seen: "2026-01-24T10:00:00Z",
  },
]

const mockAgentTasks: Record<string, { id: string; title: string; priority: number }> = {
  nova: { id: "bd-101", title: "Implement authentication", priority: 1 },
  cobalt: { id: "bd-102", title: "Design UI components", priority: 2 },
  ember: { id: "bd-103", title: "Fix critical bug", priority: 0 },
}

const mockLoomStatus = {
  agents: mockAgents,
  tasks: {
    needs_planning: 2,
    ready_to_implement: 3,
    in_progress: 1,
    need_review: 1,
    blocked: 0,
  },
  agent_tasks: mockAgentTasks,
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
]

const mockLoomTasks = {
  needs_planning: [
    { id: "bd-010", title: "Plan new feature", priority: 2 },
    { id: "bd-011", title: "Design API", priority: 1 },
  ],
  ready_to_implement: [
    { id: "bd-020", title: "Implement login", priority: 1 },
  ],
  in_progress: [{ id: "bd-001", title: "Implement feature X", priority: 2 }],
  needs_review: [{ id: "bd-030", title: "Review PR", priority: 2 }],
  blocked: [],
}

/**
 * Set up all API mocks for Agent Activity Panel tests.
 */
async function setupMocks(page: Page) {
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
      body: JSON.stringify({ success: true, data: [] }),
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
}

/**
 * Navigate to monitor view and wait for API response.
 */
async function navigateToMonitor(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/ready") && res.status() === 200
    ),
    page.goto("/?view=monitor"),
  ])
  expect(response.ok()).toBe(true)
}

/**
 * Wait for agents to load in the Agent Activity Panel.
 */
async function waitForAgents(page: Page) {
  const agentPanel = page.getByTestId("agent-activity-panel")
  await expect(agentPanel).toBeVisible()
  // Wait for summary bar to render (indicates agents are loaded)
  await expect(
    agentPanel.getByText("active", { exact: true })
  ).toBeVisible({ timeout: 10000 })
}

test.describe("AgentActivityPanel deep behavior", () => {
  test("agent cards show correct status via data-status attribute", async ({ page }) => {
    await setupMocks(page)
    await navigateToMonitor(page)
    await waitForAgents(page)

    const agentPanel = page.getByTestId("agent-activity-panel")

    // Verify each agent card has the correct data-status attribute
    const expectedStatuses: Record<string, string> = {
      nova: "working",
      falcon: "idle",
      cobalt: "planning",
      ember: "error",
      jade: "ready",
    }

    for (const [name, status] of Object.entries(expectedStatuses)) {
      const card = agentPanel.locator(`[data-status="${status}"]`, {
        hasText: name,
      })
      await expect(card).toBeVisible()
    }

    // Verify the status indicator dot exists within each card
    const cards = agentPanel.locator("[data-status]")
    const cardCount = await cards.count()
    expect(cardCount).toBe(5)
  })

  test("agent cards display status text and task titles", async ({ page }) => {
    await setupMocks(page)
    await navigateToMonitor(page)
    await waitForAgents(page)

    const agentPanel = page.getByTestId("agent-activity-panel")

    // Working agent (nova): shows "Working..." status text
    const novaCard = agentPanel.locator('[data-status="working"]', { hasText: "nova" })
    await expect(novaCard).toContainText("Working")
    // Task title for working agent
    await expect(novaCard).toContainText("Implement authentication")

    // Planning agent (cobalt): shows "Planning..." status text
    const cobaltCard = agentPanel.locator('[data-status="planning"]', { hasText: "cobalt" })
    await expect(cobaltCard).toContainText("Planning")
    await expect(cobaltCard).toContainText("Design UI components")

    // Error agent (ember): shows "Error" status text
    const emberCard = agentPanel.locator('[data-status="error"]', { hasText: "ember" })
    await expect(emberCard).toContainText("Error")
    await expect(emberCard).toContainText("Fix critical bug")

    // Idle agent (falcon): shows "Idle" status text, no task title
    const falconCard = agentPanel.locator('[data-status="idle"]', { hasText: "falcon" })
    await expect(falconCard).toContainText("Idle")
    await expect(falconCard).not.toContainText("Implement")

    // Ready agent (jade): shows "Ready" status text, no task title
    const jadeCard = agentPanel.locator('[data-status="ready"]', { hasText: "jade" })
    await expect(jadeCard).toContainText("Ready")
  })

  test("agent cards show git sync indicators (ahead/behind)", async ({ page }) => {
    await setupMocks(page)
    await navigateToMonitor(page)
    await waitForAgents(page)

    const agentPanel = page.getByTestId("agent-activity-panel")

    // nova (ahead: 2, behind: 0): shows "+2", no "-" indicator
    const novaCard = agentPanel.locator('[data-status="working"]', { hasText: "nova" })
    await expect(novaCard.getByText("+2")).toBeVisible()
    await expect(novaCard.getByTitle("2 commits ahead")).toBeVisible()
    // Verify branch name displayed
    await expect(novaCard).toContainText("feature-auth")

    // falcon (ahead: 0, behind: 3): shows "-3", no "+" indicator
    const falconCard = agentPanel.locator('[data-status="idle"]', { hasText: "falcon" })
    await expect(falconCard.getByText("-3")).toBeVisible()
    await expect(falconCard.getByTitle("3 commits behind")).toBeVisible()
    await expect(falconCard).toContainText("main")

    // ember (ahead: 1, behind: 1): shows both "+1" and "-1"
    const emberCard = agentPanel.locator('[data-status="error"]', { hasText: "ember" })
    await expect(emberCard.getByText("+1")).toBeVisible()
    await expect(emberCard.getByText("-1")).toBeVisible()
    await expect(emberCard.getByTitle("1 commits ahead")).toBeVisible()
    await expect(emberCard.getByTitle("1 commits behind")).toBeVisible()
    await expect(emberCard).toContainText("fix-bug")

    // jade (ahead: 0, behind: 0): no sync indicators
    const jadeCard = agentPanel.locator('[data-status="ready"]', { hasText: "jade" })
    // Should not contain any +/- sync text (only "Ready" and "jade" and "main")
    await expect(jadeCard.locator("[title*='commits ahead']")).toHaveCount(0)
    await expect(jadeCard.locator("[title*='commits behind']")).toHaveCount(0)
  })

  test("agent summary bar shows correct counts", async ({ page }) => {
    await setupMocks(page)
    await navigateToMonitor(page)
    await waitForAgents(page)

    const agentPanel = page.getByTestId("agent-activity-panel")

    // Verify summary bar has correct role and aria-label
    const summary = agentPanel.locator('[role="status"][aria-label="Agent activity summary"]')
    await expect(summary).toBeVisible()

    // active: nova (working) + cobalt (planning) = 2
    const activeItem = summary.locator('[data-type="active"]')
    await expect(activeItem).toBeVisible()
    await expect(activeItem).toContainText("2")

    // idle: falcon (idle) + jade (ready) = 2
    const idleItem = summary.locator('[data-type="idle"]')
    await expect(idleItem).toBeVisible()
    await expect(idleItem).toContainText("2")

    // error: ember (error) = 1
    const errorItem = summary.locator('[data-type="error"]')
    await expect(errorItem).toBeVisible()
    await expect(errorItem).toContainText("1")

    // needsPush (sync): nova (ahead=2) + ember (ahead=1) = 2
    const syncItem = summary.locator('[data-type="sync"]')
    await expect(syncItem).toBeVisible()
    await expect(syncItem).toContainText("2")
  })

  test("agent cards have interactive attributes and keyboard support", async ({ page }) => {
    await setupMocks(page)
    await navigateToMonitor(page)
    await waitForAgents(page)

    const agentPanel = page.getByTestId("agent-activity-panel")

    // Verify agent cards have role="button" (since MonitorDashboard passes onAgentClick)
    const cards = agentPanel.locator('[data-status][role="button"]')
    const cardCount = await cards.count()
    expect(cardCount).toBe(5)

    // Verify cards have tabIndex="0" for keyboard accessibility
    for (let i = 0; i < cardCount; i++) {
      await expect(cards.nth(i)).toHaveAttribute("tabindex", "0")
    }

    // Verify keyboard focus works: tab to the first card
    const firstCard = cards.first()
    await firstCard.focus()
    await expect(firstCard).toBeFocused()

    // Verify clicking a card doesn't cause errors (card is clickable)
    await firstCard.click()
  })
})
