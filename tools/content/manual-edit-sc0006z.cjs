// 人工式定点编辑（定稿 v24 — 选项与落点对齐）。
//
// 浏览实测发现：n4→n7 的选项仍写「切成小块，说这是特制咸味」，
// 但 v21 起 n7 正文已统一形态（不再切块，只是把盘沿擦净、摆得齐整）。
// 这条属于「选项承诺 A、落点写 B」，模型审核这两轮都漏掉了 —— 靠实际游玩发现。
//
// 修法：n4→n7 的选项改为如实描述 n7 的那个动作（摆盘、粉饰），
//       与 n5→n7 的「求小满配合，说这是新口味」形成对照（两条来路态度一致，措辞不重复）。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

const setChoice = (from, to, text) => {
  const c = (byId[from].choices || []).filter(x => x.to === to)[0];
  if (!c) throw new Error('缺选项 ' + from + '→' + to);
  c.text = text;
};

/* n4（小满已知情）→ n7：把盘子摆得体面，绝口不提是怎么做的 */
setChoice('n4', 'n7', '把盘沿擦净摆齐，不提怎么做的');
/* n5（小满当场尝出）→ n7：拉小满一起圆场 */
setChoice('n5', 'n7', '拉小满一起圆场，说是新口味');

/* 复核：n4→n6 与 n5→n6 措辞也不该逐字相同 */
setChoice('n4', 'n6', '硬着头皮把盘子端上桌');
setChoice('n5', 'n6', '把盘子端上桌，一句不解释');

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v24 已应用：n4/n5 → n7 与 → n6 的选项全部与落点正文对齐');
s.nodes.forEach(n => (n.choices || []).forEach(c => console.log('  ' + n.id + ' -> ' + c.to + ' : ' + c.text)));
