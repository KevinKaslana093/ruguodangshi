// 人工式定点编辑（定稿 v25）。
//
// 由「加强后的编辑审核」回归测试发现（注入已知缺陷考审核员，顺带考出现存真实缺陷）：
//   ① n9 label「刀递到阿栗手里」—— 正文只写「阿栗的手伸向盘边」，没有递刀这个动作。
//   ② n11 label「阿栗放下叉子」—— 正文里根本没出现叉子。
//   ③ n10 label「阿栗咽下第一口」—— 正文写的是「嚼得很慢……咽下去之前」，尚未咽下。
// 另：n3 的那个选择（贺卡里要不要提盐）此前被判「内容再无下文」。
//   由于 n4 之后所有节点都由 n2/n3 **两条来路共享**，无法在下游复述卡片具体写了什么；
//   这里用**中性的收尾**让它落地：结尾把贺卡递出去（内容不指定，两条来路都成立），
//   使「写了贺卡」这个动作在结局里有回响。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ①②③ label 逐条对齐正文 */
byId['n9'].label = '小满先开口圆场';
byId['n10'].label = '阿栗尝了第一口';
byId['n11'].label = '阿栗说不怪他';

/* ④ 圆满结局里让贺卡落地。
 * 注意：n12 有两条来路——n3（写了贺卡）与 n2（没经过写贺卡）。
 * 因此这里**不描述卡片内容、也不描述她的阅读反应**，只写它被递到阿栗手边，
 * 使「卡片」这个道具在结局有回响，同时对两条来路都成立。 */
byId['n12'].text = '阿栗又叉了一块，含在嘴里，慢慢点了点头，说这样也挺好吃，像哪家铺子会做的点心。小满先没忍住，笑出声，伸手也切了一角。小陶把那点事说完，从兜里把卡片拿出来，放在阿栗手边。三个人围着那盘蛋糕，一人一角地挖，蜡烛烧到一半，火苗在没开灯的屋里晃。天从灰里透出一点白，盘底慢慢刮出了声音。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v25 已应用：n9/n10/n11 label 对齐正文、n12 让贺卡落地');
['n9', 'n10', 'n11'].forEach(id => console.log('  ' + id + ' label = ' + byId[id].label));
