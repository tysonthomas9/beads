import { test, expect } from "@playwright/test"

test.describe("App", () => {
  test("homepage loads successfully", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)
  })

  test("has correct page title", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle("Beads Web UI")
  })

  test("displays main heading", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("h1")).toHaveText("Beads Web UI")
  })

  test("displays description text", async ({ page }) => {
    await page.goto("/")
    await expect(
      page.locator("p").filter({ hasText: "Task management" })
    ).toHaveText("Task management interface for beads.")
  })

  test("has no console errors on load", async ({ page }) => {
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto("/")
    await page.waitForLoadState("networkidle")

    expect(consoleErrors).toHaveLength(0)
  })

  test("page renders within acceptable time", async ({ page }) => {
    const startTime = Date.now()
    await page.goto("/")
    await page.waitForSelector("h1")
    const loadTime = Date.now() - startTime

    expect(loadTime).toBeLessThan(3000)
  })
})
