import { test, expect, Page } from "@playwright/test"

/**
 * Mock issues for testing Show Closed toggle.
 * Includes a mix of open, in_progress, and closed issues.
 */
const mockIssues = [
  {
    id: "issue-open-1",
    title: "Open Issue 1",
    status: "open",
    priority: 2,
    issue_type: "task",
    created_at: "2026-01-27T10:00:00Z",
    updated_at: "2026-01-27T10:00:00Z",
  },
  {
    id: "issue-in-progress-1",
    title: "In Progress Issue",
    status: "in_progress",
    priority: 1,
    issue_type: "feature",
    created_at: "2026-01-27T11:00:00Z",
    updated_at: "2026-01-27T11:00:00Z",
  },
  {
    id: "issue-closed-1",
    title: "Closed Issue 1",
    status: "closed",
    priority: 2,
    issue_type: "bug",
    created_at: "2026-01-27T12:00:00Z",
    updated_at: "2026-01-27T12:00:00Z",
  },
  {
    id: "issue-closed-2",
    title: "Closed Issue 2",
    status: "closed",
    priority: 3,
    issue_type: "task",
    created_at: "2026-01-27T13:00:00Z",
    updated_at: "2026-01-27T13:00:00Z",
  },
  {
    id: "issue-open-2",
    title: "Open Issue 2",
    status: "open",
    priority: 0,
    issue_type: "bug",
    created_at: "2026-01-27T14:00:00Z",
    updated_at: "2026-01-27T14:00:00Z",
  },
]
// Total: 5 issues (2 open, 1 in_progress, 2 closed)
// Non-closed: 3 issues

/**
 * Set up API mocks for Show Closed toggle tests.
 */
async function setupMocks(page: Page, issues = mockIssues) {
  await page.route("**/api/ready", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: issues }),
    })
  })
  await page.route("**/ws", async (route) => {
    await route.abort()
  })
}

/**
 * Navigate to Graph view and wait for API response.
 */
async function navigateToGraphView(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/ready") && res.status() === 200
    ),
    page.goto("/?view=graph"),
  ])
  expect(response.ok()).toBe(true)

  // Wait for GraphView to be visible
  const graphView = page.getByTestId("graph-view")
  await expect(graphView).toBeVisible()
}

test.describe("Show Closed Toggle", () => {
  test.describe("Display", () => {
    test("toggle renders in GraphControls", async ({ page }) => {
      await setupMocks(page)
      await navigateToGraphView(page)

      // Verify GraphControls panel is visible
      const controls = page.getByTestId("graph-controls")
      await expect(controls).toBeVisible()

      // Verify Show Closed checkbox is visible
      const toggle = page.getByTestId("show-closed-toggle")
      await expect(toggle).toBeVisible()
    })

    test("toggle has 'Show Closed' label text", async ({ page }) => {
      await setupMocks(page)
      await navigateToGraphView(page)

      // Verify label text is visible
      const controls = page.getByTestId("graph-controls")
      await expect(controls.getByText("Show Closed")).toBeVisible()
    })

    test("toggle has correct aria-label", async ({ page }) => {
      await setupMocks(page)
      await navigateToGraphView(page)

      const toggle = page.getByTestId("show-closed-toggle")
      await expect(toggle).toHaveAttribute("aria-label", "Show closed issues")
    })
  })

  test.describe("Default State", () => {
    test("toggle is checked by default (show closed)", async ({ page }) => {
      // Clear localStorage before test
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Verify checkbox is checked
      const toggle = page.getByTestId("show-closed-toggle")
      await expect(toggle).toBeChecked()
    })

    test("closed issues are visible when toggle is checked", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Wait for nodes to render
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(5)

      // Verify closed nodes exist
      const closedNodes = page.locator('[data-status="closed"]')
      await expect(closedNodes).toHaveCount(2)
    })
  })

  test.describe("Toggle OFF (Hide Closed)", () => {
    test("unchecking toggle hides closed issues", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Wait for initial nodes
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(5)

      // Uncheck the toggle
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.uncheck()

      // Verify toggle is unchecked
      await expect(toggle).not.toBeChecked()

      // Verify node count is reduced to 3 (only non-closed)
      await expect(nodes).toHaveCount(3)
    })

    test("toggle off removes closed nodes from graph", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Verify closed nodes exist initially
      const closedNodes = page.locator('[data-status="closed"]')
      await expect(closedNodes).toHaveCount(2)

      // Uncheck toggle
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.uncheck()

      // Verify no closed nodes exist
      await expect(closedNodes).toHaveCount(0)

      // Verify the correct non-closed nodes remain visible
      await expect(page.getByText("Open Issue 1")).toBeVisible()
      await expect(page.getByText("In Progress Issue")).toBeVisible()
      await expect(page.getByText("Open Issue 2")).toBeVisible()
    })
  })

  test.describe("Toggle ON (Show Closed)", () => {
    test("checking toggle shows closed issues", async ({ page }) => {
      // Start with toggle unchecked via localStorage
      await page.addInitScript(() => {
        localStorage.setItem("graph-show-closed", "false")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Wait for initial nodes (3 non-closed)
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(3)

      // Check the toggle
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.check()

      // Verify toggle is checked
      await expect(toggle).toBeChecked()

      // Verify node count increases to 5
      await expect(nodes).toHaveCount(5)
    })

    test("closed nodes reappear with correct status attribute", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("graph-show-closed", "false")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Verify no closed nodes initially
      const closedNodes = page.locator('[data-status="closed"]')
      await expect(closedNodes).toHaveCount(0)

      // Check toggle
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.check()

      // Verify closed nodes reappear
      await expect(closedNodes).toHaveCount(2)
    })
  })

  test.describe("Node Count", () => {
    test("correct number of nodes when all shown", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Total should be 5 (mockIssues.length)
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(5)
    })

    test("correct number of nodes when closed hidden", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("graph-show-closed", "false")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Should be 3 (5 - 2 closed = 3)
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(3)
    })

    test("node count matches visible issue count after toggling", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      const nodes = page.locator(".react-flow__node")
      const toggle = page.getByTestId("show-closed-toggle")

      // Toggle on: count = 5
      await expect(nodes).toHaveCount(5)

      // Toggle off: count = 3
      await toggle.uncheck()
      await expect(nodes).toHaveCount(3)

      // Toggle on again: count = 5
      await toggle.check()
      await expect(nodes).toHaveCount(5)
    })
  })

  test.describe("Persistence (localStorage)", () => {
    test("toggle state persists to localStorage", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Verify initial localStorage value is 'true' (default)
      let value = await page.evaluate(() =>
        localStorage.getItem("graph-show-closed")
      )
      expect(value).toBe("true")

      // Uncheck toggle
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.uncheck()

      // Verify localStorage updated to 'false'
      value = await page.evaluate(() =>
        localStorage.getItem("graph-show-closed")
      )
      expect(value).toBe("false")

      // Check toggle again
      await toggle.check()

      // Verify localStorage updated to 'true'
      value = await page.evaluate(() =>
        localStorage.getItem("graph-show-closed")
      )
      expect(value).toBe("true")
    })

    test("toggle state restores from localStorage on page load", async ({ page }) => {
      // Pre-set localStorage to 'false'
      await page.addInitScript(() => {
        localStorage.setItem("graph-show-closed", "false")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Verify checkbox is unchecked
      const toggle = page.getByTestId("show-closed-toggle")
      await expect(toggle).not.toBeChecked()

      // Verify only 3 nodes visible (closed hidden)
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(3)
    })

    test("toggle state persists across view navigation", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Uncheck toggle
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.uncheck()

      // Navigate away to Kanban view
      const kanbanTab = page.getByTestId("view-tab-kanban")
      await kanbanTab.click()
      await expect(page.locator('section[data-status="open"]')).toBeVisible()

      // Navigate back to Graph view
      const graphTab = page.getByTestId("view-tab-graph")
      await graphTab.click()
      await expect(page.getByTestId("graph-view")).toBeVisible()

      // Verify toggle is still unchecked
      await expect(toggle).not.toBeChecked()

      // Verify closed issues still hidden
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(3)
    })
  })

  test.describe("Graph Re-layout", () => {
    test("graph updates layout after toggle change", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Wait for initial render with all nodes
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(5)

      // Toggle off (hide closed)
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.uncheck()

      // Verify fewer nodes rendered
      await expect(nodes).toHaveCount(3)

      // Toggle back on
      await toggle.check()

      // Verify all nodes rendered again
      await expect(nodes).toHaveCount(5)
    })
  })

  test.describe("Edge Cases", () => {
    test("toggle works with empty issues list", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page, [])
      await navigateToGraphView(page)

      // Verify toggle still renders
      const toggle = page.getByTestId("show-closed-toggle")
      await expect(toggle).toBeVisible()

      // Toggle should be functional (no errors)
      await toggle.uncheck()
      await expect(toggle).not.toBeChecked()

      // Verify localStorage persists even with empty data
      let storageValue = await page.evaluate(() =>
        localStorage.getItem("graph-show-closed")
      )
      expect(storageValue).toBe("false")

      await toggle.check()
      await expect(toggle).toBeChecked()

      // Verify localStorage persists back to true
      storageValue = await page.evaluate(() =>
        localStorage.getItem("graph-show-closed")
      )
      expect(storageValue).toBe("true")
    })

    test("toggle works when all issues are closed", async ({ page }) => {
      const allClosedIssues = [
        {
          id: "closed-1",
          title: "Closed Only 1",
          status: "closed",
          priority: 2,
          issue_type: "task",
          created_at: "2026-01-27T10:00:00Z",
          updated_at: "2026-01-27T10:00:00Z",
        },
        {
          id: "closed-2",
          title: "Closed Only 2",
          status: "closed",
          priority: 3,
          issue_type: "bug",
          created_at: "2026-01-27T11:00:00Z",
          updated_at: "2026-01-27T11:00:00Z",
        },
      ]

      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page, allClosedIssues)
      await navigateToGraphView(page)

      // Verify all closed issues shown
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(2)

      // Uncheck toggle
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.uncheck()

      // Verify graph is empty
      await expect(nodes).toHaveCount(0)
    })

    test("toggle works when no issues are closed", async ({ page }) => {
      const noClosedIssues = [
        {
          id: "open-1",
          title: "Open Only 1",
          status: "open",
          priority: 2,
          issue_type: "task",
          created_at: "2026-01-27T10:00:00Z",
          updated_at: "2026-01-27T10:00:00Z",
        },
        {
          id: "in-progress-1",
          title: "In Progress Only 1",
          status: "in_progress",
          priority: 1,
          issue_type: "feature",
          created_at: "2026-01-27T11:00:00Z",
          updated_at: "2026-01-27T11:00:00Z",
        },
      ]

      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page, noClosedIssues)
      await navigateToGraphView(page)

      // Verify all issues shown
      const nodes = page.locator(".react-flow__node")
      await expect(nodes).toHaveCount(2)

      // Toggle has no effect on node count (none are closed)
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.uncheck()
      await expect(nodes).toHaveCount(2)

      await toggle.check()
      await expect(nodes).toHaveCount(2)
    })
  })

  test.describe("Accessibility", () => {
    test("toggle is keyboard accessible", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      // Tab to the toggle checkbox
      const toggle = page.getByTestId("show-closed-toggle")
      await toggle.focus()

      // Verify it receives focus
      await expect(toggle).toBeFocused()

      // Press Space to toggle (initial state is checked)
      await page.keyboard.press("Space")

      // Verify state changes to unchecked
      await expect(toggle).not.toBeChecked()

      // Press Space again
      await page.keyboard.press("Space")

      // Verify state changes back to checked
      await expect(toggle).toBeChecked()
    })
  })

  test.describe("Data Attributes", () => {
    test("GraphView has data-show-closed attribute that updates bidirectionally", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("graph-show-closed")
      })

      await setupMocks(page)
      await navigateToGraphView(page)

      const graphView = page.getByTestId("graph-view")
      const toggle = page.getByTestId("show-closed-toggle")

      // Verify data attribute is 'true' initially
      await expect(graphView).toHaveAttribute("data-show-closed", "true")

      // Uncheck toggle
      await toggle.uncheck()

      // Verify data attribute is 'false'
      await expect(graphView).toHaveAttribute("data-show-closed", "false")

      // Re-check toggle
      await toggle.check()

      // Verify data attribute returns to 'true'
      await expect(graphView).toHaveAttribute("data-show-closed", "true")
    })
  })
})
