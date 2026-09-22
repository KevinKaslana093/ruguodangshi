// 人工式定点编辑（终稿 v4）：sc-0006 三条道具连贯问题。
// 病根：合并点断言了"手里拿着什么"，而各来路的手部状态不同（刀/叉/空手）。
// 修法：合并点不写"手里握着什么"，只写姿态与视线。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① n9 与 n7 的选项「切好摆盘」冲突：n9 写"阿栗拿起刀切"，
 * 但 n7 来路已经把蛋糕切好摆盘了 → 不写她拿刀，只写她伸手。 */
byId['n9'].text = '窗外刚泛出一点灰，阿栗坐在桌边，蜡烛点着，火苗把影子压在墙上。蛋糕摆在桌子中间，阿栗的手伸向盘边。小满先开了口，笑着说这盘得先尝一口再评，手艺的事待会儿再说。阿栗的手停在半空，先看小满，又看小陶。小陶站在旁边，嘴张开一半，话还没出来。';

/* ② n11 写"把叉子放回盘边"，但各来路她未必拿过叉子 → 不写手里有什么。 */
byId['n11'].text = '阿栗说她其实早就知道。屋里一下静了。小陶刚说出口的那些话还悬在半空，人站在桌边没动；小满看看阿栗，又看看小陶，手还搭在桌沿上。蜡烛的火苗晃了一下，蜡油淌到盘边的纸上。蛋糕还剩在那里，切面敞着，谁也没再动刀。窗外那片灰比刚才亮了一点，但还没白。';

/* ③ n13 写"阿栗把手里那一角吃完"，但来路含"把盘子推远，说吃不下" → 去手部与份量断言。 */
byId['n13'].text = '蜡烛烧到一半，蜡油在盘边积了一小滩。盘子里没人再动，切面敞着。小陶和小满都停在桌边，动作慢下来。谁也没再提这盘东西是怎么来的。窗外那片灰终于泛出白，屋里的灯始终没开。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('终稿 v4 已应用：n9/n11/n13 去掉手部与份量的分支专有断言');
