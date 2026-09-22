// 人工式定点编辑（终稿 v5）：sc-0006 最后两条。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① 合并点 n4（来路 n2「小满房门关着」与 n3「独自写贺卡」）：
 * 两条来路里小满都不在厨房 → 必须在本节点交代他出现，否则"突然在场"。
 * 修法：正文开头写他从屋里出来（两条来路都成立）。 */
byId['n4'].text = '小满从屋里出来了，趿着拖鞋，头发压得乱七八糟。小陶把切下的那一角推到他面前，说了实话：罐子拿错了，舀进面糊里的是盐。小满捏起蛋糕咬了一口，嚼了两下，没咽下去，也没吐出来，只把杯子往边上挪了挪。台面上那盘蛋糕切开的角敞着，咸味还没散。小满看了他一会儿，说这事不能你一个人扛。两个人在小灯底下站着，怎么办还没商量出来。';

/* ② n13 结局来路含 n11（小陶已坦白、阿栗已知情）→ 不能写"谁也没再提这盘东西是怎么来的"。
 * 修法：只写此刻的状态，不作"没人提"的断言。 */
byId['n13'].text = '蜡烛烧到一半，蜡油在盘边积了一小滩。盘子里没人再动，切面敞着。小陶和小满都停在桌边，动作慢下来。窗外那片灰终于泛出白，屋里的灯始终没开。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('终稿 v5 已应用：n4 交代小满出场、n13 去"没人提"断言');
