import './styles.css';

document.documentElement.setAttribute('data-reveal-ready', '');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

function revealAll(): void {
  revealEls.forEach((el) => el.classList.add('is-in'));
}

if ('IntersectionObserver' in window && !reduceMotion.matches) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );

  revealEls.forEach((el) => revealObserver.observe(el));
} else {
  revealAll();
}

const progressBar = document.getElementById('progress-bar');
const sections = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'));
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.desktop-nav a'));
let ticking = false;

function updateScrollState(): void {
  ticking = false;
  const docEl = document.documentElement;
  const max = docEl.scrollHeight - window.innerHeight;

  if (progressBar) {
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    progressBar.style.transform = `scaleX(${ratio})`;
  }

  let currentId = '';
  const threshold = window.innerHeight * 0.35;
  sections.forEach((section) => {
    if (section.getBoundingClientRect().top <= threshold) currentId = section.id;
  });
  navLinks.forEach((link) => {
    link.classList.toggle('is-active', link.getAttribute('href') === `#${currentId}`);
  });
}

function onScroll(): void {
  if (!ticking) {
    ticking = true;
    window.requestAnimationFrame(updateScrollState);
  }
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll, { passive: true });
updateScrollState();

const mobileMenu = document.querySelector<HTMLDetailsElement>('.mobile-menu');
if (mobileMenu) {
  mobileMenu.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
    link.addEventListener('click', () => mobileMenu.removeAttribute('open'));
  });
  document.addEventListener('click', (event) => {
    if (
      mobileMenu.open &&
      event.target instanceof Node &&
      !mobileMenu.contains(event.target)
    ) {
      mobileMenu.removeAttribute('open');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileMenu.open) mobileMenu.removeAttribute('open');
  });
}

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'));

function activateTab(index: number, focus: boolean): void {
  tabs.forEach((tab, i) => {
    const selected = i === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    const panel = panels[i];
    if (panel) panel.hidden = !selected;
  });
  if (focus) tabs[index]?.focus();
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => activateTab(i, false));
  tab.addEventListener('keydown', (event) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      event.preventDefault();
      activateTab(next, true);
    }
  });
});

interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  speed: number;
  hue: number;
}

function initField(): void {
  const canvasEl = document.getElementById('latent-field') as HTMLCanvasElement | null;
  if (!canvasEl) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const rawCtx = canvas.getContext('2d');
  if (!rawCtx) return;
  const ctx: CanvasRenderingContext2D = rawCtx;

  const COLORS = ['rgba(26,24,21,', 'rgba(166,59,42,', 'rgba(111,103,92,'];
  let width = 0;
  let height = 0;
  let particles: Particle[] = [];
  let rafId: number | null = null;
  let lastFrame = 0;
  let inView = true;
  let resizeTimer: number | undefined;

  function spawn(): Particle {
    const roll = Math.random();
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      px: 0,
      py: 0,
      speed: 0.18 + Math.random() * 0.42,
      hue: roll < 0.08 ? 1 : roll < 0.36 ? 2 : 0,
    };
  }

  function resetParticles(): void {
    const count = Math.max(140, Math.min(620, Math.round((width * height) / 1400)));
    particles = [];
    for (let i = 0; i < count; i += 1) {
      const p = spawn();
      p.px = p.x;
      p.py = p.y;
      particles.push(p);
    }
  }

  function angleAt(x: number, y: number, t: number): number {
    return (
      Math.sin(x * 0.0021 + t * 0.27) * 1.35 +
      Math.cos(y * 0.0024 - t * 0.19) * 1.1 +
      Math.sin((x + y) * 0.0011 + t * 0.11) * 1.2
    );
  }

  function paintBackground(): void {
    ctx.fillStyle = '#f4efe6';
    ctx.fillRect(0, 0, width, height);
  }

  function drawStatic(): void {
    paintBackground();
    particles.forEach((p) => {
      const a = angleAt(p.x, p.y, 2.4);
      const len = 7 + Math.random() * 13;
      ctx.strokeStyle = `${COLORS[p.hue]}0.28)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
      ctx.stroke();
    });
  }

  function step(time: number): void {
    ctx.fillStyle = 'rgba(244, 239, 230, 0.08)';
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = 'round';

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p) continue;
      const a = angleAt(p.x, p.y, time);
      p.px = p.x;
      p.py = p.y;
      p.x += Math.cos(a) * p.speed;
      p.y += Math.sin(a) * p.speed;

      const out = p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20;
      if (out || Math.random() < 0.0012) {
        const fresh = spawn();
        p.x = fresh.x;
        p.y = fresh.y;
        p.px = fresh.x;
        p.py = fresh.y;
        p.hue = fresh.hue;
        p.speed = fresh.speed;
        continue;
      }

      ctx.strokeStyle = `${COLORS[p.hue]}0.32)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      if (Math.random() < 0.012) {
        ctx.fillStyle = `${COLORS[p.hue]}0.7)`;
        ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
      }
    }
  }

  function loop(now: number): void {
    rafId = window.requestAnimationFrame(loop);
    if (now - lastFrame < 33) return;
    lastFrame = now;
    step(now / 1000);
  }

  function start(): void {
    if (rafId !== null || reduceMotion.matches || !inView || document.hidden) return;
    lastFrame = 0;
    rafId = window.requestAnimationFrame(loop);
  }

  function stop(): void {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resetParticles();
    paintBackground();
    if (reduceMotion.matches) drawStatic();
    else step(performance.now() / 1000);
  }

  function onResize(): void {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  }

  resize();
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(onResize).observe(canvas);
  } else {
    window.addEventListener('resize', onResize);
  }

  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          inView = entry.isIntersecting;
          if (inView) start();
          else stop();
        });
      },
      { threshold: 0.02 },
    ).observe(canvas);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      stop();
      drawStatic();
    } else {
      start();
    }
  });
}

interface Point {
  x: number;
  y: number;
}

interface Start extends Point {
  vx: number;
  vy: number;
}

function initSandbox(): void {
  const canvasEl = document.getElementById('horizon-canvas') as HTMLCanvasElement | null;
  const sliderEl = document.getElementById('horizon') as HTMLInputElement | null;
  const horizonEl = document.getElementById('horizon-value') as HTMLOutputElement | null;
  const errorEl = document.getElementById('error-value') as HTMLElement | null;
  const statusEl = document.getElementById('error-status') as HTMLElement | null;
  const resetEl = document.getElementById('reset-sim') as HTMLButtonElement | null;
  if (!canvasEl || !sliderEl || !horizonEl || !errorEl || !statusEl || !resetEl) return;

  const canvas: HTMLCanvasElement = canvasEl;
  const slider: HTMLInputElement = sliderEl;
  const horizonOut: HTMLOutputElement = horizonEl;
  const errorOut: HTMLElement = errorEl;
  const statusOut: HTMLElement = statusEl;
  const resetBtn: HTMLButtonElement = resetEl;
  const rawCtx = canvas.getContext('2d');
  if (!rawCtx) return;
  const ctx: CanvasRenderingContext2D = rawCtx;

  const MAX_STEPS = 360;
  const TRUE_AY = 0.0000105;
  const MODEL_AY = 0.00001176;
  const MODEL_VX_SCALE = 1.002;
  const MONO = '10px "SF Mono", Menlo, Consolas, monospace';
  const TAU = Math.PI * 2;

  let width = 0;
  let height = 0;
  let truthPath: Point[] = [];
  let predPath: Point[] = [];
  let rafId: number | null = null;
  let inView = true;
  let resizeTimer: number | undefined;

  function randomStart(): Start {
    const dir = Math.random() < 0.5 ? 1 : -1;
    return {
      x: dir === 1 ? 0.1 + Math.random() * 0.06 : 0.84 + Math.random() * 0.06,
      y: 0.14 + Math.random() * 0.04,
      vx: dir * (0.0018 + Math.random() * 0.00035),
      vy: -0.0009 + Math.random() * 0.0005,
    };
  }

  function simulate(start: Start, ay: number, steps: number): Point[] {
    let { x, y } = start;
    let { vx, vy } = start;
    const out: Point[] = [];

    for (let i = 0; i < steps; i += 1) {
      vy += ay;
      x += vx;
      y += vy;
      out.push({ x, y });
    }
    return out;
  }

  function updateReadout(): void {
    const n = Math.max(1, Math.min(MAX_STEPS, Number(slider.value) || 120));
    const idx = Math.min(truthPath.length, predPath.length, n) - 1;
    const a = truthPath[idx];
    const b = predPath[idx];
    const err = a && b ? (Math.hypot(a.x - b.x, a.y - b.y) / Math.SQRT2) * 100 : 0;

    errorOut.textContent = `${err.toFixed(1)}%`;
    horizonOut.textContent = `${(n / 60).toFixed(1)} s`;

    let state = 'ok';
    let label = '轨迹吻合';
    if (err >= 3) {
      state = 'diverge';
      label = '显著偏离';
    } else if (err >= 0.8) {
      state = 'drift';
      label = '开始漂移';
    }
    statusOut.dataset.state = state;
    errorOut.dataset.state = state;
    statusOut.textContent = label;
  }

  function layout(): void {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(now: number): void {
    if (!width || !height) return;

    const pad = Math.min(36, Math.max(16, Math.min(width, height) * 0.085));
    const boxX = pad;
    const boxY = pad;
    const boxW = width - pad * 2;
    const boxH = height - pad * 2;
    if (boxW <= 0 || boxH <= 0) return;

    const ballR = Math.max(3.5, Math.min(boxW, boxH) * 0.014);
    const horizon = Math.max(1, Math.min(MAX_STEPS, Number(slider.value) || 120));

    function px(p: Point): number {
      return boxX + p.x * boxW;
    }
    function py(p: Point): number {
      return boxY + p.y * boxH;
    }

    function strokePath(points: Point[], color: string, lineWidth: number): void {
      if (!points.length) return;
      ctx.beginPath();
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        if (!point) continue;
        const X = px(point);
        const Y = py(point);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(26,24,21,0.055)';
    ctx.lineWidth = 1;
    for (let gi = 1; gi < 8; gi += 1) {
      const gx = boxX + (boxW * gi) / 8;
      ctx.beginPath();
      ctx.moveTo(gx, boxY);
      ctx.lineTo(gx, boxY + boxH);
      ctx.stroke();
    }
    for (let gj = 1; gj < 6; gj += 1) {
      const gy = boxY + (boxH * gj) / 6;
      ctx.beginPath();
      ctx.moveTo(boxX, gy);
      ctx.lineTo(boxX + boxW, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(26,24,21,0.22)';
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    strokePath(truthPath, 'rgba(26,24,21,0.14)', 1);
    strokePath(truthPath.slice(0, horizon), 'rgba(26,24,21,0.88)', 1.5);

    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -(now * 0.02);
    strokePath(predPath.slice(0, horizon), 'rgba(166,59,42,0.92)', 1.5);
    ctx.restore();

    const origin = truthPath[0];
    if (origin) {
      ctx.beginPath();
      ctx.arc(px(origin), py(origin), 2.5, 0, TAU);
      ctx.fillStyle = 'rgba(26,24,21,0.55)';
      ctx.fill();
      ctx.font = MONO;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(26,24,21,0.45)';
      ctx.fillText('T+0', Math.min(width - 28, px(origin) + 10), Math.max(12, py(origin) - 10));
    }

    const tEnd = truthPath[horizon - 1];
    const pEnd = predPath[horizon - 1];

    if (tEnd && pEnd) {
      const tx = px(tEnd);
      const ty = py(tEnd);
      const ex = px(pEnd);
      const ey = py(pEnd);

      ctx.save();
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(26,24,21,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(tx, ty, ballR + 2, 0, TAU);
      ctx.fillStyle = '#f4efe6';
      ctx.strokeStyle = 'rgba(26,24,21,0.9)';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ex, ey, ballR, 0, TAU);
      ctx.fillStyle = '#a63b2a';
      ctx.fill();

      ctx.font = MONO;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(26,24,21,0.5)';
      const label = `T+${(horizon / 60).toFixed(1)}s`;
      const labelX = Math.min(width - 54, Math.max(4, tx + 12));
      const labelY = Math.min(height - 10, Math.max(12, ty - 12));
      ctx.fillText(label, labelX, labelY);
    }
  }

  function loop(now: number): void {
    draw(now);
    rafId = window.requestAnimationFrame(loop);
  }

  function start(): void {
    if (rafId !== null || !inView || document.hidden) return;
    if (reduceMotion.matches) {
      draw(performance.now());
      return;
    }
    rafId = window.requestAnimationFrame(loop);
  }

  function stop(): void {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function rebuild(): void {
    const start = randomStart();
    truthPath = simulate(start, TRUE_AY, MAX_STEPS);
    predPath = simulate(
      {
        x: start.x,
        y: start.y,
        vx: start.vx * MODEL_VX_SCALE,
        vy: start.vy,
      },
      MODEL_AY,
      MAX_STEPS,
    );
    updateReadout();
    draw(performance.now());
  }

  function onResize(): void {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      layout();
      draw(performance.now());
    }, 120);
  }

  slider.addEventListener('input', () => {
    updateReadout();
    if (rafId === null) draw(performance.now());
  });

  resetBtn.addEventListener('click', () => {
    rebuild();
  });

  layout();
  rebuild();

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(onResize).observe(canvas);
  } else {
    window.addEventListener('resize', onResize);
  }

  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          inView = entry.isIntersecting;
          if (inView) start();
          else stop();
        });
      },
      { threshold: 0.02 },
    ).observe(canvas);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      stop();
      draw(performance.now());
    } else {
      start();
    }
  });
}

initField();
initSandbox();
