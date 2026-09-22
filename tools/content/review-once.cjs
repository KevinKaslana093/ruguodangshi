// 单次独立审核（人工编辑后的复验）。不跑整条流水线，减少资源占用与耗时。
// 用法：node tools/content/review-once.cjs <storyId> [paths]
//   paths 传入 "paths" 时，额外做一次路径审核（抽样 10 条）。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const P = require('./prompts.cjs');
const llm = require('../llm.cjs');
const C = require('./check.cjs');

const storyId = process.argv[2];
const withPaths = process.argv[3] === 'paths';
const p = path.join(R, 'content', 'drafts', storyId + '.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const story = d.story;

/* 与 produce.cjs 一致的调用封装：预算回退 + 截断补齐 + 一次重试 */
function repairTruncatedJson(text) {
  if (!text) return null;
  let s = String(text);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  const start = s.indexOf('{');
  if (start < 0) return null;
  s = s.slice(start);
  for (let cut = 0; cut < 3; cut++) {
    let t = s;
    if (cut > 0) {
      const lastComma = t.lastIndexOf(',');
      const lastClose = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
      const at = Math.max(lastComma, lastClose);
      if (at < 0) break;
      t = t.slice(0, at);
    }
    t = t.replace(/,\s*$/, '');
    let depthObj = 0, depthArr = 0, inStr = false, esc = false;
    for (const ch of t) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depthObj++; else if (ch === '}') depthObj--;
      else if (ch === '[') depthArr++; else if (ch === ']') depthArr--;
    }
    if (inStr) t += '"';
    t += ']'.repeat(Math.max(0, depthArr)) + '}'.repeat(Math.max(0, depthObj));
    try { return JSON.parse(t); } catch (e) { /* 继续回退 */ }
  }
  return null;
}

async function callJson(messages, opt, label) {
  let lastErr = null;
  for (let i = 0; i < 2; i++) {
    /* maxTokens 给足：该模型把「推理」也计入输出预算，
     * 实测单次审核的推理长度可达 3–7 万字符（≈1–2 万 token），
     * 6000 的预算会被推理吃光导致 finish=length 空返回。
     * 注意：必须让 maxTokens **覆盖** opt 里的值 —— 之前写成
     * Object.assign({maxTokens:16000}, opt, ...) 时 opt.maxTokens 会反过来覆盖它，
     * 导致预算实际仍是 6000（审核反复空返回的根因）。 */
    const merged = Object.assign({}, opt, { maxTokens: Math.max(opt.maxTokens || 0, 16000) });
    const out = await llm.callWithBudgetFallback(messages, Object.assign(merged, { tag: (opt.tag || '') + (i ? '#retry' : '') }));
    try { return { parsed: llm.extractJson(out.content), out }; }
    catch (e) {
      const salvaged = repairTruncatedJson(out.content);
      if (salvaged) { console.log('  · ' + label + ' JSON 截断，已补齐解析'); return { parsed: salvaged, out, salvaged: true }; }
      lastErr = e;
      console.log('  · ' + label + ' 解析失败（第 ' + (i + 1) + ' 次）：' + String(e.message).slice(0, 70));
    }
  }
  throw new Error(label + ' 连续返回无法解析的 JSON：' + (lastErr && lastErr.message));
}

(async () => {
  const compact = {
    title: story.title, summary: story.summary, genre: story.genreId,
    characters: story.characters, endings: story.endings,
    nodes: story.nodes.map(n => ({ id: n.id, text: n.text, label: n.label, ending: n.ending, choices: n.choices }))
  };
  const out = await callJson([
    { role: 'system', content: P.EDIT_SYSTEM },
    { role: 'user', content: P.EDIT_USER_TEMPLATE(compact) }
  ], { tag: 'editor:' + storyId, maxTokens: 6000, temperature: 0.2 }, '编辑审核');
  const issues = out.parsed.editorIssues || out.parsed.issues || [];
  console.log('编辑审核 verdict=' + (out.parsed.verdict || '?') + '，issues=' + issues.length);
  issues.forEach(i => console.log('  [' + i.severity + ']', i.nodeId || '', '::', i.issue, '| 证据:', String(i.evidence || '').slice(0, 90)));
  d.editorReview = { at: new Date().toISOString(), verdict: out.parsed.verdict || 'revise', editorIssues: issues };

  if (withPaths) {
    const V = require(path.join(R, 'shared', 'validate.js'));
    const res = V.validateStory(story, { premium: true, wantPaths: true });
    const paths = res.metrics._paths || [];
    const picked = [];
    const step = Math.max(1, Math.floor(paths.length / 8));
    for (let i = 0; i < paths.length && picked.length < 8; i += step) picked.push(i);
    const enderIdx = {};
    paths.forEach((pp, i) => { if (pp.endingId && enderIdx[pp.endingId] === undefined) enderIdx[pp.endingId] = i; });
    Object.keys(enderIdx).forEach(k => { if (picked.indexOf(enderIdx[k]) === -1) picked.push(enderIdx[k]); });
    const sel = picked.sort((a, b) => a - b).slice(0, 10).map(i => {
      const t = C.pathTexts(story, [paths[i]], 1)[0];
      const txt = t.text.length > 1150 ? (t.text.slice(0, 700) + '\n…（中略）…\n' + t.text.slice(-400)) : t.text;
      return { index: i, text: txt };
    });
    const r2 = await callJson([
      { role: 'system', content: P.PATH_SYSTEM },
      { role: 'user', content: P.PATH_USER_TEMPLATE(story, sel) }
    ], { tag: 'paths:' + storyId, maxTokens: 6000, temperature: 0.2 }, '路径审核');
    const pIssues = r2.parsed.pathIssues || [];
    console.log('路径审核 verdict=' + (r2.parsed.verdict || '?') + '，issues=' + pIssues.length + '（抽样 ' + sel.length + '/' + paths.length + '）');
    pIssues.forEach(i => console.log('  [' + i.severity + ']', i.nodeId || ('路径' + i.pathIndex), '::', i.issue, '| 证据:', String(i.evidence || '').slice(0, 90)));
    d.pathReview = { at: new Date().toISOString(), sampled: sel.length, totalPaths: paths.length, verdict: r2.parsed.verdict || 'revise', pathIssues: pIssues };
  }

  fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
  console.log('已写回 draft 审核结论');
})().catch(e => { console.error('审核失败：' + e.message); process.exit(4); });
