// Генератор тёмной темы (стиль «ночной» Telegram + зелёные акценты DIR HELPER).
// Берёт светлые стили и для каждого цветового свойства пишет тёмную пару под html.dh-dark (с !important).
//   CRM:        .tools/crm-css/*.css (сохранены из CRM: Bootstrap 4, mainAdmin.css и плагины) → dark-crm.css
//   дополнение: panel.css, dashboard.css                                                   → dark-ext.css
//   окно:       sidebar.css                                                                 → dark-sidebar.css
// Запуск: cd .tools && npm i && node gen-dark.mjs
import fs from 'fs';
import path from 'path';
import postcss from 'postcss';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');

// ---- палитры ----
// Все цвета тёмной темы — CSS-переменные --dh-*; набор переменных на каждую палитру (меню темы, theme.js → html[data-dh-pal]).
// 'dark' — исходный «ночной Telegram» (значения как были); остальные выводятся из 5 цветов палитры (тёмный → светлый).
const TG_NIGHT = {
  bg0: '#0e1621',   // самый тёмный фон страницы
  bg1: '#17212b',   // карточки, таблицы, панели
  bg2: '#1e2c3a',   // шапки, наведение
  bg3: '#263445',   // выделенное
  bg4: '#33465a',   // кнопки-серые
  input: '#242f3d', // поля ввода
  hover: '#22364a', // строка под курсором
  line: '#2a3949',  // рамки
  line2: '#3a4d61', // рамки темнее фона
  ink: '#e9eef3',   // основной текст
  ink2: '#b6c3cf', inks: '#d5dee6', ink3: '#9fb0c0', // второстепенный
  muted: '#7d8fa1', // приглушённый
  acc: '#22a35a', accd: '#166534', accd2: '#0f3d2b', // акцент: яркий / кнопки / самый тёмный
  acct: '#5fd08a', acct2: '#79e2a1',                 // акцентный текст
  accbg: '#1d4a33', accline: '#346547',              // подложка / рамка с оттенком акцента
};
const PALETTES = {
  midnight: ['#0b0f14', '#1a1f26', '#2b323c', '#4a5568', '#8a94a6'],
  forest:   ['#0b120d', '#1b2a1f', '#2e4d34', '#6ca36a', '#a8d5a2'],
  obsidian: ['#0a0a0a', '#1c1c1e', '#2f2f33', '#5a5a5f', '#9a9aa0'],
  emerald:  ['#0a0f0d', '#142821', '#1f4d3a', '#3fbf97', '#7fd9b6'],
  purple:   ['#0d0b14', '#1a1525', '#2e1f44', '#6a3d9a', '#b78cff'],
};
// светлые палитры (класс html.dh-lt): фон/рамки — из светлых цветов, акценты DIR HELPER — из ярких
const LIGHT = {
  sky:      ['#f8fafc', '#eef2ff', '#cbd5e1', '#93c5fd', '#3b82f6'],
  sage:     ['#fafdf7', '#ecfdf5', '#d1fae5', '#86efac', '#22c55e'],
  rose:     ['#fff7fa', '#fce7f3', '#f9a8d4', '#f472b6', '#ec4899'],
  sunny:    ['#fffbeb', '#fff3cd', '#fcd34d', '#f59e0b', '#d97706'],
  lavender: ['#faf5ff', '#f3e8ff', '#d8b4fe', '#a855f7', '#7c3aed'],
};
function deriveLight([c1, c2, c3, c4, c5]) {
  return {
    lbg0: c1, lbg1: c2, lbg2: mixHex(c2, c3, 0.35), lline: mixHex(c2, c3, 0.55),
    lacc: c5, laccd: mixHex(c5, '#000000', 0.18), laccd2: mixHex(c5, '#000000', 0.55), lacct: mixHex(c5, '#000000', 0.3),
    laccl: c4, laccbg: c2, laccline: c3,
  };
}
const mixHex = (a, b, t) => { const x = parse(a), y = parse(b); return hex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t); };
function derive([c1, c2, c3, c4, c5]) {
  const ink = mixHex(c5, '#ffffff', 0.85);
  return {
    bg0: c1, bg1: c2, bg2: mixHex(c2, c3, 0.45), bg3: c3, bg4: mixHex(c3, c4, 0.45),
    input: mixHex(c2, c3, 0.6), hover: mixHex(c2, c3, 0.75),
    line: mixHex(c3, c4, 0.12), line2: mixHex(c3, c4, 0.35),
    ink, ink2: mixHex(c5, '#ffffff', 0.6), inks: mixHex(c5, '#ffffff', 0.72), ink3: mixHex(c5, '#ffffff', 0.4),
    muted: mixHex(c3, ink, 0.45),
    acc: c4, accd: mixHex(c3, c4, 0.55), accd2: mixHex(c2, c4, 0.3),
    acct: c5, acct2: mixHex(c5, '#ffffff', 0.3),
    accbg: mixHex(c2, c4, 0.22), accline: mixHex(c3, c4, 0.4),
  };
}
const V = (k) => `var(--dh-${k})`;
const P = Object.fromEntries(Object.keys(TG_NIGHT).map((k) => [k, V(k)]));
// цвета «ночного Telegram» и бренда DIR HELPER, которые встречаются литералами (ручные css, проходящие насквозь) → переменные
const LIT = { ...Object.fromEntries(Object.entries(TG_NIGHT).map(([k, v]) => [v, k])),
  '#6d7f8f': 'muted', '#1c3b4a': 'accbg', '#21452e': 'accbg', '#1d492f': 'accbg', '#273f30': 'accbg', '#3c5d46': 'accline' };
const varsCss = (sel, o) => `${sel}{${Object.entries(o).map(([k, v]) => `--dh-${k}:${v}`).join(';')}}`;
const themesCss = () => '/* ---- палитры (меню темы) ---- */\n' + varsCss('html.dh-dark', TG_NIGHT) + '\n' +
  Object.entries(PALETTES).map(([n, c]) => varsCss(`html.dh-dark[data-dh-pal="${n}"]`, derive(c))).join('\n') + '\n' +
  Object.entries(LIGHT).map(([n, c]) => varsCss(`html.dh-lt[data-dh-pal="${n}"]`, deriveLight(c))).join('\n') + '\n';

// ---- цвета ----
const NAMED = { white: '#ffffff', black: '#000000', grey: '#808080', gray: '#808080', silver: '#c0c0c0', green: '#008000', red: '#ff0000', blue: '#0000ff', orange: '#ffa500', yellow: '#ffff00', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', whitesmoke: '#f5f5f5', gainsboro: '#dcdcdc' };
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|grey|gray|silver|lightgray|lightgrey|darkgray|whitesmoke|gainsboro)\b/g;
function parse(c) {
  c = c.trim().toLowerCase(); if (NAMED[c]) c = NAMED[c];
  let m;
  if ((m = c.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1]; if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  if ((m = c.match(/^rgba?\(([^)]*)\)$/))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x)));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? (String(m[1]).includes('%') && p[3] > 1 ? p[3] / 255 : p[3]) : 1 };
  }
  if ((m = c.match(/^hsla?\(([^)]*)\)$/))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    const [r, g, b] = hsl2rgb(p[0] / 360, p[1] / 100, p[2] / 100);
    return { r, g, b, a: p.length > 3 ? p[3] : 1 };
  }
  return null;
}
function rgb2hsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return { h, s, l };
}
function hsl2rgb(h, s, l) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const hex = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const withA = (h, a) => {
  if (a >= 0.999) return h;
  if (h.startsWith('var(')) return `color-mix(in srgb,${h} ${+(a * 100).toFixed(1)}%,transparent)`;
  const c = parse(h); return `rgba(${c.r},${c.g},${c.b},${+a.toFixed(3)})`;
};
// зелёные бренда DIR HELPER (оттенок 125–170°) в окнах дополнения → акцент палитры
const isBrand = (hsl) => hsl.s > 0.2 && hsl.h * 360 >= 125 && hsl.h * 360 <= 170;
const brandVar = (hsl) => (hsl.l < 0.18 ? P.accd2 : hsl.l < 0.32 ? P.accd : hsl.l < 0.5 ? P.acc : P.acct);
const tint = (hsl, s, l) => { const [r, g, b] = hsl2rgb(hsl.h, s, l); return hex(r, g, b); };

// роль цвета: bg — фон, fg — текст, line — рамка
function mapColor(str, role, ctx) {
  const c = parse(str); if (!c) return str;
  if (c.a === 0) return str;
  const hsl = rgb2hsl(c), grey = hsl.s < 0.22 || (hsl.l > 0.94 && hsl.s < 0.6);
  if (ctx.brand && isBrand(hsl) && (role !== 'shadow' || c.a < 0.6)) {
    if (c.a < 0.6) return hsl.l > 0.75 ? withA(role === 'bg' ? P.accbg : P.accline, Math.max(c.a, 0.35)) : withA(brandVar(hsl), c.a);
    if (role === 'bg' && hsl.l >= 0.86) return P.accbg;
    if (role === 'line' && hsl.l >= 0.8) return P.accline;
    if (role === 'fg' && hsl.l < 0.38) return ctx.onAccent ? str : P.acct;
    return brandVar(hsl);
  }
  // полупрозрачные: чёрная дымка → светлая дымка (полосы таблиц, наведение); белая дымка → тёмная
  if (c.a < 0.6 && role !== 'fg') {
    if (hsl.l < 0.2) return role === 'shadow' || c.a > 0.16 ? str : `rgba(255,255,255,${+(c.a * 0.7).toFixed(3)})`; // лёгкая дымка (полосы, наведение) → светлая; плотная (затемнение за окном) — как есть
    if (hsl.l > 0.85 && grey) return withA(P.bg0, Math.min(0.9, c.a + 0.2));
    if (!grey && hsl.l > 0.75) return `rgba(${hsl2rgb(hsl.h, 0.45, 0.35).map(Math.round).join(',')},${+Math.max(c.a, 0.35).toFixed(3)})`;
    return str;
  }
  if (role === 'shadow') { if (hsl.l > 0.85) return withA(P.bg1, c.a); return str; }
  if (role === 'bg') {
    if (grey) {
      if (ctx.input) return hsl.l > 0.8 ? withA(P.input, c.a) : withA(P.bg3, c.a);
      if (hsl.l >= 0.985) return withA(P.bg1, c.a);
      if (hsl.l >= 0.9) return withA(P.bg0, c.a);
      if (hsl.l >= 0.8) return withA(P.bg2, c.a);
      if (hsl.l >= 0.62) return withA(P.bg3, c.a);
      if (hsl.l >= 0.3) return withA(P.bg2, c.a);   // серые плашки (шапка-меню CRM, серые кнопки)
      return withA(P.bg1, c.a);                 // тёмно-серые плашки (шапка CRM) — в цвет панелей
    }
    if (hsl.l >= 0.86) return withA(tint(hsl, Math.min(0.45, hsl.s), 0.2), c.a);   // пастельные подложки → тёмные с оттенком
    return str;                                                                    // насыщенные (кнопки, статусы) — как есть
  }
  if (role === 'line') {
    if (grey) return hsl.l > 0.5 ? withA(P.line, c.a) : withA(P.line2, c.a);
    if (hsl.l >= 0.8) return withA(tint(hsl, Math.min(0.4, hsl.s), 0.3), c.a);
    return str;
  }
  // fg — текст
  if (grey) {
    if (ctx.onAccent) return str;               // белый текст на цветной кнопке — без изменений
    if (hsl.l <= 0.42) return withA(P.ink, c.a);
    if (hsl.l <= 0.72) return withA(P.muted, c.a);
    return str;                                 // белый/светлый текст — остаётся
  }
  if (hsl.l < 0.2) return withA(P.ink, c.a);                                                       // почти чёрный с оттенком — обычный текст
  if (hsl.l < 0.38) return withA(tint(hsl, Math.max(0.45, Math.min(0.7, hsl.s)), 0.68), c.a);   // тёмно-зелёный/синий акцент → светлее
  return str;
}

// светлые палитры: белый/серый фон → светлые цвета палитры, серые рамки → рамка палитры, зелёные бренда → акцент; текст как есть
const L = (k) => V('l' + k);
const brandVarL = (hsl) => (hsl.l < 0.18 ? L('accd2') : hsl.l < 0.32 ? L('accd') : hsl.l < 0.5 ? L('acc') : L('accl'));
function mapLight(str, role, ctx) {
  const c = parse(str); if (!c || c.a === 0) return str;
  const hsl = rgb2hsl(c), grey = hsl.s < 0.22 || (hsl.l > 0.94 && hsl.s < 0.6);
  if (ctx.brand && isBrand(hsl) && !grey && (role !== 'shadow' || c.a < 0.6)) {
    if (c.a < 0.6) return withA(hsl.l > 0.75 ? (role === 'bg' ? L('accbg') : L('accline')) : brandVarL(hsl), c.a);
    if (role === 'bg' && hsl.l >= 0.86) return L('accbg');
    if (role === 'line' && hsl.l >= 0.8) return L('accline');
    if (role === 'fg' && hsl.l < 0.38) return ctx.onAccent ? str : hsl.l < 0.2 ? L('accd2') : L('acct');
    return brandVarL(hsl);
  }
  if (c.a < 0.6 || !grey) return str;
  if (role === 'bg') return hsl.l >= 0.985 ? L('bg0') : hsl.l >= 0.9 ? L('bg1') : hsl.l >= 0.8 ? L('bg2') : str;
  if (role === 'line') return hsl.l >= 0.75 ? L('line') : str;
  return str;
}

const PROPS = {
  color: 'fg', fill: 'fg', stroke: 'fg', 'caret-color': 'fg', 'text-decoration-color': 'fg', '-webkit-text-fill-color': 'fg',
  background: 'bg', 'background-color': 'bg', 'background-image': 'bg',
  border: 'line', 'border-color': 'line', 'border-top': 'line', 'border-right': 'line', 'border-bottom': 'line', 'border-left': 'line',
  'border-top-color': 'line', 'border-right-color': 'line', 'border-bottom-color': 'line', 'border-left-color': 'line',
  outline: 'line', 'outline-color': 'line', 'column-rule': 'line', 'column-rule-color': 'line',
  'box-shadow': 'shadow', 'text-shadow': 'shadow',
};
function prefix(sel, cls = 'dh-dark') {
  return sel.split(',').map((s) => {
    s = s.trim(); if (!s) return s;
    if (/^:root\b/.test(s)) return s.replace(/^:root/, 'html.' + cls);
    if (/^html\b/.test(s)) return s.replace(/^html/, 'html.' + cls);
    return 'html.' + cls + ' ' + s;
  }).join(',');
}
// ручные css: литералы «ночного Telegram»/бренда → переменные палитры
function litVars(css) {
  return css.replace(/#[0-9a-fA-F]{6}\b/g, (m) => (LIT[m.toLowerCase()] ? V(LIT[m.toLowerCase()]) : m))
    .replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g, (m, r, g, b, a) => { const k = LIT[hex(+r, +g, +b)]; return k ? withA(V(k), +a) : m; });
}
function gen(files, extra, brand) {
  const out = postcss.root();
  for (const [cls, map] of [['dh-dark', mapColor], ['dh-lt', mapLight]])
  for (const f of files) {
    let src; try { src = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    let root; try { root = postcss.parse(src, { from: f }); } catch (e) { console.warn('skip', f, e.message); continue; }
    root.walkRules((rule) => {
      if (rule.parent && rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
      const ctx = {
        brand,
        input: /form-control|input|textarea|select2-selection|custom-select|dropdown-toggle|page-link/.test(rule.selector),
        onAccent: /btn-(primary|success|danger|info|warning|dark|secondary)|badge|alert-(success|danger)|bg-(primary|success|danger|info|dark)|text-white|\.active|:checked|\.dhb-main|selected|highlighted/.test(rule.selector),
      };
      const decls = [];
      rule.walkDecls((d) => {
        const role = PROPS[d.prop.toLowerCase()]; if (!role) return;
        if (!COLOR_RE.test(d.value)) { COLOR_RE.lastIndex = 0; return; } COLOR_RE.lastIndex = 0;
        if (/url\(/.test(d.value) && role === 'bg' && !/gradient/.test(d.value)) return;
        const v = d.value.replace(/\s*!important/i, '').replace(COLOR_RE, (m) => map(m, role, ctx));
        if (v !== d.value.replace(/\s*!important/i, '')) decls.push(postcss.decl({ prop: d.prop, value: v, important: true }));
      });
      if (!decls.length) return;
      const nr = postcss.rule({ selector: prefix(rule.selector, cls) }); decls.forEach((d) => nr.append(d));
      // правило внутри @media — сохраняем обёртку
      let parent = out;
      if (rule.parent && rule.parent.type === 'atrule' && /media|supports/i.test(rule.parent.name)) {
        const at = postcss.atRule({ name: rule.parent.name, params: rule.parent.params }); out.append(at); parent = at;
      }
      parent.append(nr);
    });
  }
  return `/* СГЕНЕРИРОВАНО .tools/gen-dark.mjs — не править руками */\n` + themesCss() + out.toString().replace(/\n{2,}/g, '\n') + '\n' + litVars(extra || '');
}

const crmDir = path.join(ROOT, '.tools', 'crm-css');
const crmFiles = fs.readdirSync(crmDir).filter((f) => f.endsWith('.css')).sort((a, b) => (a === 'bootstrap.css' ? -1 : b === 'bootstrap.css' ? 1 : a === 'mainAdmin.css' ? 1 : b === 'mainAdmin.css' ? -1 : a.localeCompare(b))).map((f) => path.join(crmDir, f));
const manual = (f) => { try { return fs.readFileSync(path.join(ROOT, '.tools', f), 'utf8'); } catch (e) { return ''; } };
fs.writeFileSync(path.join(ROOT, 'dark-crm.css'), gen(crmFiles, manual('dark-crm.manual.css')));
fs.writeFileSync(path.join(ROOT, 'dark-ext.css'), gen([path.join(ROOT, 'panel.css'), path.join(ROOT, 'dashboard.css')], manual('dark-ext.manual.css'), true));
fs.writeFileSync(path.join(ROOT, 'dark-sidebar.css'), gen([path.join(ROOT, 'sidebar.css')], manual('dark-sidebar.manual.css') + manual('dark-ext.manual.css'), true));
for (const f of ['dark-crm.css', 'dark-ext.css', 'dark-sidebar.css']) console.log(f, fs.statSync(path.join(ROOT, f)).size);
