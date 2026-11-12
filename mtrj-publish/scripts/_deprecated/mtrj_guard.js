/**
 * 媒体人家 WAF「旋转拼图」滑块 —— 自动过关模块
 *
 * 逆向所得机制：
 *   guardword Cookie = a_b_c_initialX_initialY_f
 *     圆心(a,b)、半径 c、拼图块初始中心(initialX,initialY)、扫角 f°
 *   块沿圆弧运动：startAngle=atan2(initialY-b, initialX-a)，isUpward=(initialY>b)
 *   拖动百分比 p → 旋转角 rot = -(p*f)   (isUpward)
 *                  rot = +(p*f)   (否则)
 *   松手时页面算 guardret = base64(RC4(round(rot*100)/100, guard.substr(0,8))) 写 Cookie，
 *   然后 reload 由服务端校验；通过则下发 _ok5_。
 *
 * ★ 实测结论（重要）：
 *   1) 本模块的 RC4+base64 与页面实现**逐字节一致**（已对比验证）。
 *   2) 但**直接写 guardret Cookie 不会过关**——即使把 rot 全域扫一遍也全失败。
 *      必须走"真实鼠标拖动 + 页面自己 reload"这条路。
 *   3) 因此每个挑战只能猜一次；失败后服务端会换一个新挑战。
 *      → 策略：每轮按假设队列挑一个候选，失败则下一轮换假设，通常 1~3 轮收敛。
 *
 * 导出：solveGuard(page, opts) -> {passed, rounds, tries}
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PY = process.env.MTRJ_PY ||
  path.join(os.homedir(), '.workbuddy-ai', 'binaries', 'python', 'envs', 'default', 'Scripts', 'python.exe');
const ANALYZER = process.env.MTRJ_ANALYZER || path.join(__dirname, 'guard_solve_pos.py');
const TMP = path.join(os.homedir(), '.mtrj', 'slider');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 与 slide.js 等价的 RC4 + base64（用于自检/对照） ----------
function rc4(text, key) {
  const s = [];
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    const t = s[i]; s[i] = s[j]; s[j] = t;
  }
  let i = 0; j = 0; let out = '';
  for (let k = 0; k < text.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    const t = s[i]; s[i] = s[j]; s[j] = t;
    out += String.fromCharCode(text.charCodeAt(k) ^ s[(s[i] + s[j]) % 256]);
  }
  return out;
}
function guardretFor(rotation, guard) {
  return Buffer.from(rc4(String(Math.round(rotation * 100) / 100), guard.substr(0, 8)), 'latin1').toString('base64');
}

async function readChallenge(page) {
  return await page.evaluate(() => {
    const g = n => (document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(n + '=')) || '')
      .split('=').slice(1).join('=');
    const img = document.querySelector('.puzzle-image');
    const slider = document.querySelector('.slider');
    const handle = document.querySelector('.slider-handle');
    return {
      hasChallenge: !!document.querySelector('.puzzle-container'),
      guardword: g('guardword'),
      guard: g('guard'),
      bg: img ? ((img.style.backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1] || '') : '',
      sliderW: slider ? slider.offsetWidth : 0,
      handleW: handle ? handle.offsetWidth : 0,
    };
  });
}

/**
 * 过滑块。page 需已停在挑战页（或任意被拦页面）。
 */
async function solveGuard(page, opts = {}) {
  const maxRounds = opts.maxRounds || 5;
  const log = opts.log || (() => {});
  fs.mkdirSync(TMP, { recursive: true });
  const tries = [];

  for (let round = 1; round <= maxRounds; round++) {
    const ch = await readChallenge(page);
    if (!ch.hasChallenge) { log(`  第${round}轮：无挑战 → 已放行`); return { passed: true, rounds: round, tries }; }
    if (!ch.guardword) { log(`  第${round}轮：无 guardword，重载`); await page.reload(); await sleep(3000); continue; }

    const imgPath = path.join(TMP, `guard-${round}.png`);
    const b64 = await page.evaluate(async u => {
      const r = await fetch(u, { credentials: 'include' });
      const buf = await r.arrayBuffer(); const b = new Uint8Array(buf);
      let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s);
    }, ch.bg);
    fs.writeFileSync(imgPath, Buffer.from(b64, 'base64'));

    let res;
    try {
      const raw = execFileSync(PY, [ANALYZER, imgPath, ch.guardword], { encoding: 'utf8' });
      res = JSON.parse(raw.split('\n').filter(l => l.trim().startsWith('{')).pop());
    } catch (e) { log(`  第${round}轮：分析失败 ${e.message}`); continue; }

    const cands = res.candidates || [];
    if (!cands.length) { log(`  第${round}轮：无候选缺口，换挑战`); await page.reload(); await sleep(3000); continue; }

    // 假设队列：候选 rot 及其取反（符号不确定时兜底）；只保留 p 落在 (0.01,0.99) 的
    const [, bb, , , iy, f] = ch.guardword.split('_').map(Number);
    const isUp = iy > bb;
    const pOf = r => (isUp ? (-r) / f : r / f);
    const hyps = [];
    cands.forEach(c => {
      const p = pOf(c.rot);
      if (p > 0.01 && p < 0.99) hyps.push({ rot: c.rot, p, src: `cand@${c.center}`, diff: c.diff });
      const pn = pOf(-c.rot);
      if (pn > 0.01 && pn < 0.99) hyps.push({ rot: -c.rot, p: pn, src: `cand-neg@${c.center}`, diff: c.diff + 50 });
    });
    if (!hyps.length) { log(`  第${round}轮：无有效假设，换挑战`); await page.reload(); await sleep(3000); continue; }
    hyps.sort((x, y) => x.diff - y.diff);
    const h = hyps[(round - 1) % hyps.length];

    const maxLeft = ch.sliderW - ch.handleW;
    const delta = h.p * maxLeft;
    log(`  第${round}轮：${h.src} rot=${h.rot}° → p=${h.p.toFixed(3)} 拖 ${delta.toFixed(1)}px (共${hyps.length}假设)`);

    const box = await page.locator('.slider-handle').boundingBox();
    const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await sleep(100);
    await page.mouse.down();
    await sleep(100);
    for (let i = 1; i <= 25; i++) { await page.mouse.move(sx + delta * i / 25, sy, { steps: 1 }); await sleep(10); }
    await sleep(120);
    await page.mouse.up();
    await sleep(4000);

    const after = await readChallenge(page);
    tries.push({ round, src: h.src, rot: h.rot, p: h.p, passed: !after.hasChallenge });
    if (!after.hasChallenge) { log(`    ✓ 通过（${h.src}）`); return { passed: true, rounds: round, tries }; }
    log('    ✗ 未过');
  }
  return { passed: false, rounds: maxRounds, tries };
}

module.exports = { solveGuard, guardretFor, readChallenge };

// ---------- 命令行自测 ----------
if (require.main === module) {
  const { chromium } = require('playwright-core');
  (async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mtrj-guard-'));
    const ctx = await chromium.launchPersistentContext(tmp, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true, viewport: { width: 1440, height: 900 }, locale: 'zh-CN',
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
    ctx.setDefaultTimeout(60000);
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://www.mtrj.vip/', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    const r = await solveGuard(page, { log: console.log });
    const cks = (await ctx.cookies()).map(c => c.name);
    console.log('\n结果:', r.passed ? '通过 ✅' : '失败 ❌', '| 轮次', r.rounds, '| cookies:', cks.join(','));
    await ctx.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(r.passed ? 0 : 2);
  })().catch(e => { console.error('ERR', e.message); process.exit(1); });
}
