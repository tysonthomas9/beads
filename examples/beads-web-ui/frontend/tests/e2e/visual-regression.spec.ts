import { test, expect } from "@playwright/test"

/**
 * Mock issues for visual regression testing.
 * Consistent data ensures deterministic screenshots.
 */
const visualTestIssues = [
  {
    id: "vis-1",
    title: "Open task for visual testing",
    status: "open",
    priority: 1, // P1 - high priority (red badge)
    issue_type: "task",
    created_at: "2026-01-20T10:00:00Z",
    updated_at: "2026-01-25T10:00:00Z",
  },
  {
    id: "vis-2",
    title: "In progress feature work",
    status: "in_progress",
    priority: 2, // P2 - medium priority (yellow badge)
    issue_type: "feature",
    created_at: "2026-01-21T10:00:00Z",
    updated_at: "2026-01-25T10:00:00Z",
  },
  {
    id: "vis-3",
    title: "Closed bug fix",
    status: "closed",
    priority: 3, // P3 - low priority (green badge)
    issue_type: "bug",
    created_at: "2026-01-22T10:00:00Z",
    updated_at: "2026-01-25T10:00:00Z",
  },
  {
    id: "vis-4",
    title: "Blocked epic item",
    status: "open",
    priority: 0, // P0 - critical (purple badge)
    issue_type: "epic",
    blocked_by: ["vis-1"],
    created_at: "2026-01-23T10:00:00Z",
    updated_at: "2026-01-25T10:00:00Z",
  },
]

// Set consistent viewport for reproducible screenshots
test.use({ viewport: { width: 1280, height: 720 } })

/**
 * Helper to setup API mocks for visual tests
 */
async function setupMocks(
  page: import("@playwright/test").Page,
  issues = visualTestIssues
) {
  // Mock /api/ready endpoint
  await page.route("**/api/ready", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: issues }),
    })
  })

}

/**
 * Helper to wait for content to stabilize before screenshot
 */
async function waitForStableContent(page: import("@playwright/test").Page) {
  // Wait for network idle
  await page.waitForLoadState("networkidle")
  // Wait for any animations to settle
  await page.waitForTimeout(100)
}

test.describe("Visual Regression - Kanban Board", () => {
  test("default view with all columns", async ({ page }) => {
    await setupMocks(page)

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    await waitForStableContent(page)

    // Verify cards are visible before taking screenshot
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn.locator("article")).toHaveCount(2)

    await expect(page).toHaveScreenshot("kanban-default-view.png")
  })

  test("with blocked badges visible", async ({ page }) => {
    await setupMocks(page)

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    await waitForStableContent(page)

    // vis-4 has blocked_by, should show blocked badge
    const blockedCard = page.locator("article").filter({ hasText: "Blocked epic item" })
    await expect(blockedCard).toBeVisible()

    await expect(page).toHaveScreenshot("kanban-with-blocked.png")
  })

  test("empty columns state", async ({ page }) => {
    await setupMocks(page, [])

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    await waitForStableContent(page)

    // Verify empty state is visible
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()
    await expect(openColumn.getByLabel("0 issues")).toBeVisible()

    await expect(page).toHaveScreenshot("kanban-empty.png")
  })
})

test.describe("Visual Regression - Table View", () => {
  test("default view with data", async ({ page }) => {
    await setupMocks(page)

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    // Switch to table view using the correct testId
    const tableTab = page.getByTestId("view-tab-table")
    await tableTab.click()

    await waitForStableContent(page)

    // Verify table has data
    const issueTable = page.getByTestId("issue-table")
    await expect(issueTable).toBeVisible()

    await expect(page).toHaveScreenshot("table-default-view.png")
  })

  test("empty state", async ({ page }) => {
    await setupMocks(page, [])

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    // Switch to table view
    const tableTab = page.getByTestId("view-tab-table")
    await tableTab.click()

    await waitForStableContent(page)

    await expect(page).toHaveScreenshot("table-empty.png")
  })
})

test.describe("Visual Regression - Graph View", () => {
  test("default view with nodes", async ({ page }) => {
    await setupMocks(page)

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    // Switch to graph view using the correct testId
    const graphTab = page.getByTestId("view-tab-graph")
    await graphTab.click()

    // Verify graph container is visible - this waits for React Flow to mount
    const graphView = page.getByTestId("graph-view")
    await expect(graphView).toBeVisible()

    // Wait for React Flow canvas to render nodes (canvas-based, needs time to layout)
    const reactFlow = page.locator(".react-flow")
    await expect(reactFlow).toBeVisible()

    await waitForStableContent(page)

    await expect(page).toHaveScreenshot("graph-default-view.png", {
      // Higher threshold for canvas rendering differences across platforms
      maxDiffPixels: 500,
    })
  })

  test("empty state", async ({ page }) => {
    await setupMocks(page, [])

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    // Switch to graph view
    const graphTab = page.getByTestId("view-tab-graph")
    await graphTab.click()

    // Verify graph container is visible
    const graphView = page.getByTestId("graph-view")
    await expect(graphView).toBeVisible()

    await waitForStableContent(page)

    await expect(page).toHaveScreenshot("graph-empty.png", {
      maxDiffPixels: 500,
    })
  })
})

test.describe("Visual Regression - Loading States", () => {
  test("skeleton loading state", async ({ page }) => {
    // Delay API response long enough to capture skeleton state
    // Using 800ms delay - similar to existing skeleton.spec.ts tests
    await page.route("**/api/ready", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: visualTestIssues }),
      })
    })

    // Navigate without waiting for full load to catch skeleton
    await page.goto("/", { waitUntil: "domcontentloaded" })

    // Verify skeleton columns are visible (they appear immediately before API response)
    const skeletonColumns = page.locator('[class*="column"][aria-hidden="true"]')
    await expect(skeletonColumns.first()).toBeVisible()

    // Take screenshot while skeleton is still visible (before API response at 800ms)
    await expect(page).toHaveScreenshot("loading-skeleton.png", {
      // Disable animations to capture consistent skeleton state
      animations: "disabled",
    })
  })
})

test.describe("Visual Regression - Error States", () => {
  test("error display with retry button", async ({ page }) => {
    // Mock API to return error
    await page.route("**/api/ready", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Server error" }),
      })
    })

    await page.goto("/")

    await waitForStableContent(page)

    // Verify error display is visible
    const errorDisplay = page.getByRole("alert")
    await expect(errorDisplay).toBeVisible()

    await expect(page).toHaveScreenshot("error-display.png")
  })
})

test.describe("Visual Regression - Filter Interactions", () => {
  test("priority filter dropdown selected", async ({ page }) => {
    await setupMocks(page)

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    await waitForStableContent(page)

    // Select a priority using the correct testId (it's a select element, not a button)
    const priorityFilter = page.getByTestId("priority-filter")
    await priorityFilter.selectOption("1") // P1

    await waitForStableContent(page)

    await expect(page).toHaveScreenshot("filter-priority-selected.png")
  })

  test("type filter dropdown selected", async ({ page }) => {
    await setupMocks(page)

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    await waitForStableContent(page)

    // Select a type using the correct testId
    const typeFilter = page.getByTestId("type-filter")
    await typeFilter.selectOption("task")

    await waitForStableContent(page)

    await expect(page).toHaveScreenshot("filter-type-selected.png")
  })

  test("search input with text", async ({ page }) => {
    await setupMocks(page)

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    await waitForStableContent(page)

    // Type in search input using the correct testId
    const searchInput = page.getByTestId("search-input-field")
    await searchInput.fill("visual testing")

    await waitForStableContent(page)

    await expect(page).toHaveScreenshot("search-with-text.png")
  })
})

test.describe("Visual Regression - Connection Status", () => {
  test("header with connection indicator", async ({ page }) => {
    await setupMocks(page)

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready")),
      page.goto("/"),
    ])

    await waitForStableContent(page)

    // Use the banner role to get the specific app header (not the column headers)
    const header = page.getByRole("banner")
    await expect(header).toBeVisible()

    await expect(header).toHaveScreenshot("header-connection-status.png")
  })
})
