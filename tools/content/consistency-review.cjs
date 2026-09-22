/* 专项一致性审核（小输入、独立请求）。
 *
 * 背景：加强 EDIT_SYSTEM 后，主审核要一次核对全篇 label + 173 条选项，
 * 推理负担骤增（实测推理 35k–71k 字符 → finish=length 空返回）。
 * 正确解法是**拆分**：把它做成一个**输入极小**的专项请求 ——
 * 只送每个节点的 (label, 正文首句) 与每条选项的 (选项文字, 落点正文首句)，
 * 让模型只回答「说的是不是同一件事」。输入小 → 推理短 → 稳定出结果。
 *
 * 用法：node tools/content/consistency-review.cjs <storyId>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const llm = require(path.join(R, 'tools', 'llm.cjs'));

const storyId = process.argv[2] || 'sc-0006';
const p = path.join(R, 'content', 'drafts', storyId + '.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const story = d.story;

const firstSentence = (t) => {
  const s = String(t || '').split(/[。！？]/)[0];
  return s.length > 40 ? s.slice(0, 40) : s;
};

/* 只挑「实物操作」类选项（含物理动作 + 具体物件）送去核对，压缩输入 */
const OBJECTS = ['块', '盒', '便签', '标签', '纸条', '刀', '叉', '盘', '碗', '杯', '袋', '罐', '瓶',
  '包', '箱', '卡片', '贺卡', '蜡烛', '蛋糕', '票', '钥匙', '手机', '灯', '门', '窗', '信', '笔',
  '冰箱', '抽屉', '柜', '锅', '勺', '抹布', '糖', '盐', '面糊'];
const ACTIONS = ['切', '贴', '装', '倒', '擦', '洗', '摆', '端', '拿', '放', '收', '藏', '扔', '撕',
  '折', '打开', '关上', '锁', '拆', '包', '裹', '烤', '煮', '热', '放', '塞', '取', '掏', '递',
  '推', '挪', '盖', '掀', '敲', '按', '写', '画'];

/* 送**完整正文**（不截断）。
 * 教训：先前只送首句（40 字）→ 模型看不到「敲了两下」这类写在第二句的动作，
 * 14/25 全部误报。一致性判断依赖完整上下文，不能为了压缩输入而截断正文。 */
const byId = {};
story.nodes.forEach(n => { byId[n.id] = n; });

const labelRows = story.nodes.filter(n => n.label).map(n => ({
  id: n.id, label: n.label, body: String(n.text || '')
}));

const choiceRows = [];
story.nodes.forEach(n => {
  (n.choices || []).forEach(c => {
    const land = byId[c.to];
    if (!land) return;
    const hasObj = OBJECTS.some(o => c.text.includes(o));
    const hasAct = ACTIONS.some(a => c.text.includes(a));
    if (!hasObj || !hasAct) return;
    choiceRows.push({ from: n.id, to: c.to, choice: c.text, landing: String(land.text || '') });
  });
});

const SYSTEM = [
  '你是中文故事的一致性校对员。只做一件事：判断两段文字说的是不是同一件事。',
  '**直接开始写 JSON，不要做任何前置分析。推理不超过 80 字。**',
  '对每个条目，判断：B（正文）里是否真的发生了 A（label/选项）所说的那个动作、出现了那件东西。',
  '允许合理的文字改写（同义、换角度、间接描写）；只要 A 承诺的事在 B 里成立就算 consistent=true。',
  '只有当 A 承诺的动作/物件在 B 里**完全没有兑现**时，才标 consistent=false。',
  '输出 JSON：{"items":[{"key":"节点或选项的 key","consistent":true|false,"reason":"≤24字"}]}',
  '没有不一致的条目时 items 为空数组 —— 这是完全正常的结论。'
].join('\n');

const USER = [
  '【逐条核对 label 与正文】',
  JSON.stringify(labelRows, null, 0),
  '',
  '【逐条核对选项与落点正文】',
  JSON.stringify(choiceRows, null, 0),
  '',
  '请对以上每个条目给出 consistent 判断。key 用 id（label 条目）或 "from→to"（选项条目）。'
].join('\n');

(async () => {
  console.log('专项一致性审核：' + storyId);
  console.log('  label 条目 ' + labelRows.length + ' 个；实物操作类选项 ' + choiceRows.length + ' 条');
  const out = await llm.callWithBudgetFallback(
    [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }],
    { tag: 'consistency:' + storyId, maxTokens: 16000, temperature: 0.2 }
  );
  let parsed = null, err = null;
  try { parsed = llm.extractJson(out.content); } catch (e) { err = e; }
  if (!parsed) {
    console.log('审核未返回可解析 JSON：' + (err && err.message));
    console.log('原始输出前 300 字：\n' + String(out.content).slice(0, 300));
    process.exit(0);
  }
  const items = parsed.items || [];
  const bad = items.filter(i => i.consistent === false);
  console.log('条目 ' + items.length + ' 个；判为不一致 ' + bad.length + ' 个');
  bad.forEach(i => console.log('  ✗ [' + i.key + '] ' + (i.reason || '')));
  const ok = items.filter(i => i.consistent !== false);
  console.log('  （一致 ' + ok.length + ' 个）');
  d.consistencyReview = { at: new Date().toISOString(), checked: items.length, inconsistent: bad };
  fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
  console.log('已写回 draft');
})().catch(e => { console.error('失败：' + e.message); process.exit(4); });
