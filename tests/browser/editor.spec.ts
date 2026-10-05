import { test, expect } from "@playwright/test";
const stored = async (page: any) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("interior-floorplan-v2")!),
  );
for (const cancel of ["Escape", "undo", "pointercancel", "mode-switch"] as const) {
  test(`cancelled furniture drag (${cancel}) leaves saved project and history intact`, async ({ page }) => {
    await page.goto("/");
    const before = await stored(page);
    const box = await page.locator('[data-furniture="default-0"]').boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 35, box!.y + box!.height / 2 + 15);
    expect(await stored(page)).toEqual(before);
    if (cancel === "Escape") await page.keyboard.press("Escape");
    else if (cancel === "undo") await page.keyboard.press("Control+z");
    else if (cancel === "pointercancel")
      await page.locator("svg.plan").dispatchEvent("pointercancel", { pointerId: 1 });
    else {
      await page.keyboard.press("t");
      await expect(page.locator("canvas")).toBeVisible();
      await page.keyboard.press("t");
    }
    await page.mouse.up();
    expect(await stored(page)).toEqual(before);
    await expect(page.locator("footer")).toContainText("0 thao tác");

    // A subsequent completed drag must use the current project, not an old drag snapshot.
    await page.getByLabel("Chọn phòng", { exact: true }).selectOption("master");
    await page.getByLabel("Vật liệu sàn", { exact: true }).selectOption("carpet");
    const updated = await stored(page);
    const nextBox = await page.locator('[data-furniture="default-0"]').boundingBox();
    await page.mouse.move(nextBox!.x + nextBox!.width / 2, nextBox!.y + nextBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(nextBox!.x + nextBox!.width / 2 + 25, nextBox!.y + nextBox!.height / 2 + 10);
    await page.mouse.up();
    const moved = await stored(page);
    expect(moved.rooms).toEqual(updated.rooms);
    expect(moved.furniture[0].cx).not.toBe(before.furniture[0].cx);
    await page.getByRole("button", { name: "Hoàn tác", exact: false }).click();
    expect(await stored(page)).toEqual(updated);
  });
}
test("shared resize previews, applies once, updates openings, undoes and autosaves", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("[data-room]")).toHaveCount(13);
  await expect(page.locator("[data-furniture]")).toHaveCount(46);
  const original = await stored(page);
  await page
    .getByLabel("Cạnh giữ cố định", { exact: true })
    .selectOption("max");
  const width = page.getByLabel("Chiều rộng", { exact: true });
  await width.fill("3870");
  await width.press("Enter");
  await expect(
    page.getByText("Xem trước thay đổi", { exact: true }),
  ).toBeVisible();
  expect((await stored(page)).geometry).toEqual(original.geometry);
  await expect(page.locator('[data-room="master"]')).toHaveAttribute(
    "points",
    /^6400,0 10270,0/,
  );
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  const changed = await stored(page);
  expect(changed.furniture).toEqual(original.furniture);
  expect(changed.geometry.doors[1].rect).toEqual([6160, 2400, 6400, 3280]);
  await page.getByRole("button", { name: "Hoàn tác", exact: false }).click();
  expect(await stored(page)).toEqual(original);
  await page.getByRole("button", { name: "↷", exact: true }).click();
  expect(await stored(page)).toEqual(changed);
  await page.reload();
  await expect(page.getByLabel("Chiều rộng", { exact: true })).toHaveValue(
    "3870",
  );
  await page.getByLabel("Chiều sâu", { exact: true }).fill("1000");
  await page.getByLabel("Chiều sâu", { exact: true }).press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await stored(page)).toEqual(changed);
  expect(errors).toEqual([]);
});
test("furniture drag creates one history entry, preserves seed and supports JSON/PNG export", async ({
  page,
}) => {
  await page.goto("/");
  const before = await stored(page),
    f = page.locator('[data-furniture="default-0"]'),
    box = await f.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++)
    await page.mouse.move(
      box!.x + box!.width / 2 + 5 * i,
      box!.y + box!.height / 2 + 2 * i,
    );
  await page.mouse.up();
  const moved = await stored(page);
  expect(moved.furniture[0].cx).not.toBe(before.furniture[0].cx);
  expect(moved.furniture[0].modelSeed).toBe(before.furniture[0].modelSeed);
  await expect(page.locator("footer")).toContainText("1 thao tác");
  await page.getByRole("button", { name: "Hoàn tác", exact: false }).click();
  expect(await stored(page)).toEqual(before);
  const jsonPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Xuất phương án", exact: false })
    .click();
  const file = await jsonPromise;
  const fs = await import("node:fs/promises");
  const data = JSON.parse(await fs.readFile((await file.path())!, "utf8"));
  expect(data).toEqual(before);
  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ảnh PNG", exact: true }).click();
  const png = await pngPromise;
  const bytes = await fs.readFile((await png.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.length).toBeGreaterThan(10000);
});
test("imports v1, leaves old autosave intact, and rejects malformed input atomically", async ({
  page,
}) => {
  const old = {
    furniture: [
      {
        id: "old-bed",
        type: "bed",
        name: "Giường của tôi",
        w: 1800,
        d: 2000,
        cx: 8300,
        cy: 1000,
        rot: 0,
        color: "#c9d6df",
      },
    ],
    rooms: { master: { name: "Phòng cũ", mat: "carpet" } },
    demolished: [],
    measures: [{ a: [0, 0], b: [1000, 0] }],
  };
  await page.addInitScript(
    (v) => localStorage.setItem("huxing-design-v1", JSON.stringify(v)),
    old,
  );
  await page.goto("/");
  const migrated = await stored(page);
  expect(migrated.furniture).toHaveLength(1);
  expect(migrated.rooms.master.name).toBe("Phòng cũ");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("huxing-design-v1")!),
    ),
  ).toEqual(old);
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...migrated, geometry: {} })),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await stored(page)).toEqual(migrated);
  await page.locator("input[type=file]").setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(old)),
  });
  expect((await stored(page)).schemaVersion).toBe(2);
});
test("real WebGL renders, exports PNG and moves furniture without rebuilding its meshes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Không gian 3D", exact: true })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1200);
  const image = await page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  expect(image.length).toBeGreaterThan(100000);
  const count = await page.evaluate(async () => {
    const m = await import("/src/legacy-models.js");
    return m.getModelBuildCount();
  });
  await page.getByRole("button", { name: "Bản vẽ 2D", exact: true }).click();
  await page.locator('[data-furniture="default-0"]').click();
  await page
    .getByRole("button", { name: "Không gian 3D", exact: true })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(300);
  const current = await page.evaluate(async () => {
    const m = await import("/src/legacy-models.js");
    return m.getModelBuildCount();
  });
  expect(current - count).toBe(46);
  await page.getByLabel("X (mm)", { exact: true }).fill("8350");
  await page.getByLabel("X (mm)", { exact: true }).press("Enter");
  await page.waitForTimeout(200);
  const after = await page.evaluate(async () => {
    const m = await import("/src/legacy-models.js");
    return m.getModelBuildCount();
  });
  expect(after).toBe(current);
  const memory = await page.evaluate(async () => {
    const s = await import("/src/Scene.tsx");
    return s.getSceneMemory();
  });
  for (const value of ["1900", "1800", "1900", "1800"]) {
    await page.getByLabel("Rộng (mm)", { exact: true }).fill(value);
    await page.getByLabel("Rộng (mm)", { exact: true }).press("Enter");
    await page.waitForTimeout(300);
  }
  const finalMemory = await page.evaluate(async () => {
    const s = await import("/src/Scene.tsx");
    return s.getSceneMemory();
  });
  expect(finalMemory!.geometries).toBeLessThanOrEqual(memory!.geometries + 2);
  expect(finalMemory!.textures).toBeLessThanOrEqual(memory!.textures + 1);
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("master");
  await page
    .getByLabel("Cạnh giữ cố định", { exact: true })
    .selectOption("max");
  await page.getByLabel("Chiều rộng", { exact: true }).fill("3870");
  await page.getByLabel("Chiều rộng", { exact: true }).press("Enter");
  await expect(
    page.getByText("Xem trước thay đổi", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect((await stored(page)).geometry.rooms[0].poly[0][0]).toBe(6400);

  await page.getByRole("button", { name: "Đi bộ", exact: true }).click();
  await expect(
    page.getByText("WASD / phím mũi tên", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("w");
  await page.getByRole("button", { name: "Phối cảnh", exact: true }).click();
  await page.getByRole("button", { name: "☀ Ngày", exact: true }).click();
  await page.screenshot({ path: "test-results/react-3d.png" });
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ảnh PNG", exact: true }).click();
  expect((await d).suggestedFilename()).toBe("noi-that-3d.png");
  expect(errors).toEqual([]);
});
test("mobile layout, library, room selection and concave edge editing remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "＋ Nội thất", exact: true }).click();
  await expect(page.locator(".library")).toBeVisible();
  const before = await stored(page);
  await page.locator(".library-item").first().click();
  expect((await stored(page)).furniture.length).toBe(
    before.furniture.length + 1,
  );
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("dining");
  await expect(
    page.getByText("Phòng này có polygon lõm.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Cạnh cần dịch", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Xem trước dịch cạnh", exact: false })
    .click();
  await expect(
    page.getByText("Xem trước thay đổi", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await page.screenshot({ path: "test-results/mobile-2d.png", fullPage: true });
});

test("blocked default resize offers a valid fixed edge and local apply controls on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const before = await stored(page);
  const width = page.getByLabel("Chiều rộng", { exact: true });
  await width.fill("3870");
  await width.press("Enter");
  await expect(page.locator(".resize-feedback-error")).toContainText(
    "Cửa/cửa sổ không còn vừa tường.",
  );
  expect(await stored(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Giữ cạnh phải và xem trước", exact: true })
    .click();
  await expect(
    page.getByLabel("Cạnh giữ cố định", { exact: true }),
  ).toHaveValue("max");
  await expect(page.locator(".inspector .resize-feedback")).toContainText(
    "Kích thước mới đang chờ áp dụng",
  );
  expect(await stored(page)).toEqual(before);
  await expect(width).toHaveValue("3870");
  await page
    .getByRole("button", { name: "Hủy kích thước", exact: true })
    .click();
  await expect(width).toHaveValue("3670");
  expect(await stored(page)).toEqual(before);
  await width.fill("3870");
  await width.press("Enter");
  await page
    .getByRole("button", { name: "Áp dụng kích thước", exact: true })
    .click();
  const after = await stored(page);
  expect(after.geometry.rooms[0].poly[0][0]).toBe(6400);
  expect(after.furniture).toEqual(before.furniture);
  await expect(page.locator("footer")).toContainText("1 thao tác");
  await width.fill("3.8");
  await width.press("Enter");
  await expect(page.locator(".resize-feedback-error")).toContainText(
    "3,8 m = 3800 mm",
  );
  expect(await stored(page)).toEqual(after);
  await expect(width).toHaveValue("3870");
});
