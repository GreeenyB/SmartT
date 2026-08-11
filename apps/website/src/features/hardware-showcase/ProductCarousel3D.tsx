import { useEffect, useRef, useState } from "react";

type Comp = {
  name: string;
  summary: string;
  scale: number;
  rotation: [number, number, number];
  build: (THREE: typeof import("three")) => import("three").Group;
};

const COLS = 3;
const ROWS = 2;

export function ProductCarousel3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<number>(-1);
  const [hover, setHover] = useState(-1);
  const [items, setItems] = useState<{ name: string; summary: string }[]>([]);

  useEffect(() => {
    let raf = 0;
    let disposed = false;
    let teardown = () => {};
    const canvas = canvasRef.current!;
    const container = containerRef.current!;

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
      camera.position.set(0, 0, 22);

      let layout: () => void = () => {};

      const size = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        layout();
      };

      const root = new THREE.Group();
      scene.add(root);

      scene.add(new THREE.HemisphereLight(0xffffff, 0xcdd8e7, 2.0));
      const key = new THREE.DirectionalLight(0xffffff, 2.6);
      key.position.set(7, 10, 9);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xb8d3ff, 1.4);
      fill.position.set(-9, 5, 7);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffffff, 1.4);
      rim.position.set(2, 7, -10);
      scene.add(rim);

      const metallicDark = new THREE.MeshPhysicalMaterial({
        color: 0x444b56,
        metalness: 0.9,
        roughness: 0.32,
      });
      const metallicSilver = new THREE.MeshPhysicalMaterial({
        color: 0xcfd5db,
        metalness: 1.0,
        roughness: 0.22,
      });
      const matteBlack = new THREE.MeshPhysicalMaterial({
        color: 0x22262c,
        metalness: 0.35,
        roughness: 0.72,
      });
      const panelGray = new THREE.MeshPhysicalMaterial({
        color: 0x6f7887,
        metalness: 0.4,
        roughness: 0.68,
      });

      function makeWireCurve(pts: import("three").Vector3[], radius: number, color: number) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const geom = new THREE.TubeGeometry(curve, 48, radius, 10, false);
        return new THREE.Mesh(
          geom,
          new THREE.MeshPhysicalMaterial({ color, metalness: 0.08, roughness: 0.72 }),
        );
      }

      function createMainUnit() {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.35, 1.18), metallicDark));
        const top = new THREE.Mesh(new THREE.BoxGeometry(3.08, 1.92, 0.08), panelGray);
        top.position.z = 0.63;
        g.add(top);
        const mount = new THREE.Mesh(new THREE.BoxGeometry(4.1, 2.85, 0.12), matteBlack);
        mount.position.z = -0.65;
        g.add(mount);
        for (const [x, y] of [
          [-1.82, -1.3],
          [1.82, -1.3],
          [-1.82, 1.3],
          [1.82, 1.3],
        ] as const) {
          const ear = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.16, 0.14, 24),
            metallicSilver,
          );
          ear.rotation.x = Math.PI / 2;
          ear.position.set(x, y, -0.58);
          g.add(ear);
        }
        for (let i = 0; i < 11; i++) {
          const fL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.54, 0.18), matteBlack);
          fL.position.set(-1.88, 0, -0.28 + i * 0.052);
          g.add(fL);
          const fR = fL.clone();
          fR.position.x = 1.88;
          g.add(fR);
        }
        const leds: [number, number, number][] = [
          [-0.86, 0.58, 0x52d96d],
          [-0.45, 0.78, 0x3fb9ff],
          [-0.12, 0.58, 0xffd36b],
          [0.22, 0.78, 0xffffff],
        ];
        for (const [x, y, c] of leds) {
          const led = new THREE.Mesh(
            new THREE.CircleGeometry(0.055, 24),
            new THREE.MeshBasicMaterial({ color: c }),
          );
          led.position.set(x, y, 0.682);
          g.add(led);
        }
        return g;
      }

      function createProbe() {
        const g = new THREE.Group();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 5.7, 28), metallicSilver);
        rod.rotation.z = Math.PI / 2;
        rod.position.x = -0.1;
        g.add(rod);
        const thr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.72, 28), metallicDark);
        thr.rotation.z = Math.PI / 2;
        thr.position.x = 2.92;
        g.add(thr);
        for (let i = 0; i < 5; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 10, 32), metallicSilver);
          ring.rotation.y = Math.PI / 2;
          ring.position.set(2.66 + i * 0.08, 0, 0);
          g.add(ring);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.62, 40), panelGray);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = -3.1;
        g.add(cap);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 0.65, 24), matteBlack);
        neck.rotation.z = Math.PI / 2;
        neck.position.x = -2.3;
        g.add(neck);
        g.add(
          makeWireCurve(
            [
              new THREE.Vector3(-3.42, 0.18, 0),
              new THREE.Vector3(-3.9, 0.9, -0.2),
              new THREE.Vector3(-4.15, 1.3, -0.3),
              new THREE.Vector3(-4.15, 1.72, -0.42),
              new THREE.Vector3(-2.7, 2.1, -0.12),
            ],
            0.06,
            0x1c2025,
          ),
        );
        return g;
      }

      function createHarness() {
        const g = new THREE.Group();
        const plug = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.74, 0.84), matteBlack);
        plug.position.set(1.85, 0.1, 0);
        g.add(plug);
        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.54, 0.58), matteBlack);
        neck.position.set(1.15, 0.1, 0);
        g.add(neck);
        const pinPlate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.56), metallicSilver);
        pinPlate.position.set(2.4, 0.1, 0);
        g.add(pinPlate);
        const connector = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.56, 0.62), matteBlack);
        connector.position.set(-2.0, 0.1, 0);
        g.add(connector);
        const colors = [0xff5757, 0x4fb0ff, 0xffcf58, 0x60d97b, 0xffffff, 0xfa8d55, 0x8f7cff];
        for (let i = 0; i < colors.length; i++) {
          const y = 0.34 - i * 0.11;
          const z = -0.22 + i * 0.07;
          g.add(
            makeWireCurve(
              [
                new THREE.Vector3(-1.64, y, z),
                new THREE.Vector3(-0.9, y + 0.28, z + 0.12),
                new THREE.Vector3(0.05, y + 0.35, z + 0.16),
                new THREE.Vector3(0.95, y + 0.12, z + 0.06),
                new THREE.Vector3(1.16, y + 0.02, z),
              ],
              0.03,
              colors[i],
            ),
          );
        }
        return g;
      }

      function createFlowMeter() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 1.5, 28),
          metallicSilver,
        );
        body.rotation.z = Math.PI / 2;
        g.add(body);
        const capL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 20), metallicDark);
        capL.rotation.z = Math.PI / 2;
        capL.position.x = -0.94;
        g.add(capL);
        const capR = capL.clone();
        capR.position.x = 0.94;
        g.add(capR);
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.66, 0.82), panelGray));
        return g;
      }

      function createSSR() {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.1, 0.84), matteBlack));
        for (let i = 0; i < 4; i++) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 18), metallicSilver);
          t.rotation.x = Math.PI / 2;
          t.position.set(i < 2 ? -0.43 : 0.43, i % 2 ? -0.3 : 0.3, 0.44);
          g.add(t);
        }
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 0.82),
          new THREE.MeshBasicMaterial({ color: 0x38404a }),
        );
        face.position.z = 0.43;
        g.add(face);
        return g;
      }

      function createAntenna() {
        const g = new THREE.Group();
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.78, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2),
          matteBlack,
        );
        dome.position.y = 0.06;
        g.add(dome);
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.86, 0.9, 0.18, 40),
          metallicSilver,
        );
        plate.position.y = -0.04;
        g.add(plate);
        const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 20), metallicDark);
        stub.position.y = -0.2;
        g.add(stub);
        g.add(
          makeWireCurve(
            [
              new THREE.Vector3(0, -0.35, 0),
              new THREE.Vector3(0.4, -0.8, 0.2),
              new THREE.Vector3(1.1, -0.95, 0.1),
              new THREE.Vector3(1.7, -0.6, -0.1),
            ],
            0.06,
            0x1c2025,
          ),
        );
        return g;
      }

      const components: Comp[] = [
        {
          name: "Main Tracker Unit",
          summary: "Central controller that collects, processes and transmits fleet telemetry.",
          scale: 1.23,
          rotation: [-0.22, 0.54, 0.08],
          build: createMainUnit,
        },
        {
          name: "Fuel Level Probe",
          summary: "Capacitive rod sensor for precise tank level readings.",
          scale: 0.66,
          rotation: [0.08, -0.18, -0.03],
          build: createProbe,
        },
        {
          name: "OBD-II Wiring Harness",
          summary: "Plug-and-play loom connecting SmartT to the vehicle bus.",
          scale: 1.08,
          rotation: [0.03, -0.42, 0.03],
          build: createHarness,
        },
        {
          name: "Fuel Flow Meter",
          summary: "Inline meter measuring real consumption along the fuel line.",
          scale: 1.98,
          rotation: [0.18, 0.34, 0.12],
          build: createFlowMeter,
        },
        {
          name: "Solid State Relay",
          summary: "Electronic load switching built for high-vibration environments.",
          scale: 2.04,
          rotation: [-0.1, -0.5, 0.04],
          build: createSSR,
        },
        {
          name: "GNSS Antenna",
          summary: "Low-profile GPS antenna for accurate positioning and routing.",
          scale: 2.25,
          rotation: [-0.18, 0.4, 0.05],
          build: createAntenna,
        },
      ];
      setItems(components.map((c) => ({ name: c.name, summary: c.summary })));

      const built = components.map((c, i) => {
        const o = c.build(THREE);
        const home = new THREE.Vector3(0, 0, 0);
        o.rotation.set(c.rotation[0], c.rotation[1], c.rotation[2]);
        o.scale.setScalar(c.scale);
        root.add(o);

        const light = new THREE.PointLight(0x8fd0ff, 0, 12, 2);
        scene.add(light);

        return { ...c, object: o, home, light, hoverAmt: 0 };
      });

      layout = () => {
        const dist = camera.position.z;
        const visH = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist;
        const visW = visH * camera.aspect;
        built.forEach((c, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          c.home.set(
            ((col + 0.5) / COLS - 0.5) * visW * 0.9,
            (0.5 - (row + 0.42) / ROWS) * visH * 0.88,
            0,
          );
          c.object.position.copy(c.home);
          c.light.position.set(c.home.x, c.home.y + 0.5, 3.6);
        });
      };
      layout();

      const clock = new THREE.Clock();
      let isVisible = true;
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      function loop() {
        raf = requestAnimationFrame(loop);
        if (!isVisible) return;

        const dt = Math.min(clock.getDelta(), 0.05);
        const el = clock.elapsedTime;

        built.forEach((c, i) => {
          const targetHover = hoverRef.current === i ? 1 : 0;
          c.hoverAmt += (targetHover - c.hoverAmt) * Math.min(1, dt * 8);
          const s = c.scale * (1 + c.hoverAmt * 0.16);
          c.object.scale.setScalar(s);
          const idleFloat = prefersReducedMotion ? 0 : Math.sin(el * 1.05 + i) * 0.07;
          const idleTurn = prefersReducedMotion ? 0 : Math.sin(el * 0.42 + i) * 0.1;
          c.object.position.y = c.home.y + idleFloat + c.hoverAmt * 0.14;
          c.object.rotation.y = c.rotation[1] + idleTurn + c.hoverAmt * 0.28;
          c.light.intensity = c.hoverAmt * 26;
        });

        renderer.render(scene, camera);
      }

      size();
      loop();

      const ro = new ResizeObserver(size);
      ro.observe(container);

      const visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          isVisible = entry.isIntersecting;
          if (isVisible) clock.getDelta();
        },
        { rootMargin: "160px" },
      );
      visibilityObserver.observe(container);

      teardown = () => {
        ro.disconnect();
        visibilityObserver.disconnect();
        cancelAnimationFrame(raf);
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      teardown();
    };
  }, []);

  const active = hover >= 0 ? items[hover] : undefined;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-[#f6f8fb] to-[#eef2f7]">
      <div ref={containerRef} className="relative h-[520px] w-full md:h-[640px]">
        <canvas ref={canvasRef} className="block h-full w-full" />

        <div
          className="absolute inset-0 grid p-4 md:p-6"
          style={{
            gridTemplateColumns: `repeat(${COLS},minmax(0,1fr))`,
            gridTemplateRows: `repeat(${ROWS},minmax(0,1fr))`,
          }}
        >
          {items.map((it, i) => (
            <div
              key={it.name}
              onMouseEnter={() => {
                hoverRef.current = i;
                setHover(i);
              }}
              onMouseLeave={() => {
                if (hoverRef.current === i) {
                  hoverRef.current = -1;
                  setHover(-1);
                }
              }}
              className={`relative flex cursor-pointer items-end justify-center rounded-2xl border transition-all duration-300 ${
                hover === i
                  ? "border-primary/25 bg-white/45 backdrop-blur-[1px]"
                  : "border-transparent"
              }`}
            >
              <span
                className={`mb-2 truncate rounded-full px-3 py-1 text-[11px] font-medium tracking-wide transition-all duration-300 ${
                  hover === i
                    ? "bg-foreground text-background opacity-100"
                    : "text-muted-foreground opacity-70"
                }`}
              >
                {it.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border/70 bg-white/60 px-6 py-4 text-center backdrop-blur md:px-10">
        <p className="mx-auto max-w-3xl text-sm text-muted-foreground">
          {active ? (
            <>
              <span className="font-medium text-foreground">{active.name}</span> — {active.summary}
            </>
          ) : (
            "Hover any module to light it up and read what it does."
          )}
        </p>
      </div>
    </div>
  );
}
