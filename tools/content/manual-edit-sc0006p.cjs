// 人工式定点编辑（定稿 v14）。
// ① major：n2 说"缺的就是糖"，n6 小满却凭空摸出半包 → 核心困境被瞬间消解、道具无铺垫。
//    修法：让糖的线索在 n1/n2 就埋下（小满屋里有一包他自己留的），n6 才发现。
// ② minor：贺卡在 n3 之后消失，两个选项无回响 → 在 n8（桌上）让贺卡自然收尾。
// ③ minor：n7 重复"端出来搁台面上" → 去掉重复动作。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① 铺垫：n2 里点出"小满屋里常备一包自己做点心剩的糖"（两条来路都成立——n2 是 n5/n4 的上游之一；
 *    但 n4 也由 n3 到达，所以铺垫放在**全部路径都会经过的更早位置**：n1）。 */
byId['n1'].text = '橱柜最上层那个贴着「糖」字的罐子，是上回装盐时贴错了标签，一直没人改；真正的糖袋早见了底。小陶半夜起来烤蛋糕，照标签舀了两勺，直到第一炉出烤箱尝了一口才发现不对。台面上那盘蛋糕切开的角敞着，咸味在厨房里散不掉；旁边压着一张没写完的贺卡，是给阿栗的。隔壁小满屋里灯早灭了，他那抽屉里还收着自己做点心剩的半包糖——只是这会儿谁也没想到去要。窗外还是黑的，屋里只亮着一盏小灯。';

/* ② n8 让贺卡收尾（两个 n3 选项都通到这里） */
byId['n8'].text = String(byId['n8'].text).replace(/蜡油顺着蜡烛往下淌。/, '那张贺卡压在盘子边上，字朝着桌面扣着。蜡油顺着蜡烛往下淌。');

/* ③ n7 去掉重复的"端出来" */
byId['n7'].text = '小陶把两盘并排搁在台面上，切开的角都敞着。他和小满站在台面两头，谁也没先坐下。写着糖的那只罐子被推到角落，标签还朝外翻着。窗外的天开始从黑转灰。小满说重做来不及了，先想怎么办。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v14 已应用：n1 埋糖的线索、n8 贺卡收尾、n7 去重复动作');
