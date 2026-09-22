/* 内部生产工具：模型调用层（Node 18+，零依赖）
 * 与「梗一下」项目无关，独立实现；密钥仅从环境变量或本机 Hermes 的 .env 文件读取，
 * 绝不写入任何产物、日志或发布包；发布包中不含本文件。
 * 提供：JSON 输出调用、用量记录、429/5xx 有上限退避、全局并发闸门、硬预算。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // tools/ → 工程根（tools 下的工具与 content/ 同级）
const BUDGET_FILE = path.join(ROOT, 'content', 'budget.json');
const USAGE_FILE = path.join(ROOT, 'content', 'usage', 'usage-log.jsonl');
const PAUSE_FILE = path.join(ROOT, 'content', 'PAUSE');

function parseDotEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/* 密钥解析顺序：LLM_API_KEY → 项目 .env:LLM_API_KEY → LLM_API_KEY_FILE 指向文件中的 OLLAMA_API_KEY */
function resolveKey() {
  if (process.env.LLM_API_KEY) return { key: process.env.LLM_API_KEY, origin: 'env:LLM_API_KEY' };
  let dotenv = {};
  try {
    const p = path.join(ROOT, '.env');
    if (fs.existsSync(p)) dotenv = parseDotEnv(fs.readFileSync(p, 'utf8'));
  } catch (e) { dotenv = {}; }
  if (dotenv.LLM_API_KEY) return { key: dotenv.LLM_API_KEY, origin: '.env:LLM_API_KEY' };
  const keyFile = process.env.LLM_API_KEY_FILE || dotenv.LLM_API_KEY_FILE;
  if (keyFile) {
    try {
      const vars = parseDotEnv(fs.readFileSync(keyFile, 'utf8'));
      const name = process.env.LLM_API_KEY_FILE_VAR || dotenv.LLM_API_KEY_FILE_VAR || 'OLLAMA_API_KEY';
      if (vars[name]) return { key: vars[name], origin: 'file:' + path.basename(keyFile) + ':' + name };
    } catch (e) { /* 忽略 */ }
  }
  return { key: '', origin: 'none' };
}

const keyInfo = resolveKey();

const envInt = (n, d) => { const v = parseInt(process.env[n] || '', 10); return Number.isFinite(v) ? v : d; };

/* DNS 解析顺序：本机到该端点偶发 Connect Timeout，实测 ipv4first 明显更稳
 * （10 次请求：默认 5–7 成功，ipv4first 8 成功）。这不影响正确性，只是连接更可靠。 */
try {
  const dns = require('dns');
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
} catch (e) { /* 老版本 Node 忽略 */ }

const CFG = {
  baseUrl: (process.env.LLM_BASE_URL || 'https://ollama.com/v1').replace(/\/+$/, ''),
  model: process.env.LLM_MODEL || 'deepseek-v4.1-flash',
  timeoutMs: envInt('LLM_TIMEOUT_MS', 240000),
  maxTokens: envInt('LLM_MAX_TOKENS', 6000),
  temperature: Number(process.env.LLM_TEMPERATURE || '0.9'),
  /* 并发：实测本机到该端点**并发 2 时连接失败率极高**（12 次里仅 2 次成功），
   * 并发 1 时 12/12 成功。因此默认串行；需要提速时才手动调高并自行承担失败率。 */
  maxConcurrency: envInt('LLM_MAX_CONCURRENCY', 1),
  retryOnError: Math.max(0, Math.min(6, envInt('LLM_RETRY_ON_ERROR', 4))),
  /* 连接级重试：本机到该端点的连接偶发超时（实测默认 DNS 顺序下失败率约 30–50%），
   * 属于任务书第 7 节所说的「临时故障」→ 必须有上限地退避重试，而不是判死整篇故事。 */
  networkRetryBackoffMs: [1500, 3500, 7000, 12000, 20000],
  key: keyInfo.key,
  keyOrigin: keyInfo.origin
};

/* ---------- 预算 ---------- */
function readBudget() {
  const def = {
    requests: { limit: 350, used: 0 },
    tokens: { input: 0, output: 0, limit: null, note: '服务不返回精确余额时，token 上限按用户预算人工设定' },
    stories: { passed: 0, quarantined: 0 },
    deadlines: { stopAt: null, note: 'ISO8601；到达后不再发起新请求' },
    failSafe: { consecutiveFailuresPause: 6, consecutiveFailures: 0 },
    notes: '额度余额无法通过接口查询 → 标注未知；只依据本地累计记录与预算设限。'
  };
  try {
    if (fs.existsSync(BUDGET_FILE)) return JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  } catch (e) { /* 回退默认 */ }
  return def;
}
function writeBudget(b) {
  fs.mkdirSync(path.dirname(BUDGET_FILE), { recursive: true });
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(b, null, 2), 'utf8');
}
function budgetExceeded() {
  const b = readBudget();
  if (fs.existsSync(PAUSE_FILE)) return 'PAUSE 文件存在（' + fs.readFileSync(PAUSE_FILE, 'utf8').trim() + '）';
  if (b.deadlines && b.deadlines.stopAt && Date.now() > Date.parse(b.deadlines.stopAt)) return '已到截止时间 ' + b.deadlines.stopAt;
  /* 以 append-only 用量日志为准（多进程并发安全），budget.json 作为配置与兜底 */
  const t = usageTotals();
  const requests = t.requests != null ? t.requests : (b.requests.used || 0);
  if (b.requests && b.requests.limit != null && requests >= b.requests.limit) return '请求数达到上限 ' + b.requests.limit + '（累计 ' + requests + '）';
  const tokens = t.totalTokens != null ? t.totalTokens : ((b.tokens.input || 0) + (b.tokens.output || 0));
  if (b.tokens && b.tokens.limit != null && tokens >= b.tokens.limit) return 'token 达到上限 ' + b.tokens.limit;
  if (b.failSafe && b.failSafe.consecutiveFailures >= b.failSafe.consecutiveFailuresPause) return '连续失败达到阈值，批次已自动暂停';
  return null;
}

/* 用量汇总（扫描 usage-log.jsonl；并发安全） */
function usageTotals() {
  try {
    if (!fs.existsSync(USAGE_FILE)) return { requests: 0, ok: 0, failed: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, unknownUsage: 0 };
    const lines = fs.readFileSync(USAGE_FILE, 'utf8').split('\n').filter(Boolean);
    let ok = 0, failed = 0, retried = 0, inputTokens = 0, outputTokens = 0, unknown = 0;
    for (const l of lines) {
      let r; try { r = JSON.parse(l); } catch (e) { continue; }
      /* 计费口径：**每一次 HTTP 尝试都算一次请求**（重试也会真实消耗额度）。
       * 因此 requests = 全部记录行数；其中 retrying 行代表「失败后已重试」的中间尝试。
       * 不按 tag 去重：同一个故事 ID 会被多次生产（多候选、重跑），那些都是真实请求。 */
      if (r.retrying) { retried++; continue; }
      if (r.ok) {
        ok++;
        if (r.promptTokens == null || r.completionTokens == null) unknown++;
        inputTokens += r.promptTokens || 0;
        outputTokens += r.completionTokens || 0;
      } else failed++;
    }
    return { requests: lines.length, ok, failed, retried, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, unknownUsage: unknown };
  } catch (e) {
    return { requests: null, ok: null, failed: null, inputTokens: null, outputTokens: null, totalTokens: null, unknownUsage: null };
  }
}

/* ---------- 并发闸门 ---------- */
let active = 0;
const waiters = [];
function acquire() {
  if (active < CFG.maxConcurrency) { active++; return Promise.resolve(); }
  return new Promise(res => waiters.push(res));
}
function release() {
  const next = waiters.shift();
  if (next) next(); else active--;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 用量记录 ---------- */
function logUsage(rec) {
  fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
  fs.appendFileSync(USAGE_FILE, JSON.stringify(rec) + '\n', 'utf8');
}

/* ---------- 调用 ---------- */
async function callOnce(messages, opt) {
  opt = opt || {};
  const body = {
    model: CFG.model,
    messages,
    max_tokens: opt.maxTokens || CFG.maxTokens,
    temperature: opt.temperature != null ? opt.temperature : CFG.temperature,
    stream: false
  };
  if (opt.jsonMode !== false) body.response_format = { type: 'json_object' };
  const res = await fetch(CFG.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CFG.key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CFG.timeoutMs)
  });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error('HTTP ' + res.status + ' ' + text.slice(0, 200));
    e.status = res.status;
    e.retriable = res.status === 429 || res.status >= 500;
    throw e;
  }
  let json;
  try { json = JSON.parse(text); } catch (e) { throw new Error('响应不是 JSON：' + text.slice(0, 120)); }
  const ch = (json.choices && json.choices[0]) || {};
  const content = (ch.message && ch.message.content) || '';
  const reasoning = (ch.message && ch.message.reasoning) || '';
  const finish = ch.finish_reason || '';
  if (!content) {
    /* 可重试：被输出上限截断（推理占满预算）→ 由上层以更大预算重试一次 */
    const e = new Error('模型返回空内容（finish=' + finish + '，推理长度 ' + reasoning.length + '）');
    e.code = finish === 'length' ? 'truncated' : 'empty';
    e.retriable = finish === 'length';
    throw e;
  }
  return { content, reasoning, usage: json.usage || null, raw: json, finishReason: finish };
}

/* 统一入口：预算检查 + 并发闸门 + 有上限退避 + 用量累计
 * opt: { tag, jsonMode, maxTokens, temperature, retries } */
async function callModel(messages, opt) {
  opt = opt || {};
  const blocked = budgetExceeded();
  if (blocked) { const e = new Error('预算/暂停保护触发：' + blocked); e.code = 'budget'; throw e; }
  if (!CFG.key) { const e = new Error('未配置模型密钥（发布包与正式站点不需要密钥）'); e.code = 'no_key'; throw e; }

  await acquire();
  const t0 = Date.now();
  let attempt = 0;
  const retries = opt.retries != null ? opt.retries : CFG.retryOnError;
  const b = readBudget();
  try {
    for (;;) {
      try {
        /* 诚实口径：每一次 HTTP 尝试都计入 requests.used（重试真实消耗额度）。
         * 不能只在 callModel 入口加 1——那样会把重试折叠掉，低估真实消耗。 */
        b.requests.used = (b.requests.used || 0) + 1;
        const out = await callOnce(messages, opt);
        const u = out.usage || {};
        const inTok = u.prompt_tokens != null ? u.prompt_tokens : null;
        const outTok = u.completion_tokens != null ? u.completion_tokens : null;
        b.tokens.input += inTok || 0;
        b.tokens.output += outTok || 0;
        b.failSafe.consecutiveFailures = 0;
        writeBudget(b);
        logUsage({
          ts: new Date().toISOString(), tag: opt.tag || '', attempt, ms: Date.now() - t0,
          promptTokens: inTok, completionTokens: outTok,
          totalTokens: u.total_tokens != null ? u.total_tokens : (inTok != null && outTok != null ? inTok + outTok : null),
          usageCaveat: inTok == null ? '服务未返回 token 用量 → 标注未知' : null,
          model: CFG.model, ok: true
        });
        return out;
      } catch (e) {
        attempt++;
        const retriable = e.retriable || /fetch failed|timeout|ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|network|aborted/i.test(e.message || '');
        if (!retriable || attempt > retries) {
          b.failSafe.consecutiveFailures = (b.failSafe.consecutiveFailures || 0) + 1;
          writeBudget(b);
          logUsage({ ts: new Date().toISOString(), tag: opt.tag || '', attempt, ms: Date.now() - t0, ok: false, error: String(e.message || e).slice(0, 300) });
          throw e;
        }
        /* 429 用更长的退避；连接类故障用短退避，按配置表递进 */
        const is429 = e.status === 429;
        const idx = Math.min(attempt - 1, b.networkRetryBackoffMs ? b.networkRetryBackoffMs.length - 1 : CFG.networkRetryBackoffMs.length - 1);
        const wait = is429 ? 3000 * attempt : CFG.networkRetryBackoffMs[idx];
        logUsage({
          ts: new Date().toISOString(), tag: opt.tag || '', attempt, ms: Date.now() - t0,
          ok: false, retrying: true, waitMs: wait,
          error: ('重试中：' + String(e.message || e)).slice(0, 200)
        });
        await sleep(wait);
      }
    }
  } finally {
    release();
  }
}

/* JSON 解析：容忍代码块与前后文字；对常见破坏（截断、尾随逗号、未闭合括号）做**无损修复**尝试。
 * 修复只针对结构性语法错误，绝不猜测或编造内容；修不好就抛错交给上层重试。 */
function extractJson(text) {
  let t = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t); } catch (e) { /* 继续尝试截取与修复 */ }
  }
  const start = t.indexOf('{');
  if (start !== -1) {
    const end = t.lastIndexOf('}');
    if (end > start) {
      const slice = t.slice(start, end + 1);
      try { return JSON.parse(slice); } catch (e) { /* 继续尝试修复 */ }
      const fixed = repairJson(slice);
      if (fixed) return fixed;
    }
    /* 被截断（没有收尾的 }）→ 尝试补齐 */
    const fixed = repairJson(t.slice(start));
    if (fixed) return fixed;
  }
  throw new Error('输出中没有 JSON 对象');
}

/* 结构性修复：去尾随逗号、补齐未闭合的括号/引号。
 * 仅做括号平衡与标点清理，不添加任何内容。 */
function repairJson(t) {
  let s = String(t).trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return null;
  /* 去掉尾随逗号（,}  ,]） */
  s = s.replace(/,\s*([}\]])/g, '$1');
  /* 逐字符扫描，跟踪栈与字符串状态，顺便找出最后一个「安全截断点」 */
  const stack = [];
  let inStr = false, esc = false, safeEnd = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      if (stack.length && stack[stack.length - 1] === c) { stack.pop(); if (!stack.length) safeEnd = i; }
      else return null; /* 括号不匹配，无法安全修复 */
    }
  }
  /* 已闭合：直接返回 */
  if (!stack.length && !inStr) {
    try { return JSON.parse(s); } catch (e) { }
  }
  /* 未闭合：从末尾回退到一个合法的收尾位置（最后一个完整的键值对或元素之后） */
  let body = s;
  if (inStr) {
    /* 字符串没闭合：丢掉最后这个不完整的字符串值 */
    const lastQuote = s.lastIndexOf('"');
    body = lastQuote > 0 ? s.slice(0, lastQuote) : s;
  }
  /* 去掉悬空的键或半个值：回退到最后一个逗号 */
  body = body.replace(/,\s*$/, '').replace(/[,\s]+$/, '');
  /* 若结尾悬着 ": " 或 "key" 这类半截键，去掉它 */
  body = body.replace(/"[^"]*"\s*:\s*$/, '').replace(/,\s*$/, '');
  const fixed = body + stack.slice().reverse().join('');
  try {
    return JSON.parse(fixed.replace(/,\s*([}\]])/g, '$1'));
  } catch (e) { return null; }
}

function info() {
  return { baseUrl: CFG.baseUrl, model: CFG.model, keyConfigured: !!CFG.key, keyOrigin: CFG.keyOrigin, maxConcurrency: CFG.maxConcurrency, budget: readBudget(), usage: usageTotals() };
}

/* 带预算回退的调用：该模型会先生成大量推理，推理与正文共享输出预算。
 * 被截断（finish=length）时以更大预算重试，最多两次放大。 */
async function callWithBudgetFallback(messages, opt) {
  opt = opt || {};
  const start = opt.maxTokens || 8000;
  let lastErr = null;
  for (const budget of [start, start * 2, start * 4]) {
    try {
      return await callModel(messages, Object.assign({}, opt, { maxTokens: budget }));
    } catch (e) {
      if (e.code === 'truncated' && budget < start * 4) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr || new Error('调用失败');
}

module.exports = { callModel, callWithBudgetFallback, extractJson, repairJson, info, readBudget, writeBudget, budgetExceeded, usageTotals, logUsage, CFG };
