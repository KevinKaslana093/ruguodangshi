// 人工式定点编辑（定稿 v31 — 补容器转换）。
//
// 遗留问题（review30 报出，v30 时未修）：n3 把蛋糕「装进盒子，扣上盖」（虽又揭开），
//   但 n6/n7 直接写「把盘子端到桌子那头 / 把盘沿擦净」——从盒到盘没有交代。
//   这是**合并点纪律的另一面**：上游给了两条来路（n2 蛋糕一直在盘里 / n3 进过盒子），
//   下游必须都能成立。n2 那条路本来就是盘子，所以只要让 **n3 把蛋糕放回盘子**，
//   两条来路就统一了，n6/n7 的「盘子」也就有了来源。
//
// 修法：n3 里「觉得这样送出去太像敷衍」之后，把蛋糕从盒里取出来放回盘子 ——
//   既交代了容器转换，也符合人物心理（嫌盒装像敷衍，于是还是直接端盘）。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

byId['n3'].text = '小陶把蛋糕装进盒子，扣上盖，走了两步又停下——这么送出去太像敷衍。他把盖揭开，把蛋糕取出来放回盘子里，盒子搁到一边。他摊开贺卡，笔帽咬在嘴里，写下「阿栗，生日快乐」，又写了两行平常的话。写到第三行，笔尖停住了——要不要把盐的事提一句？提了，这个生日就从一开始带着道歉；不提，阿栗第一口就会尝到。他把笔放下，没接着写。台面上那只写着糖的罐子还敞着口，咸味还在往屋里散。天快亮了。';

/* 相应的节点 label 也要跟着改（label 纪律：label 说的动作正文里必须真的发生） */
byId['n3'].label = '装盒又取出，笔停在半行';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v31 已应用：n3 交代容器转换（装盒 → 取出放回盘子）、label 同步');
console.log('  n3 label = ' + byId['n3'].label);
