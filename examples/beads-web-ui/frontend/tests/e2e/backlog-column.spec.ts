import { test, expect } from "@playwright/test"

/**
 * Helper to set up common API route mocks for the App.
 * Mocks /api/ready, /api/blocked, /api/stats, and /api/events.
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

/** Navigate and wait for /api/ready to respond */
async function navigateAndWait(page: import("@playwright/test").Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/ready") && res.status() === 200
    ),
    page.goto("/"),
  ])
  expect(response.ok()).toBe(true)
}

const NOW = "2026-01-24T10:00:00Z"

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

test.describe("Backlog column filters", () => {
  test("status=blocked issues appear in Backlog column", async ({ page }) => {
    const blockedIssue = makeIssue({
      id: "blocked-1",
      title: "Blocked Task",
      status: "blocked",
    })

    await setupMocks(page, { issues: [blockedIssue] })
    await navigateAndWait(page)

    const backlogColumn = page.locator('section[data-status="backlog"]')
    await expect(backlogColumn).toBeVisible()

    // Card should be in Backlog
    await expect(backlogColumn.getByText("Blocked Task")).toBeVisible()
    await expect(backlogColumn.locator("article")).toHaveCount(1)
    await expect(backlogColumn.getByLabel("1 issue")).toBeVisible()

    // Card should NOT be in other columns
    const readyColumn = page.locator('section[data-status="ready"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const reviewColumn = page.locator('section[data-status="review"]')
    const doneColumn = page.locator('section[data-status="done"]')

    await expect(readyColumn.locator("article")).toHaveCount(0)
    await expect(inProgressColumn.locator("article")).toHaveCount(0)
    await expect(reviewColumn.locator("article")).toHaveCount(0)
    await expect(doneColumn.locator("article")).toHaveCount(0)
  })

  test("status=deferred issues appear in Backlog column with badge", async ({
    page,
  }) => {
    const deferredIssue = makeIssue({
      id: "deferred-1",
      title: "Deferred Task",
      status: "deferred",
    })

    await setupMocks(page, { issues: [deferredIssue] })
    await navigateAndWait(page)

    const backlogColumn = page.locator('section[data-status="backlog"]')
    await expect(backlogColumn).toBeVisible()

    // Card should be in Backlog
    await expect(backlogColumn.getByText("Deferred Task")).toBeVisible()
    await expect(backlogColumn.locator("article")).toHaveCount(1)

    // Deferred badge should be visible
    const deferredBadge = backlogColumn.locator('[aria-label="Deferred"]')
    await expect(deferredBadge).toBeVisible()

    // Not in other columns
    await expect(
      page.locator('section[data-status="ready"]').locator("article")
    ).toHaveCount(0)
    await expect(
      page.locator('section[data-status="review"]').locator("article")
    ).toHaveCount(0)
  })

  test("dependency-blocked issues appear in Backlog column", async ({
    page,
  }) => {
    // An open issue that has dependency blockers
    const depBlockedIssue = makeIssue({
      id: "dep-blocked-1",
      title: "Dep Blocked Task",
      status: "open",
    })

    // The /api/blocked endpoint returns this issue with blocked info
    const blockedData = {
      ...depBlockedIssue,
      blocked_by_count: 2,
      blocked_by: ["blocker-a", "blocker-b"],
    }

    await setupMocks(page, {
      issues: [depBlockedIssue],
      blockedIssues: [blockedData],
    })
    await navigateAndWait(page)

    const backlogColumn = page.locator('section[data-status="backlog"]')
    await expect(backlogColumn).toBeVisible()

    // Card should be in Backlog (not Ready) because it has blockers
    await expect(backlogColumn.getByText("Dep Blocked Task")).toBeVisible()
    await expect(backlogColumn.locator("article")).toHaveCount(1)

    // Should NOT be in Ready column
    await expect(
      page.locator('section[data-status="ready"]').locator("article")
    ).toHaveCount(0)
  })

  test("status=blocked issues do NOT appear in Review column", async ({
    page,
  }) => {
    // A plain status=blocked issue (no [Need Review] in title)
    const blockedIssue = makeIssue({
      id: "blocked-not-review",
      title: "Blocked But Not Review",
      status: "blocked",
    })

    await setupMocks(page, { issues: [blockedIssue] })
    await navigateAndWait(page)

    const backlogColumn = page.locator('section[data-status="backlog"]')
    const reviewColumn = page.locator('section[data-status="review"]')

    // Should be in Backlog
    await expect(
      backlogColumn.getByText("Blocked But Not Review")
    ).toBeVisible()

    // Should NOT be in Review
    await expect(reviewColumn.locator("article")).toHaveCount(0)
  })

  test("epic issues are excluded from all kanban columns", async ({
    page,
  }) => {
    // An epic with blocked status - should not appear anywhere
    const epicBlocked = makeIssue({
      id: "epic-1",
      title: "Epic Issue",
      status: "blocked",
      issue_type: "epic",
    })
    // An epic with open status and blockers - also excluded
    const epicOpen = makeIssue({
      id: "epic-2",
      title: "Epic Open Issue",
      status: "open",
      issue_type: "epic",
    })

    const blockedData = {
      ...epicOpen,
      blocked_by_count: 1,
      blocked_by: ["some-blocker"],
    }

    await setupMocks(page, {
      issues: [epicBlocked, epicOpen],
      blockedIssues: [blockedData],
    })
    await navigateAndWait(page)

    // No epic should appear in any column
    const readyColumn = page.locator('section[data-status="ready"]')
    const backlogColumn = page.locator('section[data-status="backlog"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')
    const reviewColumn = page.locator('section[data-status="review"]')
    const doneColumn = page.locator('section[data-status="done"]')

    await expect(readyColumn).toBeVisible()

    await expect(readyColumn.locator("article")).toHaveCount(0)
    await expect(backlogColumn.locator("article")).toHaveCount(0)
    await expect(inProgressColumn.locator("article")).toHaveCount(0)
    await expect(reviewColumn.locator("article")).toHaveCount(0)
    await expect(doneColumn.locator("article")).toHaveCount(0)
  })
})

test.describe("Backlog column drag-drop", () => {
  test("drag from Backlog to Done succeeds", async ({ page }) => {
    const blockedIssue = makeIssue({
      id: "backlog-to-done",
      title: "Backlog To Done Task",
      status: "blocked",
    })

    const patchCalls: { url: string; body: { status?: string } }[] = []

    await setupMocks(page, { issues: [blockedIssue] })

    // Mock PATCH /api/issues/:id
    await page.route("**/api/issues/*", async (route) => {
      if (route.request().method() === "PATCH") {
        const url = route.request().url()
        const body = route.request().postDataJSON() as { status?: string }
        patchCalls.push({ url, body })

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { ...blockedIssue, status: body.status },
          }),
        })
      } else {
        await route.continue()
      }
    })

    await navigateAndWait(page)

    const backlogColumn = page.locator('section[data-status="backlog"]')
    const doneColumn = page.locator('section[data-status="done"]')
    await expect(backlogColumn.getByText("Backlog To Done Task")).toBeVisible()

    // Get draggable and drop target
    const draggable = page
      .getByRole("button", { name: "Issue: Backlog To Done Task" })
      .first()
    const dropTarget = doneColumn.locator('[data-droppable-id="done"]')
    await expect(draggable).toBeVisible()
    await expect(dropTarget).toBeVisible()

    const dragBox = await draggable.boundingBox()
    const dropBox = await dropTarget.boundingBox()
    if (!dragBox || !dropBox) throw new Error("Could not get bounding boxes")

    const startX = dragBox.x + dragBox.width / 2
    const startY = dragBox.y + dragBox.height / 2
    const endX = dropBox.x + dropBox.width / 2
    const endY = dropBox.y + dropBox.height / 2

    // Perform drag: pointerdown → pointermove past threshold → pointermove to target → pointerup
    await draggable.dispatchEvent("pointerdown", {
      clientX: startX,
      clientY: startY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointermove", {
      clientX: startX + 10,
      clientY: startY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointermove", {
      clientX: endX,
      clientY: endY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointerup", {
      clientX: endX,
      clientY: endY,
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    // Wait for PATCH API call
    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/issues/backlog-to-done") &&
        res.request().method() === "PATCH"
    )

    // Verify card moved to Done
    await expect(doneColumn.getByText("Backlog To Done Task")).toBeVisible()
    await expect(backlogColumn.locator("article")).toHaveCount(0)

    // Verify API call sent correct status
    expect(patchCalls).toHaveLength(1)
    expect(patchCalls[0].body).toEqual({ status: "closed" })
  })

  test("Backlog column is not a valid drop target", async ({ page }) => {
    // One issue in Ready, one in Backlog
    const readyIssue = makeIssue({
      id: "ready-issue",
      title: "Ready Issue",
      status: "open",
    })
    const blockedIssue = makeIssue({
      id: "blocked-issue",
      title: "Blocked Issue",
      status: "blocked",
    })

    let patchCalled = false

    await setupMocks(page, { issues: [readyIssue, blockedIssue] })

    await page.route("**/api/issues/*", async (route) => {
      if (route.request().method() === "PATCH") {
        patchCalled = true
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: readyIssue }),
        })
      } else {
        await route.continue()
      }
    })

    await navigateAndWait(page)

    const readyColumn = page.locator('section[data-status="ready"]')
    const backlogColumn = page.locator('section[data-status="backlog"]')

    await expect(readyColumn.getByText("Ready Issue")).toBeVisible()
    await expect(backlogColumn.getByText("Blocked Issue")).toBeVisible()

    // Try to drag from Ready to Backlog
    const draggable = page
      .getByRole("button", { name: "Issue: Ready Issue" })
      .first()
    await expect(draggable).toBeVisible()

    const dragBox = await draggable.boundingBox()
    const backlogBox = await backlogColumn.boundingBox()
    if (!dragBox || !backlogBox)
      throw new Error("Could not get bounding boxes")

    const startX = dragBox.x + dragBox.width / 2
    const startY = dragBox.y + dragBox.height / 2
    const endX = backlogBox.x + backlogBox.width / 2
    const endY = backlogBox.y + backlogBox.height / 2

    // Perform drag operation
    await draggable.dispatchEvent("pointerdown", {
      clientX: startX,
      clientY: startY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointermove", {
      clientX: startX + 10,
      clientY: startY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointermove", {
      clientX: endX,
      clientY: endY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointerup", {
      clientX: endX,
      clientY: endY,
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    // Wait a moment to ensure no PATCH would be sent
    await page.waitForTimeout(500)

    // Backlog should NOT have data-is-over (droppableDisabled: true)
    // No PATCH call should have been made
    expect(patchCalled).toBe(false)

    // Card should still be in Ready column
    await expect(readyColumn.getByText("Ready Issue")).toBeVisible()
    await expect(readyColumn.locator("article")).toHaveCount(1)
  })

  test("drag from Backlog to non-Done column is rejected", async ({
    page,
  }) => {
    const blockedIssue = makeIssue({
      id: "backlog-no-ip",
      title: "Cannot Drag To IP",
      status: "blocked",
    })

    let patchCalled = false

    await setupMocks(page, { issues: [blockedIssue] })

    await page.route("**/api/issues/*", async (route) => {
      if (route.request().method() === "PATCH") {
        patchCalled = true
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: blockedIssue }),
        })
      } else {
        await route.continue()
      }
    })

    await navigateAndWait(page)

    const backlogColumn = page.locator('section[data-status="backlog"]')
    const inProgressColumn = page.locator('section[data-status="in_progress"]')

    await expect(backlogColumn.getByText("Cannot Drag To IP")).toBeVisible()

    // Try to drag from Backlog to In Progress
    const draggable = page
      .getByRole("button", { name: "Issue: Cannot Drag To IP" })
      .first()
    const dropTarget = inProgressColumn.locator(
      '[data-droppable-id="in_progress"]'
    )
    await expect(draggable).toBeVisible()
    await expect(dropTarget).toBeVisible()

    const dragBox = await draggable.boundingBox()
    const dropBox = await dropTarget.boundingBox()
    if (!dragBox || !dropBox) throw new Error("Could not get bounding boxes")

    const startX = dragBox.x + dragBox.width / 2
    const startY = dragBox.y + dragBox.height / 2
    const endX = dropBox.x + dropBox.width / 2
    const endY = dropBox.y + dropBox.height / 2

    // Perform drag operation
    await draggable.dispatchEvent("pointerdown", {
      clientX: startX,
      clientY: startY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointermove", {
      clientX: startX + 10,
      clientY: startY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointermove", {
      clientX: endX,
      clientY: endY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    await page.waitForTimeout(50)

    await page.dispatchEvent("body", "pointerup", {
      clientX: endX,
      clientY: endY,
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    // Wait to ensure no PATCH would fire
    await page.waitForTimeout(500)

    // No PATCH call should have been made
    expect(patchCalled).toBe(false)

    // Card should still be in Backlog
    await expect(backlogColumn.getByText("Cannot Drag To IP")).toBeVisible()
    await expect(backlogColumn.locator("article")).toHaveCount(1)
  })
})
