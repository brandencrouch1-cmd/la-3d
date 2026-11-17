// Moving freeway traffic, boats in the bay, the Ferris wheel and other night lights.
// Everything is drawn with Cesium PointPrimitives, so it costs almost nothing per frame.
import { GEOID, FERRIS_WHEEL, NIGHT_LIGHTS } from './landmarks.js';

const C = window.Cesium;
const LIFT = 2.5;             // meters above the road surface
const CAR_SPACING = 210;      // average meters between cars per direction
const MAX_CARS_PER_ROUTE = 140;

const DAY_PAINT = ['#f4f4f2', '#d9dadc', '#9ea3a8', '#2b2d31', '#5d6066', '#8a1d1d', '#1f3a66', '#c7c2b5'];
const HEAD = C.Color.fromCssColorString('#fff3d6');
const TAIL = C.Color.fromCssColorString('#ff3b2f');

// Small boat lanes in Santa Monica Bay: [lon, lat] waypoints, traversed back and forth.
const BOAT_LANES = [
  [[-118.4560, 33.9770], [-118.4700, 33.9700], [-118.5050, 33.9660], [-118.5600, 33.9700]],   // Marina del Rey channel out to sea
  [[-118.5050, 34.0040], [-118.5250, 34.0000], [-118.5550, 33.9900]],                        // off the pier
  [[-118.5300, 34.0290], [-118.5700, 34.0200], [-118.6200, 34.0120]],                        // along the Palisades
  [[-118.4300, 33.9500], [-118.4700, 33.9350], [-118.5300, 33.9300]],                        // off Playa del Rey
];

const scratch = new C.Cartesian3();
const scratch2 = new C.Cartesian3();

function buildPath(positions) {
  const n = positions.length;
  const cum = new Float64Array(n);
  const right = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i > 0) cum[i] = cum[i - 1] + C.Cartesian3.distance(positions[i - 1], positions[i]);
    const a = positions[Math.max(0, i - 1)], b = positions[Math.min(n - 1, i + 1)];
    const dir = C.Cartesian3.normalize(C.Cartesian3.subtract(b, a, new C.Cartesian3()), new C.Cartesian3());
    const up = C.Cartesian3.normalize(positions[i], new C.Cartesian3());
    right[i] = C.Cartesian3.normalize(C.Cartesian3.cross(dir, up, new C.Cartesian3()), new C.Cartesian3());
    if (!isFinite(right[i].x)) right[i] = new C.Cartesian3(0, 0, 0);
  }
  return { positions, cum, right, length: cum[n - 1] };
}

// Position at distance s along the path, shifted sideways by `offset` meters. Updates agent.seg.
function placeOnPath(path, agent, s, offset, result) {
  const { positions, cum } = path;
  let i = agent.seg;
  if (s < cum[i]) i = 0;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  agent.seg = i;
  const span = cum[i + 1] - cum[i] || 1;
  const t = (s - cum[i]) / span;
  C.Cartesian3.lerp(positions[i], positions[i + 1], t, result);
  if (offset) C.Cartesian3.add(result, C.Cartesian3.multiplyByScalar(path.right[i], offset, scratch2), result);
  return i;
}

export function createTraffic(viewer, routes) {
  const scene = viewer.scene;
  const collection = scene.primitives.add(new C.PointPrimitiveCollection());
  const glow = scene.primitives.add(new C.BillboardCollection());       // soft halos behind night lights
  const glowImage = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return cv;
  })();

  const near = new C.NearFarScalar(400, 1.7, 30000, 0.55);
  const fade = new C.NearFarScalar(20000, 1.0, 60000, 0.0);

  // --- Cars ---------------------------------------------------------------
  const cars = [];
  const paths = routes.map((r) => {
    const pos = [];
    for (let i = 0; i < r.pts.length; i += 3) pos.push(C.Cartesian3.fromDegrees(r.pts[i], r.pts[i + 1], r.pts[i + 2] + LIFT));
    return buildPath(pos);
  });
  paths.forEach((path) => {
    const count = Math.min(MAX_CARS_PER_ROUTE, Math.floor(path.length / CAR_SPACING));
    for (let k = 0; k < count; k++) {
      const car = {
        path, seg: 0,
        s: Math.random() * path.length,
        speed: 48 + Math.random() * 30,         // m/s (sped up so motion reads from the air)
        lane: (Math.floor(Math.random() * 4) - 1.5) * 3.6,
        paint: C.Color.fromCssColorString(DAY_PAINT[Math.floor(Math.random() * DAY_PAINT.length)]),
        away: null,
      };
      car.point = collection.add({ position: path.positions[0], pixelSize: 3, color: car.paint, scaleByDistance: near, translucencyByDistance: fade });
      cars.push(car);
    }
  });

  // --- Boats --------------------------------------------------------------
  const boats = [];
  BOAT_LANES.forEach((lane, li) => {
    const path = buildPath(lane.map(([lon, lat]) => C.Cartesian3.fromDegrees(lon, lat, GEOID + 1.5)));
    for (let k = 0; k < 2; k++) {
      const boat = { path, seg: 0, s: Math.random() * path.length, dir: k % 2 ? 1 : -1, speed: 7 + Math.random() * 5 };
      boat.point = collection.add({ position: path.positions[0], pixelSize: 4, color: C.Color.WHITE, scaleByDistance: near, translucencyByDistance: fade });
      boat.wake = collection.add({ position: path.positions[0], pixelSize: 3, color: C.Color.WHITE.withAlpha(0.35), scaleByDistance: near, translucencyByDistance: fade });
      boats.push(boat);
    }
  });

  // --- Ferris wheel ring ---------------------------------------------------
  const wheel = [];
  {
    const { lon, lat, h, radius, azimuth } = FERRIS_WHEEL;
    const center = C.Cartesian3.fromDegrees(lon, lat, h + radius + 3);
    const enu = C.Transforms.eastNorthUpToFixedFrame(center);
    const az = C.Math.toRadians(azimuth);
    const N = 30;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const local = new C.Cartesian3(Math.sin(az) * radius * Math.cos(t), Math.cos(az) * radius * Math.cos(t), radius * Math.sin(t));
      const p = C.Matrix4.multiplyByPoint(enu, local, new C.Cartesian3());
      wheel.push(collection.add({ position: p, pixelSize: 5, color: C.Color.WHITE, show: false, scaleByDistance: near }));
    }
    wheel.hub = collection.add({ position: center, pixelSize: 6, color: C.Color.WHITE, show: false, scaleByDistance: near });
  }

  // --- Static night lights -------------------------------------------------
  const lights = NIGHT_LIGHTS.map((l) => {
    const position = C.Cartesian3.fromDegrees(l.lon, l.lat, l.h);
    const color = C.Color.fromCssColorString(l.color);
    return {
      color,
      core: collection.add({ position, pixelSize: l.size * 0.55, color, show: false, scaleByDistance: near }),
      halo: glow.add({ position, image: glowImage, width: l.size * 4.5, height: l.size * 4.5, color: color.withAlpha(0.8), show: false, scaleByDistance: near }),
    };
  });

  let night = 0;
  let lastNightApplied = -1;

  function applyNight() {
    const on = night > 0.02;
    for (const car of cars) {
      car.point.pixelSize = 3 + night * 2.2;
      car.away = null; // force color refresh
    }
    for (const b of boats) {
      b.point.color = night > 0.5 ? C.Color.fromCssColorString('#fff1c9') : C.Color.WHITE;
      b.point.pixelSize = 4 + night * 1.5;
    }
    for (const p of wheel) p.show = on;
    wheel.hub.show = on;
    for (const l of lights) {
      l.core.show = on; l.halo.show = on;
      l.core.color = l.color.withAlpha(Math.min(1, night * 1.3));
      l.halo.color = l.color.withAlpha(0.8 * night);
    }
    lastNightApplied = night;
  }

  function update(dt, timeSeconds, camera) {
    if (night !== lastNightApplied) applyNight();
    dt = Math.min(dt, 0.1);
    const camDir = camera.directionWC;

    for (const car of cars) {
      const path = car.path;
      car.s += car.speed * dt;
      if (car.s >= path.length) { car.s -= path.length; car.seg = 0; }
      const i = placeOnPath(path, car, car.s, car.lane, scratch);
      car.point.position = scratch;
      if (night > 0.02) {
        const segDir = C.Cartesian3.subtract(path.positions[i + 1], path.positions[i], scratch2);
        const away = C.Cartesian3.dot(segDir, camDir) > 0;
        if (away !== car.away) {
          car.away = away;
          car.point.color = (away ? TAIL : HEAD).withAlpha(0.95);
        }
      } else if (car.away !== 'day') {
        car.away = 'day';
        car.point.color = car.paint;
      }
    }

    for (const b of boats) {
      b.s += b.speed * dt * b.dir;
      if (b.s > b.path.length) { b.s = b.path.length; b.dir = -1; }
      if (b.s < 0) { b.s = 0; b.dir = 1; }
      placeOnPath(b.path, b, b.s, 0, scratch);
      b.point.position = scratch;
      const ws = Math.max(0, Math.min(b.path.length, b.s - b.dir * 18));
      const tmp = { seg: 0 };
      placeOnPath(b.path, tmp, ws, 0, scratch);
      b.wake.position = scratch;
    }

    if (night > 0.02) {
      const n = wheel.length;
      for (let k = 0; k < n; k++) {
        const hue = ((k / n) + timeSeconds * 0.12) % 1;
        wheel[k].color = C.Color.fromHsl(hue, 0.9, 0.62, Math.min(1, night * 1.3));
      }
      wheel.hub.color = C.Color.WHITE.withAlpha(night);
    }
  }

  return {
    update,
    setNight(v) { night = v; },
    primitives: [collection, glow],
    paths,
  };
}
