import { test, expect } from "@playwright/test"

/**
 * Mock issues for testing view switching.
 * Minimal set to verify views render with data.
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
    // Mock /api/ready endpoint to return test data
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
    // Navigate and wait for API response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    // Verify Kanban tab is selected
    const kanbanTab = page.getByTestId("view-tab-kanban")
    await expect(kanbanTab).toHaveAttribute("aria-selected", "true")

    // Verify Kanban column is visible
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()
  })

  test("clicking Table tab renders IssueTable", async ({ page }) => {
    // Navigate and wait for API response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    // Click Table tab
    const tableTab = page.getByTestId("view-tab-table")
    await tableTab.click()

    // Verify Table tab is selected
    await expect(tableTab).toHaveAttribute("aria-selected", "true")

    // Verify IssueTable is visible
    const issueTable = page.getByTestId("issue-table")
    await expect(issueTable).toBeVisible()

    // Verify Kanban column is NOT visible
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).not.toBeVisible()
  })

  test("clicking Graph tab renders GraphView", async ({ page }) => {
    // Navigate and wait for API response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    // Click Graph tab
    const graphTab = page.getByTestId("view-tab-graph")
    await graphTab.click()

    // Verify Graph tab is selected
    await expect(graphTab).toHaveAttribute("aria-selected", "true")

    // Verify GraphView is visible
    const graphView = page.getByTestId("graph-view")
    await expect(graphView).toBeVisible()

    // Verify IssueTable is NOT visible
    const issueTable = page.getByTestId("issue-table")
    await expect(issueTable).not.toBeVisible()
  })

  test("clicking Kanban tab returns to KanbanBoard", async ({ page }) => {
    // Navigate and wait for API response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    // Click Table tab first (switch away from Kanban)
    const tableTab = page.getByTestId("view-tab-table")
    await tableTab.click()
    await expect(tableTab).toHaveAttribute("aria-selected", "true")

    // Click Kanban tab to return
    const kanbanTab = page.getByTestId("view-tab-kanban")
    await kanbanTab.click()

    // Verify Kanban tab is selected
    await expect(kanbanTab).toHaveAttribute("aria-selected", "true")

    // Verify Kanban column is visible
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()
  })
})
