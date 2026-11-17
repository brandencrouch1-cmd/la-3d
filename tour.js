// Guided flyover: flies stop to stop, orbiting at each one. Pause, Next, Exit, or any
// camera input cancels it.
import { TOUR, LANDMARKS } from './landmarks.js';

export function createTour(app) {
  const bar = document.getElementById('tourBar');
  const stopEl = document.getElementById('tourStop');
  const prog = document.querySelector('#tourProg div');
  const pauseBtn = document.getElementById('tourPause');

  let running = false, paused = false, index = -1, dwellLeft = 0, phase = 'idle', token = 0;

  function setUI() {
    bar.classList.toggle('hide', !running);
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    if (index >= 0) {
      const lm = LANDMARKS.find((l) => l.id === TOUR[index].id);
      stopEl.textContent = lm.name;
      prog.style.width = `${((index + 1) / TOUR.length) * 100}%`;
    }
  }

  async function goto(i) {
    const my = ++token;
    index = i;
    if (index >= TOUR.length) { stop(); return; }
    phase = 'flying';
    setUI();
    const step = TOUR[index];
    const first = index === 0;
    const ok = await app.flyTo(step.id, { duration: first ? 3 : 6.5, fromTour: true, orbit: true });
    if (my !== token || !running) return;
    if (!ok) { stop(); return; }
    phase = 'dwell';
    dwellLeft = step.dwell;
  }

  function start() {
    if (running) return;
    running = true; paused = false;
    goto(0);
  }

  function stop() {
    if (!running) return;
    running = false; paused = false; phase = 'idle'; token++;
    app.cancelFlight();
    setUI();
  }

  function next() { if (running) { paused = false; app.cancelFlight(); goto(index + 1); } }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    app.setOrbitPaused(paused);
    setUI();
  }

  function update(dt) {
    if (!running || paused || phase !== 'dwell') return;
    dwellLeft -= dt;
    if (dwellLeft <= 0) { phase = 'flying'; goto(index + 1); }
  }

  pauseBtn.addEventListener('click', togglePause);
  document.getElementById('tourNext').addEventListener('click', next);
  document.getElementById('tourExit').addEventListener('click', stop);

  return { start, stop, update, get running() { return running; } };
}
