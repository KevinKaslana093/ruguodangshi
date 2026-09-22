// 人工式定点编辑（定稿 v28 — 解决「卡片内容无法在下游兑现」的结构问题）。
//
// 诊断：n3 的两个选项承诺的是「贺卡里写什么」，但 n4/n5 由 **n2（没写过贺卡）** 与
//   **n3（写过贺卡）** 两条来路共享 —— 合并点无法复述卡片内容，所以这个承诺永远无法兑现。
//   这不是措辞问题，是**结构性约束**：选项只能承诺「下游共享节点能兑现的东西」。
//   （与合并点纪律同源：同层来路的承诺必须落在共享落点能兑现的范围内。）
//
// 修法：把 n3 的选项改为**与 n2 同构的岔路**（问小满要糖 / 不出声自己收拾）——
//   两条来路（先翻橱柜 / 先装盒写卡）在「怎么办」这个岔口汇合，卡片内容退为
//   n3 正文里的心理描写，不再是玩家承诺。
//   这样 n3 的选项承诺在下游 n4/n5 都能兑现，且 n2/n3 的差异仍体现在各自正文里。
//
// 同时修：n6→n9 选项「先看看阿栗第一口的反应」，但 n9 正文里阿栗的手停在半空、没入口。
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

/* n3 正文：卡片内容留在心理描写里，不作为玩家承诺 */
byId['n3'].text = '小陶把蛋糕装进盒子，扣上盖，又觉得这样送出去太像敷衍，把盖又揭开了。他摊开贺卡，笔帽咬在嘴里，写下「阿栗，生日快乐」，又写了两行平常的话。写到第三行，笔尖停住了——要不要把盐的事提一句？提了，这个生日就从一开始带着道歉；不提，阿栗第一口就会尝到。他把笔放下，没接着写。台面上，盒子敞着盖，咸味还在往屋里散。天快亮了。';

/* n3 的选项：与 n2 同构的岔路（下游 n4/n5 都能兑现） */
setChoice('n3', 'n4', '敲门问小满有没有糖');
setChoice('n3', 'n5', '先不出声，把空糖袋收起来');

/* n6→n9 选项：改为 n9 正文能兑现的写法（她是被小满劝住、先尝一口再评） */
setChoice('n6', 'n9', '看她先尝还是先开口');

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v28 已应用：n3 选项改为下游可兑现的岔路、n6→n9 选项对齐');
s.nodes.forEach(n => (n.choices || []).forEach(c => console.log('  ' + n.id + ' -> ' + c.to + ' : ' + c.text)));
