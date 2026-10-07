import { describe, it, expect, vi, afterEach } from "vitest";
import { newId } from "../src/id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
describe("newId", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses crypto.randomUUID on HTTPS and localhost", () => {
    expect(newId()).toMatch(UUID);
  });
  it("builds a v4 UUID from getRandomValues where randomUUID is missing (plain-HTTP LAN)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (b: Uint8Array) => real.getRandomValues(b) });
    expect(typeof globalThis.crypto.randomUUID).toBe("undefined");
    const ids = new Set(Array.from({ length: 200 }, newId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID);
  });
});
