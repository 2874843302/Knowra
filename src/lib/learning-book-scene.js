import {
  AmbientLight,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// A small, original model. No downloaded models, textures or environment maps.
export function createLearningBookScene(element, preferences, onReady) {
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  element.append(canvas);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1.25, 1.25, 1.25, -1.25, 0.1, 30);
  camera.position.set(1.3, 3.2, 5.2);
  camera.lookAt(0, 0, 0);
  scene.add(new AmbientLight(0xffffff, 1.5));
  const key = new DirectionalLight(0xfff1dc, 2);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const fill = new DirectionalLight(0xc7e8e5, 0.8);
  fill.position.set(4, 2, -3);
  scene.add(fill);

  const book = new Group();
  scene.add(book);
  const geometries = new Set();
  const materials = new Set();
  const material = (color, extra = {}) => {
    const result = new MeshStandardMaterial({
      color: new Color(color),
      roughness: 0.65,
      metalness: 0,
      ...extra,
    });
    materials.add(result);
    return result;
  };
  const blue = material("#365f9a", { roughness: 0.38, metalness: 0.06 });
  const paper = material("#fff8e9");
  const pageEdge = material("#d8c9ae");
  const ink = material("#7895ab");
  const peach = material("#e8a87c");
  const box = (parent, size, position, surface, radius = 0.025) => {
    const geometry = new RoundedBoxGeometry(...size, 2, radius);
    geometries.add(geometry);
    const mesh = new Mesh(geometry, surface);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };

  for (const side of [-1, 1]) {
    const half = new Group();
    half.rotation.z = side * 0.16;
    book.add(half);
    box(half, [1.08, 0.14, 1.54], [side * 0.51, -0.1, 0], blue, 0.045);
    box(half, [0.92, 0.16, 1.32], [side * 0.51, 0.04, 0], pageEdge);
    box(half, [0.92, 0.035, 1.32], [side * 0.51, 0.136, 0], paper, 0.012);
    // A few engraved ink lines read clearly even at the title's small size.
    for (let row = 0; row < 2; row++) {
      const geometry = new CylinderGeometry(
        0.014,
        0.014,
        row === 1 ? 0.44 : 0.62,
        5,
      );
      geometries.add(geometry);
      const line = new Mesh(geometry, ink);
      line.rotation.z = Math.PI / 2;
      line.position.set(side * 0.51, 0.158, -0.25 + row * 0.24);
      half.add(line);
    }
    if (side === 1)
      box(half, [0.17, 0.02, 0.57], [0.72, 0.16, 0.55], peach, 0.006);
  }
  box(book, [0.11, 0.23, 1.52], [0, -0.06, 0], blue);

  const indices = [];
  for (let u = 0; u < 24; u++) {
    const a = u * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const sheetMaterial = material("#fffaf0", { side: DoubleSide });
  const sheets = Array.from({ length: 3 }, () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(new Float32Array(25 * 2 * 3), 3),
    );
    geometry.setIndex(indices);
    geometries.add(geometry);
    const sheet = new Mesh(geometry, sheetMaterial);
    book.add(sheet);
    return sheet;
  });

  let disposed = false;
  let contextLost = false;
  let inView = false;
  let hasSize = false;
  let frame = 0;
  let elapsed = 0;
  let lastTime = null;
  let size = 0;
  let ready = false;
  let settings = preferences;
  const markReady = (value) => {
    if (value === ready) return;
    ready = value;
    onReady(value);
  };
  const canRender = () =>
    !disposed &&
    !contextLost &&
    hasSize &&
    inView &&
    settings.active &&
    !document.hidden;
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = null;
  };
  const render = (time) => {
    book.position.y = -0.04 + Math.sin(time * 2.7) * 0.022;
    book.rotation.set(0.56, -0.12 + Math.sin(time * 1.8) * 0.045, -0.07);
    const cycle = settings.reducedMotion ? -1 : (time + 0.18) % 1.9;
    sheets.forEach((sheet, index) => {
      const turn = cycle - index * 0.15;
      sheet.visible = turn >= 0 && turn < 1.04;
      if (!sheet.visible) return;
      const progress = turn / 1.04;
      const angle = progress * progress * (3 - 2 * progress) * Math.PI;
      const position = sheet.geometry.attributes.position;
      for (let u = 0; u <= 24; u++) {
        const distance = (u / 24) * 0.93;
        for (let v = 0; v < 2; v++)
          position.setXYZ(
            u * 2 + v,
            Math.cos(angle) * distance,
            0.165 +
              index * 0.006 +
              Math.sin(angle) * distance +
              Math.abs(Math.cos(angle)) * distance * 0.13 +
              Math.sin((u / 24) * Math.PI) * Math.sin(angle) * 0.08,
            (v - 0.5) * 1.29,
          );
      }
      position.needsUpdate = true;
      sheet.geometry.computeVertexNormals();
    });
    renderer.render(scene, camera);
    markReady(true);
  };
  const tick = (now) => {
    frame = 0;
    if (!canRender() || settings.reducedMotion) return;
    if (lastTime === null || now - lastTime >= 1000 / 60) {
      if (lastTime !== null) elapsed += Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      render(elapsed);
    }
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (!canRender()) return stop();
    render(settings.reducedMotion ? 0 : elapsed);
    if (settings.reducedMotion) stop();
    else if (!frame) frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    const width = Math.round(element.getBoundingClientRect().width);
    hasSize = width > 0;
    if (hasSize && width !== size) {
      size = width;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(size, size, false);
    }
    sync();
  };
  const lost = (event) => {
    event.preventDefault();
    contextLost = true;
    stop();
    markReady(false);
  };
  const restored = () => {
    contextLost = false;
    sync();
  };
  const intersection = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    sync();
  });
  const resizeObserver = new ResizeObserver(resize);
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  document.addEventListener("visibilitychange", sync);
  intersection.observe(element);
  resizeObserver.observe(element);
  resize();

  return {
    configure(next) {
      settings = next;
      sync();
    },
    dispose() {
      disposed = true;
      stop();
      intersection.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
