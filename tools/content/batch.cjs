/* 批量生产（有界任务队列 + 断点恢复 + 自动暂停）。
 * 特性：
 *  - 每批 N 个（默认 20），每个故事一次 produce.cjs 子进程（独立上下文，互不污染）；
 *  - 并发默认 2（与接口闸门一致），可调；
 *  - 已有 content/stories/<id>.json 或 content/quarantine/<id>.json 的跳过（断点恢复）；
 *  - 连续失败达到阈值或预算保护触发 → 立即停止并保留进度文件；
 *  - 每批输出质量/用量报告 content/usage/batch-<n>.json。
 * 用法：node tools/content/batch.cjs --plan content/plans/b-tier.json [--size 20] [--conc 2]
 * 计划文件格式：{ "batch": 1, "items": [ { "id": "sc-0011", "genre": "office", "premium": false, "seed": "…" } ] }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const llm = require('../llm.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const STORIES = path.join(ROOT, 'content', 'stories');
const QUAR = path.join(ROOT, 'content', 'quarantine');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }

const planFile = arg('plan', null);
const size = parseInt(arg('size', '20'), 10);
const conc = parseInt(arg('conc', '2'), 10);
if (!planFile) { console.error('需要 --plan content/plans/xxx.json'); process.exit(2); }
const plan = readJson(planFile);
if (!plan || !Array.isArray(plan.items)) { console.error('计划文件无效'); process.exit(2); }

function done(id) {
  return fs.existsSync(path.join(STORIES, id + '.json')) || fs.existsSync(path.join(QUAR, id + '.json'));
}
/* 尝试次数：同一 ID 最多生成 2 个候选版本（任务书「重点故事可展开 2 个完整候选版本，对比后保留更好的一版」）。
 * 第二个候选使用不同的图形与不同 seed，避免重复同一个失败结构。
 * 计数文件在 content/usage/attempts.json，保证跨批次续跑不会无限重试。 */
const ATTEMPTS = path.join(ROOT, 'content', 'usage', 'attempts.json');
const MAX_CANDIDATES = 2;
function bumpAttempt(id) {
  const a = readJson(ATTEMPTS) || {};
  a[id] = (a[id] || 0) + 1;
  fs.writeFileSync(ATTEMPTS, JSON.stringify(a, null, 1), 'utf8');
  return a[id];
}
function attemptsOf(id) { const a = readJson(ATTEMPTS) || {}; return a[id] || 0; }

async function runOne(item) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const attempt = attemptsOf(item.id) + 1;
    bumpAttempt(item.id);
    /* 第二个候选：换一个图形、换一个 seed，避免重走同一条失败结构 */
    const altSeed = attempt > 1
      ? (item.seed ? item.seed + '（换一个完全不同的冲突角度重写）' : '换一个完全不同的冲突角度重写')
      : (item.seed || null);
    const child = spawn(process.execPath, [
      path.join(__dirname, 'produce.cjs'),
      '--genre', item.genre,
      '--id', item.id,
      ...(item.premium ? ['--premium'] : []),
      ...(altSeed ? ['--seed', altSeed] : []),
      ...(attempt > 1 ? ['--fresh'] : [])
    ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('exit', code => resolve({ id: item.id, genre: item.genre, code, ms: Date.now() - t0, attempt, tail: out.split('\n').filter(Boolean).slice(-4).join(' | ') }));
  });
}

(async function main() {
  const todo = plan.items.filter(it => {
    if (fs.existsSync(path.join(STORIES, it.id + '.json'))) return false;   /* 已通过 → 跳过 */
    if (fs.existsSync(path.join(QUAR, it.id + '.json'))) {
      /* 已隔离：允许再试一个候选版本（最多 2 个），超出后永久跳过 */
      if (attemptsOf(it.id) >= MAX_CANDIDATES) return false;
      return true;
    }
    return true;
  });
  const skipped = plan.items.length - todo.length;
  const batch = todo.slice(0, size);
  console.log('=== 批次 ' + (plan.batch || '?') + ' ===');
  console.log('计划 ' + plan.items.length + ' 个；已完成跳过 ' + skipped + ' 个；本次执行 ' + batch.length + ' 个；并发 ' + conc);
  if (!batch.length) { console.log('无需执行（断点恢复：全部已完成）'); return; }

  const t0 = Date.now();
  const results = [];
  let cursor = 0, consecutiveFail = 0, stopped = null;

  async function worker() {
    while (cursor < batch.length && !stopped) {
      const blocked = llm.budgetExceeded();
      if (blocked) { stopped = '预算/暂停保护：' + blocked; break; }
      const item = batch[cursor++];
      /* 重试候选：先清掉该 ID 的旧隔离记录与草稿，让 produce 从零生成一个不同版本 */
      if (attemptsOf(item.id) > 1) {
        try { fs.unlinkSync(path.join(QUAR, item.id + '.json')); } catch (e) {}
        ['content/drafts/', 'content/proposals/'].forEach(d => {
          try { fs.unlinkSync(path.join(ROOT, d, item.id + '.json')); } catch (e) {}
        });
      }
      const r = await runOne(item);
      results.push(r);
      let okPass = fs.existsSync(path.join(STORIES, item.id + '.json'));
      /* 断点续跑：草稿会在每一步落盘，因此因网络中断而失败的同一 ID 可以原地重跑，
       * 从最后一次成功的那一步继续（不重复已完成的调用，也不浪费已通过的审核）。 */
      let resume = 0;
      const isNetworkAbort = /fetch failed|timeout|ECONNRESET|socket hang up|网络/i.test(r.tail || '');
      while (!okPass && isNetworkAbort && resume < 3) {
        resume++;
        console.log('↻ ' + item.id + ' 断点续跑第 ' + resume + ' 次（网络中断，草稿已保留）');
        const rr = await runOne(item);
        r.ms += rr.ms; r.tail = rr.tail; r.resume = resume;
        okPass = fs.existsSync(path.join(STORIES, item.id + '.json'));
        if (!/fetch failed|timeout|ECONNRESET|socket hang up|网络/i.test(rr.tail || '')) break;
      }
      if (!okPass) consecutiveFail++; else consecutiveFail = 0;
      console.log((okPass ? '✅' : '⛔') + ' ' + item.id + ' (' + item.genre + ') ' + Math.round(r.ms / 1000) + 's ' + r.tail);
      const b = llm.readBudget();
      if (consecutiveFail >= (b.failSafe.consecutiveFailuresPause || 6)) {
        stopped = '连续失败达到 ' + consecutiveFail + ' 次，自动暂停批次';
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, conc) }, worker));

  const stories = fs.readdirSync(STORIES).filter(f => f.endsWith('.json'));
  const quar = fs.readdirSync(QUAR).filter(f => f.endsWith('.json'));
  const b = llm.readBudget();
  const report = {
    at: new Date().toISOString(),
    plan: path.basename(planFile), batch: plan.batch || null,
    executed: results.length, wallMs: Date.now() - t0,
    passedAmongExecuted: results.filter(r => fs.existsSync(path.join(STORIES, r.id + '.json'))).length,
    failedAmongExecuted: results.filter(r => !fs.existsSync(path.join(STORIES, r.id + '.json'))).length,
    results,
    stopped, stoppedReason: stopped || null,
    cumulative: { stories: stories.length, quarantined: quar.length, requestsUsed: b.requests.used, tokens: b.tokens },
    skippedAlreadyDone: skipped
  };
  const outFile = path.join(ROOT, 'content', 'usage', 'batch-' + (plan.batch || 'x') + '.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 1), 'utf8');
  console.log('\n本批完成：执行 ' + results.length + '，通过 ' + report.passedAmongExecuted + ' / 失败 ' + report.failedAmongExecuted + (stopped ? '（已暂停：' + stopped + '）' : '')); 
  console.log('累计：正式库 ' + stories.length + ' 个，隔离 ' + quar.length + ' 个；请求 ' + b.requests.used + '/' + b.requests.limit + '；token 累计 in=' + b.tokens.input + ' out=' + b.tokens.output);
  console.log('报告：' + outFile);
})().catch(e => { console.error('批次中断：' + e.message); process.exit(4); });
