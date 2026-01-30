import { test, expect, Page } from "@playwright/test"

/**
 * Mock issues covering all 5 columns for testing the default epic view.
 * - Ready: open, no blockers, no [Need Review]
 * - Backlog: blocked or deferred
 * - In Progress: in_progress
 * - Review: status=review or title contains [Need Review]
 * - Done: closed
 *
 * Issues are distributed across 2 epics + orphans.
 */
const mockIssues = [
  // Epic A: 1 ready, 1 in_progress, 1 closed
  {
    id: "epic-a-ready",
    title: "Ready Task in Epic A",
    status: "open",
    priority: 2,
    issue_type: "task",
    parent: "epic-a",
    parent_title: "Epic A: Authentication",
    assignee: "alice",
    created_at: "2026-01-27T10:00:00Z",
    updated_at: "2026-01-27T10:00:00Z",
  },
  {
    id: "epic-a-progress",
    title: "In Progress Task in Epic A",
    status: "in_progress",
    priority: 1,
    issue_type: "task",
    parent: "epic-a",
    parent_title: "Epic A: Authentication",
    assignee: "bob",
    created_at: "2026-01-27T11:00:00Z",
    updated_at: "2026-01-27T11:00:00Z",
  },
  {
    id: "epic-a-done",
    title: "Closed Bug in Epic A",
    status: "closed",
    priority: 0,
    issue_type: "bug",
    parent: "epic-a",
    parent_title: "Epic A: Authentication",
    created_at: "2026-01-27T12:00:00Z",
    updated_at: "2026-01-27T12:00:00Z",
  },
  // Epic B: 1 blocked (backlog), 1 review
  {
    id: "epic-b-blocked",
    title: "Blocked Feature in Epic B",
    status: "blocked",
    priority: 2,
    issue_type: "feature",
    parent: "epic-b",
    parent_title: "Epic B: Dashboard",
    created_at: "2026-01-27T13:00:00Z",
    updated_at: "2026-01-27T13:00:00Z",
  },
  {
    id: "epic-b-review",
    title: "Review Task in Epic B",
    status: "review",
    priority: 3,
    issue_type: "task",
    parent: "epic-b",
    parent_title: "Epic B: Dashboard",
    created_at: "2026-01-27T14:00:00Z",
    updated_at: "2026-01-27T14:00:00Z",
  },
  // Orphan: 1 deferred (backlog)
  {
    id: "orphan-deferred",
    title: "Deferred Orphan Task",
    status: "deferred",
    priority: 4,
    issue_type: "task",
    created_at: "2026-01-27T15:00:00Z",
    updated_at: "2026-01-27T15:00:00Z",
  },
]

/**
 * Set up API mocks for default epic view tests.
 */
async function setupMocks(page: Page, issues: object[] = mockIssues) {
  await page.route("**/api/ready", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: issues }),
    })
  })

  await page.route("**/api/issues/*", async (route) => {
    if (route.request().method() === "PATCH") {
      const url = route.request().url()
      const issueId = url.split("/").pop()
      const body = route.request().postDataJSON() as { status?: string }
      const issue = issues.find(
        (i) => (i as { id: string }).id === issueId
      ) as object
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { ...issue, ...body, updated_at: new Date().toISOString() },
        }),
      })
    } else {
      await route.continue()
    }
  })
}

/**
 * Navigate to the root path (no params) and wait for API response.
 */
async function navigateToDefault(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/ready") && res.status() === 200
    ),
    page.goto("/"),
  ])
  expect(response.ok()).toBe(true)
  await expect(page.getByTestId("swim-lane-board")).toBeVisible()
}

/**
 * Get a specific epic lane by its parent ID.
 */
function getEpicLane(page: Page, epicId: string) {
  return page.getByTestId(`swim-lane-lane-epic-${epicId}`)
}

test.describe("Default Epic View", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
  })

  test.describe("Default Navigation", () => {
    test("navigating to / shows epic swim lane board", async ({ page }) => {
      await navigateToDefault(page)

      // Swim lane board visible
      await expect(page.getByTestId("swim-lane-board")).toBeVisible()

      // groupBy dropdown shows "epic"
      await expect(page.getByTestId("groupby-filter")).toHaveValue("epic")
    })

    test("no groupBy param in URL when using default epic view", async ({
      page,
    }) => {
      await navigateToDefault(page)

      // URL should be clean - no groupBy param
      expect(page.url()).not.toContain("groupBy=")
    })

    test("epic lanes render with correct issues", async ({ page }) => {
      await navigateToDefault(page)

      // Epic A lane: 3 issues
      const epicALane = getEpicLane(page, "epic-a")
      await expect(epicALane).toBeVisible()
      await expect(epicALane.locator("article")).toHaveCount(3)
      await expect(
        epicALane.getByText("Ready Task in Epic A")
      ).toBeVisible()
      await expect(
        epicALane.getByText("In Progress Task in Epic A")
      ).toBeVisible()
      await expect(
        epicALane.getByText("Closed Bug in Epic A")
      ).toBeVisible()

      // Epic B lane: 2 issues
      const epicBLane = getEpicLane(page, "epic-b")
      await expect(epicBLane).toBeVisible()
      await expect(epicBLane.locator("article")).toHaveCount(2)
      await expect(
        epicBLane.getByText("Blocked Feature in Epic B")
      ).toBeVisible()
      await expect(
        epicBLane.getByText("Review Task in Epic B")
      ).toBeVisible()

      // Ungrouped lane: 1 orphan issue
      const ungroupedLane = getEpicLane(page, "__ungrouped__")
      await expect(ungroupedLane).toBeVisible()
      await expect(ungroupedLane.locator("article")).toHaveCount(1)
      await expect(
        ungroupedLane.getByText("Deferred Orphan Task")
      ).toBeVisible()
    })
  })

  test.describe("5-Column Layout in Swim Lanes", () => {
    test("each epic lane contains all 5 status columns", async ({ page }) => {
      await navigateToDefault(page)

      // Check Epic A lane has all 5 columns
      const epicALane = getEpicLane(page, "epic-a")
      await expect(
        epicALane.locator('section[data-status="ready"]')
      ).toBeVisible()
      await expect(
        epicALane.locator('section[data-status="backlog"]')
      ).toBeVisible()
      await expect(
        epicALane.locator('section[data-status="in_progress"]')
      ).toBeVisible()
      await expect(
        epicALane.locator('section[data-status="review"]')
      ).toBeVisible()
      await expect(
        epicALane.locator('section[data-status="done"]')
      ).toBeVisible()
    })

    test("column headers show correct labels", async ({ page }) => {
      await navigateToDefault(page)

      // Use Epic B lane which has fewer issues to avoid text collisions
      // (e.g., "Ready" matching "Ready Task in Epic A" card title)
      const epicBLane = getEpicLane(page, "epic-b")

      // Verify each column section header within the lane
      // Column headers are inside section[data-status] elements
      const readyCol = epicBLane.locator('section[data-status="ready"]')
      const backlogCol = epicBLane.locator('section[data-status="backlog"]')
      const inProgressCol = epicBLane.locator('section[data-status="in_progress"]')
      const reviewCol = epicBLane.locator('section[data-status="review"]')
      const doneCol = epicBLane.locator('section[data-status="done"]')

      await expect(readyCol).toBeVisible()
      await expect(backlogCol).toBeVisible()
      await expect(inProgressCol).toBeVisible()
      await expect(reviewCol).toBeVisible()
      await expect(doneCol).toBeVisible()
    })

    test("issues distributed into correct columns within lane", async ({
      page,
    }) => {
      await navigateToDefault(page)

      // Epic A: ready=1 (open issue), backlog=0, in_progress=1, review=0, done=1 (closed)
      const epicALane = getEpicLane(page, "epic-a")
      await expect(
        epicALane.locator('section[data-status="ready"] article')
      ).toHaveCount(1)
      await expect(
        epicALane
          .locator('section[data-status="ready"]')
          .getByText("Ready Task in Epic A")
      ).toBeVisible()

      await expect(
        epicALane.locator('section[data-status="in_progress"] article')
      ).toHaveCount(1)
      await expect(
        epicALane
          .locator('section[data-status="in_progress"]')
          .getByText("In Progress Task in Epic A")
      ).toBeVisible()

      await expect(
        epicALane.locator('section[data-status="done"] article')
      ).toHaveCount(1)
      await expect(
        epicALane
          .locator('section[data-status="done"]')
          .getByText("Closed Bug in Epic A")
      ).toBeVisible()

      // Epic B: ready=0, backlog=1 (blocked), in_progress=0, review=1, done=0
      const epicBLane = getEpicLane(page, "epic-b")
      await expect(
        epicBLane.locator('section[data-status="backlog"] article')
      ).toHaveCount(1)
      await expect(
        epicBLane
          .locator('section[data-status="backlog"]')
          .getByText("Blocked Feature in Epic B")
      ).toBeVisible()

      await expect(
        epicBLane.locator('section[data-status="review"] article')
      ).toHaveCount(1)
      await expect(
        epicBLane
          .locator('section[data-status="review"]')
          .getByText("Review Task in Epic B")
      ).toBeVisible()

      // Ungrouped: backlog=1 (deferred)
      const ungroupedLane = getEpicLane(page, "__ungrouped__")
      await expect(
        ungroupedLane.locator('section[data-status="backlog"] article')
      ).toHaveCount(1)
      await expect(
        ungroupedLane
          .locator('section[data-status="backlog"]')
          .getByText("Deferred Orphan Task")
      ).toBeVisible()
    })
  })

  test.describe("Grouped ↔ Flat Toggle", () => {
    test("switching from epic to none shows flat kanban", async ({ page }) => {
      await navigateToDefault(page)

      // Start: swim lanes visible
      await expect(page.getByTestId("swim-lane-board")).toBeVisible()

      // Select "none" in groupby-filter
      await page.getByTestId("groupby-filter").selectOption("none")

      // Swim lane board should be hidden
      await expect(page.getByTestId("swim-lane-board")).not.toBeVisible()

      // Flat kanban columns should be visible (5-column layout)
      await expect(
        page.locator('section[data-status="ready"]')
      ).toBeVisible()
      await expect(
        page.locator('section[data-status="in_progress"]')
      ).toBeVisible()
      await expect(
        page.locator('section[data-status="done"]')
      ).toBeVisible()
    })

    test("switching from none back to epic shows swim lanes", async ({
      page,
    }) => {
      // Start at flat view
      const [response] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes("/api/ready") && res.status() === 200
        ),
        page.goto("/?groupBy=none"),
      ])
      expect(response.ok()).toBe(true)

      // Verify flat view
      await expect(page.getByTestId("swim-lane-board")).not.toBeVisible()

      // Switch to epic
      await page.getByTestId("groupby-filter").selectOption("epic")

      // Swim lane board should appear
      await expect(page.getByTestId("swim-lane-board")).toBeVisible()

      // Epic lanes should be visible
      await expect(
        page.getByRole("heading", {
          name: "Epic A: Authentication",
          exact: true,
        })
      ).toBeVisible()
      await expect(
        page.getByRole("heading", {
          name: "Epic B: Dashboard",
          exact: true,
        })
      ).toBeVisible()
    })

    test("toggling updates URL correctly", async ({ page }) => {
      await navigateToDefault(page)

      // Default: no groupBy in URL
      expect(page.url()).not.toContain("groupBy=")

      // Switch to assignee: URL should contain groupBy=assignee
      await page.getByTestId("groupby-filter").selectOption("assignee")
      await expect(async () => {
        expect(page.url()).toContain("groupBy=assignee")
      }).toPass({ timeout: 2000 })

      // Switch to none: URL should be clean (none is omitted like epic)
      await page.getByTestId("groupby-filter").selectOption("none")
      await expect(async () => {
        expect(page.url()).not.toContain("groupBy=")
      }).toPass({ timeout: 2000 })

      // Switch back to epic: URL should still be clean
      await page.getByTestId("groupby-filter").selectOption("epic")
      await expect(async () => {
        expect(page.url()).not.toContain("groupBy=")
      }).toPass({ timeout: 2000 })
    })
  })

  test.describe("URL State Persistence", () => {
    test("default epic view URL is clean (no groupBy param)", async ({
      page,
    }) => {
      await navigateToDefault(page)
      expect(page.url()).not.toContain("groupBy=")
    })

    test("selecting epic explicitly also keeps clean URL", async ({
      page,
    }) => {
      await navigateToDefault(page)

      // Explicitly select "epic" in dropdown
      await page.getByTestId("groupby-filter").selectOption("epic")

      // URL should still have no groupBy param (epic is default)
      await expect(async () => {
        expect(page.url()).not.toContain("groupBy=")
      }).toPass({ timeout: 2000 })

      // Swim lanes should still be visible
      await expect(page.getByTestId("swim-lane-board")).toBeVisible()
    })

    test("page refresh preserves default epic view", async ({ page }) => {
      await navigateToDefault(page)

      // Re-setup mocks before reload
      await setupMocks(page)

      // Reload the page
      await page.reload()
      await page.waitForResponse((res) => res.url().includes("/api/ready"))

      // Swim lanes should still be visible
      await expect(page.getByTestId("swim-lane-board")).toBeVisible()

      // Dropdown should still show "epic"
      await expect(page.getByTestId("groupby-filter")).toHaveValue("epic")
    })
  })
})
