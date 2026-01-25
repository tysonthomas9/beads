import { test, expect, Page } from "@playwright/test"

/**
 * Minimal mock issues for testing view switching.
 */
const mockIssues = [
  {
    id: "kb-1",
    title: "Test Issue",
    status: "open",
    priority: 2,
    created_at: "2026-01-24T10:00:00Z",
    updated_at: "2026-01-24T10:00:00Z",
  },
]

/**
 * Set up API mocks for ViewSwitcher tests.
 */
async function setupMocks(page: Page) {
  await page.route("**/api/ready", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: mockIssues }),
    })
  })
  await page.route("**/ws", async (route) => {
    await route.abort()
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

test.describe("ViewSwitcher", () => {
  test.describe("keyboard navigation", () => {
    test("ArrowRight navigates from Kanban to Table", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/")

      // Focus on the active (Kanban) tab
      const kanbanTab = page.locator('[data-testid="view-tab-kanban"]')
      await kanbanTab.focus()

      // Press ArrowRight
      await page.keyboard.press("ArrowRight")

      // Verify focus moved to Table tab
      const tableTab = page.locator('[data-testid="view-tab-table"]')
      await expect(tableTab).toBeFocused()

      // Verify Table tab is now active
      await expect(tableTab).toHaveAttribute("aria-selected", "true")

      // Verify Table view is rendered and Kanban view is hidden
      await expect(page.locator('[data-testid="issue-table"]')).toBeVisible()
      await expect(
        page.locator('section[data-status="open"]')
      ).not.toBeVisible()
    })

    test("ArrowRight navigates from Table to Graph", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/?view=table")

      // Focus on the active (Table) tab
      const tableTab = page.locator('[data-testid="view-tab-table"]')
      await tableTab.focus()

      // Press ArrowRight
      await page.keyboard.press("ArrowRight")

      // Verify focus moved to Graph tab
      const graphTab = page.locator('[data-testid="view-tab-graph"]')
      await expect(graphTab).toBeFocused()

      // Verify Graph tab is now active
      await expect(graphTab).toHaveAttribute("aria-selected", "true")

      // Verify Graph view is rendered and Table view is hidden
      await expect(page.locator('[data-testid="graph-view"]')).toBeVisible()
      await expect(
        page.locator('[data-testid="issue-table"]')
      ).not.toBeVisible()
    })

    test("ArrowRight wraps from Graph to Kanban", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/?view=graph")

      // Focus on the active (Graph) tab
      const graphTab = page.locator('[data-testid="view-tab-graph"]')
      await graphTab.focus()

      // Press ArrowRight - should wrap to Kanban
      await page.keyboard.press("ArrowRight")

      // Verify focus moved to Kanban tab
      const kanbanTab = page.locator('[data-testid="view-tab-kanban"]')
      await expect(kanbanTab).toBeFocused()

      // Verify Kanban tab is now active
      await expect(kanbanTab).toHaveAttribute("aria-selected", "true")

      // Verify Kanban view is rendered and Graph view is hidden
      await expect(page.locator('section[data-status="open"]')).toBeVisible()
      await expect(page.locator('[data-testid="graph-view"]')).not.toBeVisible()
    })

    test("ArrowLeft navigates from Graph to Table", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/?view=graph")

      // Focus on the active (Graph) tab
      const graphTab = page.locator('[data-testid="view-tab-graph"]')
      await graphTab.focus()

      // Press ArrowLeft
      await page.keyboard.press("ArrowLeft")

      // Verify focus moved to Table tab
      const tableTab = page.locator('[data-testid="view-tab-table"]')
      await expect(tableTab).toBeFocused()

      // Verify Table tab is now active
      await expect(tableTab).toHaveAttribute("aria-selected", "true")

      // Verify Table view is rendered and Graph view is hidden
      await expect(page.locator('[data-testid="issue-table"]')).toBeVisible()
      await expect(page.locator('[data-testid="graph-view"]')).not.toBeVisible()
    })

    test("ArrowLeft wraps from Kanban to Graph", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/")

      // Focus on the active (Kanban) tab
      const kanbanTab = page.locator('[data-testid="view-tab-kanban"]')
      await kanbanTab.focus()

      // Press ArrowLeft - should wrap to Graph
      await page.keyboard.press("ArrowLeft")

      // Verify focus moved to Graph tab
      const graphTab = page.locator('[data-testid="view-tab-graph"]')
      await expect(graphTab).toBeFocused()

      // Verify Graph tab is now active
      await expect(graphTab).toHaveAttribute("aria-selected", "true")

      // Verify Graph view is rendered and Kanban view is hidden
      await expect(page.locator('[data-testid="graph-view"]')).toBeVisible()
      await expect(
        page.locator('section[data-status="open"]')
      ).not.toBeVisible()
    })

    test("Home navigates to first tab (Kanban)", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/?view=graph")

      // Focus on the active (Graph) tab
      const graphTab = page.locator('[data-testid="view-tab-graph"]')
      await graphTab.focus()

      // Press Home
      await page.keyboard.press("Home")

      // Verify focus moved to Kanban tab
      const kanbanTab = page.locator('[data-testid="view-tab-kanban"]')
      await expect(kanbanTab).toBeFocused()

      // Verify Kanban tab is now active
      await expect(kanbanTab).toHaveAttribute("aria-selected", "true")

      // Verify Kanban view is rendered and Graph view is hidden
      await expect(page.locator('section[data-status="open"]')).toBeVisible()
      await expect(page.locator('[data-testid="graph-view"]')).not.toBeVisible()
    })

    test("End navigates to last tab (Graph)", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/")

      // Focus on the active (Kanban) tab
      const kanbanTab = page.locator('[data-testid="view-tab-kanban"]')
      await kanbanTab.focus()

      // Press End
      await page.keyboard.press("End")

      // Verify focus moved to Graph tab
      const graphTab = page.locator('[data-testid="view-tab-graph"]')
      await expect(graphTab).toBeFocused()

      // Verify Graph tab is now active
      await expect(graphTab).toHaveAttribute("aria-selected", "true")

      // Verify Graph view is rendered and Kanban view is hidden
      await expect(page.locator('[data-testid="graph-view"]')).toBeVisible()
      await expect(
        page.locator('section[data-status="open"]')
      ).not.toBeVisible()
    })

    test("ArrowDown behaves like ArrowRight", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/")

      // Focus on the active (Kanban) tab
      const kanbanTab = page.locator('[data-testid="view-tab-kanban"]')
      await kanbanTab.focus()

      // Press ArrowDown
      await page.keyboard.press("ArrowDown")

      // Verify focus moved to Table tab
      const tableTab = page.locator('[data-testid="view-tab-table"]')
      await expect(tableTab).toBeFocused()

      // Verify Table tab is now active
      await expect(tableTab).toHaveAttribute("aria-selected", "true")

      // Verify Table view is rendered and Kanban view is hidden
      await expect(page.locator('[data-testid="issue-table"]')).toBeVisible()
      await expect(
        page.locator('section[data-status="open"]')
      ).not.toBeVisible()
    })

    test("ArrowUp behaves like ArrowLeft", async ({ page }) => {
      await setupMocks(page)
      await navigateAndWait(page, "/?view=graph")

      // Focus on the active (Graph) tab
      const graphTab = page.locator('[data-testid="view-tab-graph"]')
      await graphTab.focus()

      // Press ArrowUp
      await page.keyboard.press("ArrowUp")

      // Verify focus moved to Table tab
      const tableTab = page.locator('[data-testid="view-tab-table"]')
      await expect(tableTab).toBeFocused()

      // Verify Table tab is now active
      await expect(tableTab).toHaveAttribute("aria-selected", "true")

      // Verify Table view is rendered and Graph view is hidden
      await expect(page.locator('[data-testid="issue-table"]')).toBeVisible()
      await expect(page.locator('[data-testid="graph-view"]')).not.toBeVisible()
    })
  })
})
