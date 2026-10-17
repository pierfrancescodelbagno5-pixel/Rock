#!/usr/bin/env node
/*
 * Slime Reborn — headless smoke test.
 *
 *   node tools/smoke-test.mjs [--seconds 40] [--speed 4] [--shots tools/screenshots] [--biomes 0,1,2,3] [--menus]
 *
 * Serves web/ over a local HTTP server, opens it in Chromium with a landscape
 * phone viewport, lets the autoplay bot play, and fails on any page error or
 * console.error. Screenshots are written to tools/screenshots/.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..', 'web');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const SECONDS = parseFloat(arg('seconds', 40));
const SPEED = parseFloat(arg('speed', 4));
const SHOTS = path.resolve(arg('shots', path.join(here, 'screenshots')));
const BIOMES = String(arg('biomes', '0')).split(',').map((n) => parseInt(n, 10));
const MENUS = !!arg('menus', false);

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  const require = createRequire(path.join(globalRoot, 'noop.js'));
  return require('playwright');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let p = path.normalize(path.join(webRoot, decodeURIComponent(url.pathname)));
      if (!p.startsWith(webRoot)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const errors = [];
  const report = { runs: [] };

  async function newPage() {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('[pageerror] ' + (e.stack || e.message)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });
    return { ctx, page };
  }

  for (const biome of BIOMES) {
    const { ctx, page } = await newPage();
    await page.goto(`${base}?debug&autoplay&god&speed=${SPEED}&biome=${biome}`);
    await sleep(1500);
    await page.screenshot({ path: path.join(SHOTS, `b${biome}-00-title.png`) });
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      await sleep((SECONDS * 1000) / steps);
      await page.screenshot({ path: path.join(SHOTS, `b${biome}-${String(i).padStart(2, '0')}-play.png`) });
    }
    const state = await page.evaluate(() => {
      const G = window.SK && SK.G;
      if (!G) return null;
      const p = G.player || {};
      return {
        state: G.state, t: Math.round(G.t || 0), biome: G.biome, kills: G.kills, level: p.level, stage: p.stage,
        hp: p.hp && Math.round(p.hp), enemies: G.enemies && G.enemies.length, allies: G.allies && G.allies.length,
        projectiles: G.projectiles && G.projectiles.length, pickups: G.pickups && G.pickups.length,
        skills: p.skills, slots: p.slots, particles: SK.FX && SK.FX.count ? SK.FX.count() : null, fps: SK.debug.fps,
      };
    });
    report.runs.push({ biome, state });
    await ctx.close();
  }

  if (MENUS) {
    const { ctx, page } = await newPage();
    await page.goto(`${base}?debug`);
    await sleep(1200);
    const screens = [
      ['title', () => SK.UI.show('title')],
      ['creator', () => SK.Character.openCreator(() => {})],
      ['nation', () => SK.Nation.open()],
      ['shop', () => SK.UI.show('shop')],
      ['bestiary', () => SK.UI.show('bestiary')],
      ['skills', () => SK.UI.show('skills')],
      ['settings', () => SK.UI.show('settings')],
    ];
    for (const [name, fn] of screens) {
      try {
        await page.evaluate(`(${fn.toString()})()`);
        await sleep(900);
        await page.screenshot({ path: path.join(SHOTS, `menu-${name}.png`) });
      } catch (e) { errors.push(`[menu ${name}] ${e.message}`); }
    }
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) {
    const uniq = [...new Set(errors)];
    console.error(`\n${uniq.length} unique error(s):\n` + uniq.slice(0, 40).join('\n\n'));
    process.exit(1);
  }
  console.log('\nSMOKE TEST PASSED — screenshots in ' + SHOTS);
}

main().catch((e) => { console.error(e); process.exit(2); });
