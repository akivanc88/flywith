import { expect, test } from "@playwright/test";

const BRANDS = /claude|anthropic|opus|haiku|sonnet|typesafe|\bjev\b/i;

test.describe("landing page", () => {
  test.use({ reducedMotion: "reduce" });

  test("hero shows the launch video with a poster and a fallback link", async ({ page }) => {
    await page.goto("/");
    const video = page.locator(".hero-video video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("poster", "assets/video/flywith-launch.jpg");
    await expect(video.locator("source")).toHaveAttribute("src", "assets/video/flywith-launch.mp4");
    const response = await page.request.get("assets/video/flywith-launch.mp4", { headers: { Range: "bytes=0-1023" } });
    expect(response.ok()).toBeTruthy();
  });

  test("the agent replay reproduces the launch video's verdict", async ({ page }) => {
    await page.goto("/#agents");
    await page.locator("#agents").scrollIntoViewIfNeeded();
    const verdict = page.locator("#agent-verdict");
    await expect(verdict.locator(".at-card")).toHaveCount(3);
    await expect(verdict.locator(".at-card h4")).toHaveText(["Dubai · 5 days", "Istanbul · 4 days", "Doha · 3 days"]);
    await expect(verdict.locator(".at-score")).toHaveText(["86", "81", "72"]);
    await expect(verdict).toContainText("+$258 vs direct");
    await expect(verdict).toContainText("Direct baseline: $849 per seat");
    await expect(verdict.locator(".at-badge")).toHaveText(["estimated", "estimated", "estimated"]);
    const feed = page.locator("#agent-feed");
    await expect(feed).toContainText("🧭 intake-router");
    await expect(feed).toContainText("visa-free 30d (CA), stroller lanes, reliable wheelchair service");
    await expect(feed).toContainText("APPROVED.");
    await expect(page.locator("#agent-status")).toContainText("snapshot replay complete");
    expect(await page.locator("#agents").innerText()).not.toMatch(BRANDS);
  });

  test("replay can be run again from the button", async ({ page }) => {
    await page.goto("/#agents");
    await page.locator("#agents").scrollIntoViewIfNeeded();
    await expect(page.locator("#agent-run")).toHaveText("↻ Replay the run");
    await page.locator("#agent-run").click();
    await expect(page.locator("#agent-verdict .at-card")).toHaveCount(3);
  });

  test("traveller profiles explain how recommendations change", async ({ page }) => {
    await page.goto("/#profiles");
    const seniors = page.locator('.profile-card[data-profile="seniors"]');
    await seniors.scrollIntoViewIfNeeded();
    await seniors.click();
    await expect(seniors).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#profile-result")).toBeVisible();
    await expect(page.locator("#profile-result-list li").first()).toBeVisible();
  });

  test("demo tabs switch between quick connections and stopover trips", async ({ page }) => {
    await page.goto("/#demo");
    await page.locator("#tab-smart").click();
    await expect(page.locator("#panel-smart")).toBeVisible();
    await expect(page.locator("#tab-smart")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#panel-quick")).toBeHidden();
  });

  test("no horizontal scroll and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
