// Los Angeles 3D: CesiumJS + Google Photorealistic 3D Tiles.
import { LANDMARKS } from './landmarks.js';
import { ROUTES } from './routes.js';
import { createTraffic } from './traffic.js';
import { createTour } from './tour.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const byId = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

// ---------------------------------------------------------------------------
// Loader / setup / error screens
// ---------------------------------------------------------------------------
const loader = $('loader');
function setStep(text, frac) {
  $('loadStep').textContent = text;
  if (frac != null) $('loadBar').style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
}
function showPanel(id, html) {
  document.querySelector('#loader .bar').style.display = 'none';
  $('loadStep').style.display = 'none';
  const el = $(id);
  if (html) el.innerHTML = html;
  el.style.display = 'block';
}
let loaderHidden = false;
function hideLoader() {
  if (loaderHidden) return;
  loaderHidden = true;
  setStep('Ready', 1);
  loader.classList.add('done');
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function explainTilesError(err) {
  const status = err && (err.statusCode ?? err.status);
  let detail = '';
  try {
    const body = typeof err.response === 'string' ? JSON.parse(err.response) : err.response;
    detail = body?.error?.message || '';
  } catch { /* not JSON */ }
  const origin = esc(location.origin);
  if (status === 403 || status === 400 || status === 401) {
    return `<h3>Google rejected the API key${status ? ` (HTTP ${status})` : ''}</h3>
      ${detail ? `<p><code>${esc(detail)}</code></p>` : ''}
      Check that the <b>Map Tiles API</b> is enabled for the key's project, billing is on,
      and the key's HTTP referrer list includes <code>${origin}/*</code>.`;
  }
  if (status === 429) return '<h3>Google says the key is over its quota (HTTP 429)</h3>Check the Map Tiles API quotas in Google Cloud Console.';
  return `<h3>The 3D tiles couldn't load</h3>${esc(err?.message || err || 'Unknown error')}${detail ? `<p><code>${esc(detail)}</code></p>` : ''}`;
}

// ---------------------------------------------------------------------------
// Startup checks
// ---------------------------------------------------------------------------
const C = window.Cesium;
const key = ((window.LA3D && window.LA3D.googleMapsKey) || '').trim();

buildNav();

if (!C) {
  showPanel('loadErr', '<h3>CesiumJS didn\'t load</h3>The 3D engine is fetched from <code>cdn.jsdelivr.net</code>. Check your connection or any content blocker, then reload.');
} else if (!key) {
  showPanel('setup');
} else {
  start().catch((e) => { console.error(e); showPanel('loadErr', explainTilesError(e)); });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function start() {
  setStep('Starting the 3D engine…', 0.05);
  C.GoogleMaps.defaultApiKey = key;

  let viewer;
  try {
    viewer = new C.Viewer('viewer', {
      globe: false,
      baseLayer: false,
      skyAtmosphere: new C.SkyAtmosphere(),
      geocoder: false, timeline: false, animation: false, baseLayerPicker: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, shouldAnimate: false, msaaSamples: 4,
    });
  } catch (e) {
    showPanel('loadErr', `<h3>3D graphics aren't available</h3>This page needs WebGL 2. Try a current Chrome, Edge, Firefox or Safari, and check that hardware acceleration is on.<p><code>${esc(e.message || e)}</code></p>`);
    return;
  }
  window.viewer = viewer; // handy for debugging in the console

  const scene = viewer.scene;
  const camera = viewer.camera;
  scene.postProcessStages.fxaa.enabled = true;
  scene.fog.enabled = true;
  scene.atmosphere.dynamicLighting = C.DynamicAtmosphereLightingType.SUNLIGHT;
  scene.screenSpaceCameraController.minimumZoomDistance = 40;
  scene.screenSpaceCameraController.maximumZoomDistance = 150000;
  viewer.cesiumWidget.creditContainer.style.display = 'block';

  // ---- Grading shader for the photoreal tiles (golden hour + night) --------
  const shader = new C.CustomShader({
    uniforms: {
      u_golden: { type: C.UniformType.FLOAT, value: 1 },
      u_night: { type: C.UniformType.FLOAT, value: 0 },
    },
    fragmentShaderText: /* glsl */ `
      float la_hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 c0 = material.diffuse;
        vec3 c = c0;
        float lum = dot(c0, vec3(0.299, 0.587, 0.114));

        // Golden hour: warm, slightly richer, a touch of contrast.
        vec3 gold = c0 * vec3(1.20, 1.03, 0.82) + vec3(0.03, 0.012, 0.0);
        gold = mix(vec3(lum), gold, 1.15);
        c = mix(c, gold, u_golden);

        if (u_night > 0.001) {
          // Moonlit base.
          vec3 nightCol = c0 * vec3(0.085, 0.11, 0.19);

          // Lit windows on vertical, low-saturation (built) surfaces.
          vec3 pEC = fsInput.attributes.positionEC;
          vec3 nEC = normalize(cross(dFdx(pEC), dFdy(pEC)));
          vec3 upEC = normalize(czm_viewRotation * normalize(fsInput.attributes.positionWC));
          float vertical = 1.0 - smoothstep(0.22, 0.45, abs(dot(nEC, upEC)));
          float sat = max(c0.r, max(c0.g, c0.b)) - min(c0.r, min(c0.g, c0.b));
          float built = 1.0 - smoothstep(0.07, 0.17, sat);
          vec3 cell = floor(fsInput.attributes.positionMC / vec3(3.4, 3.1, 3.4));
          float r = la_hash(mod(cell, 4096.0));
          float lit = step(0.80, r) * vertical * built;
          vec3 warm = mix(vec3(1.0, 0.70, 0.36), vec3(0.80, 0.88, 1.0), step(0.95, r));
          nightCol += lit * warm * (0.35 + 0.35 * fract(r * 13.7));

          // Street-light glow on bright, flat surfaces (roads, plazas, roofs).
          float horiz = 1.0 - vertical;
          nightCol += horiz * smoothstep(0.42, 0.85, lum) * vec3(0.16, 0.10, 0.04);

          // From a distance, scattered sodium streetlights across built-up areas.
          float dist = length(pEC);
          vec3 sCell = floor(fsInput.attributes.positionMC / 22.0);
          float s = la_hash(mod(sCell, 4096.0) + 17.0);
          float street = step(0.86, s) * built * smoothstep(2500.0, 7000.0, dist);
          nightCol += street * vec3(1.0, 0.62, 0.25) * 0.55;

          c = mix(c, nightCol, u_night);
        }
        material.diffuse = c;
      }
    `,
  });

  // ---- Quality ------------------------------------------------------------
  const QUALITY = {
    high: { label: 'High', sse: 8, browserRes: false, scale: Math.min(1, 1.5 / (window.devicePixelRatio || 1)) },
    low: { label: 'Low', sse: 20, browserRes: true, scale: 1 },
  };
  let qualityName = 'high';
  try { qualityName = localStorage.getItem('la3d.quality') || (matchMedia('(pointer:coarse)').matches ? 'low' : 'high'); } catch { /* storage blocked */ }
  if (!QUALITY[qualityName]) qualityName = 'high';

  // ---- Tiles --------------------------------------------------------------
  setStep('Connecting to Google 3D Tiles…', 0.12);
  const tileset = await C.createGooglePhotorealistic3DTileset(
    { key, onlyUsingWithGoogleGeocoder: true },
    { maximumScreenSpaceError: QUALITY[qualityName].sse, showCreditsOnScreen: true },
  );
  tileset.customShader = shader;
  scene.primitives.add(tileset);

  function applyQuality() {
    const q = QUALITY[qualityName];
    tileset.maximumScreenSpaceError = q.sse;
    viewer.useBrowserRecommendedResolution = q.browserRes;
    viewer.resolutionScale = q.scale;
    $('quality').textContent = `Quality: ${q.label}`;
  }
  applyQuality();
  $('quality').addEventListener('click', () => {
    qualityName = qualityName === 'high' ? 'low' : 'high';
    try { localStorage.setItem('la3d.quality', qualityName); } catch { /* ignore */ }
    applyQuality();
  });

  let maxPending = 1;
  tileset.loadProgress.addEventListener((pending, processing) => {
    if (loaderHidden) return;
    const n = pending + processing;
    maxPending = Math.max(maxPending, n);
    setStep('Streaming the city…', 0.2 + 0.8 * (1 - n / maxPending));
  });
  tileset.initialTilesLoaded.addEventListener(() => setTimeout(hideLoader, 300));
  setTimeout(hideLoader, 25000);

  let failures = 0;
  tileset.tileFailed.addEventListener((e) => {
    failures++;
    console.warn('Tile failed', e.url, e.message);
    if (!loaderHidden && failures > 12) showPanel('loadErr', explainTilesError({ message: e.message }));
  });

  // ---- Traffic, wheel and night lights ---------------------------------------
  const traffic = createTraffic(viewer, ROUTES);

  // ---- Time of day --------------------------------------------------------
  const TOD = {
    day: { iso: '2026-06-21T19:30:00Z', golden: 0, night: 0, sky: [0, 0, 0] },
    golden: { iso: '2026-06-22T02:15:00Z', golden: 1, night: 0, sky: [0, 0.1, 0] },
    night: { iso: '2026-06-22T05:45:00Z', golden: 0, night: 1, sky: [0, 0, -0.55] },
  };
  const todState = { ...TOD.golden, t: C.JulianDate.toDate(C.JulianDate.fromIso8601(TOD.golden.iso)).getTime() };
  let todAnim = null;
  function applyTod(s) {
    viewer.clock.currentTime = C.JulianDate.fromDate(new Date(s.t));
    shader.setUniform('u_golden', s.golden);
    shader.setUniform('u_night', s.night);
    const sa = scene.skyAtmosphere;
    [sa.hueShift, sa.saturationShift, sa.brightnessShift] = s.sky;
    traffic.setNight(s.night);
  }
  function setTimeOfDay(name, instant = false) {
    const target = TOD[name];
    if (!target) return;
    document.querySelectorAll('#tod .pillbtn').forEach((b) => b.classList.toggle('active', b.dataset.tod === name));
    const to = { ...target, t: C.JulianDate.toDate(C.JulianDate.fromIso8601(target.iso)).getTime() };
    if (instant) { Object.assign(todState, to); applyTod(todState); todAnim = null; return; }
    todAnim = { from: { ...todState, sky: [...todState.sky] }, to, t: 0, dur: 2.4 };
  }
  function stepTod(dt) {
    if (!todAnim) return;
    todAnim.t = Math.min(1, todAnim.t + dt / todAnim.dur);
    const k = todAnim.t < 0.5 ? 2 * todAnim.t * todAnim.t : 1 - Math.pow(-2 * todAnim.t + 2, 2) / 2;
    const { from, to } = todAnim;
    const lerp = (a, b) => a + (b - a) * k;
    todState.t = lerp(from.t, to.t);
    todState.golden = lerp(from.golden, to.golden);
    todState.night = lerp(from.night, to.night);
    todState.sky = from.sky.map((v, i) => lerp(v, to.sky[i]));
    applyTod(todState);
    if (todAnim.t >= 1) todAnim = null;
  }
  document.querySelectorAll('#tod .pillbtn').forEach((b) => b.addEventListener('click', () => setTimeOfDay(b.dataset.tod)));
  let startTod = 'golden';
  try { startTod = localStorage.getItem('la3d.tod') || 'golden'; } catch { /* ignore */ }
  document.querySelectorAll('#tod .pillbtn').forEach((b) => b.addEventListener('click', () => {
    try { localStorage.setItem('la3d.tod', b.dataset.tod); } catch { /* ignore */ }
  }));
  setTimeOfDay(TOD[startTod] ? startTod : 'golden', true);

  // ---- Camera: fly-to and orbit --------------------------------------------
  let orbit = null;
  let flightResolve = null;

  const center = (lm) => C.Cartesian3.fromDegrees(lm.lon, lm.lat, lm.h);
  const hpr = (lm) => new C.HeadingPitchRange(C.Math.toRadians(lm.heading), C.Math.toRadians(lm.pitch), lm.range);

  function stopOrbit() {
    if (orbit) { orbit = null; camera.lookAtTransform(C.Matrix4.IDENTITY); }
  }
  function startOrbit(lm) {
    camera.lookAt(center(lm), hpr(lm));
    orbit = { rate: (Math.PI * 2) / (lm.id === 'overview' ? 400 : 150), paused: false };
  }
  function cancelFlight() {
    camera.cancelFlight();
    if (flightResolve) { const r = flightResolve; flightResolve = null; r(false); }
  }

  function flyTo(id, { duration = 4.5, orbit: doOrbit = true, fromTour = false } = {}) {
    const lm = byId[id];
    if (!lm) return Promise.resolve(false);
    if (!fromTour && tour.running) tour.stop();
    cancelFlight();
    stopOrbit();
    setActive(id);
    showCard(lm);
    try { history.replaceState(null, '', id === 'overview' ? location.pathname + location.search : `#${id}`); } catch { /* ignore */ }

    return new Promise((resolve) => {
      flightResolve = resolve;
      const dist = C.Cartesian3.distance(camera.positionWC, center(lm));
      camera.flyToBoundingSphere(new C.BoundingSphere(center(lm), 0), {
        offset: hpr(lm),
        duration,
        maximumHeight: Math.max(lm.range * 1.2, Math.min(9000, dist * 0.45)),
        easingFunction: C.EasingFunction.QUADRATIC_IN_OUT,
        complete: () => {
          if (flightResolve !== resolve) return;
          flightResolve = null;
          if (doOrbit) startOrbit(lm);
          resolve(true);
        },
        cancel: () => {
          if (flightResolve !== resolve) return;
          flightResolve = null;
          resolve(false);
        },
      });
    });
  }

  const app = {
    flyTo,
    cancelFlight,
    setOrbitPaused(p) { if (orbit) orbit.paused = p; },
  };
  const tour = createTour(app);
  $('tourBtn').addEventListener('click', () => (tour.running ? tour.stop() : tour.start()));

  // Any direct camera input takes over from the tour, flights and orbit.
  const takeOver = () => { if (tour.running) tour.stop(); cancelFlight(); stopOrbit(); };
  ['pointerdown', 'wheel', 'touchstart'].forEach((ev) => viewer.canvas.addEventListener(ev, takeOver, { passive: true }));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') takeOver(); });

  // ---- Nav, card, labels ----------------------------------------------------
  document.querySelectorAll('#nav .pillbtn').forEach((b) => b.addEventListener('click', () => flyTo(b.dataset.id)));
  $('card').querySelector('.close').addEventListener('click', () => $('card').classList.add('hide'));

  const labelsEl = $('labels');
  const labels = LANDMARKS.filter((l) => l.label !== false).map((lm) => {
    const el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = `<i></i>${esc(lm.name)}`;
    el.addEventListener('click', () => flyTo(lm.id));
    labelsEl.appendChild(el);
    return { lm, el, pos: C.Cartesian3.fromDegrees(lm.lon, lm.lat, lm.h + (lm.labelLift || 60)), w: 0, h: 0, shown: false };
  });
  const win = new C.Cartesian2();
  const toPt = new C.Cartesian3();
  function updateLabels() {
    const cw = viewer.canvas.clientWidth, ch = viewer.canvas.clientHeight;
    const placed = [];   // screen rects already used; earlier landmarks win overlaps
    for (const L of labels) {
      C.Cartesian3.subtract(L.pos, camera.positionWC, toPt);
      const d = C.Cartesian3.magnitude(toPt);
      let show = d < 48000 && d > 120 && C.Cartesian3.dot(toPt, camera.directionWC) > 0;
      if (show) {
        const p = C.SceneTransforms.worldToWindowCoordinates(scene, L.pos, win);
        if (!p) show = false;
        else {
          if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
          const x = p.x - L.w / 2, y = p.y - L.h - 8;
          show = x > -L.w && x < cw && y > -L.h && y < ch &&
            !placed.some((r) => x < r.x + r.w + 4 && x + L.w + 4 > r.x && y < r.y + r.h + 2 && y + L.h + 2 > r.y);
          if (show) placed.push({ x, y, w: L.w, h: L.h });
          if (show) L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }
      if (show !== L.shown) { L.shown = show; L.el.classList.toggle('show', show); }
    }
  }

  // ---- Frame loop --------------------------------------------------------------
  let last = performance.now();
  scene.preRender.addEventListener(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    stepTod(dt);
    if (orbit && !orbit.paused) camera.rotateRight(orbit.rate * dt);
    tour.update(dt);
    traffic.update(dt, now / 1000, camera);
  });
  scene.postRender.addEventListener(updateLabels);

  // ---- Initial view and deep links --------------------------------------------
  const hashId = () => decodeURIComponent(location.hash.replace('#', ''));
  const initial = byId[hashId()] ? hashId() : 'overview';
  camera.setView({ destination: C.Cartesian3.fromDegrees(-118.62, 33.86, 14000), orientation: { heading: C.Math.toRadians(45), pitch: C.Math.toRadians(-25), roll: 0 } });
  flyTo('overview', { duration: 0 }).then(() => { if (initial !== 'overview') flyTo(initial, { duration: 5 }); });
  window.addEventListener('hashchange', () => { const id = hashId(); if (byId[id] && id !== activeId) flyTo(id); });

  if (params.has('bake')) bakeHeights(viewer, traffic).catch((e) => console.error('Bake failed', e));
}

// ---------------------------------------------------------------------------
// UI helpers (no Cesium needed)
// ---------------------------------------------------------------------------
let activeId = null;
function buildNav() {
  const nav = $('nav');
  nav.innerHTML = LANDMARKS.map((l) => `<button class="pillbtn" data-id="${l.id}">${esc(l.short || l.name)}</button>`).join('');
}
function setActive(id) {
  activeId = id;
  document.querySelectorAll('#nav .pillbtn').forEach((b) => {
    const on = b.dataset.id === id;
    b.classList.toggle('active', on);
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
}
function showCard(lm) {
  $('cardKicker').textContent = lm.kicker;
  $('cardTitle').textContent = lm.name;
  $('cardText').textContent = lm.text;
  $('card').classList.remove('hide');
}

// ---------------------------------------------------------------------------
// ?bake : sample the real 3D-tile surface under every freeway point and offer an
// updated routes.js, so cars sit exactly on the roads. Development use only.
// ---------------------------------------------------------------------------
async function bakeHeights(viewer, traffic) {
  const C = window.Cesium;
  const box = document.createElement('div');
  box.className = 'glass';
  box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:18px 22px;z-index:40;font-size:13px;max-width:420px';
  document.body.appendChild(box);
  const say = (h) => { box.innerHTML = `<b>Baking freeway heights</b><br>${h}`; };

  const all = [];
  ROUTES.forEach((r, ri) => { for (let i = 0; i < r.pts.length; i += 3) all.push({ ri, i, carto: C.Cartographic.fromDegrees(r.pts[i], r.pts[i + 1]) }); });
  const out = ROUTES.map((r) => ({ ...r, pts: r.pts.slice() }));
  let changed = 0;
  const BATCH = 60;
  // Hide our own points while sampling so the rays only hit the city surface.
  traffic.primitives.forEach((p) => { p.show = false; });
  for (let k = 0; k < all.length; k += BATCH) {
    say(`${k} / ${all.length} points…`);
    const chunk = all.slice(k, k + BATCH);
    const cartos = chunk.map((p) => p.carto.clone());
    try {
      await viewer.scene.sampleHeightMostDetailed(cartos);
    } catch (e) { console.warn('sample failed', e); continue; }
    cartos.forEach((c, j) => {
      const p = chunk[j];
      const old = out[p.ri].pts[p.i + 2];
      if (c && Number.isFinite(c.height) && Math.abs(c.height - old) < 45) { out[p.ri].pts[p.i + 2] = Math.round(c.height * 10) / 10; changed++; }
    });
  }
  traffic.primitives.forEach((p) => { p.show = true; });
  // Remove single-point spikes (overhead signs, bridges, trees) with a 5-point median.
  for (const r of out) {
    const h = r.pts.filter((_, i) => i % 3 === 2);
    h.forEach((v, i) => {
      const w = h.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b);
      const med = w[Math.floor(w.length / 2)];
      if (Math.abs(v - med) > 4) r.pts[i * 3 + 2] = med;
    });
  }
  const lines = out.map((r) => `  { key: '${r.key}', label: '${r.label}', length: ${r.length}, pts: [${r.pts.map((v, i) => (i % 3 === 2 ? v.toFixed(1) : v.toFixed(5))).join(',')}] },`);
  const text = `// Generated by tools/build-routes.ps1, heights refined with ?bake against Google 3D Tiles.\n// Freeway geometry (c) OpenStreetMap contributors (ODbL).\n// pts = flat [lon, lat, ellipsoidHeight, ...]. Each route is one direction of travel.\nexport const ROUTES = [\n${lines.join('\n')}\n];\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  say(`Updated ${changed} of ${all.length} heights.<br><a href="${url}" download="routes.js" style="color:#ffd39a">Download routes.js</a> and replace <code>la-3d/routes.js</code>.`);
}
