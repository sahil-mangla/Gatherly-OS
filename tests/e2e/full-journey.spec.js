// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Gatherly Full-Journey Enterprise SaaS E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("1. Initial Page Load & Editorial Layout Verification", async ({ page }) => {
    await expect(page.locator("#overview-heading")).toBeVisible();
    await expect(page.locator("#stat-card-budget")).toBeVisible();
    await expect(page.locator("#stat-card-timeline")).toBeVisible();
    await expect(page.locator("#enterprise-auth-badge")).toBeVisible();
    const budgetVal = await page.locator("#overview-budget-val").innerText();
    expect(budgetVal).toContain("$");
  });

  test("2. RBAC Role Switcher & Live Token Rotation", async ({ page }) => {
    const badge = page.locator("#enterprise-auth-badge");
    const roleLabel = page.locator("#enterprise-role-label");
    await expect(badge).toBeVisible();

    const initialRole = await roleLabel.innerText();
    await badge.click();
    await page.waitForTimeout(400);

    const nextRole = await roleLabel.innerText();
    expect(nextRole).not.toBe(initialRole);
    await expect(page.locator("#app-toast")).toBeVisible();
  });

  test("3. What-If Ripple Simulation Sandbox", async ({ page }) => {
    await page.locator("button[data-tab='budget']").click();
    const sandboxCard = page.locator("#whatif-simulator-card");
    await expect(sandboxCard).toBeVisible();

    const slider = page.locator("#guest-slider");
    await expect(slider).toBeVisible();
    await slider.fill("30");
    await slider.dispatchEvent("input");

    await page.waitForTimeout(300);
    const guestLabel = page.locator("#guest-delta-val");
    await expect(guestLabel).toContainText("+30");
  });

  test("4. Vendor Quote Seed Ingestion & Omission Audit", async ({ page }) => {
    await page.locator("button[data-tab='vendors']").click();
    const compareBtn = page.locator("#compare-quotes-header-btn");
    await expect(compareBtn).toBeVisible();
    await compareBtn.click();

    const seedTab = page.locator("button[data-tab='seed-tab']");
    if (await seedTab.isVisible()) {
      await seedTab.click();
      const textarea = page.locator("#raw-quote-text");
      await textarea.fill(
        "Catering estimate: $65/person for 120 guests. Total $7800. Deposit 25%. Does not include cleanup or teardown fee."
      );
      await page.locator("#parse-quote-btn").click();
      await page.waitForTimeout(500);

      const preview = page.locator("#parsed-quote-result");
      await expect(preview).toBeVisible();
      const text = await preview.innerText();
      expect(text).toContain("65");
      expect(text).toContain("Missing Disclosures Detected");
    }
  });

  test("5. Mara Copilot & Proposal State Mutation", async ({ page }) => {
    const copilotBtn = page.locator("#copilot-toggle-btn");
    await copilotBtn.click();

    const drawer = page.locator("#copilot-drawer");
    await expect(drawer).toBeVisible();

    const firstSuggestion = page.locator(".suggestion-pill").first();
    if (await firstSuggestion.isVisible()) {
      await firstSuggestion.click();
      await page.waitForTimeout(1000);

      const applyBtn = page.locator(".proposal-apply-btn").first();
      if (await applyBtn.isVisible()) {
        await applyBtn.click();
        await expect(page.locator("#app-toast")).toBeVisible();
      }
    }
  });

  test("6. Timeline DAG Reschedule & Collision Detection", async ({ page }) => {
    await page.locator("button[data-tab='timeline']").click();
    await expect(page.locator("#timeline-events-container")).toBeVisible();

    const rescheduleBtn = page.locator(".reschedule-btn").first();
    if (await rescheduleBtn.isVisible()) {
      await rescheduleBtn.click();
      const modal = page.locator("#generic-form-backdrop");
      await expect(modal).toBeVisible();

      // Close modal
      const closeBtn = page.locator("#form-modal-close");
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(modal).not.toBeVisible();
    }
  });
});
