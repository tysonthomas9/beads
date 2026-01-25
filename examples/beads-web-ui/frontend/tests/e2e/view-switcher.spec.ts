import { test, expect } from "@playwright/test"

/**
 * Mock issues for testing ViewSwitcher component.
 * Each issue includes the minimum required fields for API compatibility.
 */
const mockIssues = [
  {
    id: "test-1",
    title: "Test Issue 1",
    status: "open",
    priority: 2,
    created_at: "2026-01-24T10:00:00Z",
    updated_at: "2026-01-24T10:00:00Z",
  },
  {
    id: "test-2",
    title: "Test Issue 2",
    status: "in_progress",
    priority: 1,
    created_at: "2026-01-24T11:00:00Z",
    updated_at: "2026-01-24T11:00:00Z",
  },
]

test.describe("ViewSwitcher", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the /api/ready endpoint to return our test data
    await page.route("**/api/ready", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: mockIssues,
        }),
      })
    })

    // Mock WebSocket to prevent connection errors
    await page.route("**/ws", async (route) => {
      await route.abort()
    })
  })

  test("default view is Kanban", async ({ page }) => {
    // Navigate to the app and wait for API response
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])
    expect(response.ok()).toBe(true)

    // Verify Kanban tab is selected
    const kanbanTab = page.locator('[data-testid="view-tab-kanban"]')
    await expect(kanbanTab).toHaveAttribute("aria-selected", "true")

    // Verify Kanban column is visible
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()
  })

  test("clicking Table tab renders IssueTable", async ({ page }) => {
    // Navigate to the app and wait for API response
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])
    expect(response.ok()).toBe(true)

    // Click the Table tab
    const tableTab = page.locator('[data-testid="view-tab-table"]')
    await tableTab.click()

    // Verify Table tab is selected
    await expect(tableTab).toHaveAttribute("aria-selected", "true")

    // Verify IssueTable is visible
    const issueTable = page.locator('[data-testid="issue-table"]')
    await expect(issueTable).toBeVisible()

    // Verify Kanban column is NOT visible
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).not.toBeVisible()
  })

  test("clicking Graph tab renders GraphView", async ({ page }) => {
    // Navigate to the app and wait for API response
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])
    expect(response.ok()).toBe(true)

    // Click the Graph tab
    const graphTab = page.locator('[data-testid="view-tab-graph"]')
    await graphTab.click()

    // Verify Graph tab is selected
    await expect(graphTab).toHaveAttribute("aria-selected", "true")

    // Verify GraphView is visible
    const graphView = page.locator('[data-testid="graph-view"]')
    await expect(graphView).toBeVisible()

    // Verify IssueTable is NOT visible
    const issueTable = page.locator('[data-testid="issue-table"]')
    await expect(issueTable).not.toBeVisible()
  })

  test("clicking Kanban tab returns to KanbanBoard", async ({ page }) => {
    // Navigate to the app and wait for API response
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])
    expect(response.ok()).toBe(true)

    // First switch away from Kanban to Table
    const tableTab = page.locator('[data-testid="view-tab-table"]')
    await tableTab.click()
    await expect(tableTab).toHaveAttribute("aria-selected", "true")

    // Click Kanban tab to switch back
    const kanbanTab = page.locator('[data-testid="view-tab-kanban"]')
    await kanbanTab.click()

    // Verify Kanban tab is selected
    await expect(kanbanTab).toHaveAttribute("aria-selected", "true")

    // Verify Kanban column is visible
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()
  })
})
