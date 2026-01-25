import { test, expect } from "@playwright/test"

/**
 * Mock issues for testing Kanban board rendering.
 * Each issue includes the minimum required fields for API compatibility.
 */
const mockIssues = [
  {
    id: "issue-open-1",
    title: "Open Task 1",
    status: "open",
    priority: 2,
    created_at: "2026-01-24T10:00:00Z",
    updated_at: "2026-01-24T10:00:00Z",
  },
  {
    id: "issue-open-2",
    title: "Open Task 2",
    status: "open",
    priority: 1,
    created_at: "2026-01-24T11:00:00Z",
    updated_at: "2026-01-24T11:00:00Z",
  },
  {
    id: "issue-ip-1",
    title: "In Progress Task",
    status: "in_progress",
    priority: 2,
    created_at: "2026-01-24T12:00:00Z",
    updated_at: "2026-01-24T12:00:00Z",
  },
  {
    id: "issue-closed-1",
    title: "Closed Task",
    status: "closed",
    priority: 3,
    created_at: "2026-01-24T09:00:00Z",
    updated_at: "2026-01-24T13:00:00Z",
  },
]

test.describe("KanbanBoard", () => {
  test("issues load into correct Kanban columns", async ({ page }) => {
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

    // Navigate to the app and wait for API response
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])
    expect(response.ok()).toBe(true)

    // Wait for the Kanban board to render (columns should appear)
    const openColumn = page.locator('section[data-status="open"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const closedColumn = page.locator('section[data-status="closed"]')

    await expect(openColumn).toBeVisible()
    await expect(inProgressColumn).toBeVisible()
    await expect(closedColumn).toBeVisible()

    // Verify Open column contains 2 cards with correct titles
    const openCards = openColumn.locator("article")
    await expect(openCards).toHaveCount(2)
    await expect(openColumn.getByText("Open Task 1")).toBeVisible()
    await expect(openColumn.getByText("Open Task 2")).toBeVisible()

    // Verify In Progress column contains 1 card with correct title
    const inProgressCards = inProgressColumn.locator("article")
    await expect(inProgressCards).toHaveCount(1)
    await expect(inProgressColumn.locator("h3")).toHaveText("In Progress Task")

    // Verify Closed column contains 1 card with correct title
    const closedCards = closedColumn.locator("article")
    await expect(closedCards).toHaveCount(1)
    await expect(closedColumn.locator("h3")).toHaveText("Closed Task")

    // Verify count badges show correct numbers (using aria-label for precise matching)
    await expect(openColumn.getByLabel("2 issues")).toBeVisible()
    await expect(inProgressColumn.getByLabel("1 issue")).toBeVisible()
    await expect(closedColumn.getByLabel("1 issue")).toBeVisible()
  })

  test("handles empty API response gracefully", async ({ page }) => {
    // Mock the /api/ready endpoint to return empty data
    await page.route("**/api/ready", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      })
    })

    // Mock WebSocket
    await page.route("**/ws", async (route) => {
      await route.abort()
    })

    // Navigate to the app and wait for API response
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])
    expect(response.ok()).toBe(true)

    // Wait for the Kanban board to render
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()

    // All columns should have 0 counts (using aria-label for precise matching)
    await expect(openColumn.getByLabel("0 issues")).toBeVisible()
  })

  test("issues without status default to open column", async ({ page }) => {
    // Mock with an issue that has no status field
    const issueWithoutStatus = [
      {
        id: "issue-no-status",
        title: "Issue Without Status",
        priority: 2,
        created_at: "2026-01-24T10:00:00Z",
        updated_at: "2026-01-24T10:00:00Z",
        // Note: no status field
      },
    ]

    await page.route("**/api/ready", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: issueWithoutStatus,
        }),
      })
    })

    await page.route("**/ws", async (route) => {
      await route.abort()
    })

    // Navigate to the app and wait for API response
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])
    expect(response.ok()).toBe(true)

    // The issue should appear in the Open column
    const openColumn = page.locator('section[data-status="open"]')
    await expect(openColumn).toBeVisible()
    await expect(openColumn.getByText("Issue Without Status")).toBeVisible()
  })

  test("shows error toast and rolls back card on drag failure", async ({ page }) => {
    // Mock /api/ready with a single test issue in 'open' column
    const dragTestIssue = [
      {
        id: "drag-fail-issue",
        title: "Issue To Drag",
        status: "open",
        priority: 2,
        created_at: "2026-01-24T10:00:00Z",
        updated_at: "2026-01-24T10:00:00Z",
      },
    ]

    await page.route("**/api/ready", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: dragTestIssue }),
      })
    })

    // Mock WebSocket to prevent connection errors
    await page.route("**/ws", async (route) => {
      await route.abort()
    })

    // Mock PATCH /api/issues/{id} to fail with 500
    await page.route("**/api/issues/*", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ success: false, error: "Server error" }),
        })
      } else {
        await route.continue()
      }
    })

    // Navigate and wait for board to render
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ready") && res.status() === 200),
      page.goto("/"),
    ])

    const openColumn = page.locator('section[data-status="open"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    await expect(openColumn).toBeVisible()

    // Verify card is in Open column initially
    const card = openColumn.locator("article").filter({ hasText: "Issue To Drag" })
    await expect(card).toBeVisible()

    // Wait for the PATCH request when drag completes
    const patchPromise = page.waitForResponse(
      (res) => res.url().includes("/api/issues/") && res.request().method() === "PATCH",
      { timeout: 10000 }
    )

    // Find the draggable wrapper using its accessible role and name
    const draggableWrapper = page.getByRole("button", { name: "Issue: Issue To Drag" })
    await expect(draggableWrapper).toBeVisible()

    // Get the droppable target
    const dropTarget = inProgressColumn.locator('[data-droppable-id="in_progress"]')
    await expect(dropTarget).toBeVisible()

    // Get bounding boxes for pointer event coordinates
    const dragBox = await draggableWrapper.boundingBox()
    const dropBox = await dropTarget.boundingBox()
    if (!dragBox || !dropBox) throw new Error("Could not get element bounds")

    const startX = dragBox.x + dragBox.width / 2
    const startY = dragBox.y + dragBox.height / 2
    const endX = dropBox.x + dropBox.width / 2
    const endY = dropBox.y + dropBox.height / 2

    // Use dispatchEvent to fire pointer events that @dnd-kit's PointerSensor handles
    await draggableWrapper.dispatchEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: startX,
      clientY: startY,
      button: 0,
      buttons: 1,
    })

    // Move beyond activation threshold (5px)
    await page.mouse.move(startX + 10, startY)
    await page.waitForTimeout(50) // Allow time for drag activation

    // Move to drop target
    await page.mouse.move(endX, endY, { steps: 5 })
    await page.waitForTimeout(50)

    // Fire pointerup on the page to complete the drag
    await page.mouse.up()

    // Wait for PATCH to complete (will fail if drag didn't trigger API call)
    await patchPromise

    // Allow time for async error handling and React state updates
    await page.waitForTimeout(500)

    // Wait for and verify error toast appears
    const toast = page.getByTestId("error-toast")
    await expect(toast).toBeVisible({ timeout: 5000 })
    await expect(toast).toHaveAttribute("role", "alert")

    // Verify card rolled back to Open column
    await expect(openColumn.locator("article").filter({ hasText: "Issue To Drag" })).toBeVisible()
    await expect(inProgressColumn.locator("article")).toHaveCount(0)
  })
})
