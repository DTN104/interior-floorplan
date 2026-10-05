// Adapted from the original MIT-licensed app, copyright (c) 2026 wuyi.
import * as THREE from 'three';
import {floorMat,mat,box,metal} from './legacy-models';
import {windowSpec,DEFAULT_CEILING} from './project';
const M=v=>v/1000;
// origin: world origin in mm (the original apartment uses 6000, 5300); ceiling and window heights come from the plan.
export function buildArchitecture(project,cut=2.8,origin=[6000,5300]) {
const wx=x=>(x-origin[0])/1000,wz=y=>(y-origin[1])/1000;
const {walls:WALLS,windows:WINS,doors:DOORS,slides:SLIDES,rooms:ROOMS}=project.geometry;
const drawn=!!project.geometry.layout;
const state=project,H=(project.geometry.ceiling??DEFAULT_CEILING)/1000,opt={cut,mode:'orbit'},archFloor=new THREE.Group(),archUp=new THREE.Group(),lampG=new THREE.Group(),doors=[];let colliders=[];
const wallMat=mat('#f4f1eb',{roughness:.92}),capMat=mat('#34312d',{roughness:.9}),glassMat=new THREE.MeshPhysicalMaterial({color:0xcfe6ef,roughness:.05,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}),frameMat=mat('#5d6166',{roughness:.5,metalness:.4});

function clearGroup(g){ g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); g.clear(); }
function wallBox([x0, y0, x1, y1], yb, yt, m){
  if (yt - yb <= .001) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(M(x1-x0), yt-yb, M(y1-y0)), m || [wallMat, wallMat, capMat, wallMat, wallMat, wallMat]);
  o.position.set(wx((x0+x1)/2), (yb+yt)/2, wz((y0+y1)/2)); o.castShadow = o.receiveShadow = true; archUp.add(o);
  // 漫游辅助：墙体棱线 + 踢脚线，让相邻墙面、墙角一眼可分（仅漫游模式显示）
  const ln = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), edgeMat); ln.position.copy(o.position); ln.userData.walkOnly = true; ln.visible = opt.mode === 'walk'; archUp.add(ln);
  if (yb <= .001){
    const p = o.geometry.parameters, sh = Math.min(.12, yt), sk = new THREE.Mesh(new THREE.BoxGeometry(p.width + .02, sh, p.depth + .02), skirtMat);
    sk.position.set(o.position.x, sh/2, o.position.z); sk.userData.walkOnly = true; sk.visible = opt.mode === 'walk'; archUp.add(sk);
  }
}
const edgeMat = new THREE.LineBasicMaterial({color:0x6f675b}), skirtMat = new THREE.MeshStandardMaterial({color:'#8b7f6e', roughness:.6});
function shapeOf(poly, flip){ const s = new THREE.Shape(); poly.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](wx(x), flip ? wz(y) : -wz(y))); return s; }

function buildArch(){
  clearGroup(archFloor); clearGroup(archUp); lampG.clear(); doors.length = 0; colliders = [];
  const top = opt.cut;
  ROOMS.forEach(r => {
    const m = floorMat(state.rooms[r.id].mat), bay = r.counted === false;
    const geo = bay ? new THREE.ExtrudeGeometry(shapeOf(r.poly), {depth:.45, bevelEnabled:false}) : new THREE.ShapeGeometry(shapeOf(r.poly));
    geo.rotateX(-Math.PI/2);
    const fl = new THREE.Mesh(geo, bay ? [m, mat('#e9e4da')] : m);
    fl.receiveShadow = true; fl.userData.room = r.id;
    if (bay){ fl.castShadow = true; archUp.add(fl); } else archFloor.add(fl);
    // 天花：法线朝下，只在室内仰视时可见
    const cg = new THREE.ShapeGeometry(shapeOf(r.poly, true)); cg.rotateX(Math.PI/2);
    const ceil = new THREE.Mesh(cg, mat('#fbfaf7', {roughness:1})); ceil.position.y = H; ceil.visible = top >= H; archUp.add(ceil);
    if (r.at){
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .02, 32), new THREE.MeshStandardMaterial({color:'#fff', emissive:'#fff2d6', emissiveIntensity:.3}));
      lamp.position.set(wx(r.at[0]), H - .012, wz(r.at[1])); lamp.visible = top >= H; lampG.add(lamp);
      const pl = new THREE.PointLight(0xffd9a8, 0, 7, 1.6); pl.position.set(wx(r.at[0]), H - .25, wz(r.at[1])); lampG.add(pl);
    }
  });
  [...DOORS, ...SLIDES].forEach(d => { const [x0, y0, x1, y1] = d.rect; const s = box(M(x1-x0), .012, M(y1-y0), mat('#d8d0c0', {roughness:.3}), wx((x0+x1)/2), 0, wz((y0+y1)/2)); s.castShadow = false; archFloor.add(s); });
  WALLS.forEach((w, i) => {
    // Pieces consumed by a resize keep their index (demolition IDs) but have zero length: nothing to build.
    if (state.demolished.includes('w'+i) || w[2] <= w[0] || w[3] <= w[1]) return;
    wallBox(w, 0, w[4] === 'low' ? Math.min(1, top) : top);
    colliders.push([wx(w[0]), wz(w[1]), wx(w[2]), wz(w[3])]);
  });
  // 门洞、飘窗洞口上方过梁
  [...DOORS.map(d => [d.rect, 2.1]), ...SLIDES.map(s => [s.rect, s.v || drawn ? 2.4 : 2.1]), ...project.geometry.bayOpenings.map(r=>[r,2.4])]
    .forEach(([r, h]) => { if (top > h) wallBox(r, h, top); });
  WINS.forEach((r, i) => {
    const spec = windowSpec(project.geometry, i), sill = spec.sill/1000, head = spec.head/1000;
    wallBox(r, 0, Math.min(sill, top)); if (top > head) wallBox(r, head, top);
    colliders.push([wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3])]);
    const gTop = Math.min(head, top); if (gTop <= sill) return;
    const [x0, y0, x1, y1] = r, hz = (x1-x0) >= (y1-y0), L = M(hz ? x1-x0 : y1-y0), gh = gTop - sill, cx = wx((x0+x1)/2), cz = wz((y0+y1)/2);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(hz ? L : .01, gh, hz ? .01 : L), glassMat); pane.position.set(cx, sill + gh/2, cz); archUp.add(pane);
    const n = Math.max(1, Math.round(L/.9));
    for (let k = 0; k <= n; k++){ const t = -L/2 + k*L/n, mu = new THREE.Mesh(new THREE.BoxGeometry(hz ? .04 : .06, gh, hz ? .06 : .04), frameMat);
      mu.position.set(cx + (hz ? t : 0), sill + gh/2, cz + (hz ? 0 : t)); mu.castShadow = true; archUp.add(mu); }
    [sill + .02, gTop - .02].forEach(y => { const tr = new THREE.Mesh(new THREE.BoxGeometry(hz ? L : .06, .04, hz ? .06 : L), frameMat); tr.position.set(cx, y, cz); archUp.add(tr); });
  });
  DOORS.forEach(d => {
    const pivot = new THREE.Group(), L = M(d.len), dh = Math.min(2.05, top);
    pivot.position.set(wx(d.h[0]), 0, wz(d.h[1]));
    const leaf = box(L, dh, .04, mat(d.entry ? '#6b4f3a' : '#efe6d8', {roughness:.5}), L/2);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), metal()); knob.position.set(L - .07, Math.min(1, dh - .05), 0); knob.scale.z = 2.2;
    pivot.add(leaf, knob);
    const ang = v => Math.atan2(-v[1], v[0]), door = {pivot, a0:ang(d.c), a1:ang(d.o), open:true};
    if (door.a1 - door.a0 > Math.PI) door.a1 -= Math.PI*2; if (door.a0 - door.a1 > Math.PI) door.a1 += Math.PI*2;
    door.cur = door.a1; pivot.rotation.y = door.cur; leaf.userData.door = knob.userData.door = door;
    doors.push(door); archUp.add(pivot);
  });
  SLIDES.forEach(({rect:[x0, y0, x1, y1], v}) => {
    const L = M(v ? y1-y0 : x1-x0), ph = Math.min(v || drawn ? 2.4 : 2.1, top), pl = L*.55;
    [[-1, -.02], [1, .02]].forEach(([s, off]) => {
      const c = s < 0 ? -L/2 + pl/2 : L/2 - pl/2, x = v ? wx((x0+x1)/2) + off : wx(x0) + L/2 + c, z = v ? wz(y0) + L/2 + c : wz((y0+y1)/2) + off;
      const p = new THREE.Mesh(new THREE.BoxGeometry(v ? .02 : pl, ph, v ? pl : .02), glassMat); p.position.set(x, ph/2, z); archUp.add(p);
      [ph - .03, .03].forEach(y => { const fr = new THREE.Mesh(new THREE.BoxGeometry(v ? .04 : pl, .05, v ? pl : .04), frameMat); fr.position.set(x, y, z); archUp.add(fr); });
      [-1, 1].forEach(e => { const fr = new THREE.Mesh(new THREE.BoxGeometry(.04, ph, .04), frameMat); fr.position.set(v ? x : x + e*pl/2, ph/2, v ? z + e*pl/2 : z); archUp.add(fr); });
    });
  });
  
}


buildArch();const group=new THREE.Group();group.add(archFloor,archUp,lampG);return {group,doors,colliders};
}
