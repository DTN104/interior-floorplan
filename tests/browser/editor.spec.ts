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
    // The original HTML app stores measurement points as {x, y}.
    measures: [{ a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } }],
  };
  await page.addInitScript(
    (v) => localStorage.setItem("huxing-design-v1", JSON.stringify(v)),
    old,
  );
  await page.goto("/");
  const migrated = await stored(page);
  expect(migrated.furniture).toHaveLength(1);
  expect(migrated.rooms.master.name).toBe("Phòng cũ");
  expect(migrated.measures).toEqual([{ a: [0, 0], b: [1000, 0] }]);
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
  // A file exported by legacy/index.html itself (one measurement made with its tool).
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/legacy-v1-export.json");
  await expect(page.locator(".error")).toHaveCount(0);
  const real = await stored(page);
  expect(real.furniture).toHaveLength(46);
  expect(real.measures).toEqual([{ a: [5140, 6050], b: [7510, 6050] }]);
});
test("unreadable autosave is explained and kept until the first edit", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("interior-floorplan-v2", "{broken"),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Không đọc được phương án đã lưu",
  );
  const raw = (key: string) =>
    page.evaluate((k) => localStorage.getItem(k), key);
  expect(await raw("interior-floorplan-v2")).toBe("{broken");
  expect(await raw("interior-floorplan-v2-unreadable")).toBe("{broken");
  await page.getByLabel("Vật liệu sàn", { exact: true }).selectOption("carpet");
  expect((await stored(page)).rooms.master.mat).toBe("carpet");
  expect(await raw("interior-floorplan-v2-unreadable")).toBe("{broken");
});
test("clicking a room on the 2D plan selects it, while panning does not", async ({
  page,
}) => {
  await page.goto("/");
  const room = page.getByLabel("Chọn phòng", { exact: true });
  const spot = (id: string) =>
    page.evaluate((id) => {
      const poly = document.querySelector(`[data-room="${id}"]`)!;
      const r = poly.getBoundingClientRect();
      for (let fy = 0.1; fy < 0.95; fy += 0.05)
        for (let fx = 0.1; fx < 0.95; fx += 0.05) {
          const x = r.left + r.width * fx,
            y = r.top + r.height * fy;
          if (document.elementFromPoint(x, y) === poly) return [x, y];
        }
      throw Error("no free spot in " + id);
    }, id);
  const [kx, ky] = await spot("kitchen");
  await page.mouse.click(kx, ky);
  await expect(room).toHaveValue("kitchen");
  const plan = page.locator("svg.plan"),
    before = await plan.getAttribute("viewBox"),
    [hx, hy] = await spot("hall");
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 60, hy + 40, { steps: 6 });
  await page.mouse.up();
  expect(await plan.getAttribute("viewBox")).not.toBe(before);
  await expect(room).toHaveValue("kitchen");
  const [lx, ly] = await spot("living");
  await page.mouse.click(lx, ly);
  await expect(room).toHaveValue("living");
});
test("exporting during a resize preview writes only the applied project", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("living");
  const width = page.getByLabel("Chiều rộng", { exact: true });
  await width.fill("5750");
  await width.press("Enter");
  await expect(
    page.getByText("Xem trước thay đổi", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Xuất phương án", exact: false })
    .click();
  const fs = await import("node:fs/promises");
  const data = JSON.parse(
    await fs.readFile((await (await download).path())!, "utf8"),
  );
  expect(data).toEqual(await stored(page));
  expect(
    data.geometry.rooms.find((r: { id: string }) => r.id === "living").poly[1][0],
  ).toBe(10270);
});
test("a center-anchored door moves only with its own wall and the preview says so", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Cạnh cần dịch", { exact: true }).selectOption("3");
  await page.getByLabel("Neo door-1", { exact: true }).selectOption("center");
  const anchored = await stored(page);
  expect(anchored.geometry.doors[1].anchor).toBe("center");
  expect(anchored.geometry.doors[1].rect).toEqual([6360, 2400, 6600, 3280]);
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("living");
  await page.getByLabel("Chiều rộng", { exact: true }).fill("5750");
  await page.getByLabel("Chiều rộng", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect((await stored(page)).geometry.doors[1].rect).toEqual([
    6360, 2400, 6600, 3280,
  ]);
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("master");
  await page.getByLabel("Chiều sâu", { exact: true }).fill("3470");
  await page.getByLabel("Chiều sâu", { exact: true }).press("Enter");
  await expect(page.locator(".preview-card")).toContainText(
    "Cửa phòng chính +50 mm",
  );
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect((await stored(page)).geometry.doors[1].rect).toEqual([
    6360, 2450, 6600, 3330,
  ]);
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

test("blocked resize offers a valid fixed edge and local apply controls on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const before = await stored(page);
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("child");
  // Pulling the child room's bottom wall up 500 mm would push it into the bay window frame.
  const depth = page.getByLabel("Chiều sâu", { exact: true });
  await depth.fill("2260");
  await depth.press("Enter");
  await expect(page.locator(".resize-feedback-error")).toContainText(
    "Tường hoặc cửa chồng lên nhau.",
  );
  expect(await stored(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Giữ cạnh dưới và xem trước", exact: true })
    .click();
  await expect(
    page.getByLabel("Cạnh giữ cố định", { exact: true }),
  ).toHaveValue("max");
  await expect(page.locator(".inspector .resize-feedback")).toContainText(
    "Kích thước mới đang chờ áp dụng",
  );
  expect(await stored(page)).toEqual(before);
  await expect(depth).toHaveValue("2260");
  await page
    .getByRole("button", { name: "Hủy kích thước", exact: true })
    .click();
  await expect(depth).toHaveValue("2760");
  expect(await stored(page)).toEqual(before);
  await depth.fill("2260");
  await depth.press("Enter");
  await page
    .getByRole("button", { name: "Áp dụng kích thước", exact: true })
    .click();
  const after = await stored(page),
    ys = after.geometry.rooms
      .find((r: { id: string }) => r.id === "child")
      .poly.map((v: number[]) => v[1]);
  expect(Math.max(...ys) - Math.min(...ys)).toBe(2260);
  expect(after.furniture).toEqual(before.furniture);
  await expect(page.locator("footer")).toContainText("1 thao tác");
  await depth.fill("3.8");
  await depth.press("Enter");
  await expect(page.locator(".resize-feedback-error")).toContainText(
    "3,8 m = 3800 mm",
  );
  expect(await stored(page)).toEqual(after);
  await expect(depth).toHaveValue("2260");
});
test("dragging a room edge resizes it live, applies once on release and Esc cancels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const before = await stored(page);
  // Phòng ngủ chính is selected by default: drag its right edge 300 mm outwards.
  await expect(page.locator("[data-edge-handle]")).toHaveCount(4);
  const handle = await page.locator('[data-edge-handle="1"]').boundingBox(),
    x = handle!.x + handle!.width / 2,
    y = handle!.y + handle!.height / 2,
    mmPerPx = await page.evaluate(() => {
      const m = document.querySelector("svg.plan")!.getScreenCTM()!;
      return 1 / m.a;
    });
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(x + (300 / mmPerPx) * (i / 10), y);
  await expect(page.locator(".inspector [role=status]")).toContainText(
    "Đang kéo cạnh 2",
  );
  expect(await stored(page)).toEqual(before);
  await page.mouse.up();
  const after = await stored(page),
    master = after.geometry.rooms.find((r: { id: string }) => r.id === "master");
  expect(Math.abs(master.poly[1][0] - 10570)).toBeLessThanOrEqual(10);
  expect(after.furniture).toEqual(before.furniture);
  await expect(page.locator("footer")).toContainText("1 thao tác");
  await expect(page.locator(".inspector [role=status]")).toContainText(
    "Đã đổi kích thước",
  );
  await page.keyboard.press("Control+z");
  expect(await stored(page)).toEqual(before);
  // Esc during a drag leaves everything as it was.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await stored(page)).toEqual(before);
  await expect(page.locator("footer")).toContainText("0 thao tác");
  expect(errors).toEqual([]);
});
