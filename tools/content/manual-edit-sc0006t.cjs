// 人工式定点编辑（定稿 v18）：修正节点 label。
//
// 前几轮只改了 text / choices，漏了 **label**——而审核与路径审核都会读它，
// 因此每轮都报「标题称第二炉出炉，正文却不是」。
// 这里把全部 14 个 label 逐条对齐到当前正文语义。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

const labels = {
  n1: '天亮前的厨房',
  n2: '橱柜里只剩空糖袋',
  n3: '贺卡写到一半停笔',
  n4: '小满尝了一口咸蛋糕',
  n5: '小满自己尝出了咸味',
  n6: '把盘子端上桌',
  n7: '切成小块码好',
  n8: '蜡烛点上之后',
  n9: '刀递到阿栗手里',
  n10: '阿栗咽下第一口',
  n11: '阿栗放下叉子',
  n12: '咸的也挺好吃',
  n13: '蛋糕终究没吃完',
  n14: '其实阿栗早就知道'
};
Object.keys(labels).forEach(id => { if (byId[id]) byId[id].label = labels[id]; });

/* 顺带修 n4 与 n5 的场景重叠问题：n4/n5 同层，都是厨房台面，措辞对齐。 */
byId['n4'].text = '小满不知什么时候站在了厨房门口。小陶把切下的那一角推到他面前，说了实话：罐子拿错了，舀进面糊里的是盐。小满捏起蛋糕咬了一口，嚼了两下，没咽下去，也没吐出来，只把杯子往边上挪了挪。台面上那盘蛋糕切开的角敞着，咸味还没散。小满看了他一会儿，说这事不能你一个人扛。两个人在小灯底下站着，怎么办还没商量出来。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v18 已应用：14 个 label 全部对齐正文');
s.nodes.forEach(n => console.log('  ' + n.id + ' : ' + n.label));
