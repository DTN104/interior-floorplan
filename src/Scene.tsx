import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  buildFurniture,
  disposeGeometry,
  disposeMaterials,
  setEnvironment,
  isSharedMaterial,
  setNightLighting,
} from "./legacy-models";
import { buildArchitecture } from "./legacy-architecture";
import {
  Project,
  Furniture,
  Point,
  area,
  bounds,
  pointIn,
  roomLabel,
  sceneOrigin,
  DEFAULT_CEILING,
} from "./project";

type Props = {
  project: Project;
  selected: string | null;
  onSelect: (id: string, kind: "room" | "furniture") => void;
  onMove: (id: string, x: number, y: number, finished: boolean) => void;
  onCancelMove: () => void;
  dragKey: number;
  night: boolean;
  hour: number;
  cut: boolean;
  cameraMode: "iso" | "top" | "walk";
  targetRoom: string | null;
  onExportReady: (fn: () => void) => void;
};
let activeRenderer: THREE.WebGLRenderer | null = null;
export const getSceneMemory = () =>
  activeRenderer ? { ...activeRenderer.info.memory } : null;
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function FurnitureModel({
  f,
  origin,
  selected,
  onSelect,
  onMove,
  onCancelMove,
  dragKey,
  onDragging,
  draggable,
}: {
  f: Furniture;
  origin: Point;
  selected: boolean;
  draggable: boolean;
  onSelect: Props["onSelect"];
  onMove: Props["onMove"];
  onCancelMove: Props["onCancelMove"];
  dragKey: number;
  onDragging: (b: boolean) => void;
}) {
  const object = useMemo(() => {
    const o = buildFurniture(f);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    return o;
  }, [f.id, f.type, f.w, f.d, f.color, f.modelSeed]);
  useEffect(() => () => disposeGeometry(object), [object]);
  const drag = useRef<{
    start: THREE.Vector3;
    cx: number;
    cy: number;
    pid: number;
    target: Element;
    latest: THREE.Vector3;
  } | null>(null);
  useEffect(() => {
    if (!drag.current) return;
    const d = drag.current;
    drag.current = null;
    onDragging(false);
    if (d.target.hasPointerCapture?.(d.pid))
      d.target.releasePointerCapture(d.pid);
  }, [dragKey, onDragging]);
  const pointer = (e: ThreeEvent<PointerEvent>) => {
    const p = new THREE.Vector3();
    e.ray.intersectPlane(ground, p);
    return p;
  };
  const finish = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current || drag.current.pid !== e.pointerId) return;
    e.stopPropagation();
    const d = drag.current;
    drag.current = null;
    onDragging(false);
    onMove(
      f.id,
      Math.round((d.latest.x - d.start.x) * 1000 + d.cx),
      Math.round((d.latest.z - d.start.z) * 1000 + d.cy),
      true,
    );
    (e.target as Element).releasePointerCapture?.(d.pid);
  };
  const cancel = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current || drag.current.pid !== e.pointerId) return;
    e.stopPropagation();
    const pid = drag.current.pid;
    drag.current = null;
    onDragging(false);
    onCancelMove();
    (e.target as Element).releasePointerCapture?.(pid);
  };
  return (
    <group
      position={[(f.cx - origin[0]) / 1000, 0, (f.cy - origin[1]) / 1000]}
      rotation={[0, (-f.rot * Math.PI) / 180, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(f.id, "furniture");
      }}
      onPointerDown={(e) => {
        if (!draggable || e.button !== 0 || drag.current) return;
        e.stopPropagation();
        onSelect(f.id, "furniture");
        const start = pointer(e);
        drag.current = {
          start,
          cx: f.cx,
          cy: f.cy,
          pid: e.pointerId,
          target: e.target as Element,
          latest: start,
        };
        onDragging(true);
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current || drag.current.pid !== e.pointerId) return;
        e.stopPropagation();
        const d = drag.current;
        d.latest = pointer(e);
        onMove(
          f.id,
          Math.round((d.latest.x - d.start.x) * 1000 + d.cx),
          Math.round((d.latest.z - d.start.z) * 1000 + d.cy),
          false,
        );
      }}
      onPointerUp={finish}
      onPointerCancel={cancel}
    >
      <primitive object={object} dispose={null} />
      {selected && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[f.w / 1000 + 0.12, f.d / 1000 + 0.12]} />
          <meshBasicMaterial
            color="#bf693f"
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
function World(props: Props) {
  const { project: p, cut, night, hour, cameraMode, targetRoom } = props;
  const { gl, camera, scene } = useThree();
  const controls = useRef<any>(null);
  const [dragging, setDragging] = useState(false);
  const origin = useMemo(() => sceneOrigin(p), [p.geometry]),
    ceiling = (p.geometry.ceiling ?? DEFAULT_CEILING) / 1000;
  const arch = useMemo(
    () =>
      buildArchitecture(
        p,
        cut && cameraMode !== "walk" ? 1.1 : ceiling,
        origin,
      ),
    [p.geometry, p.rooms, p.demolished, cut, cameraMode, origin, ceiling],
  );
  useEffect(
    () => () => {
      disposeGeometry(arch.group);
      const own = new Set<THREE.Material>();
      arch.group.traverse((o: any) => {
        if (o.material)
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (!isSharedMaterial(m)) own.add(m);
      });
      own.forEach((m) => m.dispose());
    },
    [arch],
  );
  useEffect(() => {
    const envScene = new RoomEnvironment();
    const pm = new THREE.PMREMGenerator(gl),
      env = pm.fromScene(envScene, 0.04);
    scene.environment = null;
    setEnvironment(env.texture);
    envScene.dispose();
    pm.dispose();
    return () => {
      scene.environment = null;
      setEnvironment(null);
      env.dispose();
      disposeMaterials();
    };
  }, [gl, scene]);
  useEffect(() => {
    props.onExportReady(() => {
      gl.render(scene, camera);
      const a = document.createElement("a");
      a.download = "noi-that-3d.png";
      a.href = gl.domElement.toDataURL("image/png");
      a.click();
    });
  }, [gl, scene, camera, props.onExportReady]);
  const floorBounds = useMemo(
    () => bounds(p.geometry.rooms.flatMap((r) => r.poly)),
    [p.geometry],
  );
  useEffect(() => {
    const r = targetRoom && p.geometry.rooms.find((r) => r.id === targetRoom),
      b = r ? bounds(r.poly) : floorBounds;
    const center = new THREE.Vector3(
        (b[0] + b[2] - 2 * origin[0]) / 2000,
        0,
        (b[1] + b[3] - 2 * origin[1]) / 2000,
      ),
      span = Math.max(b[2] - b[0], b[3] - b[1]) / 1000;
    if (cameraMode === "walk") {
      const room =
          p.geometry.rooms.find((r) => r.id === "living") ??
          [...p.geometry.rooms]
            .filter((r) => r.counted !== false)
            .sort((a, b) => area(b.poly) - area(a.poly))[0] ??
          p.geometry.rooms[0],
        poly = room.poly,
        box = bounds(poly);
      let start: [number, number] = [
        (box[0] + box[2]) / 2,
        (box[1] + box[3]) / 2,
      ];
      if (!pointIn(poly, start)) start = room.at ?? poly[0];
      camera.position.set(
        (start[0] - origin[0]) / 1000,
        1.6,
        (start[1] - origin[1]) / 1000,
      );
      camera.lookAt(camera.position.x, 1.6, camera.position.z - 1);
    } else {
      camera.position
        .copy(center)
        .add(
          cameraMode === "top"
            ? new THREE.Vector3(0, span * 1.5, 0.001)
            : new THREE.Vector3(span * 0.8, span, span * 0.9),
        );
      camera.lookAt(center);
      if (controls.current) {
        controls.current.target.copy(center);
        controls.current.update();
      }
    }
  }, [cameraMode, targetRoom, floorBounds, camera, p.geometry, origin]);
  const walk = useRef({
    keys: new Set<string>(),
    yaw: 0,
    pitch: 0,
    look: false,
    x: 0,
    y: 0,
    forward: 0,
    side: 0,
  });
  useEffect(() => {
    const keys = walk.current.keys;
    const down = (e: KeyboardEvent) => {
        if (
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLSelectElement)
        )
          keys.add(e.key.toLowerCase());
      },
      up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase()),
      blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    walk.current.yaw = 0;
    walk.current.pitch = 0;
    walk.current.look = false;
    if (cameraMode !== "walk") return;
    const cv = gl.domElement,
      w = walk.current;
    const down = (e: PointerEvent) => {
        w.look = true;
        w.x = e.clientX;
        w.y = e.clientY;
        cv.setPointerCapture(e.pointerId);
      },
      move = (e: PointerEvent) => {
        if (w.look) {
          w.yaw -= (e.clientX - w.x) * 0.004;
          w.pitch = THREE.MathUtils.clamp(
            w.pitch - (e.clientY - w.y) * 0.004,
            -1.2,
            1.2,
          );
          w.x = e.clientX;
          w.y = e.clientY;
        }
      },
      up = () => {
        w.look = false;
      };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
    };
  }, [cameraMode, gl]);
  useFrame((_, dt) => {
    for (const d of arch.doors) {
      d.cur += ((d.open ? d.a1 : d.a0) - d.cur) * Math.min(1, dt * 6);
      d.pivot.rotation.y = d.cur;
    }
    if (cameraMode !== "walk") return;
    const w = walk.current;
    camera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
    const forward =
        (w.keys.has("w") || w.keys.has("arrowup") ? 1 : 0) -
        (w.keys.has("s") || w.keys.has("arrowdown") ? 1 : 0) +
        w.forward,
      side =
        (w.keys.has("d") || w.keys.has("arrowright") ? 1 : 0) -
        (w.keys.has("a") || w.keys.has("arrowleft") ? 1 : 0) +
        w.side,
      speed = Math.min(dt, 0.05) * (w.keys.has("shift") ? 3.2 : 1.8),
      dx = (side * Math.cos(w.yaw) - forward * Math.sin(w.yaw)) * speed,
      dz = (-forward * Math.cos(w.yaw) - side * Math.sin(w.yaw)) * speed;
    const blocked = (x: number, z: number) => {
      const mm: [number, number] = [
        x * 1000 + origin[0],
        z * 1000 + origin[1],
      ];
      return (
        ![
          ...p.geometry.rooms.map((r) => r.poly),
          ...[...p.geometry.doors, ...p.geometry.slides].map((d) => {
            const r = d.rect;
            return [
              [r[0], r[1]],
              [r[2], r[1]],
              [r[2], r[3]],
              [r[0], r[3]],
            ] as [number, number][];
          }),
        ].some((poly) => pointIn(poly, mm)) ||
        arch.colliders.some(
          (r: number[]) =>
            x > r[0] - 0.14 &&
            x < r[2] + 0.14 &&
            z > r[1] - 0.14 &&
            z < r[3] + 0.14,
        ) ||
        arch.doors.some((d: any, i: number) => {
          const r = p.geometry.doors[i].rect;
          return (
            !d.open &&
            mm[0] > r[0] - 140 &&
            mm[0] < r[2] + 140 &&
            mm[1] > r[1] - 140 &&
            mm[1] < r[3] + 140
          );
        })
      );
    };
    if (!blocked(camera.position.x + dx, camera.position.z))
      camera.position.x += dx;
    if (!blocked(camera.position.x, camera.position.z + dz))
      camera.position.z += dz;
  });
  // The original 26 m shadow box, grown for larger drawn plans.
  const shadowHalf = Math.max(
      13,
      Math.max(
        floorBounds[2] - floorBounds[0],
        floorBounds[3] - floorBounds[1],
      ) /
        2000 +
        3,
    ),
    sunAngle = ((hour - 6) / 12) * Math.PI,
    az = Math.PI * (0.15 + ((hour - 6) / 12) * 0.7),
    el = Math.sin(sunAngle) * 1.05 + 0.15;
  useEffect(() => {
    gl.toneMappingExposure = night ? 1.25 : 1.05;
    setNightLighting(night);
    arch.group.children[2].children.forEach((o: any) => {
      if (o.isPointLight) o.intensity = night ? 6 : 0;
      else if (o.material) o.material.emissiveIntensity = night ? 2 : 0.3;
    });
  }, [gl, night, arch]);
  return (
    <>
      <color attach="background" args={[night ? "#1c2130" : "#f7f4ee"]} />
      <hemisphereLight args={[0xfff8ee, 0xb9a88f, night ? 0.12 : 1.1]} />
      <directionalLight
        position={[
          Math.cos(az) * 18,
          Math.sin(el) * 20 + 3,
          -Math.sin(az) * 10 + 8,
        ]}
        color={night ? "#b4c9ee" : "#fff1dd"}
        intensity={night ? 0.05 : 1.4 + Math.sin(sunAngle) * 1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowHalf}
        shadow-camera-right={shadowHalf}
        shadow-camera-top={shadowHalf}
        shadow-camera-bottom={-shadowHalf}
        shadow-camera-far={60}
        shadow-bias={-0.0002}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.015, 0]}
        receiveShadow
      >
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial
          color={night ? "#2a2e38" : "#f2eee7"}
          roughness={1}
        />
      </mesh>
      <primitive
        object={arch.group}
        dispose={null}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          const door = e.object.userData.door;
          if (door) door.open = !door.open;
          else if (e.object.userData.room)
            props.onSelect(e.object.userData.room, "room");
        }}
      />
      {p.furniture.map((f) => (
        <FurnitureModel
          key={f.id}
          f={f}
          origin={origin}
          selected={props.selected === f.id}
          draggable={cameraMode !== "walk"}
          onSelect={props.onSelect}
          onMove={props.onMove}
          onCancelMove={props.onCancelMove}
          dragKey={props.dragKey}
          onDragging={setDragging}
        />
      ))}
      {cameraMode !== "walk" &&
        p.geometry.rooms
          .filter((r) => r.counted !== false)
          .map((r) => {
            const b = bounds(r.poly);
            return (
              <Html
                key={r.id}
                position={[
                  (b[0] + b[2] - 2 * origin[0]) / 2000,
                  0.03,
                  (b[1] + b[3] - 2 * origin[1]) / 2000,
                ]}
                center
                style={{ pointerEvents: "none" }}
              >
                <span className="scene-label">{roomLabel(p, r.id)}</span>
              </Html>
            );
          })}
      {cameraMode !== "walk" && (
        <OrbitControls
          ref={controls}
          enabled={!dragging}
          maxPolarAngle={Math.PI * 0.495}
          minDistance={1.5}
          maxDistance={60}
        />
      )}
      {cameraMode === "walk" && (
        <Html fullscreen style={{ pointerEvents: "none" }}>
          <div className="walk-hint">
            WASD / phím mũi tên · kéo để nhìn · chạm cửa để mở
          </div>
          <div className="walk-pad">
            {[
              ["↑", 1, 0],
              ["←", 0, -1],
              ["↓", -1, 0],
              ["→", 0, 1],
            ].map(([label, f, s]) => (
              <button
                key={label}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  walk.current.forward = Number(f);
                  walk.current.side = Number(s);
                }}
                onPointerUp={() => {
                  walk.current.forward = 0;
                  walk.current.side = 0;
                }}
                onPointerCancel={() => {
                  walk.current.forward = 0;
                  walk.current.side = 0;
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Html>
      )}
    </>
  );
}
export function Scene(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 15, 14], fov: 45, near: 0.05, far: 300 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        activeRenderer = gl;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <Suspense fallback={null}>
        <World {...props} />
      </Suspense>
    </Canvas>
  );
}
