// Demo ürün ve kampanya görsellerini üretir (yalnızca geliştirme; gerçek fotoğraflar Admin > Görseller'den yüklenir).
// Çizimler SVG ile yapılır, Chromium (Playwright) ile render edilir, sharp ile WebP'ye çevrilir.
// Kullanım (repo kökünden): node backend/demo-assets/generate.mjs
// Gerekenler: global playwright (bulut ortamında kurulu) ve backend/node_modules/sharp.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', 'package.json'));
const sharp = require('sharp');
const { chromium } = createRequire(import.meta.url)('playwright');
const fontDir = path.join(here, '..', '..', 'frontend', 'node_modules', '@fontsource');

// ---------- renk yardımcıları ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const dark = (c, t) => mix(c, '#000000', t);
const light = (c, t) => mix(c, '#ffffff', t);

let uid = 0;
const id = (p) => `${p}${++uid}`;

// Yatay "silindir" gradyanı: kenarlar koyu, sol-orta parlak.
function cyl(c, { hi = 0.55, sh = 0.35 } = {}) {
  const g = id('g');
  return {
    g,
    def: `<linearGradient id="${g}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${dark(c, sh)}"/><stop offset="0.18" stop-color="${c}"/>
      <stop offset="0.34" stop-color="${light(c, hi)}"/><stop offset="0.5" stop-color="${c}"/>
      <stop offset="0.85" stop-color="${dark(c, sh * 0.6)}"/><stop offset="1" stop-color="${dark(c, sh)}"/></linearGradient>`,
  };
}
function vgrad(a, b) {
  const g = id('v');
  return { g, def: `<linearGradient id="${g}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>` };
}
function radial(a, b, cx = 0.4, cy = 0.35) {
  const g = id('r');
  return { g, def: `<radialGradient id="${g}" cx="${cx}" cy="${cy}" r="0.75"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>` };
}
const METAL = '#b9bec4';
const shadow = (cx, cy, rx, ry, o = 0.28) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#3a2f22" opacity="${o}" filter="url(#blur)"/>`;

// ---------- parçalar ----------
function plate(cx, cy, rx, color, { gold = false, ry = rx * 0.36, thick = 14 } = {}) {
  const top = radial(light(color, 0.35), color, 0.4, 0.3);
  const well = radial(color, dark(color, 0.08), 0.45, 0.4);
  return {
    defs: top.def + well.def,
    svg: `<ellipse cx="${cx}" cy="${cy + thick}" rx="${rx}" ry="${ry}" fill="${dark(color, 0.28)}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${top.g})"/>
    ${gold ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.95}" ry="${ry * 0.95}" fill="none" stroke="#c9a15e" stroke-width="5"/>` : ''}
    <ellipse cx="${cx}" cy="${cy + ry * 0.05}" rx="${rx * 0.68}" ry="${ry * 0.66}" fill="url(#${well.g})"/>
    <ellipse cx="${cx}" cy="${cy + ry * 0.05}" rx="${rx * 0.68}" ry="${ry * 0.66}" fill="none" stroke="${dark(color, 0.12)}" stroke-width="2" opacity=".6"/>
    <path d="M ${cx - rx * 0.8} ${cy - ry * 0.45} Q ${cx - rx * 0.45} ${cy - ry * 0.95} ${cx + rx * 0.05} ${cy - ry * 0.92}" stroke="#fff" stroke-width="8" fill="none" opacity=".55" stroke-linecap="round"/>`,
  };
}

function bowl(cx, cy, rx, h, color, { inner, pattern } = {}) {
  const ry = rx * 0.3;
  const body = cyl(color, { hi: 0.5 });
  const inn = radial(dark(inner ?? color, 0.12), light(inner ?? color, 0.15), 0.5, 0.75);
  const footY = cy + h;
  return {
    defs: body.def + inn.def,
    svg: `<ellipse cx="${cx}" cy="${footY}" rx="${rx * 0.42}" ry="${ry * 0.38}" fill="${dark(color, 0.35)}"/>
    <path d="M ${cx - rx} ${cy} C ${cx - rx} ${cy + h * 0.9}, ${cx - rx * 0.45} ${footY}, ${cx} ${footY} C ${cx + rx * 0.45} ${footY}, ${cx + rx} ${cy + h * 0.9}, ${cx + rx} ${cy} Z" fill="url(#${body.g})"/>
    ${pattern ? `<path d="M ${cx - rx * 0.97} ${cy + h * 0.28} Q ${cx} ${cy + h * 0.55} ${cx + rx * 0.97} ${cy + h * 0.28}" stroke="${pattern}" stroke-width="10" fill="none" opacity=".9"/>` : ''}
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${inn.g})"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${light(color, 0.5)}" stroke-width="5"/>`,
  };
}

function teaGlass(cx, base, s = 1, tea = '#a3360f') {
  const w = 34 * s, waist = 25 * s, b = 30 * s, h = 150 * s;
  const top = base - h;
  const outline = `M ${cx - w} ${top} C ${cx - w} ${top + h * 0.3}, ${cx - waist} ${top + h * 0.45}, ${cx - waist} ${top + h * 0.55} C ${cx - waist} ${top + h * 0.7}, ${cx - b} ${top + h * 0.82}, ${cx - b} ${base} L ${cx + b} ${base} C ${cx + b} ${top + h * 0.82}, ${cx + waist} ${top + h * 0.7}, ${cx + waist} ${top + h * 0.55} C ${cx + waist} ${top + h * 0.45}, ${cx + w} ${top + h * 0.3}, ${cx + w} ${top} Z`;
  const t = cyl(tea, { hi: 0.35, sh: 0.4 });
  const cp = id('c');
  const saucer = plate(cx, base + 4 * s, 62 * s, '#f4f1ec', { thick: 6 * s, ry: 16 * s });
  return {
    defs: t.def + saucer.defs + `<clipPath id="${cp}"><path d="${outline}"/></clipPath>`,
    svg: saucer.svg + `<g clip-path="url(#${cp})"><rect x="${cx - w}" y="${top + h * 0.14}" width="${w * 2}" height="${h}" fill="url(#${t.g})"/>
    <ellipse cx="${cx}" cy="${top + h * 0.14}" rx="${w * 0.95}" ry="${5 * s}" fill="${light(tea, 0.25)}"/></g>
    <path d="${outline}" fill="#eaf4f7" fill-opacity=".18" stroke="#ffffff" stroke-opacity=".9" stroke-width="${2.5 * s}"/>
    <ellipse cx="${cx}" cy="${top}" rx="${w}" ry="${5 * s}" fill="none" stroke="#fff" stroke-width="${2.5 * s}" opacity=".9"/>
    <path d="M ${cx - w * 0.6} ${top + 10 * s} C ${cx - w * 0.55} ${top + h * 0.35}, ${cx - waist * 0.6} ${top + h * 0.5}, ${cx - b * 0.6} ${base - 12 * s}" stroke="#fff" stroke-width="${5 * s}" fill="none" opacity=".55" stroke-linecap="round"/>`,
  };
}

function tumbler(cx, base, w, h, { fill, tint = '#cfe3ea', taper = 0.86 } = {}) {
  const top = base - h, wb = w * taper;
  const outline = `M ${cx - w} ${top} L ${cx - wb} ${base} Q ${cx} ${base + 8} ${cx + wb} ${base} L ${cx + w} ${top} Z`;
  const cp = id('c');
  const liq = fill ? cyl(fill, { hi: 0.3, sh: 0.3 }) : null;
  return {
    defs: (liq ? liq.def : '') + `<clipPath id="${cp}"><path d="${outline}"/></clipPath>`,
    svg: `${liq ? `<g clip-path="url(#${cp})"><rect x="${cx - w}" y="${top + h * 0.3}" width="${w * 2}" height="${h}" fill="url(#${liq.g})" opacity=".92"/><ellipse cx="${cx}" cy="${top + h * 0.3}" rx="${w * 0.93}" ry="${w * 0.12}" fill="${light(fill, 0.3)}"/></g>` : ''}
    <path d="${outline}" fill="${tint}" fill-opacity=".45" stroke="#9fb9c2" stroke-opacity=".9" stroke-width="3"/>
    <rect x="${cx - wb}" y="${base - 18}" width="${wb * 2}" height="16" rx="6" fill="#fff" opacity=".35"/>
    <ellipse cx="${cx}" cy="${top}" rx="${w}" ry="${w * 0.14}" fill="none" stroke="#fff" stroke-width="3"/>
    <path d="M ${cx - w * 0.62} ${top + 14} L ${cx - wb * 0.6} ${base - 24}" stroke="#fff" stroke-width="9" opacity=".5" stroke-linecap="round"/>
    <path d="M ${cx + w * 0.55} ${top + 20} L ${cx + wb * 0.52} ${base - 30}" stroke="#fff" stroke-width="3" opacity=".45" stroke-linecap="round"/>`,
  };
}

function mug(cx, base, w, h, color, { saucer = false, handle = true } = {}) {
  const top = base - h;
  const body = cyl(color, { hi: 0.45 });
  const ry = w * 0.22;
  const inn = vgrad(dark(color, 0.35), dark(color, 0.1));
  const s = saucer ? plate(cx, base + 6, w * 1.75, light(color, 0.15), { thick: 8, ry: w * 0.42 }) : { defs: '', svg: '' };
  return {
    defs: body.def + inn.def + s.defs,
    svg: `${s.svg}${handle ? `<path d="M ${cx + w * 0.92} ${top + h * 0.22} C ${cx + w * 1.65} ${top + h * 0.18}, ${cx + w * 1.65} ${top + h * 0.8}, ${cx + w * 0.88} ${top + h * 0.75}" stroke="${dark(color, 0.12)}" stroke-width="${w * 0.2}" fill="none" stroke-linecap="round"/>` : ''}
    <path d="M ${cx - w} ${top} L ${cx - w * 0.92} ${base - ry * 0.4} Q ${cx} ${base + ry * 0.9} ${cx + w * 0.92} ${base - ry * 0.4} L ${cx + w} ${top} Z" fill="url(#${body.g})"/>
    <ellipse cx="${cx}" cy="${top}" rx="${w}" ry="${ry}" fill="url(#${inn.g})"/>
    <ellipse cx="${cx}" cy="${top}" rx="${w}" ry="${ry}" fill="none" stroke="${light(color, 0.45)}" stroke-width="4"/>`,
  };
}

function pot(cx, base, w, h, color, { lid = true, handles = 'ears', knob = '#1d1d1f', long = false, glassLid = false } = {}) {
  const top = base - h;
  const body = cyl(color, { hi: 0.6, sh: 0.45 });
  const ry = w * 0.25;
  const lidG = glassLid ? null : cyl(light(color, 0.1), { hi: 0.6 });
  let hs = '';
  if (handles === 'ears') {
    hs = `<path d="M ${cx - w} ${top + h * 0.2} q ${-w * 0.28} 0 ${-w * 0.3} ${h * 0.12} q 0 ${h * 0.1} ${w * 0.3} ${h * 0.1}" stroke="${knob}" stroke-width="${w * 0.07}" fill="none" stroke-linecap="round"/>
    <path d="M ${cx + w} ${top + h * 0.2} q ${w * 0.28} 0 ${w * 0.3} ${h * 0.12} q 0 ${h * 0.1} ${-w * 0.3} ${h * 0.1}" stroke="${knob}" stroke-width="${w * 0.07}" fill="none" stroke-linecap="round"/>`;
  }
  if (long) {
    hs += `<path d="M ${cx + w * 0.95} ${top + h * 0.3} L ${cx + w * 2.1} ${top - h * 0.15}" stroke="${knob}" stroke-width="${w * 0.12}" stroke-linecap="round"/>`;
  }
  const lidSvg = !lid
    ? `<ellipse cx="${cx}" cy="${top}" rx="${w}" ry="${ry}" fill="${dark(color, 0.45)}"/><ellipse cx="${cx}" cy="${top}" rx="${w}" ry="${ry}" fill="none" stroke="${light(color, 0.5)}" stroke-width="5"/>`
    : glassLid
      ? `<path d="M ${cx - w * 1.02} ${top} Q ${cx} ${top - ry * 2.4} ${cx + w * 1.02} ${top} Q ${cx} ${top + ry * 0.9} ${cx - w * 1.02} ${top} Z" fill="#dfeef2" fill-opacity=".45" stroke="#fff" stroke-width="3"/>
         <ellipse cx="${cx}" cy="${top}" rx="${w * 1.02}" ry="${ry}" fill="none" stroke="${METAL}" stroke-width="7"/>
         <path d="M ${cx - w * 0.6} ${top - ry * 0.5} Q ${cx - w * 0.2} ${top - ry * 1.3} ${cx + w * 0.2} ${top - ry * 1.25}" stroke="#fff" stroke-width="6" fill="none" opacity=".7"/>
         <ellipse cx="${cx}" cy="${top - ry * 1.3}" rx="${w * 0.14}" ry="${w * 0.07}" fill="${knob}"/>`
      : `<path d="M ${cx - w * 1.02} ${top} Q ${cx} ${top - ry * 2.2} ${cx + w * 1.02} ${top} Z" fill="url(#${lidG.g})"/>
         <ellipse cx="${cx}" cy="${top}" rx="${w * 1.02}" ry="${ry * 0.5}" fill="${dark(color, 0.2)}" opacity=".5"/>
         <rect x="${cx - w * 0.13}" y="${top - ry * 1.55}" width="${w * 0.26}" height="${ry * 0.6}" rx="${ry * 0.25}" fill="${knob}"/>`;
  return {
    defs: body.def + (lidG ? lidG.def : ''),
    svg: `${hs}<path d="M ${cx - w} ${top} L ${cx - w} ${base - ry * 0.6} Q ${cx} ${base + ry * 0.75} ${cx + w} ${base - ry * 0.6} L ${cx + w} ${top} Z" fill="url(#${body.g})"/>${lidSvg}`,
  };
}

function pan(cx, cy, rx, color = '#2b2b2e') {
  const ry = rx * 0.34;
  const inner = radial('#4a4a4f', '#1f1f22', 0.45, 0.5);
  const side = cyl(color, { hi: 0.35 });
  const speck = Array.from({ length: 70 }, (_, i) => {
    const a = (i * 137.5 * Math.PI) / 180, r = Math.sqrt(i / 70) * 0.85;
    return `<circle cx="${cx + Math.cos(a) * rx * r * 0.8}" cy="${cy + 6 + Math.sin(a) * ry * r * 0.8}" r="2.2" fill="#8d8d93" opacity=".55"/>`;
  }).join('');
  return {
    defs: inner.def + side.def,
    svg: `<path d="M ${cx + rx * 0.9} ${cy - ry * 0.1} L ${cx + rx * 2} ${cy - ry * 0.9}" stroke="#1a1a1c" stroke-width="${rx * 0.12}" stroke-linecap="round"/>
    <path d="M ${cx + rx * 1.45} ${cy - ry * 0.52} L ${cx + rx * 1.98} ${cy - ry * 0.9}" stroke="#b58a52" stroke-width="${rx * 0.13}" stroke-linecap="round"/>
    <path d="M ${cx - rx} ${cy} L ${cx - rx * 0.9} ${cy + ry * 0.75} Q ${cx} ${cy + ry * 1.45} ${cx + rx * 0.9} ${cy + ry * 0.75} L ${cx + rx} ${cy} Z" fill="url(#${side.g})"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#3a3a3e"/>
    <ellipse cx="${cx}" cy="${cy + 6}" rx="${rx * 0.9}" ry="${ry * 0.85}" fill="url(#${inner.g})"/>${speck}
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#6b6b70" stroke-width="5"/>`,
  };
}

function board(cx, cy, w, h, wood = '#c08a52') {
  const g = cyl(wood, { hi: 0.25, sh: 0.25 });
  const lines = Array.from({ length: 9 }, (_, i) => {
    const x = cx - w * 0.8 + (i * w * 1.6) / 8;
    return `<path d="M ${x} ${cy - h * 0.42} C ${x + 14} ${cy - h * 0.1}, ${x - 12} ${cy + h * 0.2}, ${x + 6} ${cy + h * 0.48}" stroke="${dark(wood, 0.25)}" stroke-width="2.5" fill="none" opacity=".45"/>`;
  }).join('');
  return {
    defs: g.def,
    svg: `<rect x="${cx - w + 10}" y="${cy - h / 2 + 16}" width="${w * 2}" height="${h}" rx="40" fill="${dark(wood, 0.4)}"/>
    <rect x="${cx - w}" y="${cy - h / 2}" width="${w * 2}" height="${h}" rx="40" fill="url(#${g.g})"/>${lines}
    <path d="M ${cx - w * 0.3} ${cy - h / 2} q ${w * 0.3} ${-h * 0.32} ${w * 0.6} 0" fill="url(#${g.g})" stroke="${dark(wood, 0.2)}" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy - h / 2 - h * 0.06}" r="${h * 0.06}" fill="#efe7da"/>`,
  };
}

function utensil(x, base, h, kind, color = '#2a2a2c') {
  const m = cyl(METAL, { hi: 0.7 });
  const handle = `<rect x="${x - 11}" y="${base - h * 0.45}" width="22" height="${h * 0.45}" rx="11" fill="${color}"/>`;
  const shaft = `<rect x="${x - 5}" y="${base - h * 0.75}" width="10" height="${h * 0.32}" fill="url(#${m.g})"/>`;
  const heads = {
    spatula: `<rect x="${x - 34}" y="${base - h}" width="68" height="${h * 0.27}" rx="12" fill="${color}"/>`,
    ladle: `<ellipse cx="${x}" cy="${base - h * 0.88}" rx="38" ry="30" fill="url(#${m.g})"/>`,
    spoon: `<ellipse cx="${x}" cy="${base - h * 0.9}" rx="26" ry="40" fill="${color}"/>`,
    whisk: Array.from({ length: 5 }, (_, i) => `<ellipse cx="${x}" cy="${base - h * 0.88}" rx="${8 + i * 7}" ry="${h * 0.15}" fill="none" stroke="${METAL}" stroke-width="3"/>`).join(''),
  };
  return { defs: m.def, svg: shaft + heads[kind] + handle };
}

function jar(cx, base, w, h, content, lid) {
  const top = base - h;
  const lidG = cyl(lid, { hi: 0.45 });
  const c = cyl(content, { hi: 0.2, sh: 0.25 });
  return {
    defs: lidG.def + c.def,
    svg: `<rect x="${cx - w * 0.92}" y="${top + h * 0.28}" width="${w * 1.84}" height="${h * 0.68}" rx="${w * 0.25}" fill="url(#${c.g})"/>
    <rect x="${cx - w}" y="${top + 8}" width="${w * 2}" height="${h - 8}" rx="${w * 0.3}" fill="#e8f3f6" fill-opacity=".25" stroke="#fff" stroke-width="3"/>
    <rect x="${cx - w * 0.7}" y="${top + h * 0.2}" width="${w * 0.22}" height="${h * 0.65}" rx="${w * 0.1}" fill="#fff" opacity=".5"/>
    <rect x="${cx - w * 1.04}" y="${top - h * 0.12}" width="${w * 2.08}" height="${h * 0.2}" rx="${w * 0.16}" fill="url(#${lidG.g})"/>`,
  };
}

function box(cx, base, w, h, depth, lidColor, { glass = true, body = '#f1f1ef' } = {}) {
  const top = base - h;
  const lidG = cyl(lidColor, { hi: 0.35 });
  return {
    defs: lidG.def,
    svg: `<path d="M ${cx - w} ${top} L ${cx - w + depth} ${top - depth * 0.55} L ${cx + w + depth} ${top - depth * 0.55} L ${cx + w + depth} ${base - depth * 0.55} L ${cx + w} ${base} Z" fill="${glass ? '#d8e9ee' : dark(body, 0.12)}" fill-opacity="${glass ? 0.35 : 1}" stroke="#fff" stroke-width="2"/>
    <rect x="${cx - w}" y="${top}" width="${w * 2}" height="${h}" rx="14" fill="${glass ? '#e9f4f7' : body}" fill-opacity="${glass ? 0.3 : 1}" stroke="#fff" stroke-width="3"/>
    ${glass ? `<rect x="${cx - w + 16}" y="${top + 16}" width="18" height="${h - 32}" rx="9" fill="#fff" opacity=".55"/>` : ''}
    <path d="M ${cx - w - 6} ${top + 6} L ${cx - w + depth - 4} ${top - depth * 0.55 - 6} L ${cx + w + depth + 6} ${top - depth * 0.55 - 6} L ${cx + w + 6} ${top + 6} Z" fill="${light(lidColor, 0.15)}"/>
    <rect x="${cx - w - 6}" y="${top - 4}" width="${w * 2 + 12}" height="26" rx="10" fill="url(#${lidG.g})"/>
    <rect x="${cx - 22}" y="${top + 14}" width="44" height="20" rx="6" fill="${dark(lidColor, 0.15)}"/>`,
  };
}

function vase(cx, base, s, color, { stems = false } = {}) {
  const g = cyl(color, { hi: 0.55 });
  const h = 420 * s;
  const top = base - h;
  const d = `M ${cx - 40 * s} ${top} C ${cx - 40 * s} ${top + 60 * s}, ${cx - 30 * s} ${top + 90 * s}, ${cx - 70 * s} ${top + 170 * s} C ${cx - 140 * s} ${top + 280 * s}, ${cx - 120 * s} ${base - 30 * s}, ${cx - 70 * s} ${base} L ${cx + 70 * s} ${base} C ${cx + 120 * s} ${base - 30 * s}, ${cx + 140 * s} ${top + 280 * s}, ${cx + 70 * s} ${top + 170 * s} C ${cx + 30 * s} ${top + 90 * s}, ${cx + 40 * s} ${top + 60 * s}, ${cx + 40 * s} ${top} Z`;
  const st = stems
    ? [-1, 0, 1].map((k) => `<path d="M ${cx + k * 10 * s} ${top + 30 * s} Q ${cx + k * 70 * s} ${top - 120 * s} ${cx + k * 110 * s} ${top - 230 * s}" stroke="#7c6a45" stroke-width="${5 * s}" fill="none"/>
        <ellipse cx="${cx + k * 110 * s}" cy="${top - 236 * s}" rx="${22 * s}" ry="${48 * s}" transform="rotate(${k * 25} ${cx + k * 110 * s} ${top - 236 * s})" fill="#d9c9a3"/>`).join('')
    : '';
  return {
    defs: g.def,
    svg: `${st}<path d="${d}" fill="url(#${g.g})"/><ellipse cx="${cx}" cy="${top}" rx="${40 * s}" ry="${10 * s}" fill="${dark(color, 0.4)}"/>
    <path d="M ${cx - 75 * s} ${top + 200 * s} C ${cx - 105 * s} ${top + 260 * s}, ${cx - 100 * s} ${base - 70 * s}, ${cx - 70 * s} ${base - 30 * s}" stroke="#fff" stroke-width="${9 * s}" fill="none" opacity=".35" stroke-linecap="round"/>`,
  };
}

function candle(cx, base, w, h, glassColor = '#e9d9b8') {
  const top = base - h;
  const glow = radial('#ffe9b0', '#ffe9b000', 0.5, 0.5);
  return {
    defs: glow.def,
    svg: `<circle cx="${cx}" cy="${top + h * 0.15}" r="${w * 1.7}" fill="url(#${glow.g})" opacity=".8"/>
    <rect x="${cx - w * 0.75}" y="${top + h * 0.35}" width="${w * 1.5}" height="${h * 0.6}" rx="10" fill="#fbf6ea"/>
    <path d="M ${cx} ${top + h * 0.12} q ${w * 0.14} ${h * 0.12} 0 ${h * 0.22} q ${-w * 0.14} ${-h * 0.1} 0 ${-h * 0.22}" fill="#ffb53b"/>
    <rect x="${cx - w}" y="${top}" width="${w * 2}" height="${h}" rx="18" fill="${glassColor}" fill-opacity=".35" stroke="#fff" stroke-width="3"/>
    <rect x="${cx - w * 0.75}" y="${top + 16}" width="${w * 0.2}" height="${h - 40}" rx="8" fill="#fff" opacity=".45"/>`,
  };
}

function tray(cx, cy, rx, color = '#c9a15e') {
  const ry = rx * 0.32;
  const top = radial(light(color, 0.45), dark(color, 0.1), 0.35, 0.3);
  return {
    defs: top.def,
    svg: `<ellipse cx="${cx}" cy="${cy + 22}" rx="${rx}" ry="${ry}" fill="${dark(color, 0.35)}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${top.g})"/>
    <ellipse cx="${cx}" cy="${cy + 4}" rx="${rx * 0.9}" ry="${ry * 0.86}" fill="${dark(color, 0.12)}"/>
    <ellipse cx="${cx}" cy="${cy + 6}" rx="${rx * 0.87}" ry="${ry * 0.82}" fill="url(#${top.g})" opacity=".85"/>
    <path d="M ${cx - rx * 1.02} ${cy - 4} q ${-rx * 0.12} ${-ry * 0.3} 0 ${-ry * 0.5}" stroke="${dark(color, 0.2)}" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M ${cx + rx * 1.02} ${cy - 4} q ${rx * 0.12} ${-ry * 0.3} 0 ${-ry * 0.5}" stroke="${dark(color, 0.2)}" stroke-width="12" fill="none" stroke-linecap="round"/>`,
  };
}

function cutlery(cx, base) {
  const m = cyl(METAL, { hi: 0.75, sh: 0.4 });
  const items = [
    // çatal
    (x) => `<rect x="${x - 9}" y="${base - 300}" width="18" height="190" rx="9" fill="url(#${m.g})"/>
      <path d="M ${x - 26} ${base - 470} L ${x - 26} ${base - 370} Q ${x} ${base - 300} ${x + 26} ${base - 370} L ${x + 26} ${base - 470}" fill="none" stroke="url(#${m.g})" stroke-width="9"/>
      ${[-9, 9].map((d) => `<line x1="${x + d}" y1="${base - 470}" x2="${x + d}" y2="${base - 360}" stroke="url(#${m.g})" stroke-width="8"/>`).join('')}
      <rect x="${x - 8}" y="${base - 360}" width="16" height="70" fill="url(#${m.g})"/>`,
    // kaşık
    (x) => `<rect x="${x - 9}" y="${base - 320}" width="18" height="210" rx="9" fill="url(#${m.g})"/><ellipse cx="${x}" cy="${base - 400}" rx="36" ry="62" fill="url(#${m.g})"/>`,
    // bıçak
    (x) => `<rect x="${x - 11}" y="${base - 290}" width="22" height="180" rx="10" fill="url(#${m.g})"/><path d="M ${x - 11} ${base - 290} L ${x - 11} ${base - 490} Q ${x + 22} ${base - 470} ${x + 14} ${base - 290} Z" fill="url(#${m.g})"/>`,
  ];
  return { defs: m.def, svg: [-90, 0, 90].map((d, i) => `<g transform="rotate(${(i - 1) * 7} ${cx} ${base})">${items[i](cx + d)}</g>`).join('') };
}

function grater(cx, base, h = 380) {
  const m = cyl(METAL, { hi: 0.7 });
  const top = base - h;
  const holes = Array.from({ length: 48 }, (_, i) => `<ellipse cx="${cx - 70 + (i % 6) * 28}" cy="${top + 70 + Math.floor(i / 6) * 34}" rx="7" ry="4" fill="#5b6066"/>`).join('');
  return {
    defs: m.def,
    svg: `<path d="M ${cx - 90} ${top + 40} L ${cx - 120} ${base} L ${cx + 120} ${base} L ${cx + 90} ${top + 40} Z" fill="url(#${m.g})"/>${holes}
    <path d="M ${cx - 60} ${top + 40} Q ${cx} ${top - 70} ${cx + 60} ${top + 40}" stroke="#1d1d1f" stroke-width="22" fill="none" stroke-linecap="round"/>`,
  };
}

function knifeBlock(cx, base) {
  const wood = cyl('#9b6a3c', { hi: 0.25 });
  const handles = [-60, -20, 20, 60].map((d, i) => `<rect x="${cx + d - 15 + i * 6}" y="${base - 420 - i * 8}" width="30" height="120" rx="12" fill="#1d1d1f" transform="rotate(-12 ${cx + d} ${base - 330})"/>
    <circle cx="${cx + d + i * 6}" cy="${base - 395 - i * 8}" r="4" fill="${METAL}" transform="rotate(-12 ${cx + d} ${base - 330})"/>`).join('');
  return {
    defs: wood.def,
    svg: `${handles}<path d="M ${cx - 130} ${base - 300} L ${cx + 100} ${base - 360} L ${cx + 140} ${base} L ${cx - 120} ${base} Z" fill="url(#${wood.g})"/>
    <path d="M ${cx - 130} ${base - 300} L ${cx + 100} ${base - 360} L ${cx + 110} ${base - 340} L ${cx - 120} ${base - 285} Z" fill="#7a5130"/>`,
  };
}

function thermos(cx, base, w, h, color) {
  const g = cyl(color, { hi: 0.45 });
  const m = cyl(METAL, { hi: 0.7 });
  const top = base - h;
  return {
    defs: g.def + m.def,
    svg: `<rect x="${cx - w}" y="${top + 70}" width="${w * 2}" height="${h - 70}" rx="${w * 0.35}" fill="url(#${g.g})"/>
    <rect x="${cx - w * 0.82}" y="${top + 30}" width="${w * 1.64}" height="50" rx="10" fill="url(#${m.g})"/>
    <rect x="${cx - w * 0.9}" y="${top - 30}" width="${w * 1.8}" height="70" rx="18" fill="url(#${g.g})"/>
    <rect x="${cx - w}" y="${base - 40}" width="${w * 2}" height="14" fill="#000" opacity=".12"/>`,
  };
}

function breadBox(cx, base, w, h, color) {
  const g = cyl(color, { hi: 0.4 });
  const top = base - h;
  return {
    defs: g.def,
    svg: `<path d="M ${cx - w} ${base} L ${cx - w} ${top + h * 0.35} Q ${cx - w} ${top} ${cx - w * 0.55} ${top} L ${cx + w * 0.55} ${top} Q ${cx + w} ${top} ${cx + w} ${top + h * 0.35} L ${cx + w} ${base} Z" fill="url(#${g.g})"/>
    <path d="M ${cx - w} ${top + h * 0.42} L ${cx + w} ${top + h * 0.42}" stroke="${dark(color, 0.25)}" stroke-width="4"/>
    <rect x="${cx - 50}" y="${top + h * 0.48}" width="100" height="22" rx="11" fill="#b58a52"/>
    <text x="${cx}" y="${top + h * 0.75}" text-anchor="middle" font-family="Playfair Display" font-size="${h * 0.14}" fill="${dark(color, 0.4)}">Ekmek</text>`,
  };
}

function strainer(cx, cy, rx) {
  const m = cyl(METAL, { hi: 0.7 });
  const ry = rx * 0.3;
  const holes = Array.from({ length: 90 }, (_, i) => {
    const col = i % 15, row = Math.floor(i / 15);
    const x = cx - rx * 0.85 + col * (rx * 1.7) / 14;
    const yb = cy + 20 + row * 26;
    const lim = rx * Math.sqrt(Math.max(0, 1 - ((yb - cy) / (rx * 0.85)) ** 2));
    return Math.abs(x - cx) < lim * 0.92 ? `<circle cx="${x}" cy="${yb}" r="3.5" fill="#6a6f75"/>` : '';
  }).join('');
  return {
    defs: m.def,
    svg: `<path d="M ${cx + rx} ${cy} L ${cx + rx * 1.9} ${cy - ry * 1.4}" stroke="#2a2a2c" stroke-width="22" stroke-linecap="round"/>
    <path d="M ${cx - rx * 1.02} ${cy} L ${cx - rx * 1.3} ${cy - 18}" stroke="${METAL}" stroke-width="12" stroke-linecap="round"/>
    <path d="M ${cx - rx} ${cy} C ${cx - rx} ${cy + rx * 0.9}, ${cx + rx} ${cy + rx * 0.9}, ${cx + rx} ${cy} Z" fill="url(#${m.g})"/>${holes}
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#4f5358"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#e6e9ec" stroke-width="7"/>`,
  };
}

const join = (...parts) => ({ defs: parts.map((p) => p.defs).join(''), svg: parts.map((p) => p.svg).join('') });
const raw = (svg) => ({ defs: '', svg });

// ---------- ürünler: slug → çizim ----------
// Sıra demo-lib.ts PRODUCT_NAMES ile aynıdır.
const PRODUCTS = {
  'cay-bardagi': () => join(raw(shadow(500, 760, 300, 30)), teaGlass(340, 720, 1.6), teaGlass(660, 720, 1.6), teaGlass(500, 780, 1.9)),
  'su-bardagi': () => join(raw(shadow(500, 790, 320, 34)), tumbler(320, 740, 80, 300, {}), tumbler(680, 740, 80, 300, {}), tumbler(500, 790, 92, 340, { fill: '#cfe8ef' })),
  'kahve-fincani': () => join(raw(shadow(500, 760, 330, 40)), mug(330, 650, 70, 110, '#1f1d1b', { saucer: true }), mug(660, 650, 70, 110, '#f3efe7', { saucer: true }), mug(500, 790, 78, 122, '#0f5c5a', { saucer: true })),
  'kupa': () => join(raw(shadow(500, 790, 260, 40)), mug(470, 780, 150, 330, '#d9c3a0')),
  'mesrubat-bardagi': () => join(raw(shadow(500, 790, 320, 34)), tumbler(320, 740, 70, 340, { fill: '#c7562a', taper: 0.8 }), tumbler(680, 740, 70, 340, { fill: '#e2a33c', taper: 0.8 }), tumbler(500, 790, 78, 380, { fill: '#7d2f33', taper: 0.8 })),
  'yemek-tabagi': () => join(raw(shadow(500, 640, 380, 80, 0.22)), plate(500, 560, 380, '#fbfaf7', { gold: true })),
  'corba-kasesi': () => join(raw(shadow(500, 760, 260, 40)), bowl(500, 520, 290, 250, '#efe9df', { inner: '#f7f3eb', pattern: '#1f4d7a' })),
  'servis-tabagi': () => join(raw(shadow(500, 640, 420, 80, 0.22)), plate(500, 560, 420, '#1d1c1b', { gold: true, ry: 130 })),
  'tatli-tabagi': () => join(raw(shadow(500, 720, 330, 60, 0.22)), plate(500, 690, 330, '#d9e3dc'), plate(500, 610, 320, '#d9e3dc'), plate(500, 530, 310, '#d9e3dc', { gold: true })),
  'salata-kasesi': () => join(raw(shadow(500, 770, 300, 45)), bowl(500, 500, 340, 270, '#6f8b6e', { inner: '#eef0e6' })),
  'celik-tencere': () => join(raw(shadow(500, 800, 300, 45)), pot(500, 790, 230, 330, '#c4c9ce', { glassLid: true })),
  'granit-tava': () => join(raw(shadow(460, 680, 330, 60)), pan(420, 560, 290)),
  'duduklu-tencere': () => join(raw(shadow(500, 800, 290, 45)), pot(500, 790, 210, 380, '#cdd2d6', { long: true })),
  'caydanlik': () => join(raw(shadow(500, 810, 260, 40)), pot(500, 800, 190, 260, '#c7ccd1', { lid: false }), pot(500, 530, 120, 170, '#c7ccd1'), raw(`<path d="M 380 470 Q 300 430 290 360" stroke="#aeb3b8" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M 620 400 Q 680 300 620 260" stroke="#1d1d1f" stroke-width="16" fill="none" stroke-linecap="round"/>`)),
  'sahan': () => join(raw(shadow(500, 720, 330, 50)), pot(500, 700, 250, 110, '#9f4a2c', { lid: false })),
  'suzgec': () => join(raw(shadow(450, 720, 300, 45)), strainer(430, 520, 260)),
  'kesme-tahtasi': () => join(raw(shadow(500, 830, 330, 34)), board(500, 520, 290, 560)),
  'bicak-seti': () => join(raw(shadow(510, 810, 260, 36)), knifeBlock(500, 800)),
  'rende': () => join(raw(shadow(500, 820, 200, 30)), grater(500, 810, 560)),
  'spatula-seti': () => join(raw(shadow(500, 820, 240, 34)), utensil(390, 600, 420, 'spatula'), utensil(470, 560, 460, 'ladle'), utensil(550, 570, 450, 'spoon', '#7a5130'), utensil(625, 600, 420, 'whisk'), mug(500, 820, 170, 300, '#efe7da', { handle: false })),
  'cam-saklama': () => join(raw(shadow(500, 800, 330, 40)), box(470, 790, 250, 230, 90, '#2f6f73')),
  'plastik-kutu': () => join(raw(shadow(500, 820, 300, 40)), box(480, 820, 230, 150, 70, '#e3b23c', { glass: false }), box(480, 640, 200, 130, 60, '#d55d3a', { glass: false }), box(480, 480, 170, 110, 50, '#5f8fa8', { glass: false })),
  'baharat-takimi': () => join(raw(shadow(500, 790, 360, 36)), jar(270, 780, 60, 230, '#c0392b', '#2b2b2e'), jar(420, 780, 60, 230, '#e3a72f', '#2b2b2e'), jar(570, 780, 60, 230, '#6b7d3a', '#2b2b2e'), jar(720, 780, 60, 230, '#7a4b2a', '#2b2b2e')),
  'ekmek-kutusu': () => join(raw(shadow(500, 800, 340, 40)), breadBox(500, 790, 300, 380, '#ece4d6')),
  'termos': () => join(raw(shadow(500, 830, 170, 30)), thermos(500, 820, 110, 600, '#24453f')),
  'seramik-vazo': () => join(raw(shadow(500, 820, 200, 34)), vase(500, 820, 1.3, '#e6dccb', { stems: true })),
  'mumluk-seti': () => join(raw(shadow(500, 800, 330, 36)), candle(330, 760, 70, 220), candle(670, 760, 70, 260), candle(500, 800, 85, 330)),
  'dekoratif-tepsi': () => join(raw(shadow(500, 700, 400, 70, 0.2)), tray(500, 600, 390), candle(420, 600, 50, 150), vase(600, 610, 0.5, '#1d1c1b')),
  'dekoratif-kase': () => join(raw(shadow(500, 760, 280, 40)), bowl(500, 540, 320, 220, '#1c1b1a', { inner: '#c9a15e' })),
  'mini-vazo': () => join(raw(shadow(500, 800, 330, 34)), vase(340, 780, 0.7, '#a3502f'), vase(500, 800, 0.85, '#f1ece2'), vase(660, 780, 0.7, '#2f4f4a')),
  'catal-kasik-seti': () => join(raw(shadow(500, 830, 250, 30)), cutlery(500, 820)),
};

// ---------- sahneler: duvar + masa (fotoğraf stüdyosu hissi) ----------
const SCENES = {
  cream: { wall: ['#f3ebdf', '#e4d6c2'], table: ['#d9b48a', '#b88a5c'], grain: '#8a5f36' },
  terracotta: { wall: ['#d49a7c', '#b9715a'], table: ['#e9dccb', '#cdbba3'], grain: '#9c8a72' },
  sage: { wall: ['#c7d0bd', '#a9b59d'], table: ['#e8e2d8', '#d3cabd'], grain: '#a59c8e', marble: true },
  sand: { wall: ['#eadcc6', '#d8c3a3'], table: ['#f4efe8', '#e2d9cc'], grain: '#b5a998', marble: true },
  blue: { wall: ['#cfd9df', '#aebfc9'], table: ['#d6b48e', '#b78c63'], grain: '#7e5733' },
  charcoal: { wall: ['#4a433d', '#2e2925'], table: ['#7a5638', '#563a24'], grain: '#2c1d12', glow: '#ffdca8' },
};
function scene(w, h, name, tableY) {
  const sc = SCENES[name];
  const wall = vgrad(sc.wall[0], sc.wall[1]);
  const table = vgrad(sc.table[0], sc.table[1]);
  const glow = radial(sc.glow ?? '#ffffff', `${sc.glow ?? '#ffffff'}00`, 0.5, 0.5);
  const lines = Array.from({ length: Math.round((h - tableY) / 22) }, (_, i) => {
    const y = tableY + 18 + i * 22 + (i % 3) * 4;
    const amp = sc.marble ? 30 : 4;
    return `<path d="M 0 ${y} C ${w * 0.25} ${y - amp}, ${w * 0.5} ${y + amp}, ${w * 0.75} ${y - amp * 0.5} S ${w} ${y + amp * 0.3}, ${w * 1.05} ${y}" stroke="${sc.grain}" stroke-width="${sc.marble ? 1.4 : 2}" fill="none" opacity="${sc.marble ? 0.18 : 0.22}"/>`;
  }).join('');
  return {
    defs: wall.def + table.def + glow.def,
    svg: `<rect width="${w}" height="${tableY}" fill="url(#${wall.g})"/>
    <ellipse cx="${w * 0.3}" cy="${tableY * 0.35}" rx="${w * 0.55}" ry="${tableY * 0.7}" fill="url(#${glow.g})" opacity="${sc.glow ? 0.35 : 0.45}"/>
    <polygon points="${w * 0.62},0 ${w * 0.86},0 ${w * 0.7},${tableY} ${w * 0.44},${tableY}" fill="#ffffff" opacity="${sc.glow ? 0.04 : 0.09}"/>
    <rect y="${tableY - 26}" width="${w}" height="26" fill="#000" opacity=".06"/>
    <rect y="${tableY}" width="${w}" height="${h - tableY}" fill="url(#${table.g})"/>${lines}
    <rect y="${tableY}" width="${w}" height="3" fill="#fff" opacity=".35"/>`,
  };
}

/** Ürün → sahne (ürün rengine göre kontrastlı zemin). */
const SCENE_OF = {
  'cay-bardagi': 'blue', 'su-bardagi': 'terracotta', 'kahve-fincani': 'sand', kupa: 'sage', 'mesrubat-bardagi': 'cream',
  'yemek-tabagi': 'terracotta', 'corba-kasesi': 'cream', 'servis-tabagi': 'sand', 'tatli-tabagi': 'terracotta', 'salata-kasesi': 'sand',
  'catal-kasik-seti': 'charcoal', 'celik-tencere': 'terracotta', 'granit-tava': 'sage', 'duduklu-tencere': 'blue', caydanlik: 'cream',
  sahan: 'sage', suzgec: 'terracotta', 'kesme-tahtasi': 'sage', 'bicak-seti': 'blue', rende: 'terracotta', 'spatula-seti': 'sage',
  'cam-saklama': 'terracotta', 'plastik-kutu': 'sand', 'baharat-takimi': 'blue', 'ekmek-kutusu': 'sage', termos: 'sand',
  'seramik-vazo': 'charcoal', 'mumluk-seti': 'charcoal', 'dekoratif-tepsi': 'sage', 'dekoratif-kase': 'sand', 'mini-vazo': 'cream',
};

const BG = (w, h, dark = false) =>
  dark
    ? `<rect width="${w}" height="${h}" fill="#141210"/><rect width="${w}" height="${h}" fill="url(#bgd)"/>`
    : `<rect width="${w}" height="${h}" fill="url(#bg)"/>`;

function productSvg(fn, sceneName) {
  uid = 0;
  const art = fn();
  const sc = scene(1000, 1000, sceneName, 660);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1000 1000">
  <defs><radialGradient id="bg" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#ece4d6"/></radialGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>${art.defs}${sc.defs}</defs>
  ${sc.svg}<g id="art">${art.svg}</g></svg>`;
}

// ---------- kampanya görselleri (3:1) ----------
function bannerSvg({ dark, eyebrow, title, sub, art, sceneName }) {
  uid = 0;
  const a = art();
  const sc = scene(1800, 600, sceneName, 470);
  const fg = dark ? '#f7f3eb' : '#1c1a17';
  const accent = dark ? '#f2c78a' : '#8a5a1c';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="600" viewBox="0 0 1800 600">
  <defs><radialGradient id="bg" cx="0.7" cy="0.5" r="0.9"><stop offset="0" stop-color="#fffaf2"/><stop offset="1" stop-color="#eadfcc"/></radialGradient>
  <radialGradient id="bgd" cx="0.72" cy="0.5" r="0.7"><stop offset="0" stop-color="#3a2f22" stop-opacity=".9"/><stop offset="1" stop-color="#141210" stop-opacity="0"/></radialGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>${a.defs}${sc.defs}
  <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="${dark ? '#000' : '#fff'}" stop-opacity="${dark ? 0.35 : 0.3}"/><stop offset="0.55" stop-color="${dark ? '#000' : '#fff'}" stop-opacity="0"/></linearGradient></defs>
  ${sc.svg}<rect width="1800" height="600" fill="url(#fade)"/>
  <line x1="120" y1="168" x2="190" y2="168" stroke="${dark ? '#f2c78a' : '#dcb47a'}" stroke-width="3"/>
  <text x="206" y="178" font-family="Plus Jakarta Sans" font-weight="700" font-size="26" letter-spacing="5" fill="${accent}">${eyebrow}</text>
  ${title.map((t, i) => `<text x="120" y="${268 + i * 84}" font-family="Playfair Display" font-weight="700" font-size="76" fill="${fg}">${t}</text>`).join('')}
  <text x="120" y="${268 + title.length * 84 + 10}" font-family="Plus Jakarta Sans" font-weight="500" font-size="30" fill="${dark ? '#cfc6b8' : '#5f584e'}">${sub}</text>
  <g transform="translate(900 -200) scale(0.8)">${a.svg}</g></svg>`;
}

const BANNERS = {
  'kampanya-sofra': {
    dark: true, sceneName: 'terracotta', eyebrow: 'YENİ SEZON', title: ['Sofranıza yeni', 'sezon şıklığı'], sub: 'Altın detaylı tabak ve servis koleksiyonu katalogda.',
    art: () => join(raw(shadow(500, 900, 520, 70, 0.5)), plate(430, 820, 420, '#fbfaf7', { gold: true }), bowl(620, 640, 200, 150, '#1d1c1b', { inner: '#c9a15e' }), teaGlass(950, 880, 2.2)),
  },
  'kampanya-mutfak': {
    dark: false, sceneName: 'sand', eyebrow: 'MUTFAK', title: ['Profesyonel', 'mutfak ekipmanı'], sub: 'Tencere, tava ve gereçlerde koli bazında toptan fiyat.',
    art: () => join(raw(shadow(560, 950, 560, 60)), pot(300, 950, 200, 300, '#c4c9ce', { glassLid: true }), pan(680, 830, 220)),
  },
  'kampanya-dekor': {
    dark: true, sceneName: 'charcoal', eyebrow: 'DEKORASYON', title: ['Evlere sıcaklık', 'katan detaylar'], sub: 'Vazo, mumluk ve dekoratif tepsiler stokta.',
    art: () => join(raw(shadow(560, 940, 520, 60, 0.5)), vase(300, 930, 1.3, '#e6dccb', { stems: true }), candle(620, 930, 90, 330), vase(880, 930, 0.95, '#a3502f')),
  },
};

// ---------- render ----------
const fontCss = ['playfair-display/files/playfair-display-latin-ext-700-normal.woff2', 'playfair-display/files/playfair-display-latin-700-normal.woff2']
  .map((f) => `@font-face{font-family:'Playfair Display';font-weight:700;src:url(data:font/woff2;base64,${readFileSync(path.join(fontDir, f)).toString('base64')})}`)
  .concat(['500', '700'].flatMap((w) => [`latin-ext`, `latin`].map((s) => `@font-face{font-family:'Plus Jakarta Sans';font-weight:${w};src:url(data:font/woff2;base64,${readFileSync(path.join(fontDir, `plus-jakarta-sans/files/plus-jakarta-sans-${s}-${w}-normal.woff2`)).toString('base64')})}`)))
  .join('');

const outDir = (d) => (mkdirSync(path.join(here, d), { recursive: true }), path.join(here, d));
const only = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(svg, w, h, file, width) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><head><style>${fontCss}html,body{margin:0}</style></head><body>${svg}</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // Ürün görseli: çizimi kadraja otomatik sığdır (alt kenar zemine otursun, ürün kareyi doldursun).
  await page.evaluate(() => {
    const art = document.getElementById('art');
    if (!art) return;
    const bb = art.getBBox();
    const k = Math.min(760 / bb.width, 700 / bb.height, 2.2);
    const tx = 500 - (bb.x + bb.width / 2) * k;
    const ty = 840 - (bb.y + bb.height) * k;
    art.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
  });
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  writeFileSync(file, await sharp(png).resize({ width }).webp({ quality: 84 }).toBuffer());
}
for (const [slug, fn] of Object.entries(PRODUCTS)) {
  if (only && only !== slug) continue;
  await render(productSvg(fn, SCENE_OF[slug] ?? 'cream'), 1200, 1200, path.join(outDir('products'), `${slug}.webp`), 1000);
}
for (const [slug, b] of Object.entries(BANNERS)) {
  if (only && only !== slug) continue;
  await render(bannerSvg(b), 1800, 600, path.join(outDir('banners'), `${slug}.webp`), 1500);
}
await browser.close();
console.log('Demo görselleri üretildi:', outDir('products'), outDir('banners'));
