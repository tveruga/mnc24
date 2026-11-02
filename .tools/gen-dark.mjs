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

// ---- палитра ----
const P = {
  bg0: '#0e1621',   // самый тёмный фон страницы
  bg1: '#17212b',   // карточки, таблицы, панели
  bg2: '#1e2c3a',   // шапки, поля ввода, наведение
  bg3: '#263445',   // выделенное
  bg4: '#33465a',   // кнопки-серые
  line: '#2a3949',  // рамки
  ink: '#e9eef3',   // основной текст
  ink2: '#b6c3cf',  // второстепенный
  muted: '#7d8fa1', // приглушённый
};

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
const withA = (h, a) => { if (a >= 0.999) return h; const c = parse(h); return `rgba(${c.r},${c.g},${c.b},${+a.toFixed(3)})`; };
const tint = (hsl, s, l) => { const [r, g, b] = hsl2rgb(hsl.h, s, l); return hex(r, g, b); };

// роль цвета: bg — фон, fg — текст, line — рамка
function mapColor(str, role, ctx) {
  const c = parse(str); if (!c) return str;
  if (c.a === 0) return str;
  const hsl = rgb2hsl(c), grey = hsl.s < 0.22 || (hsl.l > 0.94 && hsl.s < 0.6);
  // полупрозрачные: чёрная дымка → светлая дымка (полосы таблиц, наведение); белая дымка → тёмная
  if (c.a < 0.6 && role !== 'fg') {
    if (hsl.l < 0.2) return role === 'shadow' || c.a > 0.16 ? str : `rgba(255,255,255,${+(c.a * 0.7).toFixed(3)})`; // лёгкая дымка (полосы, наведение) → светлая; плотная (затемнение за окном) — как есть
    if (hsl.l > 0.85 && grey) return `rgba(14,22,33,${+Math.min(0.9, c.a + 0.2).toFixed(3)})`;
    if (!grey && hsl.l > 0.75) return `rgba(${hsl2rgb(hsl.h, 0.45, 0.35).map(Math.round).join(',')},${+Math.max(c.a, 0.35).toFixed(3)})`;
    return str;
  }
  if (role === 'shadow') { if (hsl.l > 0.85) return withA(P.bg1, c.a); return str; }
  if (role === 'bg') {
    if (grey) {
      if (ctx.input) return hsl.l > 0.8 ? withA('#242f3d', c.a) : withA(P.bg3, c.a);
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
    if (grey) return hsl.l > 0.5 ? withA(P.line, c.a) : withA('#3a4d61', c.a);
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

const PROPS = {
  color: 'fg', fill: 'fg', stroke: 'fg', 'caret-color': 'fg', 'text-decoration-color': 'fg', '-webkit-text-fill-color': 'fg',
  background: 'bg', 'background-color': 'bg', 'background-image': 'bg',
  border: 'line', 'border-color': 'line', 'border-top': 'line', 'border-right': 'line', 'border-bottom': 'line', 'border-left': 'line',
  'border-top-color': 'line', 'border-right-color': 'line', 'border-bottom-color': 'line', 'border-left-color': 'line',
  outline: 'line', 'outline-color': 'line', 'column-rule': 'line', 'column-rule-color': 'line',
  'box-shadow': 'shadow', 'text-shadow': 'shadow',
};
function prefix(sel) {
  return sel.split(',').map((s) => {
    s = s.trim(); if (!s) return s;
    if (/^:root\b/.test(s)) return s.replace(/^:root/, 'html.dh-dark');
    if (/^html\b/.test(s)) return s.replace(/^html/, 'html.dh-dark');
    return 'html.dh-dark ' + s;
  }).join(',');
}
function gen(files, extra) {
  const out = postcss.root();
  for (const f of files) {
    let src; try { src = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    let root; try { root = postcss.parse(src, { from: f }); } catch (e) { console.warn('skip', f, e.message); continue; }
    root.walkRules((rule) => {
      if (rule.parent && rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
      const ctx = {
        input: /form-control|input|textarea|select2-selection|custom-select|dropdown-toggle|page-link/.test(rule.selector),
        onAccent: /btn-(primary|success|danger|info|warning|dark|secondary)|badge|alert-(success|danger)|bg-(primary|success|danger|info|dark)|text-white|\.active|:checked|\.dhb-main|selected|highlighted/.test(rule.selector),
      };
      const decls = [];
      rule.walkDecls((d) => {
        const role = PROPS[d.prop.toLowerCase()]; if (!role) return;
        if (!COLOR_RE.test(d.value)) { COLOR_RE.lastIndex = 0; return; } COLOR_RE.lastIndex = 0;
        if (/url\(/.test(d.value) && role === 'bg' && !/gradient/.test(d.value)) return;
        const v = d.value.replace(/\s*!important/i, '').replace(COLOR_RE, (m) => mapColor(m, role, ctx));
        if (v !== d.value.replace(/\s*!important/i, '')) decls.push(postcss.decl({ prop: d.prop, value: v, important: true }));
      });
      if (!decls.length) return;
      const nr = postcss.rule({ selector: prefix(rule.selector) }); decls.forEach((d) => nr.append(d));
      // правило внутри @media — сохраняем обёртку
      let parent = out;
      if (rule.parent && rule.parent.type === 'atrule' && /media|supports/i.test(rule.parent.name)) {
        const at = postcss.atRule({ name: rule.parent.name, params: rule.parent.params }); out.append(at); parent = at;
      }
      parent.append(nr);
    });
  }
  return `/* СГЕНЕРИРОВАНО .tools/gen-dark.mjs — не править руками */\n` + out.toString().replace(/\n{2,}/g, '\n') + '\n' + (extra || '');
}

const crmDir = path.join(ROOT, '.tools', 'crm-css');
const crmFiles = fs.readdirSync(crmDir).filter((f) => f.endsWith('.css')).sort((a, b) => (a === 'bootstrap.css' ? -1 : b === 'bootstrap.css' ? 1 : a === 'mainAdmin.css' ? 1 : b === 'mainAdmin.css' ? -1 : a.localeCompare(b))).map((f) => path.join(crmDir, f));
const manual = (f) => { try { return fs.readFileSync(path.join(ROOT, '.tools', f), 'utf8'); } catch (e) { return ''; } };
fs.writeFileSync(path.join(ROOT, 'dark-crm.css'), gen(crmFiles, manual('dark-crm.manual.css')));
fs.writeFileSync(path.join(ROOT, 'dark-ext.css'), gen([path.join(ROOT, 'panel.css'), path.join(ROOT, 'dashboard.css')], manual('dark-ext.manual.css')));
fs.writeFileSync(path.join(ROOT, 'dark-sidebar.css'), gen([path.join(ROOT, 'sidebar.css')], manual('dark-sidebar.manual.css') + manual('dark-ext.manual.css')));
for (const f of ['dark-crm.css', 'dark-ext.css', 'dark-sidebar.css']) console.log(f, fs.statSync(path.join(ROOT, f)).size);
