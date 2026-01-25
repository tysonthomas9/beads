import { test, expect } from "@playwright/test"

/**
 * Mock issues for testing priority filter.
 * Contains issues across P0-P4 priorities to verify filtering.
 */
const mockIssues = [
  {
    id: "p0-issue",
    title: "Critical Bug",
    status: "open",
    priority: 0,
    created_at: "2026-01-24T10:00:00Z",
    updated_at: "2026-01-24T10:00:00Z",
  },
  {
    id: "p1-issue-1",
    title: "High Priority Task",
    status: "open",
    priority: 1,
    created_at: "2026-01-24T11:00:00Z",
    updated_at: "2026-01-24T11:00:00Z",
  },
  {
    id: "p1-issue-2",
    title: "Another High Task",
    status: "in_progress",
    priority: 1,
    created_at: "2026-01-24T12:00:00Z",
    updated_at: "2026-01-24T12:00:00Z",
  },
  {
    id: "p2-issue",
    title: "Medium Task",
    status: "open",
    priority: 2,
    created_at: "2026-01-24T13:00:00Z",
    updated_at: "2026-01-24T13:00:00Z",
  },
  {
    id: "p3-issue",
    title: "Normal Task",
    status: "closed",
    priority: 3,
    created_at: "2026-01-24T14:00:00Z",
    updated_at: "2026-01-24T14:00:00Z",
  },
  {
    id: "p4-issue",
    title: "Backlog Item",
    status: "open",
    priority: 4,
    created_at: "2026-01-24T15:00:00Z",
    updated_at: "2026-01-24T15:00:00Z",
  },
]

test.describe("FilterBar - Priority Filter", () => {
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

  test("selecting priority filters issues to only matching priority", async ({ page }) => {
    // Navigate and wait for API response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    // Wait for the Kanban board to render
    const openColumn = page.locator('section[data-status="open"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const closedColumn = page.locator('section[data-status="closed"]')

    await expect(openColumn).toBeVisible()
    await expect(inProgressColumn).toBeVisible()
    await expect(closedColumn).toBeVisible()

    // Count total issues initially (should be 6)
    const openCards = openColumn.locator("article")
    const inProgressCards = inProgressColumn.locator("article")
    const closedCards = closedColumn.locator("article")

    // Open: p0, p1-1, p2, p4 (4 issues)
    // In Progress: p1-2 (1 issue)
    // Closed: p3 (1 issue)
    await expect(openCards).toHaveCount(4)
    await expect(inProgressCards).toHaveCount(1)
    await expect(closedCards).toHaveCount(1)

    // Select P1 (High) from priority filter
    const priorityFilter = page.getByTestId("priority-filter")
    await priorityFilter.selectOption("1")

    // Wait for filter to apply - verify expected issue is visible first
    await expect(openColumn.getByText("High Priority Task")).toBeVisible()

    // Only P1 issues should be visible
    // P1 issues: "High Priority Task" (open), "Another High Task" (in_progress)
    await expect(openCards).toHaveCount(1)
    await expect(inProgressCards).toHaveCount(1)
    await expect(closedCards).toHaveCount(0)

    // Verify correct issues are shown
    await expect(inProgressColumn.getByText("Another High Task")).toBeVisible()

    // Verify other issues are not visible
    await expect(openColumn.getByText("Critical Bug")).not.toBeVisible()
    await expect(openColumn.getByText("Medium Task")).not.toBeVisible()
    await expect(closedColumn.getByText("Normal Task")).not.toBeVisible()
  })

  test("clearing filter shows all issues again", async ({ page }) => {
    // Navigate and wait for API response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    // Wait for the Kanban board to render
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()

    const openCards = openColumn.locator("article")
    const inProgressCards = page.locator('section[data-status="in_progress"]').locator("article")
    const closedCards = page.locator('section[data-status="closed"]').locator("article")

    // Verify initial state (6 issues total)
    await expect(openCards).toHaveCount(4)
    await expect(inProgressCards).toHaveCount(1)
    await expect(closedCards).toHaveCount(1)

    // Select P0 (Critical) - only 1 issue
    const priorityFilter = page.getByTestId("priority-filter")
    await priorityFilter.selectOption("0")

    // Wait for filter to apply - verify expected issue is visible first
    await expect(openColumn.getByText("Critical Bug")).toBeVisible()

    // Only P0 issue should be visible
    await expect(openCards).toHaveCount(1)
    await expect(inProgressCards).toHaveCount(0)
    await expect(closedCards).toHaveCount(0)

    // Verify other issues are not visible
    await expect(openColumn.getByText("High Priority Task")).not.toBeVisible()
    await expect(openColumn.getByText("Medium Task")).not.toBeVisible()

    // Clear filter by selecting "All priorities"
    await priorityFilter.selectOption("")

    // Wait for filter to clear - verify a filtered-out issue reappears
    await expect(openColumn.getByText("High Priority Task")).toBeVisible()

    // All issues should be visible again
    await expect(openCards).toHaveCount(4)
    await expect(inProgressCards).toHaveCount(1)
    await expect(closedCards).toHaveCount(1)
  })

  test("P0 filter works correctly (value=0 not empty string)", async ({ page }) => {
    // Navigate and wait for API response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    // Wait for the Kanban board to render
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()

    // Select P0 (Critical)
    const priorityFilter = page.getByTestId("priority-filter")
    await priorityFilter.selectOption("0")

    // Wait for filter to apply - verify expected issue is visible first
    await expect(openColumn.getByText("Critical Bug")).toBeVisible()

    // Only P0 issue should be visible
    const openCards = openColumn.locator("article")
    await expect(openCards).toHaveCount(1)

    // Verify other issues are not visible
    await expect(openColumn.getByText("High Priority Task")).not.toBeVisible()
    await expect(openColumn.getByText("Medium Task")).not.toBeVisible()

    // Verify filter dropdown shows correct value
    await expect(priorityFilter).toHaveValue("0")
  })
})

test.describe("FilterBar - Priority Filter (Empty Results)", () => {
  test("empty filter results shows no issues in columns", async ({ page }) => {
    // Mock with issues that don't include P4 (no backlog items)
    await page.route("**/api/ready", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: mockIssues.filter((issue) => issue.priority !== 4),
        }),
      })
    })

    // Mock WebSocket to prevent connection errors
    await page.route("**/ws", async (route) => {
      await route.abort()
    })

    // Navigate and wait for API response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    // Wait for the Kanban board to render
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()

    // Verify initial issues are visible before filtering
    await expect(openColumn.getByText("Critical Bug")).toBeVisible()

    // Select P4 (Backlog) - no issues exist with this priority in our mock
    const priorityFilter = page.getByTestId("priority-filter")
    await priorityFilter.selectOption("4")

    // Wait for filter to apply - verify Critical Bug is no longer visible
    await expect(openColumn.getByText("Critical Bug")).not.toBeVisible()

    // All columns should be empty
    const openCards = openColumn.locator("article")
    const inProgressCards = page.locator('section[data-status="in_progress"]').locator("article")
    const closedCards = page.locator('section[data-status="closed"]').locator("article")

    await expect(openCards).toHaveCount(0)
    await expect(inProgressCards).toHaveCount(0)
    await expect(closedCards).toHaveCount(0)
  })
})
