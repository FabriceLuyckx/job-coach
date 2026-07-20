#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx
//
// Shell contrast check: every persistent element on the app-shell wall
// (--frame) must clear its WCAG threshold. The cream sheet's colours were
// audited when they were written; the wall never was (see
// openspec/changes/fix-shell-color-contrast). Run: node scripts/check_contrast.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexCss = readFileSync(join(root, 'frontend/src/index.css'), 'utf8');
const appCss = readFileSync(join(root, 'frontend/src/App.css'), 'utf8');

// --- token + declaration extraction -----------------------------------------

const tokens = Object.fromEntries(
  [...indexCss.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map(([, k, v]) => [k, v.trim()]),
);

/** The value of `prop` inside the block for `selector` (exact selector text). */
function decl(css, selector, prop) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`(?:^|[},])\\s*${esc}\\s*\\{([^}]*)\\}`, 'm'));
  if (!block) throw new Error(`no rule for "${selector}"`);
  const m = block[1].match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`));
  if (!m) throw new Error(`no "${prop}" in "${selector}"`);
  return m[1].trim();
}

// --- colour --------------------------------------------------------------

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Resolve a CSS colour expression to [r,g,b], compositing any alpha over `bg`. */
function color(expr, bg) {
  expr = expr.trim();

  const v = expr.match(/^var\((--[\w-]+)\)$/);
  if (v) return color(tokens[v[1]], bg);

  // color-mix(in srgb, <color> N%, transparent) — N% opacity over bg
  const mix = expr.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*transparent\)$/);
  if (mix) {
    const fg = color(mix[1], bg);
    const a = Number(mix[2]) / 100;
    return fg.map((c, i) => c * a + bg[i] * (1 - a));
  }

  const rgba = expr.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/);
  if (rgba) {
    const [r, g, b] = rgba.slice(1, 4).map(Number);
    const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return [r, g, b].map((c, i) => c * a + bg[i] * (1 - a));
  }

  if (/^#[0-9a-f]{6}$/i.test(expr)) return hex(expr);
  throw new Error(`cannot parse colour "${expr}"`);
}

/** The colour part of a box-shadow value (offsets first, colour last). */
function shadowColor(expr) {
  const v = expr.trim().match(/^var\((--[\w-]+)\)$/);
  if (v) return shadowColor(tokens[v[1]]);
  return expr.replace(/^(?:[-\d.]+(?:px)?\s+){2,3}/, '').replace(/\s*\/\*.*$/, '').trim();
}

const lum = (rgb) =>
  rgb
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// --- the checks -------------------------------------------------------------

const wall = color(tokens['--frame'], [255, 255, 255]);
// Hover ground: the wash sits on the wall, so hover text is judged against it.
const hoverGround = color(decl(appCss, '.sidebar-nav a:hover', 'background'), wall);

const checks = [
  ['nav inactive', decl(appCss, '.sidebar-nav a', 'color'), wall, 4.5],
  ['nav hover', decl(appCss, '.sidebar-nav a:hover', 'color'), hoverGround, 4.5],
  ['nav active', decl(appCss, '.sidebar-nav a.active', 'color'),
    color(decl(appCss, '.sidebar-nav a.active', 'background'), wall), 4.5],
  ['wordmark', decl(appCss, '.sidebar-nav .nav-logo', 'color'), wall, 4.5],
  ['wordmark em', decl(appCss, '.nav-logo em', 'color'), wall, 4.5],
  ['footer text', decl(appCss, '.app-footer', 'color'), wall, 4.5],
  ['AGPL link', decl(appCss, '.app-footer a', 'color'), wall, 4.5],
  ['page-sheet shadow', shadowColor(decl(appCss, '.page-container', 'box-shadow')), wall, 1.2],
];

let failed = 0;
for (const [name, expr, bg, min] of checks) {
  const r = ratio(color(expr, bg), bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(20)} ${r.toFixed(2)}:1  (needs ${min}:1)`);
}

console.log(failed ? `\n${failed} shell contrast failure(s)` : '\nall shell pairs pass');
process.exit(failed ? 1 : 0);
