/* ═══════════════════════════════════════════════════════════════════════
   HERO SCENE — "The Colonnade"
   ═══════════════════════════════════════════════════════════════════════

   A real-time three-dimensional colonnade receding into navy fog, with a
   single warm light far down the corridor. Rendered live rather than
   played back as a video file: it stays sharp at any viewport, adapts to
   the device, weighs a fraction of a video, and never expires.

   Why a colonnade. Classical architecture is the inherited visual
   language of institutions built to outlast their founders, which is the
   firm's own claim. It carries "old money" without costume, and it reads
   as structure and permanence rather than spectacle.

   Guidelines note: 01.06 forbids rendering the LOGO in three dimensions.
   Nothing here depicts or approximates the mark; the geometry is
   abstract architecture only. Materials use guideline colours.
   ═══════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

const NAVY  = 0x192c44;
const SLATE = 0x2f4768;
const GOLD  = 0xead09c;
const BLUE  = 0x215d9b;
const INK   = 0x0a1424;
const STONE = 0xd6d6d6;

const SPACING = 5.2;    // metres between column pairs
const PAIRS   = 26;     // enough to fill the fog depth
const SPEED   = 0.42;   // metres per second of apparent travel

export function initScene(canvas, opts = {}) {
  const reduce = opts.reduce === true;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch (e) {
    return null;               // no WebGL — the CSS gradient stands in
  }
  if (!renderer.getContext()) return null;

  renderer.setClearColor(INK, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(INK, 0.029);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 260);
  camera.position.set(0, 1.75, 7);

  /* ── Geometry ──────────────────────────────────────────────────────
     Each column is a slightly tapered shaft between a square plinth and
     capital. Three instanced meshes rather than three hundred separate
     ones. */

  const corridor = new THREE.Group();
  scene.add(corridor);

  const shaftGeo   = new THREE.CylinderGeometry(0.46, 0.55, 9.4, 28, 1, true);
  const plinthGeo  = new THREE.BoxGeometry(1.5, 0.55, 1.5);
  const capitalGeo = new THREE.BoxGeometry(1.62, 0.62, 1.62);

  /* Limestone, not shadow. Platinum Gray is the guidelines' light
     neutral; lit by a navy ambient and a warm key it reads as pale
     stone and gives the corridor its depth. */
  const stone = new THREE.MeshStandardMaterial({
    color: STONE,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide
  });

  const stoneSolid = new THREE.MeshStandardMaterial({
    color: STONE,
    roughness: 0.86,
    metalness: 0.03
  });

  const count = PAIRS * 2;
  const shafts   = new THREE.InstancedMesh(shaftGeo,   stone,      count);
  const plinths  = new THREE.InstancedMesh(plinthGeo,  stoneSolid, count);
  const capitals = new THREE.InstancedMesh(capitalGeo, stoneSolid, count);

  const m = new THREE.Matrix4();
  const tint = new THREE.Color();
  let i = 0;

  for (let p = 0; p < PAIRS; p++) {
    for (const side of [-1, 1]) {
      const x = side * 3.55;
      const z = -p * SPACING;

      m.makeTranslation(x, 4.7, z);
      shafts.setMatrixAt(i, m);

      m.makeTranslation(x, 0.27, z);
      plinths.setMatrixAt(i, m);

      m.makeTranslation(x, 9.7, z);
      capitals.setMatrixAt(i, m);

      /* A little variation per column so the repetition never reads as
         a tiled texture. */
      const v = 0.86 + ((p * 7 + (side > 0 ? 3 : 0)) % 11) / 38;
      tint.setHex(STONE).multiplyScalar(v);
      shafts.setColorAt(i, tint);
      plinths.setColorAt(i, tint);
      capitals.setColorAt(i, tint);

      i++;
    }
  }

  shafts.instanceColor.needsUpdate = true;
  plinths.instanceColor.needsUpdate = true;
  capitals.instanceColor.needsUpdate = true;

  corridor.add(shafts, plinths, capitals);

  /* Floor and entablature, both very dark — they exist to catch light
     and give the corridor a top and bottom, not to be looked at. */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(46, PAIRS * SPACING + 60),
    new THREE.MeshStandardMaterial({ color: INK, roughness: 0.42, metalness: 0.22 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -PAIRS * SPACING / 2 + 10);
  corridor.add(floor);

  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(11, 1.1, PAIRS * SPACING + 60),
    new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.9 })
  );
  lintel.position.set(0, 10.5, -PAIRS * SPACING / 2 + 10);
  corridor.add(lintel);

  /* ── Light ─────────────────────────────────────────────────────────
     One warm source far down the corridor, a cool fill from the side,
     and enough ambient to keep the stone from going black. Gold is the
     key here because the corridor is where the eye is led — this is the
     "elevated application" the guidelines reserve it for. */

  scene.add(new THREE.AmbientLight(NAVY, 2.6));

  const fill = new THREE.DirectionalLight(BLUE, 2.1);
  fill.position.set(-6, 9, 4);
  scene.add(fill);

  const far = new THREE.PointLight(GOLD, 520, 160, 1.9);
  far.position.set(0, 4.4, -PAIRS * SPACING + 7);
  scene.add(far);

  const near = new THREE.PointLight(BLUE, 70, 48, 2.1);
  near.position.set(2.4, 6.2, 2);
  scene.add(near);

  /* ── Dust ──────────────────────────────────────────────────────────
     A few hundred motes drifting in the light. Cheap, and the thing that
     makes the corridor feel like air rather than a render. */

  const DUST = 520;
  const dustPos = new Float32Array(DUST * 3);
  for (let d = 0; d < DUST; d++) {
    dustPos[d * 3]     = (Math.random() - 0.5) * 15;
    dustPos[d * 3 + 1] = Math.random() * 10.5;
    dustPos[d * 3 + 2] = -Math.random() * PAIRS * SPACING;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: GOLD,
    size: 0.055,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  corridor.add(dust);

  /* ── Loop ──────────────────────────────────────────────────────────
     The corridor slides toward the camera and wraps every SPACING
     metres. Because the colonnade is periodic, the wrap is invisible and
     the travel is endless without recycling a single instance. */

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = null;
  let running = false;
  let t0 = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render(elapsed) {
    corridor.position.z = (elapsed * SPEED) % SPACING;

    /* Damped parallax. The camera barely moves — enough to feel
       responsive to the viewer, never enough to be a gimmick. */
    pointer.x += (pointer.tx - pointer.x) * 0.035;
    pointer.y += (pointer.ty - pointer.y) * 0.035;

    camera.position.x = pointer.x * 0.85 + Math.sin(elapsed / 13) * 0.16;
    camera.position.y = 1.75 + pointer.y * 0.34 + Math.sin(elapsed / 17) * 0.09;
    camera.lookAt(pointer.x * 0.4, 3.5, -26);

    dust.rotation.z = elapsed * 0.008;
    far.intensity = 520 + Math.sin(elapsed / 7) * 70;

    renderer.render(scene, camera);
  }

  function frame(now) {
    if (t0 === null) t0 = now;
    render((now - t0) / 1000);
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (running || reduce) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  resize();
  render(0);
  if (!reduce) play();

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { resize(); if (!running) render(0); }, 160);
  });

  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = -(e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    document.hidden ? pause() : play();
  });

  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      entries[0].isIntersecting ? play() : pause();
    }, { threshold: 0 }).observe(canvas);
  }

  return { play, pause, resize };
}


/* ── Boot ───────────────────────────────────────────────────────────
   PDCM_SCENE_BOOT — self-starting so the scene needs no handshake with
   site.js and behaves identically whether this file is loaded from disk
   or inlined into a single-file build. */

(function boot() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = initScene(canvas, { reduce });
  if (scene) canvas.classList.add('is-lit');
})();
