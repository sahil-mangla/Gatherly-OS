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

  test("7. Create your own event, flag a capacity breach, then fix it from Edit event details", async ({ page }) => {
    const name = "Priya & Sam's wedding";
    const future = new Date();
    future.setDate(future.getDate() + 120);
    const date = future.toISOString().slice(0, 10);

    await page.getByRole("button", { name: "New event", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New event" });
    await expect(dialog).toBeVisible();

    // Empty submit: inline, per-field errors and focus on the first invalid field.
    await dialog.getByRole("button", { name: "Create event" }).click();
    await expect(dialog.locator("#ev-name-error")).toHaveText("Give your event a name.");
    await expect(dialog.locator("#ev-name")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.locator("#ev-name")).toBeFocused();

    await dialog.getByLabel("Event type").selectOption("wedding");
    await dialog.getByLabel("Event name").fill(`  ${name}  `);
    await dialog.getByLabel("Event date").fill(date);
    await dialog.getByLabel("Expected guests").fill("180");
    await dialog.getByLabel("Venue capacity").fill("120");
    await dialog.getByLabel("Total budget").fill("24000.01");
    await expect(dialog.locator("#ev-capacity-warning")).toHaveText(
      "This is over capacity — Gatherly will flag it on your Risk Radar"
    );

    // The warning never blocks saving.
    await dialog.getByRole("button", { name: "Create event" }).click();
    await expect(page.locator("#generic-form-backdrop")).not.toBeVisible();
    await expect(page.locator("#overview-heading")).toBeFocused();
    await expect(page.locator("#toast-title")).toHaveText(`Created ${name}`);
    await expect(page.locator("#topbar-event-name")).toHaveText(name);
    await expect(page.locator('#sidebar-event-list .event-link[aria-current="true"]')).toContainText(name);
    await expect(page.locator("#overview-budget-val")).toContainText("$0 / $24,000");
    await expect(page.locator("#mara-overview-quote")).toContainText("exceeds confirmed venue capacity (120) by 60 guests");

    // Edit event details: raise the capacity and the Risk Radar recomputes.
    await page.getByRole("button", { name: "Edit event details" }).click();
    const editor = page.getByRole("dialog", { name: "Edit event details" });
    await expect(editor.getByLabel("Venue capacity")).toHaveValue("120");
    await editor.getByLabel("Venue capacity").fill("200");
    await expect(editor.locator("#ev-capacity-warning")).toHaveText("");
    await editor.getByRole("button", { name: "Save details" }).click();
    await expect(page.locator("#generic-form-backdrop")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Edit event details" })).toBeFocused();
    await expect(page.locator("#mara-overview-quote")).not.toContainText("exceeds confirmed venue capacity");

    // The event survives a reload and stays the active one.
    await page.reload();
    await expect(page.locator("#topbar-event-name")).toHaveText(name);
    await expect(page.locator("#sidebar-event-list .event-link")).toHaveCount(4);
  });

  test("8. Milestone dependencies: blocked-by text, due-date guard and unblocking", async ({ page }) => {
    await page.locator("button[data-tab='timeline']").click();
    await expect(page.locator("#timeline-events-container")).toContainText("Blocked by: Review photographer shortlist");

    await page.locator("#add-milestone-btn").click();
    const dialog = page.getByRole("dialog", { name: "Schedule Milestone" });
    const group = dialog.getByRole("group", { name: /Depends on/ });
    await expect(group.getByRole("checkbox")).toHaveCount(6);

    // A dependency due after the new milestone is rejected inline and names the task.
    await dialog.getByLabel("Milestone Title").fill("Early rehearsal");
    await dialog.getByLabel("Due Date").fill("2000-01-01");
    const seating = group.getByRole("checkbox", { name: /Finalize seating chart/ });
    await seating.check();
    await dialog.getByRole("button", { name: "Add Milestone" }).click();
    await expect(page.locator("#form-modal-error")).toContainText("Finalize seating chart & place cards");
    await expect(page.locator("#form-modal-error")).toContainText("after this milestone");
    await expect(seating).toHaveAttribute("aria-invalid", "true");
    await expect(seating).toBeFocused();

    // A valid dependency is saved and shown on the timeline.
    const later = new Date();
    later.setFullYear(later.getFullYear() + 2);
    await dialog.getByLabel("Due Date").fill(later.toISOString().slice(0, 10));
    await dialog.getByRole("button", { name: "Add Milestone" }).click();
    await expect(page.locator("#generic-form-backdrop")).not.toBeVisible();
    await expect(page.locator("#timeline-events-container")).toContainText("Blocked by: Finalize seating chart & place cards");

    // Finishing the dependency removes it from the new milestone's blocked-by list.
    await page.getByRole("button", { name: "Mark complete: Finalize seating chart & place cards" }).click();
    const row = page.locator(".timeline-event", { hasText: "Early rehearsal" });
    await expect(row).not.toContainText("Blocked by");
  });
});
