/**
 * 媒体人家（mtrj.vip）自动登录测试
 *   1) 调 quit 接口退出登录 → 确认被踢回登录页
 *   2) 抓验证码图 → 存 captcha-N.png，等待 code-N.txt（由外部识别后写入）
 *   3) 按平台原逻辑提交：verifycode → login（明文 menberpwd）
 *   4) 校验是否登录成功；失败则换验证码重试
 *
 * 用法：MTRJ_PWD=xxx node mtrj_login_test.js [--profile <dir>] [--attempts 3] [--headed]
 * 产物：C:\Users\123\.mtrj\login\ 下 captcha-N.png / result.json
 * 退出码：0 登录成功 / 2 登录失败 / 1 异常
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { solveGuard } = require('./mtrj_guard');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PROFILE = arg('--profile', 'D:\\Software\\workbuddy\\2026-10-12-09-39-38\\browser-profile');
const MAX_ATTEMPTS = parseInt(arg('--attempts', '3'), 10);
const HEADED = argv.includes('--headed');
const USER = arg('--user', 'nhqinang');
const PWD = process.env.MTRJ_PWD || '';
const OUT = 'C:\\Users\\123\\.mtrj\\login';
const STATE = path.join(PROFILE, 'storage-state.json');
const BASE = 'https://www.mtrj.vip/';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { startedAt: new Date().toISOString(), profile: PROFILE, user: USER, attempts: [] };

  if (!PWD) { console.error('!! 缺少密码：请通过 MTRJ_PWD 环境变量传入'); process.exit(1); }

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: !HEADED,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 3,          // 放大验证码图，便于识别
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  ctx.setDefaultTimeout(60000);
  const page = ctx.pages()[0] || await ctx.newPage();
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true }).catch(() => {});

  // ============ 0. 先过 WAF 滑块（若 _ok5_ 缺失/过期才会出现） ============
  log('>> 检查 WAF 是否拦截');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  const guard = await solveGuard(page, { maxRounds: 8, log });
  report.guard = { passed: guard.passed, rounds: guard.rounds, tries: guard.tries };
  if (!guard.passed) {
    console.error('!! WAF 滑块未通过，无法继续登录');
    await shot('0-guard-fail');
    await ctx.close(); process.exit(2);
  }
  log(guard.rounds === 1 ? '   未触发滑块（_ok5_ 有效）' : `   滑块已通过（${guard.rounds} 轮）`);

  // ============ 0b. 基线：确认当前是否已登录 ============
  await page.goto(BASE + 'Manage/', { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  let html = await page.content();
  report.beforeLogout = {
    url: page.url(),
    htmlLen: html.length,
    loggedIn: html.includes(USER) && !html.includes('name="UserPassWord"'),
  };
  log('>> 退出前状态:', JSON.stringify(report.beforeLogout));

  // ============ 1. 退出登录 ============
  log('>> 调用 quit 退出登录');
  const quitResp = await page.evaluate(async () => {
    const r = await fetch('/IHttpHandler/Handler_Menber_Login.ashx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: 'typename=quit',
      credentials: 'include',
    });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  });
  report.quit = quitResp;
  log('   quit 返回:', JSON.stringify(quitResp));

  await sleep(1000);
  await page.goto(BASE + 'Manage/', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  html = await page.content();
  report.afterLogout = {
    url: page.url(),
    htmlLen: html.length,
    loginFormVisible: html.includes('name="UserPassWord"'),
    stillHasUser: html.includes(USER),
  };
  await shot('1-logged-out');
  log('>> 退出后状态:', JSON.stringify(report.afterLogout));

  // ============ 2. 打开登录页 ============
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  html = await page.content();
  report.loginPage = {
    url: page.url(),
    hasLoginForm: html.includes('name="UserPassWord"'),
    hasSlider: html.includes('slider_html'),
  };
  log('>> 登录页:', JSON.stringify(report.loginPage));
  if (report.loginPage.hasSlider) log('   ⚠️ 出现 WAF 滑块，需人工处理');

  // ============ 3~6. 验证码 → 提交 → 校验（多轮重试） ============
  let loggedIn = false;
  for (let n = 1; n <= MAX_ATTEMPTS && !loggedIn; n++) {
    const att = { attempt: n };
    log(`\n>> 第 ${n} 轮：抓验证码`);

    // 刷新验证码，确保是新图
    await page.evaluate(() => {
      const img = document.querySelector('#ValidateImage');
      if (img) img.src = '/IHttpHandler/Handler_MainCode.ashx?t=' + Math.random();
    });
    await sleep(1500);

    const captchaPath = path.join(OUT, `captcha-${n}.png`);
    const el = await page.$('#ValidateImage');
    if (!el) { att.error = '找不到验证码元素 #ValidateImage'; report.attempts.push(att); break; }
    await el.screenshot({ path: captchaPath });
    att.captchaFile = captchaPath;
    log('   验证码已存:', captchaPath);

    // 等待外部写入识别结果
    const codeFile = path.join(OUT, `code-${n}.txt`);
    fs.writeFileSync(path.join(OUT, 'awaiting.txt'), JSON.stringify({ round: n, captchaFile: captchaPath }), 'utf8');
    log(`   等待 ${codeFile} （最长 240 秒）...`);
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline && !fs.existsSync(codeFile)) await sleep(1000);
    if (!fs.existsSync(codeFile)) { att.error = '等待识别结果超时'; report.attempts.push(att); break; }

    const code = fs.readFileSync(codeFile, 'utf8').trim().replace(/\D/g, '');
    att.code = code;
    log('   识别结果:', code);
    if (code.length !== 4) { att.error = '验证码长度不是 4 位'; report.attempts.push(att); continue; }

    // 填入表单
    await page.fill('#UserName', USER);
    await page.fill('#UserPassWord', PWD);
    await page.fill('#Verifycode', code);
    await sleep(500);

    // 步骤 a：校验验证码（平台原逻辑）
    const vc = await page.evaluate(async c => {
      const body = new URLSearchParams({ typename: 'verifycode', verifycode: c, getchecked: 'false' });
      const r = await fetch('/IHttpHandler/Handler_Menber_Login.ashx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: body.toString(), credentials: 'include',
      });
      return await r.text();
    }, code);
    att.verifycodeResp = vc.slice(0, 300);
    log('   verifycode 返回:', att.verifycodeResp);

    // 步骤 b：正式登录
    const lg = await page.evaluate(async d => {
      const body = new URLSearchParams({ typename: 'login', verifycode: d.code, menbername: d.user, menberpwd: d.pwd, getchecked: 'false' });
      const r = await fetch('/IHttpHandler/Handler_Menber_Login.ashx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: body.toString(), credentials: 'include',
      });
      return await r.text();
    }, { code, user: USER, pwd: PWD });
    att.loginResp = lg.slice(0, 300);
    log('   login 返回:', att.loginResp);

    // 校验：重新访问后台
    await sleep(1500);
    await page.goto(BASE + 'Manage/', { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    const h2 = await page.content();
    att.afterUrl = page.url();
    att.afterHtmlLen = h2.length;
    att.loggedIn = h2.includes(USER) && !h2.includes('name="UserPassWord"');
    report.attempts.push(att);

    if (att.loggedIn) {
      loggedIn = true;
      log('   ✅ 登录成功');
      await shot('3-login-ok');
      await ctx.storageState({ path: STATE });
      report.stateSaved = STATE;
      const cks = await ctx.cookies();
      report.cookies = cks.map(c => c.name);
    } else {
      log('   ❌ 本轮未登录成功');
      await shot(`2-fail-${n}`);
      try { fs.unlinkSync(codeFile); } catch (e) {}
    }
  }

  report.loggedIn = loggedIn;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(report, null, 2), 'utf8');
  await ctx.close();
  log('\n===== 最终结果: ' + (loggedIn ? '登录成功 ✅' : '登录失败 ❌') + ' =====');
  log('详细报告:', path.join(OUT, 'result.json'));
  process.exit(loggedIn ? 0 : 2);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
