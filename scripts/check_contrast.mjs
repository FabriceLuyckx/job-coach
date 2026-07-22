#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx
//
// Shell contrast check (Atelier / Stone): the app is one drenched sage ground
// with the sidebar a tonal step of it — no dark wall. Every persistent shell
// element must clear its WCAG threshold against the sage surface it sits on, and
// terracotta *as text* (CTA/deadline) must use --accent-text, not the fill value
// --accent (which passes only as a fill). Run: node scripts/check_contrast.mjs

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

  // color-mix(in srgb, <color> N%, <color2|transparent>) — N% of <color> over the rest.
  const mix = expr.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*(.+?)\)$/);
  if (mix) {
    const a = Number(mix[2]) / 100;
    const over = mix[3].trim() === 'transparent' ? bg : color(mix[3], bg);
    const fg = color(mix[1], over);
    return fg.map((c, i) => c * a + over[i] * (1 - a));
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

const lum = (rgb) =>
  rgb
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// --- grounds ----------------------------------------------------------------

const white = [255, 255, 255];
const ground = color(tokens['--ground'], white);
const board = color(tokens['--board'], white);
const accentFill = color(tokens['--accent'], white);
// The sidebar is a tonal step of the ground; read it from the source, not a copy.
const sidebar = color(decl(appCss, '.sidebar-nav', 'background'), white);
// Nav hover wash sits on the sidebar, so hover text is judged against it.
const hoverGround = color(decl(appCss, '.sidebar-nav a:hover', 'background'), sidebar);

const checks = [
  // Sidebar / nav — against the sage sidebar step
  ['nav inactive', decl(appCss, '.sidebar-nav a', 'color'), sidebar, 4.5],
  ['nav hover', decl(appCss, '.sidebar-nav a:hover', 'color'), hoverGround, 4.5],
  ['nav active', decl(appCss, '.sidebar-nav a.active', 'color'),
    color(decl(appCss, '.sidebar-nav a.active', 'background'), sidebar), 4.5],
  ['wordmark', decl(appCss, '.sidebar-nav .nav-logo', 'color'), sidebar, 4.5],
  ['wordmark em', decl(appCss, '.nav-logo em', 'color'), sidebar, 4.5],
  // Footer + AGPL §13 link — now on the ground
  ['footer text', decl(appCss, '.app-footer', 'color'), ground, 4.5],
  ['AGPL link', decl(appCss, '.app-footer a', 'color'), ground, 4.5],
  // Muted text on the two grounds it actually sits on
  ['muted on ground', tokens['--muted'], ground, 4.5],
  ['muted on board', tokens['--muted'], board, 4.5],
  // Pine marker (match/success word) as text
  ['mark on ground', tokens['--mark'], ground, 4.5],
  ['mark on board', tokens['--mark'], board, 4.5],
  // Terracotta AS TEXT must use --accent-text (= --deadline), not the fill value
  ['accent-text on ground', tokens['--accent-text'], ground, 4.5],
  ['accent-text on board', tokens['--accent-text'], board, 4.5],
  ['deadline on ground', tokens['--deadline'], ground, 4.5],
  ['deadline on board', tokens['--deadline'], board, 4.5],
  // Terracotta AS FILL: white label on the accent button
  ['white on accent', tokens['--accent-ink'], accentFill, 4.5],
];

let failed = 0;
for (const [name, expr, bg, min] of checks) {
  const r = ratio(color(expr, bg), bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(22)} ${r.toFixed(2)}:1  (needs ${min}:1)`);
}

console.log(failed ? `\n${failed} shell contrast failure(s)` : '\nall shell pairs pass');
process.exit(failed ? 1 : 0);
