// Плавные SVG-графики без библиотек
const PALETTE = ['#15803d', '#0f766e', '#65a30d', '#22a35a', '#047857', '#4d7c0f', '#14532d', '#2dd4bf'];
const NS = 'http://www.w3.org/2000/svg';
const fmt = (n) => n == null || isNaN(n) ? '—' : (Math.round(n * 10) / 10).toLocaleString('ru-RU');
let _gid = 0;

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
// Монотонная кубическая кривая (без «выбросов» над точками)
function smoothPath(pts) {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0]},${pts[0][1]}` : '';
  const dx = [], dy = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / (dx[i] || 1); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}
function animateStroke(path, ms = 900) {
  requestAnimationFrame(() => {
    const L = path.getTotalLength ? path.getTotalLength() : 1000;
    path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(.4,0,.2,1)`;
    path.style.strokeDashoffset = 0;
    setTimeout(() => { if (path.dataset.dash) path.style.strokeDasharray = path.dataset.dash; else path.style.strokeDasharray = 'none'; }, ms + 50);
  });
}

// Плавный график с заливкой. series: [{name, values[], color, dashed}]
function smoothChart(box, labels, series, opts = {}) {
  box.innerHTML = '';
  const W = opts.w || 900, H = opts.h || 300, L = 52, R = 16, T = 16, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const max = niceMax(Math.max(0, ...all));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'smooth' }, box);
  const defs = el('defs', {}, svg);
  const n = Math.max(labels.length, 2);
  const X = (i) => L + (labels.length < 2 ? iw / 2 : iw * i / (n - 1));
  const Y = (v) => T + ih - ih * (v || 0) / max;
  for (let k = 0; k <= 4; k++) {
    const y = T + ih - ih * k / 4;
    el('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'gl' }, svg);
    el('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', class: 'ax' }, svg).textContent = fmt(max * k / 4);
  }
  const every = Math.ceil(labels.length / 12);
  labels.forEach((lab, i) => { if (i % every === 0) el('text', { x: X(i), y: H - 10, 'text-anchor': 'middle', class: 'ax' }, svg).textContent = lab; });

  series.slice().reverse().forEach((s) => {
    const color = s.color || PALETTE[series.indexOf(s)];
    const pts = s.values.map((v, i) => [X(i), Y(v)]);
    if (!s.dashed) {
      const gid = 'g' + (++_gid);
      const lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': .28 }, lg);
      el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, lg);
      const area = el('path', { d: smoothPath(pts) + ` L${pts[pts.length - 1][0]},${T + ih} L${pts[0][0]},${T + ih} Z`, fill: `url(#${gid})`, class: 'area' }, svg);
      requestAnimationFrame(() => area.classList.add('on'));
    }
    const p = el('path', { d: smoothPath(pts), fill: 'none', stroke: color, 'stroke-width': s.dashed ? 2 : 3, 'stroke-linecap': 'round', opacity: s.dashed ? .55 : 1 }, svg);
    if (s.dashed) p.dataset.dash = '6 6';
    animateStroke(p);
  });

  // наведение: вертикальная линия и значения всех рядов
  const guide = el('line', { y1: T, y2: T + ih, class: 'guide' }, svg);
  const dots = series.map((s) => el('circle', { r: 5, fill: '#fff', stroke: s.color || PALETTE[series.indexOf(s)], 'stroke-width': 2.5, class: 'dot' }, svg));
  const hit = el('rect', { x: L, y: T, width: iw, height: ih, fill: 'transparent' }, svg);
  const tip = document.getElementById('mnc-tip');
  hit.addEventListener('mousemove', (ev) => {
    const r = svg.getBoundingClientRect();
    const x = (ev.clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(labels.length - 1, Math.round((x - L) / iw * (n - 1))));
    guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.style.opacity = 1;
    dots.forEach((d, k) => { const v = series[k].values[i]; d.setAttribute('cx', X(i)); d.setAttribute('cy', Y(v)); d.style.opacity = v == null ? 0 : 1; });
    tip.innerHTML = `<b>${labels[i]}</b>` + series.map((s) => `<div><i style="background:${s.color || PALETTE[series.indexOf(s)]}"></i>${s.name}: <b>${fmt(s.values[i])}${opts.unit || ''}</b></div>`).join('');
    tip.style.opacity = 1;
    const tx = ev.clientX + 16, tw = tip.offsetWidth;
    tip.style.left = (tx + tw > innerWidth ? ev.clientX - tw - 16 : tx) + 'px'; tip.style.top = ev.clientY - 20 + 'px';
  });
  hit.addEventListener('mouseleave', () => { guide.style.opacity = 0; dots.forEach((d) => d.style.opacity = 0); tip.style.opacity = 0; });
}

// Мини-график в карточке
function sparkline(box, values, color, prev) {
  box.innerHTML = '';
  const W = 220, H = 54, P = 4;
  const all = values.concat(prev || []).filter((v) => v != null);
  const max = Math.max(1, ...all), min = 0;
  const X = (i, len) => P + (W - 2 * P) * (len < 2 ? .5 : i / (len - 1));
  const Y = (v) => H - P - (H - 2 * P) * ((v || 0) - min) / (max - min || 1);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'spark' }, box);
  const gid = 's' + (++_gid);
  const lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, el('defs', {}, svg));
  el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': .25 }, lg);
  el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, lg);
  if (prev && prev.length > 1) {
    el('path', { d: smoothPath(prev.map((v, i) => [X(i, prev.length), Y(v)])), fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', opacity: .4 }, svg);
  }
  if (values.length > 1) {
    const pts = values.map((v, i) => [X(i, values.length), Y(v)]);
    el('path', { d: smoothPath(pts) + ` L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`, fill: `url(#${gid})` }, svg);
    animateStroke(el('path', { d: smoothPath(pts), fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, svg), 700);
  }
}

// Кольцо с анимацией. items: [{label, value, color}]
function donut(box, items, opts = {}) {
  box.innerHTML = '';
  const S = 220, c = S / 2, R = 88, w = 22;
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const wrap = document.createElement('div'); wrap.className = 'donut-wrap'; box.appendChild(wrap);
  const svg = el('svg', { viewBox: `0 0 ${S} ${S}`, class: 'donut' });
  wrap.appendChild(svg);
  el('circle', { cx: c, cy: c, r: R, fill: 'none', stroke: '#eef4f0', 'stroke-width': w }, svg);
  const C = 2 * Math.PI * R; let off = 0;
  const tip = document.getElementById('mnc-tip');
  items.forEach((it, i) => {
    const len = C * it.value / total;
    const arc = el('circle', { cx: c, cy: c, r: R, fill: 'none', stroke: it.color || PALETTE[i % PALETTE.length], 'stroke-width': w,
      'stroke-dasharray': `0 ${C}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${c} ${c})`, 'stroke-linecap': 'butt' }, svg);
    arc.style.transition = `stroke-dasharray .9s cubic-bezier(.4,0,.2,1) ${i * 60}ms`;
    requestAnimationFrame(() => arc.setAttribute('stroke-dasharray', `${Math.max(len - 2, 0)} ${C}`));
    arc.addEventListener('mousemove', (ev) => { tip.innerHTML = `<b>${it.label}</b><div>${fmt(it.value)} · ${fmt(it.value * 100 / total)}%</div>`; tip.style.opacity = 1; tip.style.left = ev.clientX + 14 + 'px'; tip.style.top = ev.clientY - 20 + 'px'; });
    arc.addEventListener('mouseleave', () => tip.style.opacity = 0);
    off += len;
  });
  el('text', { x: c, y: c + 2, 'text-anchor': 'middle', class: 'dv' }, svg).textContent = fmt(opts.centerValue != null ? opts.centerValue : total);
  el('text', { x: c, y: c + 22, 'text-anchor': 'middle', class: 'ax' }, svg).textContent = opts.center || 'всего';
  const lg = document.createElement('div'); lg.className = 'dlegend';
  lg.innerHTML = items.map((it, i) => `<div class="dli"><i style="background:${it.color || PALETTE[i % PALETTE.length]}"></i><span class="dlt">${it.label}</span><b>${fmt(it.value)}</b><em>${fmt(it.value * 100 / total)}%</em></div>`).join('');
  wrap.appendChild(lg);
}
