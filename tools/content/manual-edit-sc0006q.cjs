// 人工式定点编辑（定稿 v15）。
//
// 结构事实（这次先查清再改）：
//   n4 → n6（重烤第二炉）  n4 → n7（切成小块，不重烤）
//   n5 → n6               n5 → n7
//   即 **n6 与 n7 同层**：n6 那支有两盘蛋糕，n7 这支只有一盘。
//   而 n8 是 n6、n7 的合并点 → n8 不能指定盘数。
// 之前反复失败的根因：把"两盘"写进了只该有一盘的 n7。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① n7（不重烤分支）：只有一盘咸蛋糕 */
byId['n7'].text = '小陶把那盘蛋糕端到台面中间，拿刀切成了一块一块，切面朝上码着，谁想吃哪块自己拿。他和小满站在台面两头，谁也没先坐下。写着糖的那只罐子被推到角落，标签还朝外翻着。窗外的天开始从黑转灰。小满说重做来不及了，先想怎么办。';

/* ② n8（n6/n7 合并点）：不指定盘数——只写"桌上有蛋糕" */
byId['n8'].text = '窗外刚泛出一点灰，阿栗被叫起来，坐在桌边，头发还压着一道印。蜡烛插上了，火苗在没开灯的屋里晃。蛋糕端到了桌子中间，阿栗伸手去拿刀叉，嘴里道了声谢。小陶站在她手边，盯着桌上那东西，喉咙里那句话已经排到嘴边，还没出声。那张贺卡压在盘子边上，字朝着桌面扣着。蜡油顺着蜡烛往下淌。';

/* ③ n9（n6/n7 合并点）：同样不指定盘数 */
byId['n9'].text = '窗外刚泛出一点灰，阿栗坐在桌边，蜡烛点着，火苗把影子压在墙上。蛋糕摆在桌子中间，阿栗的手伸向盘边。小满先开了口，笑着说这盘得先尝一口再评，手艺的事待会儿再说。阿栗的手停在半空，先看小满，又看小陶。小陶站在旁边，嘴张开一半，话还没出来。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v15 已应用：n7 只写一盘、n8/n9 合并点不指定盘数');
