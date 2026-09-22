// 人工式定点编辑（定稿 v13）：统一「糖」的容器口径。
// n1 说的是"贴着糖字的罐子装的是盐"，n2 又写"糖袋只剩空壳"→ 容器在罐/袋间摇摆。
// 统一为：罐子（装盐那个）+ 袋（真正的糖，已空）。n2 明说糖袋是另一回事。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* n1：把"糖罐其实是盐"交代清楚，并点出真正的糖袋也空了 → 与 n2 一致 */
byId['n1'].text = '橱柜最上层那个贴着「糖」字的罐子，是上回装盐时贴错了标签，一直没人改；真正的糖袋早见了底。小陶半夜起来烤蛋糕，照标签舀了两勺，直到第一炉出烤箱尝了一口才发现不对。台面上那盘蛋糕切开的角敞着，咸味在厨房里散不掉；旁边压着一张没写完的贺卡，是给阿栗的。窗外还是黑的，屋里只亮着一盏小灯。';

/* n2：明确区分「贴错标签的罐」与「见了底的糖袋」，并把翻找动作对准真正的糖袋 */
byId['n2'].text = '小陶把橱柜翻了个底朝天。面粉袋还有半袋，鸡蛋也够，那只真正的糖袋却只剩一层空壳，抖了抖，连底子里的碎粒都没倒出来。他蹲在柜门前，把空糖袋捏扁又展开。再烤一炉的话，缺的就是这一样。走廊那头，小满的房门关着，屋里没灯。台面上，咸蛋糕和那张写到一半的贺卡一起搁着，切开的角敞着。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v13 已应用：n1/n2 统一糖的容器口径（罐=盐，袋=糖且已空）');
