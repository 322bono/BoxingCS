import { test, expect } from "@playwright/test";
for (const [id, name] of [
  ["nova", "노바"],
  ["blaze", "블레이즈"],
  ["specs", "스펙스"],
  ["volt", "볼트"],
])
  test(`${id}: generated person loads and plays its own signature`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.text().includes("3D character load failed")) errors.push(m.text());
    });
    await page.goto("/");
    await page.locator("#console-fighters").click();
    await page
      .getByRole("button", { name: name + " 미리보기", exact: true })
      .click();
    await expect(page.locator("#character-stage")).toHaveAttribute(
      "data-ready",
      "true",
      { timeout: 20000 },
    );
    await page.screenshot({ path: `test-results/${id}-select.png` });
    await page.getByRole("button", { name: "스킬 시연", exact: true }).click();
    await expect(page.locator("#character-stage")).toHaveAttribute(
      "data-animation",
      "skill-" + id,
    );
    await page.screenshot({ path: `test-results/${id}-skill.png` });
    expect(errors).toEqual([]);
  });
