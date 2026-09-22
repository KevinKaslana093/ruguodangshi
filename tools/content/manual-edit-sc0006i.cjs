// 人工式定点编辑（终稿 v7）：sc-0006 收尾。
// ① major：n11 写"阿栗说她其实早就知道"，而 n14（e3 twist 结局）正是以"她早就知道"为转折
//    → n11 提前泄底，使 e3 失去转折。修法：n11 不再让她点破"早就知道"。
// ② minor：n12 的"颜色不匀"是第二炉特征，部分来路桌上只有原炉 → 去掉该修饰。
// ③ minor：半包糖出现在小满抽屉 → 在 n4（他第一次出场）补一句铺垫。
// ④ minor：n2 选项"再翻一遍柜子"与正文已翻遍重复 → 改为别的动作。
// ⑤ minor：n7 便签"实验品"与 n8"海盐特调"口径不一 → 便签不写具体字。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① n11 不再泄底 */
byId['n11'].text = '阿栗说她其实不怪他。屋里一下静了。小陶刚说出口的那些话还悬在半空，人站在桌边没动；小满看看阿栗，又看看小陶，手还搭在桌沿上。蜡烛的火苗晃了一下，蜡油淌到盘边的纸上。蛋糕还剩在那里，切面敞着，谁也没再动刀。窗外那片灰比刚才亮了一点，但还没白。';

/* ② n12 去掉"颜色不匀"（第二炉特征） */
byId['n12'].text = '阿栗又叉了一块，含在嘴里，慢慢点了点头，说这样也挺好吃，像哪家铺子会做的点心。小满先没忍住，笑出声，伸手也切了一角。小陶的脸烫起来，叉子犹豫着跟过去。三个人围着那盘蛋糕，一人一角地挖，蜡烛烧到一半，火苗在没开灯的屋里晃。天从灰里透出一点白，盘底慢慢刮出了声音。';

/* ③ n4 补糖的铺垫（小满出场时带出他那儿有糖） */
byId['n4'].text = '小满从屋里出来了，趿着拖鞋，头发压得乱七八糟，手里搁着半包没拆完的糖，是上回他自己做点心剩下的。小陶把切下的那一角推到他面前，说了实话：罐子拿错了，舀进面糊里的是盐。小满捏起蛋糕咬了一口，嚼了两下，没咽下去，也没吐出来，只把杯子往边上挪了挪。台面上那盘蛋糕切开的角敞着，咸味还没散。小满看了他一会儿，说这事不能你一个人扛。两个人在小灯底下站着，怎么办还没商量出来。';

/* ④ n2 选项改为不与正文重复的动作 */
byId['n2'].choices.forEach(c => {
  if (c.to === 'n5') c.text = '先不出声，把空糖袋收起来';
});

/* ⑤ n7 便签去掉具体字样 */
byId['n7'].text = String(byId['n7'].text).replace(/盒上贴便签，写实验品/, '盒上贴了张便签');

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('终稿 v7 已应用：n11 去泄底、n12 去颜色特征、n4 补糖铺垫、n2 选项去重复、n7 便签去具体字样');
