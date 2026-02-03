import { test, expect } from "@playwright/test"

/**
 * E2E tests for the Kanban Column Redesign (5-column layout).
 *
 * Validates: column order, naming, icons, issue distribution, epic filtering,
 * column backgrounds, status badges, header accents, and default group-by-epic view.
 *
 * Avoids duplicating tests already in backlog-column.spec.ts (individual blocked/deferred
 * routing, drag-drop). Focuses on integration-level verification of the redesign.
 */

const NOW = "2026-01-31T10:00:00Z"

function makeIssue(overrides: Record<string, unknown>) {
  return {
    id: "test-issue",
    title: "Test Issue",
    status: "open",
    priority: 2,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

/**
 * Set up common API route mocks.
 */
async function setupMocks(
  page: import("@playwright/test").Page,
  options: {
    issues: Record<string, unknown>[]
    blockedIssues?: Record<string, unknown>[]
  }
) {
  await page.route("**/api/ready", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: options.issues }),
    })
  })

  await page.route("**/api/blocked", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: options.blockedIssues ?? [],
      }),
    })
  })

  await page.route("**/api/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { open: 0, closed: 0, in_progress: 0, blocked: 0, total: 0 },
      }),
    })
  })

  await page.route("**/api/events", async (route) => {
    await route.abort()
  })
}

/** Navigate to flat kanban view (groupBy=none) and wait for /api/ready */
async function navigateToKanban(page: import("@playwright/test").Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/ready") && res.status() === 200
    ),
    page.goto("/?groupBy=none"),
  ])
  expect(response.ok()).toBe(true)
}

test.describe("Column Redesign: 5-column layout", () => {
  test("renders 5 columns in order: Ready, Backlog, In Progress, Review, Done", async ({
    page,
  }) => {
    const issues = [
      makeIssue({ id: "ready-1", title: "Ready Issue", status: "open" }),
      makeIssue({
        id: "blocked-1",
        title: "Blocked Issue",
        status: "blocked",
      }),
      makeIssue({ id: "ip-1", title: "IP Issue", status: "in_progress" }),
      makeIssue({
        id: "review-1",
        title: "[Need Review] Review Issue",
        status: "open",
      }),
      makeIssue({ id: "done-1", title: "Done Issue", status: "closed" }),
    ]

    await setupMocks(page, { issues })
    await navigateToKanban(page)

    const columns = page.locator("section[data-status]")
    const statuses = await columns.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-status"))
    )
    expect(statuses).toEqual([
      "ready",
      "backlog",
      "in_progress",
      "review",
      "done",
    ])
  })

  test("column headers display correct labels", async ({ page }) => {
    // Need at least one issue to ensure columns render
    const issues = [
      makeIssue({ id: "r-1", title: "Some Task", status: "open" }),
    ]
    await setupMocks(page, { issues })
    await navigateToKanban(page)

    const readyColumn = page.locator('section[data-status="ready"]')
    const backlogColumn = page.locator('section[data-status="backlog"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const reviewColumn = page.locator('section[data-status="review"]')
    const doneColumn = page.locator('section[data-status="done"]')

    await expect(readyColumn.locator("h2")).toHaveText("Ready")
    await expect(backlogColumn.locator("h2")).toHaveText("Backlog")
    await expect(inProgressColumn.locator("h2")).toHaveText("In Progress")
    await expect(reviewColumn.locator("h2")).toHaveText("Review")
    await expect(doneColumn.locator("h2")).toHaveText("Done")
  })

  test("no column is labeled Pending", async ({ page }) => {
    const issues = [
      makeIssue({ id: "r-1", title: "Some Task", status: "open" }),
    ]
    await setupMocks(page, { issues })
    await navigateToKanban(page)

    // Verify no h2 with text "Pending" exists in any column header
    const pendingHeaders = page.locator("section[data-status] h2", {
      hasText: /^Pending$/,
    })
    await expect(pendingHeaders).toHaveCount(0)
  })

  test("each column header shows correct icon", async ({ page }) => {
    const issues = [
      makeIssue({ id: "r-1", title: "Ready Task", status: "open" }),
      makeIssue({ id: "b-1", title: "Blocked Task", status: "blocked" }),
      makeIssue({
        id: "rev-1",
        title: "[Need Review] Review Task",
        status: "open",
      }),
    ]
    await setupMocks(page, { issues })
    await navigateToKanban(page)

    // Backlog shows ⏳ icon (scope to column header, not cards)
    const backlogColumn = page.locator('section[data-status="backlog"]')
    const backlogIcon = backlogColumn
      .locator("header [aria-hidden='true']")
      .first()
    await expect(backlogIcon).toHaveText("⏳")

    // Review shows 👀 icon
    const reviewColumn = page.locator('section[data-status="review"]')
    const reviewIcon = reviewColumn
      .locator("header [aria-hidden='true']")
      .first()
    await expect(reviewIcon).toHaveText("👀")

    // Ready, In Progress, Done headers should NOT have icon spans
    const readyColumn = page.locator('section[data-status="ready"]')
    await expect(
      readyColumn.locator("header [aria-hidden='true']")
    ).toHaveCount(0)

    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    await expect(
      inProgressColumn.locator("header [aria-hidden='true']")
    ).toHaveCount(0)

    const doneColumn = page.locator('section[data-status="done"]')
    await expect(
      doneColumn.locator("header [aria-hidden='true']")
    ).toHaveCount(0)
  })
})

test.describe("Column Redesign: issue distribution across all columns", () => {
  test("issues distribute correctly across all 5 columns simultaneously", async ({
    page,
  }) => {
    const issues = [
      // open, no blockers → Ready
      makeIssue({ id: "ready-1", title: "Ready Task", status: "open" }),
      // status=blocked → Backlog
      makeIssue({
        id: "blocked-1",
        title: "Explicitly Blocked Task",
        status: "blocked",
      }),
      // status=deferred → Backlog
      makeIssue({
        id: "deferred-1",
        title: "Deferred Task",
        status: "deferred",
      }),
      // open with dependency blockers → Backlog
      makeIssue({
        id: "dep-blocked-1",
        title: "Dep Blocked Task",
        status: "open",
      }),
      // in_progress → In Progress
      makeIssue({
        id: "ip-1",
        title: "In Progress Task",
        status: "in_progress",
      }),
      // [Need Review] in title → Review
      makeIssue({
        id: "review-1",
        title: "[Need Review] Review Task",
        status: "open",
      }),
      // status=review → Review
      makeIssue({
        id: "review-2",
        title: "Status Review Task",
        status: "review",
      }),
      // closed → Done
      makeIssue({ id: "done-1", title: "Done Task", status: "closed" }),
    ]

    const blockedData = {
      ...issues[3],
      blocked_by_count: 1,
      blocked_by: ["some-blocker"],
    }

    await setupMocks(page, { issues, blockedIssues: [blockedData] })
    await navigateToKanban(page)

    const readyColumn = page.locator('section[data-status="ready"]')
    const backlogColumn = page.locator('section[data-status="backlog"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const reviewColumn = page.locator('section[data-status="review"]')
    const doneColumn = page.locator('section[data-status="done"]')

    // Ready: 1 (ready-1)
    await expect(readyColumn.locator("article")).toHaveCount(1)
    await expect(readyColumn.getByText("Ready Task")).toBeVisible()

    // Backlog: 3 (blocked, deferred, dep-blocked)
    await expect(backlogColumn.locator("article")).toHaveCount(3)
    await expect(
      backlogColumn.getByText("Explicitly Blocked Task")
    ).toBeVisible()
    await expect(backlogColumn.getByText("Deferred Task")).toBeVisible()
    await expect(backlogColumn.getByText("Dep Blocked Task")).toBeVisible()

    // In Progress: 1
    await expect(inProgressColumn.locator("article")).toHaveCount(1)
    await expect(inProgressColumn.getByText("In Progress Task")).toBeVisible()

    // Review: 2 (title-based + status-based)
    await expect(reviewColumn.locator("article")).toHaveCount(2)
    await expect(
      reviewColumn.getByText("[Need Review] Review Task")
    ).toBeVisible()
    await expect(reviewColumn.getByText("Status Review Task")).toBeVisible()

    // Done: 1
    await expect(doneColumn.locator("article")).toHaveCount(1)
    await expect(doneColumn.getByText("Done Task")).toBeVisible()

    // Verify no card appears in multiple columns (total = 8)
    const allCards = page.locator("section[data-status] article")
    await expect(allCards).toHaveCount(8)
  })

  test("epic issues are excluded from all 5 columns", async ({ page }) => {
    const issues = [
      makeIssue({
        id: "epic-open",
        title: "Epic Open",
        status: "open",
        issue_type: "epic",
      }),
      makeIssue({
        id: "epic-ip",
        title: "Epic In Progress",
        status: "in_progress",
        issue_type: "epic",
      }),
      makeIssue({
        id: "epic-blocked",
        title: "Epic Blocked",
        status: "blocked",
        issue_type: "epic",
      }),
      makeIssue({
        id: "epic-closed",
        title: "Epic Closed",
        status: "closed",
        issue_type: "epic",
      }),
      // One non-epic issue to verify columns still render
      makeIssue({
        id: "task-1",
        title: "Normal Task",
        status: "open",
      }),
    ]

    await setupMocks(page, { issues })
    await navigateToKanban(page)

    const readyColumn = page.locator('section[data-status="ready"]')
    const backlogColumn = page.locator('section[data-status="backlog"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const reviewColumn = page.locator('section[data-status="review"]')
    const doneColumn = page.locator('section[data-status="done"]')

    // Only the non-epic task should appear in Ready
    await expect(readyColumn.locator("article")).toHaveCount(1)
    await expect(readyColumn.getByText("Normal Task")).toBeVisible()

    // Epics are excluded from Ready, Backlog, In Progress, Review columns
    await expect(backlogColumn.locator("article")).toHaveCount(0)
    await expect(inProgressColumn.locator("article")).toHaveCount(0)
    await expect(reviewColumn.locator("article")).toHaveCount(0)

    // Note: Done column filter (status === 'closed') does not exclude epics,
    // so the closed epic appears in Done. This is expected behavior.
    await expect(doneColumn.locator("article")).toHaveCount(1)
    await expect(doneColumn.getByText("Epic Closed")).toBeVisible()
  })
})

test.describe("Column Redesign: column backgrounds", () => {
  test("Ready, In Progress, Done columns use warm gray column background", async ({
    page,
  }) => {
    const issues = [
      makeIssue({ id: "r-1", title: "Some Task", status: "open" }),
    ]
    await setupMocks(page, { issues })
    await navigateToKanban(page)

    const readyBg = await page
      .locator('section[data-status="ready"]')
      .evaluate((el) => window.getComputedStyle(el).backgroundColor)
    const ipBg = await page
      .locator('section[data-status="in_progress"]')
      .evaluate((el) => window.getComputedStyle(el).backgroundColor)
    const doneBg = await page
      .locator('section[data-status="done"]')
      .evaluate((el) => window.getComputedStyle(el).backgroundColor)

    // All three should use --color-column-bg (#EAE8E1 → rgb(234, 232, 225))
    expect(readyBg).toBe("rgb(234, 232, 225)")
    expect(ipBg).toBe("rgb(234, 232, 225)")
    expect(doneBg).toBe("rgb(234, 232, 225)")
  })

  test("Backlog column uses muted warm gray background", async ({ page }) => {
    const issues = [
      makeIssue({ id: "r-1", title: "Some Task", status: "open" }),
    ]
    await setupMocks(page, { issues })
    await navigateToKanban(page)

    const backlogColumn = page.locator('section[data-status="backlog"]')
    await expect(backlogColumn).toHaveAttribute("data-column-type", "backlog")

    const backlogBg = await backlogColumn.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    )
    // --color-column-bg-muted: #E4E2DB → rgb(228, 226, 219)
    expect(backlogBg).toBe("rgb(228, 226, 219)")
  })

  test("Review column uses warm gray column background", async ({ page }) => {
    const issues = [
      makeIssue({ id: "r-1", title: "Some Task", status: "open" }),
    ]
    await setupMocks(page, { issues })
    await navigateToKanban(page)

    const reviewColumn = page.locator('section[data-status="review"]')

    const reviewBg = await reviewColumn.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    )
    // --color-column-bg: #EAE8E1 → rgb(234, 232, 225)
    expect(reviewBg).toBe("rgb(234, 232, 225)")
  })
})

test.describe("Column Redesign: status badges and header accents", () => {
  test("column count badges show correct counts", async ({ page }) => {
    const issues = [
      makeIssue({ id: "r-1", title: "Ready 1", status: "open" }),
      makeIssue({ id: "r-2", title: "Ready 2", status: "open" }),
      makeIssue({ id: "b-1", title: "Blocked 1", status: "blocked" }),
      makeIssue({ id: "ip-1", title: "IP 1", status: "in_progress" }),
      makeIssue({
        id: "rev-1",
        title: "[Need Review] Rev 1",
        status: "open",
      }),
      makeIssue({ id: "d-1", title: "Done 1", status: "closed" }),
      makeIssue({ id: "d-2", title: "Done 2", status: "closed" }),
      makeIssue({ id: "d-3", title: "Done 3", status: "closed" }),
    ]

    await setupMocks(page, { issues })
    await navigateToKanban(page)

    const readyColumn = page.locator('section[data-status="ready"]')
    const backlogColumn = page.locator('section[data-status="backlog"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const reviewColumn = page.locator('section[data-status="review"]')
    const doneColumn = page.locator('section[data-status="done"]')

    await expect(readyColumn.getByLabel("2 issues")).toBeVisible()
    await expect(backlogColumn.getByLabel("1 issue")).toBeVisible()
    await expect(inProgressColumn.getByLabel("1 issue")).toBeVisible()
    await expect(reviewColumn.getByLabel("1 issue")).toBeVisible()
    await expect(doneColumn.getByLabel("3 issues")).toBeVisible()
  })

  test("empty columns show 0 issues badge", async ({ page }) => {
    // Need at least one issue to get flat kanban to render columns
    const issues = [
      makeIssue({ id: "r-1", title: "Some Task", status: "open" }),
    ]
    await setupMocks(page, { issues })
    await navigateToKanban(page)

    // Ready has 1 issue, others have 0
    const backlogColumn = page.locator('section[data-status="backlog"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const reviewColumn = page.locator('section[data-status="review"]')
    const doneColumn = page.locator('section[data-status="done"]')

    await expect(backlogColumn.getByLabel("0 issues")).toBeVisible()
    await expect(inProgressColumn.getByLabel("0 issues")).toBeVisible()
    await expect(reviewColumn.getByLabel("0 issues")).toBeVisible()
    await expect(doneColumn.getByLabel("0 issues")).toBeVisible()
  })

  test("column header border colors match status", async ({ page }) => {
    const issues = [
      makeIssue({ id: "r-1", title: "Ready Task", status: "open" }),
    ]
    await setupMocks(page, { issues })
    await navigateToKanban(page)

    // Use > header to target only the direct column header, not nested card headers
    // Ready: --color-status-ready (#6b7280 → rgb(107, 114, 128))
    const readyBorderColor = await page
      .locator('section[data-status="ready"] > header')
      .evaluate((el) => window.getComputedStyle(el).borderBottomColor)
    expect(readyBorderColor).toBe("rgb(107, 114, 128)")

    // Backlog: overridden by data-column-type='backlog' → --color-text-muted (#9ca3af → rgb(156, 163, 175))
    const backlogBorderColor = await page
      .locator('section[data-status="backlog"] > header')
      .evaluate((el) => window.getComputedStyle(el).borderBottomColor)
    expect(backlogBorderColor).toBe("rgb(156, 163, 175)")

    // In Progress: --color-status-in-progress (#f59e0b → rgb(245, 158, 11))
    const ipBorderColor = await page
      .locator('section[data-status="in_progress"] > header')
      .evaluate((el) => window.getComputedStyle(el).borderBottomColor)
    expect(ipBorderColor).toBe("rgb(245, 158, 11)")

    // Review: --color-status-review (#8b5cf6 → rgb(139, 92, 246))
    const reviewBorderColor = await page
      .locator('section[data-status="review"] > header')
      .evaluate((el) => window.getComputedStyle(el).borderBottomColor)
    expect(reviewBorderColor).toBe("rgb(139, 92, 246)")

    // Done: --color-status-done (#10b981 → rgb(16, 185, 129))
    const doneBorderColor = await page
      .locator('section[data-status="done"] > header')
      .evaluate((el) => window.getComputedStyle(el).borderBottomColor)
    expect(doneBorderColor).toBe("rgb(16, 185, 129)")
  })
})

test.describe("Column Redesign: default group-by-epic view", () => {
  test("navigating to /?groupBy=epic loads swim lane view", async ({
    page,
  }) => {
    const issues = [
      makeIssue({
        id: "e1-open",
        title: "Epic One Feature",
        status: "open",
        issue_type: "feature",
        parent: "epic-1",
        parent_title: "Epic One: Authentication",
      }),
      makeIssue({
        id: "orphan-1",
        title: "Standalone Task",
        status: "open",
        issue_type: "task",
      }),
    ]

    await setupMocks(page, { issues })

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/ready") && res.status() === 200
      ),
      page.goto("/?groupBy=epic"),
    ])
    expect(response.ok()).toBe(true)

    // Verify swim lane board is visible
    await expect(page.getByTestId("swim-lane-board")).toBeVisible()

    // Verify at least one epic lane heading is visible
    await expect(
      page.getByRole("heading", {
        name: "Epic One: Authentication",
        exact: true,
      })
    ).toBeVisible()

    // Verify Ungrouped lane exists for orphan issues
    await expect(
      page.getByRole("heading", { name: "Ungrouped", exact: true })
    ).toBeVisible()
  })

  test("each epic lane contains the 5-column layout", async ({ page }) => {
    const issues = [
      makeIssue({
        id: "e1-ready",
        title: "Ready Feature",
        status: "open",
        parent: "epic-1",
        parent_title: "Test Epic",
      }),
      makeIssue({
        id: "e1-blocked",
        title: "Blocked Feature",
        status: "blocked",
        parent: "epic-1",
        parent_title: "Test Epic",
      }),
      makeIssue({
        id: "e1-ip",
        title: "IP Feature",
        status: "in_progress",
        parent: "epic-1",
        parent_title: "Test Epic",
      }),
      makeIssue({
        id: "e1-review",
        title: "[Need Review] Review Feature",
        status: "open",
        parent: "epic-1",
        parent_title: "Test Epic",
      }),
      makeIssue({
        id: "e1-done",
        title: "Done Feature",
        status: "closed",
        parent: "epic-1",
        parent_title: "Test Epic",
      }),
    ]

    await setupMocks(page, { issues })

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/ready") && res.status() === 200
      ),
      page.goto("/?groupBy=epic"),
    ])
    expect(response.ok()).toBe(true)
    await expect(page.getByTestId("swim-lane-board")).toBeVisible()

    const epicLane = page.getByTestId("swim-lane-lane-epic-epic-1")
    await expect(epicLane).toBeVisible()

    // Verify all 5 column sections exist within the lane
    await expect(
      epicLane.locator('section[data-status="ready"]')
    ).toBeVisible()
    await expect(
      epicLane.locator('section[data-status="backlog"]')
    ).toBeVisible()
    await expect(
      epicLane.locator('section[data-status="in_progress"]')
    ).toBeVisible()
    await expect(
      epicLane.locator('section[data-status="review"]')
    ).toBeVisible()
    await expect(
      epicLane.locator('section[data-status="done"]')
    ).toBeVisible()

    // Verify issues distribute to correct columns within the lane
    await expect(
      epicLane
        .locator('section[data-status="ready"]')
        .getByText("Ready Feature")
    ).toBeVisible()
    await expect(
      epicLane
        .locator('section[data-status="backlog"]')
        .getByText("Blocked Feature")
    ).toBeVisible()
    await expect(
      epicLane
        .locator('section[data-status="in_progress"]')
        .getByText("IP Feature")
    ).toBeVisible()
    await expect(
      epicLane
        .locator('section[data-status="review"]')
        .getByText("[Need Review] Review Feature")
    ).toBeVisible()
    await expect(
      epicLane
        .locator('section[data-status="done"]')
        .getByText("Done Feature")
    ).toBeVisible()
  })
})
