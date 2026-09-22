/* 专项一致性审核的**判别力验证**：用已知坏样本考它。
 *
 * 若它只会在完好版本上返回 0，那它是无用的橡皮图章。
 * 本脚本把 sc-0006 的已知缺陷重新注入（label 与选项都写回旧值），
 * 再跑一次同样的检查，看它是否报出来。
 *
 * 用法：node tools/content/consistency-review-test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const llm = require(path.join(R, 'tools', 'llm.cjs'));

const src = JSON.parse(fs.readFileSync(path.join(R, 'content', 'stories', 'sc-0006.json'), 'utf8'));
const story = JSON.parse(JSON.stringify(src.story || src));
const byId = {};
story.nodes.forEach(n => { byId[n.id] = n; });

/* 注入缺陷 A：n7 label 写回「切成小块码好」（正文只是擦盘摆齐） */
byId['n7'].label = '切成小块码好';
/* 注入缺陷 B：n4→n7 选项写回「切成小块，说这是特制咸味」（正文无切块、无特制咸味） */
byId['n4'].choices.find(c => c.to === 'n7').text = '切成小块，说这是特制咸味';
/* 注入缺陷 C：n9 label 写「刀递到阿栗手里」（正文只有手伸向盘边，没人递刀） */
byId['n9'].label = '刀递到阿栗手里';

const OBJECTS = ['块', '盒', '便签', '标签', '纸条', '刀', '叉', '盘', '碗', '杯', '袋', '罐', '瓶',
  '包', '箱', '卡片', '贺卡', '蜡烛', '蛋糕', '票', '钥匙', '手机', '灯', '门', '窗', '信', '笔',
  '冰箱', '抽屉', '柜', '锅', '勺', '抹布', '糖', '盐', '面糊'];
const ACTIONS = ['切', '贴', '装', '倒', '擦', '洗', '摆', '端', '拿', '放', '收', '藏', '扔', '撕',
  '折', '打开', '关上', '锁', '拆', '包', '裹', '烤', '煮', '热', '放', '塞', '取', '掏', '递',
  '推', '挪', '盖', '掀', '敲', '按', '写', '画'];

const labelRows = story.nodes.filter(n => n.label).map(n => ({ id: n.id, label: n.label, body: String(n.text || '') }));
const choiceRows = [];
story.nodes.forEach(n => {
  (n.choices || []).forEach(c => {
    const land = byId[c.to];
    if (!land) return;
    if (!OBJECTS.some(o => c.text.includes(o)) || !ACTIONS.some(a => c.text.includes(a))) return;
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
  '【逐条核对 label 与正文】', JSON.stringify(labelRows), '',
  '【逐条核对选项与落点正文】', JSON.stringify(choiceRows), '',
  '请对以上每个条目给出 consistent 判断。key 用 id（label 条目）或 "from→to"（选项条目）。'
].join('\n');

(async () => {
  console.log('注入 3 处已知缺陷：');
  console.log('  A. n7 label = ' + byId['n7'].label + '（正文只擦盘摆齐）');
  console.log('  B. n4→n7 选项 = ' + byId['n4'].choices.find(c => c.to === 'n7').text);
  console.log('  C. n9 label = ' + byId['n9'].label + '（正文只写手伸向盘边）');
  console.log();
  const out = await llm.callWithBudgetFallback(
    [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }],
    { tag: 'consistency-test:sc-0006', maxTokens: 16000, temperature: 0.2 }
  );
  let parsed = null, err = null;
  try { parsed = llm.extractJson(out.content); } catch (e) { err = e; }
  if (!parsed) {
    console.log('未返回可解析 JSON：' + (err && err.message));
    console.log(String(out.content).slice(0, 300));
    return;
  }
  const items = parsed.items || [];
  const bad = items.filter(i => i.consistent === false);
  console.log('条目 ' + items.length + '；判为不一致 ' + bad.length);
  bad.forEach(i => console.log('  ✗ [' + i.key + '] ' + (i.reason || '')));
  console.log();
  const hit = (k) => bad.some(i => String(i.key).indexOf(k) !== -1);
  console.log('=== 判别力结论 ===');
  console.log('  抓到 A（n7 label）  : ' + (hit('n7') ? '是 ★' : '否'));
  console.log('  抓到 B（n4→n7 选项）: ' + (bad.some(i => String(i.key).indexOf('n4') !== -1 && String(i.key).indexOf('n7') !== -1) ? '是 ★' : '否'));
  console.log('  抓到 C（n9 label）  : ' + (hit('n9') ? '是 ★' : '否'));
})().catch(e => { console.error('失败：' + e.message); process.exit(4); });
