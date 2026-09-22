// 人工式定点编辑（定稿 v29 — 收尾）。
//
// 编辑审核 pass，仅剩 1 条 minor：n5 由 n2（蛋糕敞着在台面）、n3（蛋糕已装盒）两条来路共享，
// 而 n5 写「伸手从盘沿掰下一小块」——n3 那条路上蛋糕在盒里，没有盘沿可掰。
// 这是合并点纪律的直接体现：**合并点的动作不能依赖只有一条来路才成立的道具状态**。
//
// 修法：n5 改为不指定蛋糕的位置与形态（从「那盘东西」掰下一块，两条来路都成立）。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0006.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* n5：不指定容器（n2 来路是台面上的盘，n3 来路是敞盖的盒） */
byId['n5'].text = '隔壁房门响了一下，小满趿着拖鞋站在了厨房门口。小陶手忙脚乱地把那只空糖袋团起来塞进围裙口袋里，又把身子挡在前面，说那是新试的口味，让他回去睡。小满没答话，走过来，伸手掰下一小块放进嘴里。他嚼得很慢，眉毛挑起来，随即看向台面上那只写着糖的罐子。他把罐子端起来，掂了掂，又放回去。窗外还是黑的。';

/* n4 同理：不指定容器（两条来路一条在盘、一条可能已装盒） */
byId['n4'].text = '天快亮了，能指望的只有隔壁。小陶敲了两下，小满隔着门应了一声，趿着拖鞋出来了，头发压得乱七八糟。小陶掰下一角推到他面前，说了实话：罐子拿错了，舀进面糊里的是盐。小满捏起蛋糕咬了一口，嚼了两下，没咽下去，也没吐出来，只把杯子往边上挪了挪。他说糖的事他回头翻翻自己抽屉，可这会儿重做来不及。咸味还没散。两个人站在小灯底下，怎么办还没商量出来。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('定稿 v29 已应用：n4/n5 不指定容器（合并点纪律）');
