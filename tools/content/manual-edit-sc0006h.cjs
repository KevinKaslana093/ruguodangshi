// 人工式定点编辑（终稿 v6）：sc-0006 最后 1 条。
// n11 的选项「闷头把剩下的往嘴里塞」承诺吃光盘里剩下的，
// 但落点 n13（结局 e2）写的是「盘子里没人再动，切面敞着」→ 行为与后果冲突。
// 修法：选项改为如实描述"只顾吃自己那份、用吃来回避说话"，与结局一致。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const n11 = s.nodes.filter(n => n.id === 'n11')[0];
n11.choices.forEach(c => {
  if (c.to === 'n13') c.text = '闷头吃完自己那块，不说话';
});
['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('n11 选项已修正:', n11.choices.map(c => c.text).join(' / '));
