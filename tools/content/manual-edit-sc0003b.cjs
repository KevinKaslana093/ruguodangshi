// 人工式定点编辑（第二轮）：sc-0003 剩余 3 条真实缺陷。
// 每条都只动必要节点，不动结构。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0003.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* 缺陷 A（major n3）：n3 是「在她自己门口」，两个选项都下楼，
 * 但下游 n6/n7 都有沈知遥在场 —— 她"突然出现"。
 * 修法：在 n3 结尾交代她一起下楼（她本就在自己门口，最自然）。 */
byId['n3'].text = '她没提那个名字，只问：之前住这儿的是个什么样的人。沈知遥靠着门框，答得挺顺：挺好一户，安静，不吵人，搬走得也急。再往下问，她就摆手：我记性差。林小满转身往楼梯口走，沈知遥把门带上，跟了下来，钥匙串一路轻响。楼梯尽头就是门厅，灯亮着。';

/* 缺陷 B（blocker n5）：选项说「把信放回」，下游 n6/n7 却仍由她拿着信 → 矛盾。
 * 修法：选项文字改为「收好信」，与下游一致（正文不动，正文只说她把信放回信箱夹层这件事已完成）。 */
byId['n5'].choices.forEach(c => {
  if (c.to === 'n6') c.text = '收好信，转身去问老周';
  if (c.to === 'n7') c.text = '收好信，抽一封看邮戳比对日期';
});

/* 缺陷 C（major n9）：整条路径是同一夜连续发生，n9 却说「这几天」→ 时间口径错。
 * 修法：改为同一夜内的说法。 */
byId['n9'].text = '值班台的灯还亮着，林小满把话一句一句摆出来：从门缝底下那晚说起，说到那个不属于她的名字，又说到今晚谁都笑着把话岔开、谁都不肯把它念出来。她声音不高，说完就看着沈知遥。钥匙串在沈知遥手里攥紧了，始终没响。老周在旁边翻着本子，翻得比刚才慢。';

['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('人工编辑（第二轮）已应用：n3 交代同行、n5 选项修正、n9 时间口径修正');
