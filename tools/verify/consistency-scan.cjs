/* 一致性诊断（不调用模型，纯程序）：测量两类不一致的可检出性。
 *
 * 背景：模型审核对两类不一致召回率偏低——
 *   ① label（节点标题）与正文不符：v21 起 n7 正文已不切块，label 却仍是「切成小块码好」
 *   ② 选项承诺的动作与落点正文不符：n4→n7 选项写「切成小块」，落点却是擦盘摆盘
 * 两轮模型审核都放过了。上一轮尝试过的「词面比对」在好样本上误报 12/12（中文改写空间太大）。
 *
 * 本脚本不预设结论，只做**测量**：
 *   - 若「零共享片段 → 报警」在 8 篇已通过作品上误报为 0，且能抓住已知坏样本 → 可程序化
 *   - 否则如实报告不可行，交回模型审核 + 人工游玩兜底
 *
 * 用法：node tools/verify/consistency-scan.cjs [--verbose]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const VERBOSE = process.argv.includes('--verbose');

const HAN = /[\u4e00-\u9fa5]/;

/* 取文本中的汉字 2-gram 集合（忽略标点与空白，避免被标点切碎） */
function bigrams(text) {
  const chars = String(text || '').split('').filter(c => HAN.test(c));
  const s = new Set();
  for (let i = 0; i + 1 < chars.length; i++) s.add(chars[i] + chars[i + 1]);
  return s;
}

/* 最长公共连续汉字片段长度（用于判断是否有实质共享） */
function longestCommonRun(a, b) {
  const A = String(a || '').split('').filter(c => HAN.test(c)).join('');
  const B = String(b || '').split('').filter(c => HAN.test(c)).join('');
  let best = 0;
  const dp = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    let prev = 0;
    for (let j = 1; j <= B.length; j++) {
      const cur = dp[j];
      dp[j] = (A[i - 1] === B[j - 1]) ? prev + 1 : 0;
      if (dp[j] > best) best = dp[j];
      prev = cur;
    }
  }
  return best;
}

function stats(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let shared = 0;
  A.forEach(g => { if (B.has(g)) shared++; });
  return {
    bigramsA: A.size,
    shared,
    // 归一化：共享 2-gram 占较短一方的比例
    ratio: (A.size && B.size) ? shared / Math.min(A.size, B.size) : 0,
    run: longestCommonRun(a, b)
  };
}

/* ---------- 样本 1：8 篇已通过作品（好样本，应尽量不报警） ---------- */
const stories = [];
const dir = path.join(R, 'content', 'stories');
fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().forEach(f => {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  stories.push({ file: f, story: raw.story || raw });
});

console.log('='.repeat(74));
console.log('A. label ↔ 正文');
console.log('='.repeat(74));
let labelTotal = 0, labelZeroShared = 0, labelRun1 = 0;
const labelCases = [];
stories.forEach(({ file, story }) => {
  (story.nodes || []).forEach(n => {
    if (!n.label) return;
    labelTotal++;
    const st = stats(n.label, n.text);
    labelCases.push({ file, id: n.id, label: n.label, ...st });
    if (st.shared === 0) labelZeroShared++;
    if (st.run <= 1) labelRun1++;
  });
});
console.log('节点总数:', labelTotal);
console.log('零共享 2-gram:', labelZeroShared, '(', (labelZeroShared / labelTotal * 100).toFixed(1), '% )');
console.log('最长公共片段 ≤1 字:', labelRun1, '(', (labelRun1 / labelTotal * 100).toFixed(1), '% )');
const labelSorted = labelCases.slice().sort((a, b) => a.shared - b.shared);
console.log('\n共享最少的 8 个（最可疑）:');
labelSorted.slice(0, 8).forEach(c => {
  console.log('  [' + c.file.replace('.json', '') + ' ' + c.id + '] shared=' + c.shared + ' run=' + c.run + '  label=' + c.label);
});
if (VERBOSE) {
  console.log('\n全部 label 案例:');
  labelSorted.forEach(c => console.log('  shared=' + c.shared + ' run=' + c.run + ' | ' + c.file + ' ' + c.id + ' | ' + c.label));
}

/* ---------- 样本 2：选项 ↔ 落点正文 ---------- */
console.log();
console.log('='.repeat(74));
console.log('B. 选项 ↔ 落点正文');
console.log('='.repeat(74));
let optTotal = 0, optZeroShared = 0, optRun1 = 0;
const optCases = [];
stories.forEach(({ file, story }) => {
  const byId = {};
  (story.nodes || []).forEach(n => { byId[n.id] = n; });
  (story.nodes || []).forEach(n => {
    (n.choices || []).forEach(c => {
      const land = byId[c.to];
      if (!land) return;
      optTotal++;
      const st = stats(c.text, land.text);
      optCases.push({ file, from: n.id, to: c.to, opt: c.text, ...st });
      if (st.shared === 0) optZeroShared++;
      if (st.run <= 1) optRun1++;
    });
  });
});
console.log('选项总数:', optTotal);
console.log('零共享 2-gram:', optZeroShared, '(', (optZeroShared / optTotal * 100).toFixed(1), '% )');
console.log('最长公共片段 ≤1 字:', optRun1, '(', (optRun1 / optTotal * 100).toFixed(1), '% )');
const optSorted = optCases.slice().sort((a, b) => a.shared - b.shared);
console.log('\n共享最少的 10 个（最可疑）:');
optSorted.slice(0, 10).forEach(c => {
  console.log('  [' + c.file.replace('.json', '') + ' ' + c.from + '→' + c.to + '] shared=' + c.shared + ' run=' + c.run);
  console.log('      选项: ' + c.opt);
});
if (VERBOSE) {
  console.log('\n全部选项案例:');
  optSorted.forEach(c => console.log('  shared=' + c.shared + ' run=' + c.run + ' | ' + c.file + ' ' + c.from + '→' + c.to + ' | ' + c.opt));
}

/* ---------- 样本 3：已知坏样本（应从好样本中分离出来） ---------- */
console.log();
console.log('='.repeat(74));
console.log('C. 已知坏样本（修复前，应被分离出来）');
console.log('='.repeat(74));
const bad = [
  {
    what: 'label「切成小块码好」 vs v21 n7 正文（已不切块）',
    a: '切成小块码好',
    b: '小陶把盘子端到桌子那头，又拿抹布把盘沿擦了擦，摆得比平时齐整。小满靠在橱柜边看着他，没帮忙，也没走开。写着糖的那只罐子被推到角落，标签还朝外翻着。小陶把卡片收进兜里，窗外的天开始从黑转灰。他说：就当是新口味。'
  },
  {
    what: '选项「切成小块，说这是特制咸味」 vs v21 n7 正文',
    a: '切成小块，说这是特制咸味',
    b: '小陶把盘子端到桌子那头，又拿抹布把盘沿擦了擦，摆得比平时齐整。小满靠在橱柜边看着他，没帮忙，也没走开。写着糖的那只罐子被推到角落，标签还朝外翻着。小陶把卡片收进兜里，窗外的天开始从黑转灰。他说：就当是新口味。'
  },
  {
    what: '选项「盒上贴张便签，不写具体字样」 vs v20 n7 正文（切块摆盘，无盒无便签）',
    a: '盒上贴张便签，不写具体字样',
    b: '小陶把那盘蛋糕端到台面中间，拿刀切成一块一块，切面朝上码着，谁想吃哪块自己拿。小满靠在橱柜边看着他，没帮忙，也没走开。写着糖的那只罐子被推到角落，标签还朝外翻着。小陶把那张写到一半的卡片收进兜里。窗外的天开始从黑转灰。他说：就当是新口味。'
  }
];
bad.forEach(c => {
  const st = stats(c.a, c.b);
  console.log('  shared=' + st.shared + ' run=' + st.run + ' | ' + c.what);
});

/* ---------- 判定 ---------- */
console.log();
console.log('='.repeat(74));
console.log('D. 判定：能否用「零共享 2-gram」作为高精度报警条件');
console.log('='.repeat(74));
const badShared = bad.map(c => stats(c.a, c.b).shared);
console.log('好样本零共享率  label: ' + labelZeroShared + '/' + labelTotal + '  选项: ' + optZeroShared + '/' + optTotal);
console.log('坏样本 shared 值: ' + badShared.join(', '));
console.log();
if (labelZeroShared === 0 && badShared.every(v => v === 0)) {
  console.log('★ label↔正文：好样本零误报 且 坏样本全部命中 → 可作为高精度程序检查');
} else {
  console.log('label↔正文：好样本零共享 ' + labelZeroShared + ' 个（=误报数）。');
  console.log(labelZeroShared === 0
    ? '  → 好样本无误报，可程序化'
    : '  → 存在误报，需收紧条件（例如要求 label 含动作动词且正文无任何共享片段）');
}
console.log('（选项侧样本量 ' + optTotal + '，零共享 ' + optZeroShared + ' 个；若好样本零共享率偏高说明该条件过松）');
