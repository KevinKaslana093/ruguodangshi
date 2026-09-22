// 人工式定点编辑（定稿 v30 — 终稿）。
//
// 路径审核最后一条 minor：n6 写「他什么也没解释，只说了句：端上去吧」——
// 盘子本来就在他手上（本节点开头就是他把盘子端到桌子那头），说「端上去吧」
// 像是在吩咐别人，与「一句不解释」的意图拧着。
//
// 修法：改成不产生歧义的自语（他自己已经端过去了，这里只需要一句定心的自言自语）。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

byId['n6'].text = '小陶把盘子端到桌子那头，刀叉摆在旁边，动作比平时慢。小满靠在橱柜边看着他，没帮忙，也没走开。那盘蛋糕的切角敞着，咸味还没散。小陶把卡片收进兜里，窗外的天从黑转成灰。他什么也没解释，只低声说了句：就这样吧。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v30 已应用：n6 收尾自语改为不产生歧义的「就这样吧」');
