import { test, expect, Page } from "@playwright/test";
const stored = async (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("interior-floorplan-v2")!));
/** Screen position of a plan point given in millimetres. */
const screen = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => {
    const svg = document.querySelector("svg.plan") as SVGSVGElement,
      p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
    return [p.x, p.y] as [number, number];
  }, [x, y]);
async function drag(page: Page, from: [number, number], to: [number, number], release = true) {
  const a = await screen(page, ...from),
    b = await screen(page, ...to);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move(b[0], b[1], { steps: 10 });
  if (release) await page.mouse.up();
}
async function useTemplate(page: Page, name: string) {
  await page.getByRole("button", { name: "Mẫu", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Mẫu mặt bằng" });
  await dialog.getByRole("button", { name: "Dùng mẫu " + name, exact: true }).click();
  await dialog.getByRole("button", { name: "Dùng mẫu này" }).click();
  await expect(dialog).toBeHidden();
}

test("a template replaces the plan as one undo step; plans can be saved as templates", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const original = await stored(page);
  await useTemplate(page, "Căn 2 phòng ngủ");
  await expect(page.locator("[data-room]")).toHaveCount(6);
  await expect(page.locator(".canvas-caption")).toContainText("CĂN 2 PHÒNG NGỦ");
  const two = await stored(page);
  expect(two.name).toBe("Căn 2 phòng ngủ");
  expect(two.geometry.layout).toEqual({ exterior: 220, partition: 110 });
  expect(two.furniture).toEqual([]);
  await page.keyboard.press("Control+z");
  expect(await stored(page)).toEqual(original);
  await page.keyboard.press("Control+Shift+z");
  expect(await stored(page)).toEqual(two);

  const dialog = page.getByRole("dialog", { name: "Mẫu mặt bằng" });
  await page.getByRole("button", { name: "Mẫu", exact: true }).click();
  await dialog.getByLabel("Tên mẫu").fill("Căn thử nghiệm");
  await dialog.getByLabel("Kèm nội thất").uncheck();
  await dialog.getByRole("button", { name: "Lưu mẫu" }).click();
  await expect(dialog.getByRole("status")).toContainText("Đã lưu mẫu “Căn thử nghiệm”");
  await page.reload();
  await page.getByRole("button", { name: "Mẫu", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Dùng mẫu Căn thử nghiệm", exact: true })).toContainText("6 phòng");
  await dialog.getByRole("button", { name: "Xóa mẫu Căn thử nghiệm" }).click();
  await expect(dialog.getByRole("button", { name: "Dùng mẫu Căn thử nghiệm", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("the original apartment explains that its rooms cannot be redrawn", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "✎ Sửa mặt bằng" }).click();
  await expect(page.locator(".error")).toContainText("Căn hộ gốc không vẽ lại phòng được");
  await expect(page.getByRole("button", { name: "▭ Vẽ phòng" })).toHaveCount(0);
});

test("draw a room next to another, put a door in the shared wall and edit it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await useTemplate(page, "Mặt bằng trống");
  // The empty plan opens in layout mode with the room tool.
  await expect(page.getByRole("button", { name: "▭ Vẽ phòng" })).toHaveClass(/active/);
  const center = await screen(page, 2000, 1500),
    viewBox = () => page.locator("svg.plan").getAttribute("viewBox"),
    initial = await viewBox();
  await page.mouse.move(center[0], center[1]);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 300);
  // Zooming re-renders asynchronously: wait for the new view before mapping millimetres to pixels.
  await expect.poll(viewBox).not.toBe(initial);
  await page.waitForTimeout(200);
  // Start 30 mm off one partition width from Phòng 1: the new room snaps to share a 110 mm wall.
  await drag(page, [4140, 30], [6500, 2980]);
  let plan = await stored(page);
  expect(plan.geometry.rooms.map((r: { poly: number[][] }) => r.poly)).toEqual([
    [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
    [[4110, 0], [6500, 0], [6500, 3000], [4110, 3000]],
  ]);
  await expect(page.locator(".inspector")).toContainText("Đã thêm Phòng 2");
  await expect(page.locator("footer")).toContainText("2 thao tác");

  await page.getByRole("button", { name: "Cửa đi", exact: true }).click();
  const wall = await screen(page, 4055, 1500);
  await page.mouse.click(wall[0], wall[1]);
  plan = await stored(page);
  expect(plan.geometry.doors).toHaveLength(1);
  expect(plan.geometry.doors[0]).toMatchObject({
    name: "Cửa Phòng 1",
    rect: [4000, 1100, 4110, 1900],
    o: [-1, 0],
  });
  const panel = page.locator(".inspector");
  await expect(panel).toContainText("Trên cạnh phải của Phòng 1");
  const width = panel.getByLabel("Rộng", { exact: true });
  await width.fill("900");
  await width.press("Enter");
  await expect.poll(async () => (await stored(page)).geometry.doors[0].rect).toEqual([4000, 1100, 4110, 2000]);
  await panel.getByRole("button", { name: "Đổi chiều mở" }).click();
  await expect.poll(async () => (await stored(page)).geometry.doors[0].o).toEqual([1, 0]);
  await panel.getByRole("button", { name: "Xóa cửa" }).click();
  await expect.poll(async () => (await stored(page)).geometry.doors).toEqual([]);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await stored(page)).geometry.doors).toHaveLength(1);

  await page.getByRole("button", { name: "✓ Xong" }).click();
  await expect(page.getByRole("button", { name: "✎ Sửa mặt bằng" })).toBeVisible();
  await page.getByRole("button", { name: "Không gian 3D" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test("moving a room previews live, Esc cancels and release applies once", async ({ page }) => {
  await page.goto("/");
  await useTemplate(page, "Căn 2 phòng ngủ");
  await page.getByRole("button", { name: "✎ Sửa mặt bằng" }).click();
  const before = await stored(page),
    balcony = before.geometry.rooms.find((r: { id: string }) => r.id === "balcony");
  expect(balcony.poly[0]).toEqual([0, 8210]);
  // First tap selects the balcony, then dragging it moves it.
  const tap = await screen(page, 1500, 8800);
  await page.mouse.click(tap[0], tap[1]);
  await expect(page.getByLabel("Chọn phòng", { exact: true })).toHaveValue("balcony");
  await drag(page, [1500, 8800], [2500, 8800], false);
  await expect(page.locator(".canvas-caption")).toContainText("ĐANG DI CHUYỂN PHÒNG");
  expect(await stored(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await stored(page)).toEqual(before);
  await drag(page, [1500, 8800], [2500, 8800]);
  const after = await stored(page),
    moved = after.geometry.rooms.find((r: { id: string }) => r.id === "balcony");
  expect(Math.abs(moved.poly[0][0] - 1000)).toBeLessThanOrEqual(80);
  expect(moved.poly[0][1]).toBe(8210);
  // Its glass door went along with it.
  expect(after.geometry.slides[0].rect[0] - before.geometry.slides[0].rect[0]).toBe(moved.poly[0][0]);
  await expect(page.locator("footer")).toContainText("2 thao tác");
});

test("drawn plans and templates work on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await useTemplate(page, "Căn studio");
  await expect(page.locator("[data-room]")).toHaveCount(4);
  await page.getByRole("button", { name: "✎ Sửa mặt bằng" }).click();
  const done = page.getByRole("button", { name: "✓ Xong" });
  await done.scrollIntoViewIfNeeded();
  await done.click();
  await expect(page.getByRole("button", { name: "✎ Sửa mặt bằng" })).toBeVisible();
});

test("layout gestures: handles need a real drag, drawing left snaps too, opening tools pan on drag", async ({ page }) => {
  await page.goto("/");
  await useTemplate(page, "Mặt bằng trống");
  await page.getByRole("button", { name: "↖ Chọn" }).click();
  // Pressing the top handle of Phòng 1 and sliding along the edge changes nothing.
  const before = await stored(page),
    handle = await page.locator('[data-edge-handle="0"]').boundingBox(),
    hx = handle!.x + handle!.width / 2,
    hy = handle!.y + handle!.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 60, hy, { steps: 6 });
  await page.mouse.up();
  expect(await stored(page)).toEqual(before);
  // Drawing leftwards from just outside the west face leaves one partition (110 mm) between the rooms.
  await page.getByRole("button", { name: "▭ Vẽ phòng" }).click();
  await drag(page, [-140, 30], [-2000, 2980]);
  const drawn = (await stored(page)).geometry.rooms[1].poly;
  expect(drawn).toEqual([[-2000, 0], [-110, 0], [-110, 3000], [-2000, 3000]]);
  // With the door tool a drag pans the view and adds nothing; a tap adds a door.
  await page.getByRole("button", { name: "Cửa đi", exact: true }).click();
  const viewBox = await page.locator("svg.plan").getAttribute("viewBox");
  await drag(page, [2000, 1500], [2600, 1800]);
  expect((await stored(page)).geometry.doors).toEqual([]);
  expect(await page.locator("svg.plan").getAttribute("viewBox")).not.toBe(viewBox);
  const wall = await screen(page, -55, 1500);
  await page.mouse.click(wall[0], wall[1]);
  await expect.poll(async () => (await stored(page)).geometry.doors.length).toBe(1);
});

test("keyboard: openings can be added and chosen from the room panel; the template dialog keeps focus", async ({ page }) => {
  await page.goto("/");
  // New furniture in the original apartment still lands where the source app put it.
  await page.locator(".library-item").first().click();
  const bed = (await stored(page)).furniture.at(-1);
  expect([bed.cx, bed.cy]).toEqual([8435, 1685]);
  await page.getByRole("button", { name: "Mẫu", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Mẫu mặt bằng" });
  await expect(dialog.getByRole("button", { name: "Đóng mẫu mặt bằng" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Lưu mẫu" })).toBeFocused();
  await page.keyboard.press("t");
  await expect(page.getByRole("button", { name: "Bản vẽ 2D" })).toHaveClass(/active/);
  await dialog.getByRole("button", { name: "Dùng mẫu Mặt bằng trống", exact: true }).click();
  await dialog.getByRole("button", { name: "Dùng mẫu này" }).click();
  const panel = page.locator(".inspector");
  await panel.getByLabel("Loại cửa thêm mới").selectOption("window");
  await panel.getByLabel("Cạnh đặt cửa").selectOption({ label: "Cạnh trên · 4000 mm" });
  await panel.getByRole("button", { name: "＋ Thêm vào giữa cạnh" }).click();
  await expect(panel).toContainText("Trên cạnh trên của Phòng 1");
  expect((await stored(page)).geometry.windows).toEqual([[1400, -220, 2600, 0]]);
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("r1");
  await panel.getByRole("button", { name: /Cửa sổ 1 · 1200 mm/ }).click();
  await expect(panel.getByRole("button", { name: "Xóa cửa sổ" })).toBeVisible();
});

test("a refused edit shows the previous value again; partitions stay thinner than two exterior walls", async ({
  page,
}) => {
  await page.goto("/");
  await useTemplate(page, "Căn 2 phòng ngủ");
  await page.getByRole("button", { name: "✎ Sửa mặt bằng" }).click();
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("pn1");
  const panel = page.locator(".inspector"),
    width = panel.getByLabel("Rộng", { exact: true });
  await width.fill("6000");
  await width.press("Enter");
  await expect(page.locator(".error")).toContainText("chồng lên");
  await expect(width).toHaveValue("3600");
  const exterior = panel.getByLabel("Tường ngoài", { exact: true }),
    partition = panel.getByLabel("Vách mới", { exact: true });
  await exterior.fill("100");
  await exterior.press("Enter");
  await expect.poll(async () => (await stored(page)).geometry.layout).toEqual({ exterior: 100, partition: 110 });
  await partition.fill("250");
  await partition.press("Enter");
  await expect(page.locator(".error")).toContainText("tối đa 199 mm");
  await expect(partition).toHaveValue("110");
  expect((await stored(page)).geometry.layout).toEqual({ exterior: 100, partition: 110 });
});

test("furniture, duplicates and saved templates work where crypto.randomUUID is missing (plain-HTTP LAN)", async ({
  page,
}) => {
  // Browsers only offer crypto.randomUUID on HTTPS and localhost, not on http://<LAN IP>.
  await page.addInitScript(() => {
    delete (Crypto.prototype as { randomUUID?: unknown }).randomUUID;
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  const count = async () => (await stored(page)).furniture.length,
    before = await count();
  await page.locator(".library-item").first().click();
  await expect.poll(count).toBe(before + 1);
  await page.getByRole("button", { name: "Nhân bản", exact: true }).click();
  await expect.poll(count).toBe(before + 2);
  const dialog = page.getByRole("dialog", { name: "Mẫu mặt bằng" });
  await page.getByRole("button", { name: "Mẫu", exact: true }).click();
  await dialog.getByLabel("Tên mẫu").fill("Mẫu qua LAN");
  await dialog.getByRole("button", { name: "Lưu mẫu" }).click();
  await expect(dialog.getByRole("status")).toContainText("Đã lưu mẫu “Mẫu qua LAN”");
  const ids = await page.evaluate(() => [
    ...JSON.parse(localStorage.getItem("interior-floorplan-v2")!).furniture.slice(-2).map((f: { id: string }) => f.id),
    JSON.parse(localStorage.getItem("interior-floorplan-templates")!)[0].id,
  ]);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(new Set(ids).size).toBe(3);
  expect(errors).toEqual([]);
});

test("normal mode keeps drawn rooms at least 500 mm; furniture moves with its room in layout mode", async ({
  page,
}) => {
  await page.goto("/");
  await useTemplate(page, "Căn 2 phòng ngủ");
  const before = await stored(page);
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("balcony");
  const depth = page.getByLabel("Chiều sâu", { exact: true });
  await depth.fill("300");
  await depth.press("Enter");
  await expect(page.locator(".resize-feedback-error")).toContainText("Ban công phải rộng và sâu ít nhất 500 mm.");
  expect(await stored(page)).toEqual(before);
  await page.keyboard.press("Escape");

  await page.locator(".library-item").first().click();
  await expect.poll(async () => (await stored(page)).furniture.length).toBe(1);
  const item = (await stored(page)).furniture[0];
  expect([item.cx, item.cy]).toEqual([1500, 8810]);

  await page.getByRole("button", { name: "✎ Sửa mặt bằng" }).click();
  await page.getByLabel("Chọn phòng", { exact: true }).selectOption("balcony");
  const x = page.locator(".inspector").getByLabel("X", { exact: true });
  await x.fill("500");
  await x.press("Enter");
  await expect.poll(async () => (await stored(page)).furniture[0].cx).toBe(2000);
  const after = await stored(page);
  expect(after.furniture[0].cy).toBe(8810);
  expect(after.geometry.rooms.find((r: { id: string }) => r.id === "balcony").poly[0]).toEqual([500, 8210]);
});
