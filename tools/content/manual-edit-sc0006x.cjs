// 人工式定点编辑（定稿 v22）。
// ① major n2：n2 写"写到一半的贺卡"，但 n1→n2 这条路上小陶还没动笔（n3 才写）。
//    修法：n2 只说"贺卡"，不说写到哪一步。
// ② major n7：选项仍写"切成小块"，正文已无切块动作 → 选项改为与正文一致。
// ③ minor n5：n4/n5 是同一事件的两条线，措辞不宜逐字重复 → 让 n5 换一个观察角度。
// ④ minor 路径6：写贺卡后直接找小满，缺动机 → n4 补一句动机（天快亮，只有他屋里可能有糖）。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* ① n2：不提贺卡写到哪一步 */
byId['n2'].text = '小陶把橱柜翻了个底朝天。面粉袋还有半袋，鸡蛋也够，那只真正的糖袋却只剩一层空壳，抖了抖，连底子里的碎粒都没倒出来。他蹲在柜门前，把空糖袋捏扁又展开。再烤一炉的话，缺的就是这一样——除非去问小满。走廊那头，小满的房门关着，屋里没灯。台面上，那盘咸蛋糕和给阿栗准备的贺卡、盒子一起搁着。';

/* ② n7 选项对齐正文（正文无切块动作） */
byId['n7'].choices.forEach(c => {
  if (c.to === 'n8') c.text = '摆好盘沿，等着被问';
  if (c.to === 'n9') c.text = '绝口不提配方，先看反应';
});

/* ③ n5：换角度，避免与 n4 逐字重复 */
byId['n5'].text = '隔壁房门响了一下，小满趿着拖鞋站在了厨房门口。小陶下意识把盘子往身后挪了挪，说那是新试的口味，让他回去睡。小满没答话，走过来，伸手从盘沿掰下一小块放进嘴里。他嚼得很慢，眉毛挑起来，随即看向台面上那只写着糖的罐子。他把罐子端起来，掂了掂，又放回去。窗外还是黑的。';

/* ④ n4 补动机 */
byId['n4'].text = '天快亮了，能指望的只有隔壁。小陶敲了两下，小满隔着门应了一声，趿着拖鞋出来了，头发压得乱七八糟。小陶把掰下的那一角推到他面前，说了实话：罐子拿错了，舀进面糊里的是盐。小满捏起蛋糕咬了一口，嚼了两下，没咽下去，也没吐出来，只把杯子往边上挪了挪。他说糖的事他回头翻翻自己抽屉，可这会儿重做来不及。台面上那盘蛋糕切角敞着，咸味还没散。两个人站在小灯底下，怎么办还没商量出来。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v22 已应用：n2 去"写到一半"、n7 选项对齐、n5 换角度、n4 补动机');
