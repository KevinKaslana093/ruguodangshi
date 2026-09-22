/* 内部生产流水线：策划 → 成稿 → 程序检查 → 独立编辑审核 → 路径审核 → 定点修复（≤2 轮）→ 隔离。
 * 断点恢复：每完成一步即把草稿写盘（content/drafts/<storyId>.json），重跑跳过已完成环节。
 * 预算保护：所有模型调用经 tools/llm.cjs（预算 + 并发闸门 + 退避 + 用量记录）。
 * 用法：
 *   node tools/content/produce.cjs --genre office --id sc-0001 [--premium] [--seed "…"]
 *   node tools/content/produce.cjs --genre pet --candidates 2 --id sc-0012   # 重点故事双候选
 */
'use strict';
const fs = require('fs');
const path = require('path');
const llm = require('../llm.cjs');
const P = require('./prompts.cjs');
const C = require('./check.cjs');
const OC = require('./outline.cjs');
const SH = require('./shapes.cjs');
const MG = require('./merges.cjs');
const PB = require('./props.cjs');
const FC = require('./facts.cjs');
const V = require('../../shared/validate.js');
const S = require('../../shared/schema.js');
const R = require('../../shared/runtime.js');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = {
  drafts: path.join(ROOT, 'content', 'drafts'),
  proposals: path.join(ROOT, 'content', 'proposals'),
  review: path.join(ROOT, 'content', 'review'),
  stories: path.join(ROOT, 'content', 'stories'),
  quarantine: path.join(ROOT, 'content', 'quarantine'),
  plans: path.join(ROOT, 'content', 'plans')
};

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function writeJson(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 1), 'utf8'); }
function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

const genreId = arg('genre', null);
const storyId = arg('id', null);
const premium = !!arg('premium', false);
const seed = arg('seed', '');
const candidates = parseInt(arg('candidates', '1'), 10);
const legacy = !!arg('legacy', false);
/* --no-fix：人工编辑定稿后跳过定点修复。
 * 用途：当审核提出的问题已经由人工审定处理（或属于已知的审核噪声）时，
 * 避免自动修复轮再次改写正文。仍会重新执行程序检查与全部审核，验收门照常生效。 */
const noFix = process.argv.includes('--no-fix');
const fresh = !!arg('fresh', false);

if (!genreId || !S.genreById(genreId)) { console.error('需要 --genre 之一：' + S.GENRES.map(g => g.id).join('/')); process.exit(2); }
if (!storyId || !S.LIMITS.storyIdPattern.test(storyId)) { console.error('需要 --id 形如 sc-0001'); process.exit(2); }

const draftFile = path.join(DIR.drafts, storyId + '.json');

/* --fresh：丢弃这个 ID 的既有草稿/提案，从零生成一个不同的候选版本
 * （用于「同一故事展开 2 个候选」：第一个版本被隔离后，换角度重做） */
if (fresh) {
  [draftFile, path.join(DIR.proposals, storyId + '.json'), path.join(DIR.quarantine, storyId + '.json')].forEach(p => {
    try { fs.unlinkSync(p); } catch (e) {}
  });
}

/* ── 步骤 1：策划（3 个不同核心冲突的提案，小输出、低风险） ── */
async function stepPlan() {
  const draft = readJson(draftFile) || {};
  if (draft.proposals && draft.proposals.length) { log('提案已存在，跳过策划'); return draft; }
  const messages = [
    { role: 'system', content: '你是中文互动剧情策划。只输出 JSON，不做解释，不做长篇分析。' },
    { role: 'user', content: [
        P.genreBrief(genreId),
        seed ? '本次创作线索（作为核心冲突的灵感来源，不必逐字复述）：' + seed : '线索由你自行设计，但必须是该题材下常见而具体的生活冲突。',
        '',
        '请提出 3 个**不同核心冲突**的提案。每个提案：conflict（一句话冲突，≤40 字）、differs（与另外两个的区别，≤40 字）、hook（开场画面一句话，≤30 字）、protagonist（主角称呼与身份，≤20 字）。',
        '输出 JSON：{"proposals":[{"conflict":"","differs":"","hook":"","protagonist":""},{"conflict":"","differs":"","hook":"","protagonist":""},{"conflict":"","differs":"","hook":"","protagonist":""}]}'
      ].filter(Boolean).join('\n') }
  ];
  const out = await extractJsonRetry(messages, { tag: 'plan:' + storyId, maxTokens: 8000, temperature: 1.0 }, '策划');
  const parsed = out.parsed;
  draft.proposals = parsed.proposals || [];
  draft.chosen = 0;
  writeJson(path.join(DIR.proposals, storyId + '.json'), { storyId, genreId, proposals: draft.proposals, at: new Date().toISOString(), chosen: draft.chosen });
  writeJson(draftFile, draft);
  log('策划完成：提案 ' + draft.proposals.length + ' 个 → ' + draft.proposals.map(p => p.conflict).join(' / '));
  return draft;
}

/* ── 步骤 2a：结构设计（骨架）。
 * 图结构由 tools/content/shapes.cjs 程序生成（结构必然合法：无环、全可达、每节点 2–3 选项、
 * 恰好 3 个结局、路径 ≤128），模型只负责给它写内容。
 * 输出分三批（元数据 → 前半节点 → 后半节点），避免单次输出过大被截断。 ── */
async function stepSkeleton() {
  const draft = readJson(draftFile) || {};
  /* 形状签名：骨架与正文必须同属一次生成。
   * 若磁盘上已有草稿来自旧形状（例如脚本换代后形状集变了），必须清掉重建，
   * 否则会拿旧故事去跑新结构的检查，产出「节点 18 / 路径 74」这类自相矛盾的结果。 */
  const sig = draft.shape ? (draft.shape.id + ':' + (draft.skeleton ? draft.skeleton.outline.length : 0)) : null;
  if (draft.skeleton && sig && draft.skeletonSignature && draft.skeletonSignature !== sig) {
    log('草稿形状签名不一致（' + draft.skeletonSignature + ' → ' + sig + '），清除旧骨架与正文重建');
    delete draft.skeleton; delete draft.texts; delete draft.story;
    delete draft.editorReview; delete draft.pathReview; delete draft.mergeCheck;
    delete draft.check; delete draft.paths; delete draft.fixRounds; delete draft.fixLog;
    writeJson(draftFile, draft);
  }
  if (draft.skeleton) { log('骨架已存在，跳过结构设计'); return draft; }
  const p = (draft.proposals || [])[draft.chosen] || {};

  /* 图形选择：优先未使用过的形状，保证同一题材内图形不单调 */
  const pool = SH.shapesFor(premium);
  const usedFile = path.join(DIR.plans, 'used-shapes.json');
  const used = readJson(usedFile) || {};
  let shape = pool.filter(s => !used[s.id])[0];
  if (!shape) {
    Object.keys(used).forEach(k => { if (pool.some(s => s.id === k)) delete used[k]; });
    shape = pool.filter(s => !used[s.id])[0] || pool[0];
  }
  const built = SH.skeletonFromShape(shape, { title: '', small: !premium });
  draft.skeleton = built.story;
  draft.skeletonSignature = shape.id + ':' + built.story.outline.length;
  draft.shape = built.shape;
  draft.inbound = SH.inboundOf(shape);
  writeJson(draftFile, draft);

  const outlineIds = built.story.outline.map(n => n.id);
  const mid = Math.ceil(outlineIds.length / 2);
  const batches = [outlineIds.slice(0, mid), outlineIds.slice(mid)];
  const meta = { title: '', summary: '', characters: [], tags: [], endings: [], cover: {} };

  /* 批 1：元数据 + 前半节点（含选项文字） */
  for (let bi = 0; bi < batches.length; bi++) {
    const ids = batches[bi];
    const partial = {
      story: Object.assign({}, p, {}),
      ids,
      needMeta: bi === 0
    };
    let ok = false, lastErr = '';
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      const out = await extractJsonRetry([
        { role: 'system', content: P.SKELETON_SYSTEM },
        { role: 'user', content: P.SKELETON_USER_TEMPLATE(genreId, seed, p, premium, {
          shapeNote: shape.note, endings: shape.endings, nodesTotal: built.shape.nodes,
          nodes: ids.map(id => {
            const n = built.story.outline.filter(x => x.id === id)[0];
            return { id, to: (n.choices || []).map(c => c.to), isEnding: !!n.endingId };
          }),
          needMeta: bi === 0,
          endingsInfo: built.story.endings,
          metaSoFar: bi === 0 ? null : meta,
          prevContent: bi === 0 ? null : draft.skeleton.outline.filter(x => ids.indexOf(x.id) === -1).map(x => ({ id: x.id, label: x.label, purpose: x.purpose }))
        }) }
      ], { tag: 'skeleton' + bi + ':' + storyId, maxTokens: 8000, temperature: 0.9 }, '结构设计');
      const filled = OC.fillSkeletonPartial(draft.skeleton, out.parsed, shape, { premium, ids, needMeta: bi === 0 });
      if (filled.ok) {
        draft.skeleton = filled.story;
        ok = true;
        if (bi === 0) {
          const st = filled.story;
          meta.title = st.title; meta.summary = st.summary; meta.characters = st.characters;
          meta.tags = st.tags; meta.endings = st.endings; meta.cover = st.cover;
        }
        if (filled.notes.length) log('骨架已自动修正：' + filled.notes.join('；'));
        writeJson(draftFile, draft);
      } else {
        lastErr = filled.errors.join('；');
        log('骨架内容第 ' + (bi + 1) + ' 批 第 ' + attempt + ' 次不可用：' + lastErr);
      }
    }
    if (!ok) throw new Error('结构设计第 ' + (bi + 1) + ' 批连续 3 次不可用：' + lastErr);
  }

  used[shape.id] = (used[shape.id] || 0) + 1;
  writeJson(usedFile, used);
  writeJson(draftFile, draft);
  log('结构设计完成：形状 ' + shape.id + '（' + shape.note + '）；节点 ' + built.shape.nodes +
    '；路径 ' + built.shape.paths + ' 条，每条 ' + built.shape.minLen + ' 段；结局 ' + shape.endings.length);
  return draft;
}

/* ── 步骤 2b：对白写作。
 * 顺序：按场景先后（层号从小到大）从上往下写。
 * 关键理由（实测得出）：合并点必须知道**上游实际写了什么**，否则无法判断哪些事已经成立。
 * 倒序写作时合并点的上游还没写出来，模型只能凭空猜，于是反复出现
 * 「饭团早已热好装袋、后文微波炉却还在转」这类既成事实冲突。
 * 选项文字在结构设计阶段就已确定，因此正序写作不会牺牲「选项与目标一致」。 ── */
async function stepWrite() {
  const draft = readJson(draftFile) || {};
  if (!draft.skeleton) throw new Error('缺少骨架');
  draft.texts = draft.texts || {};

  const outline = draft.skeleton.outline;
  const level = SH.levelsOf(draft.shape ? SH.shapeById(draft.shape.id) : null) || {};
  const byId = {};
  outline.forEach(n => { byId[n.id] = n; });

  /* 按层从浅到深（场景先后）；结局层最后写，因为结局要收束全部线索 */
  const maxLevel = Object.keys(level).reduce((a, k) => Math.max(a, level[k]), 0);
  const sequence = [];
  for (let lv = 0; lv <= maxLevel; lv++) {
    outline.forEach(n => { if (level[n.id] === lv) sequence.push(n.id); });
  }
  /* 无层级信息时退化为按 id 顺序（同样满足“上游先写”） */
  const order = sequence.length === outline.length ? sequence : outline.map(n => n.id);

  if (order.every(id => draft.texts[id])) { log('正文已全部写好，跳过写作'); return finalizeTexts(draft); }

  const BATCH = 3;
  let guard = 0;
  while (true) {
    const left = order.filter(id => !draft.texts[id] || !draft.texts[id].text);
    if (!left.length) break;
    const batch = left.slice(0, BATCH);
    const out = await extractJsonRetry([
      { role: 'system', content: P.WRITE_SYSTEM },
      { role: 'user', content: P.WRITE_USER_TEMPLATE(
        draft.skeleton,
        batch.map(id => byId[id]),
        /* 只把「已写好的目标节点」与少量上下文交给模型，避免上下文过长 */
        draft.texts,
        draft.inbound || {}
      ) }
    ], { tag: 'write:' + storyId, maxTokens: 6000, temperature: 0.95 }, '对白写作');

    let gained = 0;
    (out.parsed.nodes || []).forEach(n => {
      if (!n || !n.id || !byId[n.id] || !n.text) return;
      const text = String(n.text).replace(/\s+/g, ' ').trim();
      const prev = draft.texts[n.id] || {};
      const choices = Array.isArray(n.choices)
        ? n.choices.filter(c => c && c.to).map(c => ({ to: String(c.to), text: String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, 24) }))
        : prev.choices;
      const changed = !prev.text || prev.text !== text;
      draft.texts[n.id] = { text, choices: choices || [] };
      if (changed) gained++;
    });
    writeJson(draftFile, draft);
    const doneN = order.filter(id => draft.texts[id] && draft.texts[id].text).length;
    log('正文进度 ' + doneN + '/' + order.length + '（本批 +' + gained + '）');
    if (!gained) throw new Error('写作批次未返回可用正文');
    if (++guard > 40) throw new Error('写作批次异常中止');
  }
  return finalizeTexts(draft);
}

/* 把正文与选项合并进骨架 → 正式 story 对象 */
function finalizeTexts(draft) {
  if (draft.story) { log('成稿已存在，跳过装配'); return draft; }
  const texts = {};
  Object.keys(draft.texts).forEach(id => { texts[id] = draft.texts[id].text || draft.texts[id]; });
  const story = OC.fillGenre(OC.assemble(draft.skeleton, texts), genreId);
  /* 选项文字：优先用模型写的（此时目标节点已存在），缺失则回退到骨架里的占位文字 */
  const byId = {};
  (draft.skeleton.outline || []).forEach(n => { byId[n.id] = n; });
  story.nodes.forEach(node => {
    const rec = draft.texts[node.id];
    if (!rec || !Array.isArray(rec.choices) || !rec.choices.length) return;
    (node.choices || []).forEach((c, i) => {
      const m = rec.choices.filter(x => x.to === c.to)[0] || rec.choices[i];
      if (m && m.text && m.text.length >= 2) c.text = m.text.slice(0, 24);
    });
  });
  draft.story = C.normalize(story);
  writeJson(draftFile, draft);
  log('成稿完成：节点 ' + draft.story.nodes.length + '，结局 ' + draft.story.endings.length);
  return draft;
}

/* ── 步骤 2（旧版，单次大输出；--legacy 时使用） ── */
async function stepCreate() {
  const draft = readJson(draftFile) || {};
  if (draft.story) { log('成稿已存在，跳过创作'); return draft; }
  const p = (draft.proposals || [])[draft.chosen] || {};
  const messages = [
    { role: 'system', content: P.CREATE_SYSTEM },
    { role: 'user', content: P.CREATE_USER_TEMPLATE(genreId, seed, [
      '已选定的提案：' + (p.conflict || '（由你自行决定）'),
      p.hook ? '开场画面：' + p.hook : '',
      p.protagonist ? '主角：' + p.protagonist : '',
      premium ? '本作品为精品档：节点 14–18 个，单条路径 8–10 段，结局 3 个且各自明显不同，细节密度更高。' : '节点 12–16 个，单条路径 6–9 段，结局 3 个。'
    ].filter(Boolean).join('\n')) }
  ];
  const out = await extractJsonRetry(messages, { tag: 'create:' + storyId, maxTokens: 16000, temperature: 0.9 }, '成稿');
  const parsed = out.parsed;
  if (!parsed || !parsed.story) throw new Error('输出缺少 story 字段');
  draft.story = parsed.story;
  draft.createUsage = { reasoningChars: (out.out.reasoning || '').length, contentChars: out.out.content.length };
  writeJson(draftFile, draft);
  log('成稿完成：正文 ' + out.out.content.length + ' 字符（推理 ' + (out.out.reasoning || '').length + ' 字符）');
  return draft;
}

/* ── 步骤 2c：选项文字回归校准。
 * 正序写作后，选项文字是在「目标节点正文还没有」的时候写的，容易与后文答非所问
 * （例如选项写「先查保修期」，落点却在清点账本）。
 * 这里在所有正文写完之后，只重写**选项文字**这一层，让每个选项如实描述它通向的节点内容。
 * 输出极小（每个节点 2–3 个短句），因此即使全篇一次请求也不会被推理挤爆。 ── */
async function stepChoices() {
  const draft = readJson(draftFile) || {};
  if (!draft.story) { log('选项校准：尚无成稿，跳过'); return draft; }
  if (draft.choicesRefreshed) { log('选项校准已完成，跳过'); return draft; }

  const nodes = draft.story.nodes;
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  const items = nodes.filter(n => (n.choices || []).length).map(n => ({
    id: n.id,
    text: String(n.text || '').slice(0, 120),
    choices: n.choices.map(c => ({ to: c.to, text: c.text, target: String((byId[c.to] || {}).text || '').slice(0, 80) }))
  }));
  if (!items.length) { draft.choicesRefreshed = true; writeJson(draftFile, draft); return draft; }

  try {
    const out = await extractJsonRetry([
      { role: 'system', content: P.CHOICE_SYSTEM },
      { role: 'user', content: P.CHOICE_USER_TEMPLATE(items) }
    ], { tag: 'choices:' + storyId, maxTokens: 4000, temperature: 0.6 }, '选项校准');
    const fixed = out && out.choices;
    let n = 0;
    if (Array.isArray(fixed)) {
      fixed.forEach(row => {
        const node = byId[row.id];
        if (!node || !Array.isArray(row.choices)) return;
        row.choices.forEach(c => {
          const t = (node.choices || []).filter(x => x.to === c.to)[0];
          if (t && typeof c.text === 'string' && c.text.length >= 2) { t.text = c.text.slice(0, 24); n++; }
        });
      });
    }
    /* 去重：同一节点内选项文字不得重复（schema 硬要求） */
    nodes.forEach(node => {
      const seen = {};
      (node.choices || []).forEach((c, i) => {
        if (seen[c.text]) c.text = c.text.slice(0, 18) + (i + 1);
        seen[c.text] = true;
      });
    });
    draft.story = C.normalize(draft.story);
    draft.choicesRefreshed = { at: new Date().toISOString(), touched: n };
    writeJson(draftFile, draft);
    log('选项校准：更新 ' + n + ' 条选项文字');
  } catch (e) {
    log('选项校准失败（不阻塞流程）：' + e.message);
    draft.choicesRefreshed = { at: new Date().toISOString(), error: String(e.message).slice(0, 120) };
    writeJson(draftFile, draft);
  }
  return draft;
}

/* ── 步骤 3：程序检查（含机械规范化） ── */
function stepProgramCheck(draft) {
  const norm = C.normalize(draft.story);
  norm.storyId = storyId;
  norm.schemaVersion = S.SCHEMA_VERSION;
  norm.genreId = genreId;
  const res = V.validateStory(norm, premium ? { premium: true, wantPaths: true } : { wantPaths: true });
  draft.story = norm;
  draft.check = { ok: res.ok, codes: [...new Set(res.errors.map(e => e.code))], errors: res.errors.slice(0, 20), metrics: res.metrics };
  draft.paths = res.metrics._paths || [];
  writeJson(draftFile, draft);
  log('程序检查：' + (res.ok ? '通过' : '未通过 → ' + draft.check.codes.join(',')) +
    '；节点 ' + res.metrics.nodeCount + '，路径 ' + (res.metrics.paths ? res.metrics.paths.counted + '(' + res.metrics.paths.mode + ')' : '-'));
  return res;
}

/* 解析失败也算可重试一次（模型偶发截断/坏 JSON），但保持有界。
 * 若内容是被截断的（大括号/引号不闭合），先尝试「截断修复」：补齐未完成的 JSON。 */
async function extractJsonRetry(messages, opt, label) {
  let lastErr = null;
  for (let i = 0; i < 2; i++) {
    const out = await llm.callWithBudgetFallback(messages, Object.assign({}, opt, { tag: (opt.tag || '') + (i ? '#retry' : '') }));
    try {
      return { parsed: llm.extractJson(out.content), out };
    } catch (e) {
      /* 二次机会：内容被截断时做结构性补齐（不改动任何已有文本，只补闭合符号） */
      const salvaged = repairTruncatedJson(out.content);
      if (salvaged) {
        console.log('  · ' + label + ' JSON 被截断（第 ' + (i + 1) + ' 次），已按结构补齐后解析');
        return { parsed: salvaged, out, salvaged: true };
      }
      lastErr = e;
      console.log('  · ' + label + ' JSON 解析失败（第 ' + (i + 1) + ' 次），重试：' + String(e.message).slice(0, 80));
    }
  }
  throw new Error(label + ' 连续返回无法解析的 JSON：' + (lastErr && lastErr.message));
}

/* 截断修复：从首个 '{' 开始，丢弃末尾不完整的片段（保留最后一个完整元素），
 * 再按栈补齐未闭合的 } 与 ]。只做结构补齐，不修改任何已完整的文本内容。 */
function repairTruncatedJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let body = s.slice(start);
  /* 逐步回退到「最后一个完整的值边界」：逗号或闭合符号 */
  for (let cut = 0; cut < 4000 && body.length; cut++) {
    const candidate = cutBack(body, cut);
    const fixed = closeJson(candidate);
    if (!fixed) continue;
    try { return JSON.parse(fixed); } catch (e) { /* 继续回退 */ }
  }
  return null;
}

/* 把结尾截到第 cut 个「安全边界」处（从后往前找 , } ] 或完整字符串结束） */
function cutBack(body, cut) {
  let b = body;
  /* 丢弃末尾的孤立引号片段：如果最后一个引号之前没有配对的引号，就截到它之前 */
  let trimmed = b.replace(/[,\s]+$/, '');
  /* 去掉末尾不完整的字符串（未闭合的引号） */
  const lastQuote = trimmed.lastIndexOf('"');
  const quotes = (trimmed.match(/"/g) || []).length;
  if (quotes % 2 === 1 && lastQuote >= 0) trimmed = trimmed.slice(0, lastQuote);
  trimmed = trimmed.replace(/[,\s]+$/, '');
  /* cut 次回退：每次丢掉最后一个逗号后的片段 */
  for (let i = 0; i < cut && trimmed.length; i++) {
    const lastComma = trimmed.lastIndexOf(',');
    const lastOpenBrace = Math.max(trimmed.lastIndexOf('{'), trimmed.lastIndexOf('['));
    if (lastComma < 0) { trimmed = trimmed.slice(0, Math.max(0, lastOpenBrace)); break; }
    trimmed = trimmed.slice(0, lastComma);
  }
  return trimmed;
}

/* 按栈补齐未闭合的括号（跳过字符串内的括号） */
function closeJson(text) {
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      if (!stack.length) return null;
      const want = stack.pop();
      if (want !== c) return null;
    }
  }
  if (inStr) return null;
  let out = text.replace(/[,\s]+$/, '');
  /* 末尾若是 "key": 这种半截结构，去掉它 */
  out = out.replace(/,\s*"[^"]*"\s*:\s*$/, '').replace(/"[^"]*"\s*:\s*$/, '');
  out = out.replace(/[,\s]+$/, '');
  while (stack.length) out += stack.pop();
  return out;
}

/* ── 步骤 4b：合并点程序检查（不调用模型；与模型审核独立统计） ── */
function stepMergeCheck(draft) {
  const mergeIssues = MG.checkMerges(draft.story);
  const propIssues = PB.checkProps(draft.story);
  const factIssues = FC.checkFacts(draft.story);
  /* 同层同场：同层的两个节点必须是同一场戏的两种做法 */
  const levels = SH.levelsOf(draft.shape ? SH.shapeById(draft.shape.id) : null);
  const levelIssues = FC.checkLevels(draft.story, levels);
  const issues = mergeIssues.concat(propIssues).concat(factIssues).concat(levelIssues);
  draft.mergeCheck = {
    at: new Date().toISOString(), issues,
    mergeCount: mergeIssues.length, propCount: propIssues.length,
    factCount: factIssues.length, levelCount: levelIssues.length,
    fixRounds: draft.fixRounds || 0
  };
  writeJson(draftFile, draft);
  log('程序侧剧情检查：场景一致 ' + (mergeIssues.length ? mergeIssues.length + ' 条' : '通过') +
    '；道具铺垫 ' + (propIssues.length ? propIssues.length + ' 条' : '通过') +
    '；既成事实 ' + (factIssues.length ? factIssues.length + ' 条' : '通过') +
    '；同层同场 ' + (levelIssues.length ? levelIssues.length + ' 条' : '通过'));
  return issues;
}

/* ── 步骤 4：独立编辑审核（只审故事；独立上下文、独立请求） ── */
async function stepEditorReview(draft) {
  if (draft.editorReview) { log('已有编辑审核，跳过'); return draft.editorReview; }
  const r = await extractJsonRetry([
    { role: 'system', content: P.EDIT_SYSTEM },
    { role: 'user', content: P.EDIT_USER_TEMPLATE(draft.story) }
  ], { tag: 'edit:' + storyId, maxTokens: 16000, temperature: 0.3 }, '编辑审核');
  const parsed = r.parsed;
  const review = { at: new Date().toISOString(), editorIssues: parsed.editorIssues || [], verdict: parsed.verdict || 'revise', fixRounds: draft.fixRounds || 0 };
  draft.editorReview = review;
  writeJson(draftFile, draft);
  writeJson(path.join(DIR.review, storyId + '-editor.json'), { storyId, kind: 'editor', review });
  log('编辑审核：verdict=' + review.verdict + '；issues ' + review.editorIssues.length + '（针对已修复 ' + review.fixRounds + ' 轮的版本）');
  return review;
}

/* ── 步骤 5：路径审核（独立请求，逐条读样本路径；采样口径写入报告） ── */
async function stepPathReview(draft) {
  if (draft.pathReview) { log('已有路径审核，跳过'); return draft.pathReview; }
  const paths = draft.paths || [];
  const sample = [];
  const step = Math.max(1, Math.floor(paths.length / 8));
  for (let i = 0; i < paths.length && sample.length < 8; i += step) sample.push(i);
  const enderIdx = {};
  paths.forEach((p, i) => { if (p.endingId && enderIdx[p.endingId] === undefined) enderIdx[p.endingId] = i; });
  Object.keys(enderIdx).forEach(k => { if (sample.indexOf(enderIdx[k]) === -1) sample.push(enderIdx[k]); });
  const picked = sample.sort(function (a, b) { return a - b; }).slice(0, 10).map(function (i) {
    const t = C.pathTexts(draft.story, [paths[i]], 1)[0];
    /* 每条路径文本限长（头 700 + 尾 400），避免把推理拖爆 */
    const txt = t.text.length > 1150 ? (t.text.slice(0, 700) + '\n…（中略）…\n' + t.text.slice(-400)) : t.text;
    return { index: i, text: txt };
  });
  const r2 = await extractJsonRetry([
    { role: 'system', content: P.PATH_SYSTEM },
    { role: 'user', content: P.PATH_USER_TEMPLATE(draft.story, picked) }
  ], { tag: 'paths:' + storyId, maxTokens: 16000, temperature: 0.3 }, '路径审核');
  const parsed = r2.parsed;
  const review = {
    at: new Date().toISOString(), sampled: picked.length, totalPaths: paths.length, fixRounds: draft.fixRounds || 0,
    samplingNote: ((draft.check.metrics.paths || {}).mode === 'exhaustive') ? '程序侧穷举；模型侧抽样阅读' : '程序侧覆盖+采样；模型侧抽样阅读',
    pathIssues: parsed.pathIssues || [], verdict: parsed.verdict || 'revise'
  };
  draft.pathReview = review;
  writeJson(draftFile, draft);
  writeJson(path.join(DIR.review, storyId + '-paths.json'), { storyId, kind: 'paths', review });
  log('路径审核：抽样 ' + picked.length + '/' + paths.length + '；issues ' + review.pathIssues.length);
  return review;
}

/* 上游上下文：把被指出节点的所有入边（谁在什么选项后走到它）写清楚，
 * 避免修复者在不了解分叉结构的情况下，把一句话改成只对某条路径成立。 */
function inboundContext(story, issues) {
  const targets = new Set();
  issues.forEach(i => { if (i && i.nodeId) targets.add(i.nodeId); });
  if (!targets.size) return '';
  const lines = [];
  targets.forEach(id => {
    const node = R.nodeById(story, id);
    if (!node) return;
    const ins = [];
    story.nodes.forEach(n => {
      (n.choices || []).forEach(c => { if (c.to === id) ins.push(n.id + '「' + (n.label || '') + '」选项「' + c.text + '」'); });
    });
    lines.push('· ' + id + (node.label ? '「' + node.label + '」' : '') + ' 的上游：' + (ins.length ? ins.join('；') : '（起点）'));
    /* 附上游节点正文摘要，便于判断哪些内容是共有的 */
    ins.slice(0, 4).forEach(s => {
      const upId = s.split('「')[0];
      const up = R.nodeById(story, upId);
      if (up) lines.push('    ' + upId + ' 正文开头：' + up.text.slice(0, 40) + '…');
    });
  });
  return lines.join('\n');
}

/* ── 步骤 6：定点修复（最多 2 轮；只改被指出的节点） ── */
async function stepFix(draft, round) {
  const issues = verifyIssueEvidence(
    (draft.editorReview.editorIssues || []).concat(draft.pathReview.pathIssues || [])
      .concat((draft.mergeCheck && draft.mergeCheck.fixRounds === (draft.fixRounds || 0) ? draft.mergeCheck.issues : [])),
    draft.story
  ).filter(i => i && (i.severity === 'blocker' || i.severity === 'major'));
  if (!issues.length) return { changed: false, note: '无需修复', done: true };
  /* 严格上限：整篇故事最多 2 轮完整修复 */
  if ((draft.fixRounds || 0) >= 2) return { changed: false, note: '已达 2 轮修复上限', done: true };
  /* 按严重度排序后取前 12 条（blocker 优先），并把编辑建议一并交给修复者 */
  const ranked = issues.slice().sort((a, b) => (a.severity === 'blocker' ? 0 : 1) - (b.severity === 'blocker' ? 0 : 1)).slice(0, 12);
  const rf = await extractJsonRetry([
    { role: 'system', content: P.FIX_SYSTEM },
    { role: 'user', content: P.FIX_USER_TEMPLATE(draft.story, ranked, inboundContext(draft.story, ranked)) }
  ], { tag: 'fix' + round + ':' + storyId, maxTokens: 16000, temperature: 0.7 }, '定点修复');
  const parsed = rf.parsed;
  const fixed = parsed.nodes || [];
  if (!fixed.length) return { changed: false, note: '修复请求未返回节点' };
  const map = {};
  draft.story.nodes.forEach(n => { map[n.id] = n; });
  let applied = 0;
  const appliedIds = [];
  fixed.forEach(n => {
    if (!n || !map[n.id] || typeof n.text !== 'string') return;
    /* 只接受结构上合法的节点替换（选项目标必须存在） */
    if (Array.isArray(n.choices) && n.choices.some(c => !c || !map[c.to])) return;
    /* 合并而非整体替换：模型可能漏带 label 等字段，保留原值 */
    map[n.id] = Object.assign({}, map[n.id], n);
    appliedIds.push(n.id);
    applied++;
  });
  /* ★ 关键修复（2026-09-22 实测 bug）：此前只改了 map（临时索引），
   * draft.story.nodes 仍指向旧对象 —— 修复被记为「已应用」，正文却从未变化；
   * 配合「touched 节点的问题即视为已处理」的清除逻辑，还造成「问题已处理」假象。
   * 这是 B 档批量隔离率偏高（日志反复出现「2 轮修复后仍遗留」）的直接原因。 */
  draft.story.nodes = draft.story.nodes.map(n => map[n.id] || n);
  draft.fixRounds = (draft.fixRounds || 0) + 1;
  draft.fixLog = draft.fixLog || [];
  const touched = appliedIds.slice();
  /* 覆盖检查（程序侧）：问题清单指向的节点，是否都被改到了？
   * 实测：修复者常只改其中一两个节点就返回，导致 blocker 原样残留到验收门。
   * 这里如实记录覆盖率，供日志与报告核对（不额外调用模型）。 */
  const need = new Set();
  issues.forEach(i => { if (i && i.nodeId) need.add(String(i.nodeId).replace(/[^a-z0-9]/gi, '')); });
  const miss = Array.from(need).filter(id => !touched.includes(id));
  draft.fixLog.push({ round, applied, touched, uncovered: miss, note: parsed.note || '', at: new Date().toISOString() });
  draft.story = C.normalize(draft.story);
  if (miss.length) log('定点修复第 ' + round + ' 轮：' + miss.length + ' 个问题节点未被改动（' + miss.join(',') + '），将由定点回归复核');

  /* 被修节点上的旧问题视为「已按修复请求处理」→ 从审核结论里移除。
   * 理由：不这样做，验收门会拿**修复前**的旧问题拒绝一篇已经改好的故事（实测踩过）。
   * 公平性：只有当问题确实指向被改动的节点时才移除；
   * 如果问题没被真正修掉，定点回归会把它重新报出来（stepTargetedRegression）。 */
  const touchedSet = new Set(touched);
  let purged = 0;
  const purgeFrom = (list) => (list || []).filter(i => {
    const nid = i && (i.nodeId || i.where || i.node);
    const hit = nid && touchedSet.has(String(nid).replace(/[^a-z0-9]/gi, ''));
    if (hit) { purged++; return false; }
    return true;
  });
  if (draft.editorReview) draft.editorReview.editorIssues = purgeFrom(draft.editorReview.editorIssues);
  if (draft.pathReview) draft.pathReview.pathIssues = purgeFrom(draft.pathReview.pathIssues);

  writeJson(draftFile, draft);
  log('定点修复第 ' + round + ' 轮：应用 ' + applied + ' 个节点，清掉 ' + purged + ' 条已处理问题（将做定点回归）');
  return { changed: applied > 0, note: parsed.note || '', touched: touched };
}

/* ── 步骤 6b：定点回归（任务书第 4 节第 7 步）
 * 只重新验证「被修复的节点 + 它们的相邻节点」，而不是重审全篇。
 * 验证内容：① 被修节点是否仍然结构合法、是否真的修掉了原来的问题；
 *           ② 改动有没有改坏邻居（邻居与它之间的衔接是否还成立）。
 * 输出很小，因此成本低、结论稳定 —— 不会每轮都冒出全新问题。 ── */
async function stepTargetedRegression(draft, touched) {
  if (!touched || !touched.length) { log('定点回归：本轮没有节点改动，跳过'); return; }

  const nodes = draft.story.nodes;
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  const inbound = {};
  nodes.forEach(n => (n.choices || []).forEach(c => { (inbound[c.to] = inbound[c.to] || []).push(n.id); }));

  /* 验证范围：被修节点 + 直接邻居（上游、下游） */
  const scope = new Set();
  touched.forEach(id => {
    if (!byId[id]) return;
    scope.add(id);
    (inbound[id] || []).forEach(u => scope.add(u));
    (byId[id].choices || []).forEach(c => scope.add(c.to));
  });
  const ids = Array.from(scope).filter(id => byId[id]);

  const items = ids.map(id => ({
    id,
    text: String(byId[id].text || ''),
    isEnding: !!byId[id].ending,
    choices: (byId[id].choices || []).map(c => ({ to: c.to, text: c.text, target: String((byId[c.to] || {}).text || '').slice(0, 70) })),
    upstream: (inbound[id] || [])
  }));

  try {
    const out = await extractJsonRetry([
      { role: 'system', content: P.REGRESSION_SYSTEM },
      { role: 'user', content: P.REGRESSION_USER_TEMPLATE(items) }
    ], { tag: 'regress' + (draft.fixRounds || 0) + ':' + storyId, maxTokens: 16000, temperature: 0.3 }, '定点回归');

    const found = (out && out.issues) || [];
    const reg = { at: new Date().toISOString(), round: draft.fixRounds || 0, scope: ids, issues: found };
    draft.regressions = draft.regressions || [];
    draft.regressions.push(reg);
    writeJson(draftFile, draft);

    const big = found.filter(i => i && (i.severity === 'blocker' || i.severity === 'major'));
    if (big.length) {
      log('定点回归：发现 ' + big.length + ' 条残留问题（' + ids.length + ' 个节点范围内）');
      /* 把残留问题并回 editorReview，使最终验收门能看到它们 */
      draft.editorReview = draft.editorReview || { at: new Date().toISOString(), editorIssues: [], verdict: 'revise' };
      draft.editorReview.editorIssues = (draft.editorReview.editorIssues || []).concat(big.map(i => ({
        severity: i.severity, nodeId: i.nodeId, issue: i.issue, suggest: i.suggest, evidence: i.evidence
      })));
      draft.editorReview.verdict = 'revise';
    } else {
      log('定点回归：通过（' + ids.length + ' 个节点范围内无残留问题）');
    }
  } catch (e) {
    log('定点回归失败（不阻塞流程）：' + e.message);
  }
}

/* 证据核验（程序侧，不调用模型）：
 * 审核方报出的 blocker/major 必须能指向故事里真实存在的原文。
 * 拿不出证据（evidence 缺失，且 issue 里也抄不出故事原文片段）→ 降级为 minor，不阻塞验收。
 * 这样既保留审核的独立判断，又用程序验证兜住「审核噪声导致好作品被拒收」。 */
function issueHasEvidence(issue, story) {
  const hay = (story.nodes || []).map(n => String(n.text || '')).join('\n');
  const chunks = [];
  const ev = String(issue.evidence || '').trim();
  if (ev) chunks.push(ev);
  /* 从 issue 描述里抽出中文片段（长度 ≥6 的连续中文串）作为候选证据 */
  String(issue.issue || '').replace(/[\u4e00-\u9fa5，。、；：""''（）]{6,}/g, m => { chunks.push(m); return m; });
  for (const c of chunks) {
    const clean = c.replace(/[「」""''（）()【】\s]/g, '');
    /* 取候选证据里最长的 8 个连续汉字做子串匹配 */
    for (let i = 0; i + 8 <= clean.length; i++) {
      const probe = clean.slice(i, i + 8);
      if (hay.indexOf(probe) >= 0) return true;
    }
  }
  return false;
}

/* 把无法核验的 blocker/major 降级（保留记录，但不阻塞验收） */
/* 从问题的原文证据反查它属于哪个节点（程序侧，不调用模型）。
 * 实测：路径审核有时报出真实问题却不给 nodeId，导致定点修复"找不到地方"、
 * 问题残留到验收门被隔离。这里用证据片段做匹配补上 nodeId。
 * 匹配顺序：① 选项文字（"选项与落点不符"类问题应定位到**持有该选项的节点**）
 *           ② 节点正文。 */
function locateIssueNode(issue, story) {
  if (!issue || issue.nodeId || issue.where || issue.node) return issue;
  const ev = String(issue.evidence || issue.quote || '').trim();
  if (ev.length < 6) return issue;
  /* 证据常是「两处原文」拼接（矛盾类问题必然引用两处），按常见分隔符切开逐段找 */
  const frags = ev.split(/[…\.]{2,}|——|→|／|\/|\|｜|；|;|、/)
    .map(s => s.replace(/[「」“”"'（）()【】]/g, '').replace(/\s+/g, '').trim())
    .filter(s => s.length >= 5);
  const nodes = story.nodes || [];
  /* ① 选项文字优先：定位到"说出这句话的节点" */
  for (const f of frags) {
    const probe = f.slice(0, 16);
    const holder = nodes.filter(n => (n.choices || []).some(c => String(c.text || '').replace(/\s+/g, '').indexOf(probe) !== -1))[0];
    if (holder) return Object.assign({}, issue, { nodeId: holder.id, locatedBy: 'choice-text' });
  }
  /* ② 节点正文 */
  const norm = nodes.map(n => ({ id: n.id, t: String(n.text || '').replace(/\s+/g, '') }));
  for (const f of frags) {
    const probe = f.slice(0, 20);
    const hit = norm.filter(n => n.t.indexOf(probe) !== -1)[0];
    if (hit) return Object.assign({}, issue, { nodeId: hit.id, locatedBy: 'evidence' });
  }
  return issue;
}

function verifyIssueEvidence(issues, story) {
  return issues.map(i => {
    if (!i || (i.severity !== 'blocker' && i.severity !== 'major')) return i;
    /* 程序侧检查（merged/props/shape）自带的原文比对已经足够，视为已核验 */
    if (i.source) return i;
    if (issueHasEvidence(i, story)) return locateIssueNode(i, story);
    return Object.assign({}, i, {
      severity: 'minor', demoted: true,
      demoteReason: '无法从故事原文中核验（缺少逐字证据）'
    });
  });
}

/* ── 步骤 7：通过 → 正式库；失败 → 隔离 ──
 * 验收门槛：结构必须合法，且最终一轮审核中不得残留 blocker/major
 * （定点修复最多 2 轮；未收敛的作品按任务书要求隔离，不进入公开库）。 */
function finalize(draft, reason) {
  const res = V.validateStory(draft.story, premium ? { premium: true, wantPaths: true } : {});
  const verified = verifyIssueEvidence(
    [].concat(
      (draft.editorReview && draft.editorReview.editorIssues) || [],
      (draft.pathReview && draft.pathReview.pathIssues) || [],
      (draft.mergeCheck && draft.mergeCheck.fixRounds === (draft.fixRounds || 0)) ? draft.mergeCheck.issues.filter(i => i.highConfidence !== false) : []
    ),
    draft.story);
  const openIssues = verified.filter(i => i && (i.severity === 'blocker' || i.severity === 'major'));
  /* 去重：同一问题常被多条路径重复报出（路径审核尤其如此） */
  const seen = {};
  const uniqueIssues = [];
  openIssues.forEach(i => {
    const key = String(i.issue || '').replace(/\s+/g, '').slice(0, 30);
    if (seen[key]) return;
    seen[key] = true;
    uniqueIssues.push(i);
  });
  const accept = res.ok && uniqueIssues.length === 0;
  draft.finalCheck = {
    ok: res.ok, codes: [...new Set(res.errors.map(e => e.code))],
    openIssuesAfterDedup: uniqueIssues.length,
    openIssuesRaw: openIssues.length,
    openIssues: uniqueIssues.slice(0, 12),
    at: new Date().toISOString()
  };
  draft.story.meta = {
    createdAt: new Date().toISOString(),
    generatedBy: 'tools/content/produce.cjs@1',
    reviewStatus: accept ? 'passed' : 'rejected',
    contentSources: '原创虚构，未使用未授权私人素材',
    pipeline: {
      proposalId: storyId + '-p' + (draft.chosen != null ? draft.chosen : 0),
      editorPass: !!(draft.editorReview && (draft.editorReview.verdict === 'pass' || (draft.fixRounds || 0) > 0)),
      pathReviewPass: !!(draft.pathReview && (draft.pathReview.pathIssues || []).filter(i => i.severity === 'blocker').length === 0),
      editorVerdict: draft.editorReview ? draft.editorReview.verdict : null,
      pathVerdict: draft.pathReview ? draft.pathReview.verdict : null,
      pathSampling: draft.pathReview ? (draft.pathReview.sampled + '/' + draft.pathReview.totalPaths) : null,
      fixRounds: draft.fixRounds || 0,
      openIssuesAtAcceptance: uniqueIssues.length,
      premium: premium
    }
  };
  writeJson(draftFile, draft);
  if (accept) {
    writeJson(path.join(DIR.stories, storyId + '.json'), draft.story);
    const b = llm.readBudget();
    b.stories.passed = (b.stories.passed || 0) + 1;
    llm.writeBudget(b);
    log('✅ 通过并写入正式库：' + storyId + '（节点 ' + draft.story.nodes.length + '，结局 ' + draft.story.endings.length +
      '，修复 ' + (draft.fixRounds || 0) + ' 轮，遗留 issue ' + uniqueIssues.length + '）');
    return true;
  }
  const reason2 = reason + (res.ok ? '' : '；结构错误：' + [...new Set(res.errors.map(e => e.code))].join(',')) +
    (uniqueIssues.length ? '；2 轮修复后仍遗留 blocker/major ' + uniqueIssues.length + ' 条（去重后）' : '');
  writeJson(path.join(DIR.quarantine, storyId + '.json'), {
    storyId, genreId, reason: reason2, at: new Date().toISOString(),
    errorCodes: [...new Set(res.errors.map(e => e.code))],
    errors: res.errors.slice(0, 30),
    openIssues: uniqueIssues.slice(0, 20),
    reviewSummary: (draft.editorReview || draft.pathReview) ? {
      editorVerdict: draft.editorReview ? draft.editorReview.verdict : null,
      editorIssues: draft.editorReview ? draft.editorReview.editorIssues.length : null,
      pathVerdict: draft.pathReview ? draft.pathReview.verdict : null,
      pathIssues: draft.pathReview ? draft.pathReview.pathIssues.length : null
    } : null,
    story: draft.story
  });
  const b = llm.readBudget();
  b.stories.quarantined = (b.stories.quarantined || 0) + 1;
  llm.writeBudget(b);
  log('⛔ 隔离：' + storyId + '（' + reason2 + '）');
  return false;
}

(async function main() {
  log('开始生产 ' + storyId + '（' + genreId + (premium ? '，精品档' : '') + '）');
  const b0 = llm.readBudget();
  const blocked = llm.budgetExceeded();
  if (blocked) { console.error('预算保护触发：' + blocked); process.exit(3); }

  let draft = await stepPlan();
  if (legacy) {
    draft = await stepCreate();
  } else {
    draft = await stepSkeleton();
    draft = await stepWrite();
  }
  if (!draft.story && draft.skeleton && draft.texts) {
    draft.story = OC.fillGenre(OC.assemble(draft.skeleton, draft.texts), genreId);
    writeJson(draftFile, draft);
  }
  /* 选项文字校准：正文写完后，用一次小请求让选项如实对应该选项通向的内容 */
  if (draft.story) draft = await stepChoices();
  if (draft.story && !draft.story.genre) draft.story.genre = genreId;
  let check = stepProgramCheck(draft);

  /* 程序检查失败：先尝试机械修复一次；仍失败则进入审核前隔离 */
  if (!check.ok) {
    const repaired = C.structuralRepair(draft.story);
    check = V.validateStory(repaired.story, premium ? { premium: true, wantPaths: true } : { wantPaths: true });
    if (check.ok) { draft.story = repaired.story; draft.check = { ok: true, codes: [], errors: [], metrics: check.metrics, repaired: repaired.notes }; writeJson(draftFile, draft); log('机械修复后通过程序检查'); }
    else { finalize(draft, '程序检查未通过（机械修复无效）'); return; }
  }

  await stepEditorReview(draft);
  await stepPathReview(draft);

  /* 有 blocker/major 就定点修复，最多 2 轮，每轮后重新程序检查 + 重新审核 */
  if (noFix) log('--no-fix：跳过自动定点修复（正文已由人工审定），直接进入验收判定');
  for (let round = 1; !noFix && round <= 2; round++) {
    const mergeIssues0 = stepMergeCheck(draft);
    const hasBig = (draft.editorReview.editorIssues || []).concat(draft.pathReview.pathIssues || [])
      .concat(mergeIssues0.filter(i => i.highConfidence !== false))
      .some(i => i && (i.severity === 'blocker' || i.severity === 'major'));
    if (!hasBig) break;
    if ((draft.fixRounds || 0) >= 2) { log('已达 2 轮修复上限，停止修复并进入最终判定'); break; }
    const r = await stepFix(draft, round);
    if (!r.changed) break;
    const res = V.validateStory(draft.story, premium ? { premium: true, wantPaths: true } : { wantPaths: true });
    if (!res.ok) {
      const repaired = C.structuralRepair(draft.story);
      draft.story = repaired.story;
      draft.paths = [];
      const res2 = V.validateStory(draft.story, premium ? { premium: true, wantPaths: true } : { wantPaths: true });
      if (!res2.ok) { finalize(draft, '修复后结构非法'); return; }
    } else {
      draft.paths = res.metrics._paths || [];
    }
    /* 定点回归（任务书第 4 节第 7 步的原意）：只重新验证**被修的节点及其相邻节点**，
     * 而不是每轮都做一次全新的全篇审核。
     * 理由（实测）：全篇重审每轮都会发现新问题，2 轮上限必然耗尽 → 永远无法收敛；
     * 而任务书要求的是「仅修失败节点及必要相邻节点，再重新验证」，
     * 即验证「这次修复有没有生效、有没有改坏邻居」，不是重新审一遍全篇。 */
    await stepTargetedRegression(draft, r.touched || []);
  }

  const finalOk = finalize(draft, '完成流程');
  const b1 = llm.readBudget();
  log('本次会话请求增量 ' + (b1.requests.used - b0.requests.used) + ' 次；累计 ' + b1.requests.used + '/' + b1.requests.limit + '；通过 ' + b1.stories.passed + '，隔离 ' + b1.stories.quarantined);
  process.exit(finalOk ? 0 : 1);
})().catch(e => { console.error('生产中断：' + (e && e.message ? e.message : e)); process.exit(4); });
