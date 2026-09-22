// 人工式定点编辑（第三轮）：sc-0003 最后 1 条——选项承诺与落点场景不符。
// n6「收起信，先和邻居回楼上」的落点 n9 实际发生在值班台（合并点，与 n7 同场）。
// 修法：把选项改成如实描述"在值班台继续把话摊开"。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0003.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const n6 = s.nodes.filter(n => n.id === 'n6')[0];
n6.choices.forEach(c => {
  if (c.to === 'n9') c.text = '收起信，转身问邻居怎么看';
});
['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('n6 → n9 选项已改为与落点场景一致：' + n6.choices.map(c => c.text).join(' / '));
