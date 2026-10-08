import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LIB } from "../src/legacy-data";
import {
  buildFurniture,
  disposeGeometry,
  disposeMaterials,
} from "../src/legacy-models";
const original = readFileSync(
  new URL("../legacy/index.html", import.meta.url),
  "utf8",
);
const source = original.slice(
  original.indexOf("const matCache ="),
  original.indexOf("/* ======================= 建筑"),
);
const originalBuild = new Function(
  "THREE",
  "RoundedBoxGeometry",
  "wx",
  "wz",
  "M",
  "const glassMat=new THREE.MeshPhysicalMaterial({color:0xcfe6ef,roughness:.05,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide});const frameMat=new THREE.MeshStandardMaterial({color:'#5d6166',roughness:.5,metalness:.4});\n" +
    source +
    "\nreturn buildFurniture;",
)(
  THREE,
  RoundedBoxGeometry,
  (x: number) => (x - 6000) / 1000,
  (y: number) => (y - 5300) / 1000,
  (v: number) => v / 1000,
);
function signature(g: THREE.Group) {
  const hash = createHash("sha256");
  g.traverse((o: any) => {
    hash.update(
      JSON.stringify([
        o.type,
        o.position.toArray(),
        o.rotation.toArray(),
        o.scale.toArray(),
      ]),
    );
    if (o.geometry) {
      for (const key of Object.keys(o.geometry.attributes).sort()) {
        const a = o.geometry.attributes[key].array;
        hash.update(key);
        hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      }
      if (o.geometry.index) {
        const a = o.geometry.index.array;
        hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      }
    }
    if (o.material)
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        hash.update(
          JSON.stringify([
            m.type,
            m.color?.getHex(),
            m.roughness,
            m.metalness,
            m.emissive?.getHex(),
            m.emissiveIntensity,
            m.transparent,
            m.opacity,
            m.side,
          ]),
        );
  });
  return hash.digest("hex");
}
describe("original procedural furniture preservation", () => {
  for (const category of LIB)
    for (const item of category.items)
      it(`${item[0]} / ${item[1]} matches all original geometry, transforms and materials`, () => {
        const f = {
          id: "compare",
          type: item[0],
          name: item[1],
          w: Number(item[2]),
          d: Number(item[3]),
          color: item[4],
          cx: 7600,
          cy: 8500,
          rot: 90,
        };
        const old = originalBuild(f),
          fresh = buildFurniture({
            ...f,
            modelSeed: Math.round(f.w * 7 + f.d * 13 + f.cx + f.cy),
          });
        expect(signature(fresh)).toBe(signature(old));
        disposeGeometry(old);
        disposeGeometry(fresh);
      });
  it("decorative seeds stay stable across position changes", () => {
    const f = {
      id: "plant",
      type: "plant",
      name: "plant",
      w: 500,
      d: 500,
      color: "#a9c39b",
      cx: 7600,
      cy: 8500,
      rot: 0,
      modelSeed: 17600,
    };
    const a = buildFurniture(f),
      b = buildFurniture({ ...f, cx: 8900, cy: 9300 });
    a.position.set(0, 0, 0);
    b.position.set(0, 0, 0);
    expect(signature(a)).toBe(signature(b));
    disposeGeometry(a);
    disposeGeometry(b);
    disposeMaterials();
  });
});
