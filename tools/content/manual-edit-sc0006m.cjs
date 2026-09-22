// 人工式定点编辑（终稿 v11 — 定稿）。
// ① blocker：n13 结局来路含 n11（小陶已当面承认），却写"那点事始终没被说破"→ 冲突。
//    修法：结局只写此刻的姿态与天光，不对"说没说破"下任何断言。
// ② minor：n4 正文已说出"盐"，选项却写"承认是盐"→ 动作重复。
//    修法：选项改为不重复正文已发生动作的措辞。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① n13：不判断"说破与否" */
byId['n13'].text = '蜡烛烧到一半，蜡油在盘边积了一小滩。阿栗把手里那一角吃完，越吃越慢，最后把叉子放下了。小陶和小满也没再动。窗外那片灰终于泛出白，屋里的灯始终没开，谁也没去开。盘子在桌子中间搁着，切面敞着。';

/* ② n4 的两个选项：不再重复"承认是盐"（正文已经说了） */
byId['n4'].choices.forEach(c => {
  if (c.to === 'n6') c.text = '拉小满一起重烤一炉';
  if (c.to === 'n7') c.text = '把蛋糕切成小块，说是特制咸味';
});

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('终稿 v11 已应用：n13 去"说破"断言、n4 选项去重复');
