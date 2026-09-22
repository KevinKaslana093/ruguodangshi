// 人工式定点编辑（定稿 v23 — 补齐入库版本的两处遗漏）。
//
// ① n7 的 **label** 仍是旧值「切成小块码好」，但 v21 起 n7 正文已不再切块（形态统一纪律）——
//    label 与正文不符。（这一条审核没抓到，是人工复核发现的。）
// ② n6 与 n7 开头句式几乎逐字重复（「小陶把盘子端到桌子那头，……小满靠在橱柜边看着他，
//    没帮忙，也没走开。」）——两条支线读起来像同一段，削弱「选择有可感知后果」。
//    修法：n7 换一个开头角度（从擦盘沿、摆位置的动作切进去），保留「想粉饰」的态度差异。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① label 与正文对齐 */
byId['n7'].label = '盘沿擦净，摆得齐整';

/* ② n7 换开头角度，消除与 n6 的逐字重复 */
byId['n7'].text = '小陶找了块干抹布，把盘沿一圈圈擦净，端起来比了两次位置，最后摆在桌子正中间，刀叉斜着码好，间距都匀。小满靠着橱柜看他忙这些，没帮忙，也没走开。写着糖的那只罐子被推到角落，标签还朝外翻着。小陶把卡片收进兜里，窗外的天开始从黑转灰。他说：就当是新口味。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v23 已应用：n7 label 对齐正文、n7 开头去重复');
console.log('  n6 label:', byId['n6'].label);
console.log('  n7 label:', byId['n7'].label);
