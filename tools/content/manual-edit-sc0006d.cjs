// 人工式定点编辑（终稿 v2）：sc-0006 四条真实缺陷，逐条对应证据。
// 总原则：**合并点的正文不得携带只在部分来路成立的信息**（盘数、味道、贺卡状态）。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① n3→n6 选项承诺「两炉一起端上桌」，n6→n8 的落点只写一盘 → 去掉盘数承诺。
 * 同时 n6（合并点）两个选项分别通向 n8/n9，措辞都不得再点数量。 */
byId['n6'].choices.forEach(c => {
  if (c.to === 'n8') c.text = '把烤好的都端上桌，先不解释';
});
byId['n6'].text = byId['n6'].text.replace(/只把那盘咸的挪到台面另一头，切开的角还敞着。/,
  '把那盘咸的挪到台面另一头，切开的角还敞着。');
byId['n8'].text = '窗外刚泛出一点灰，阿栗被叫起来，坐在桌边，头发还压着一道印。蜡烛插上了，火苗在没开灯的屋里晃。蛋糕端到了桌子中间，阿栗伸手去拿刀叉，嘴里道了声谢。小陶站在他手边，盯着桌上那东西，喉咙里那句话已经排到嘴边，还没出声。蜡油顺着蜡烛往下淌。';

/* ② n9 来路含「绝口不提配方」（n7）与「只端新出炉的」（n6），
 * 正文却说「这是小陶新试的做法」→ 与"不提"矛盾。改为不指定说法。 */
byId['n9'].text = '窗外刚泛出一点灰，阿栗坐在桌边，蜡烛点着，火苗把影子压在墙上。蛋糕摆在桌子中间，阿栗拿起刀，手腕刚抬起来。小满在桌沿上挪了挪，像是要开口，又没说出话。阿栗的刀停在半空，先看小满，又看小陶。小陶站在旁边，嘴张开一半，话还没出来。';

/* ③ n13 结局来路含「闷头把剩下的往嘴里塞」，却写「还剩大半个」→ 直接矛盾。
 * 改为完全不涉及剩余量的写法。 */
byId['n13'].text = '蜡烛烧到一半，蜡油在盘边积了一小滩。阿栗把手里那一角吃完，小陶和小满也各挖了一块，吃着吃着，动作都慢下来。盘子里没人再动，切面敞着。谁也没再提这蛋糕是怎么来的。窗外那片灰终于泛出白，屋里的灯始终没开。';

/* ④ n7「最后一行空着」：n7 来路含 n2 分支（根本没写贺卡）→ 贺卡状态不确定。
 * 删掉贺卡状态描述。 */
byId['n7'].text = String(byId['n7'].text).replace(/，旁边是摊开的贺卡，最后一行空着/, '，贺卡摊在旁边');

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('终稿 v2 已应用：n6/n8 去盘数、n9 去说法预设、n13 去剩余量、n7 去贺卡状态');
console.log('n6 选项:', byId['n6'].choices.map(c => c.text).join(' / '));
