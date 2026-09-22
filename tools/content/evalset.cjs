/* 评测集生成：2000–10000 条多样评测输入 + 对应检查要求（不要求每条都生成正式故事）。
 * 覆盖维度：8 题材 × 冲突类型 × 角色关系 × 分支机制（状态/条件/汇合/伪分支陷阱/长度陷阱）。
 * 每条包含：input（创作线索）、genre、difficulty、checks（程序可验证的检查要求）、tags。
 * 输出：content/eval/evalset.jsonl 与 content/eval/evalset-summary.json
 * 用法：node tools/content/evalset.cjs --n 2400 [--seed 7]
 */
'use strict';
const fs = require('fs');
const path = require('path');

function arg(name, def) { const i = process.argv.indexOf('--' + name); if (i === -1) return def; const v = process.argv[i + 1]; return (v === undefined || v.startsWith('--')) ? true : v; }
const N = parseInt(arg('n', '2400'), 10);
const SEED = parseInt(arg('seed', '7'), 10);

/* 简单确定性伪随机（可复现，不依赖外部包） */
let s = SEED >>> 0;
function rnd() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

const GENRES = ['office', 'dorm', 'pet', 'travel', 'birthday', 'mystery', 'scifi', 'warm'];

const CONFLICTS = {
  office: ['需求被反复推翻', '同事抢功', '远程办公的误会', '绩效面谈', '离职与挽留', '跨部门扯皮', '实习生请教', '团建尴尬'],
  dorm: ['早八起不来', '室友作息冲突', '期末周通宵', '宿舍用电限制', '快递与门禁', '室友闹矛盾要选边', '搬宿舍', '毕业清理旧物'],
  pet: ['猫半夜叫', '狗认定快递是它的', '宠物生病要不要花大钱', '宠物走失', '搬家与宠物', '宠物和新成员', '邻居投诉', '宠物老去'],
  travel: ['航班取消', '行李丢了一件', '迷路与末班车', '同行者想改行程', '住进奇怪的民宿', '赶不上返程', '钱花超了', '雨天打乱计划'],
  birthday: ['寿星说不办', '惊喜被提前泄露', '蛋糕出问题', '异地庆生', '礼物送错', '生日和加班撞车', '旧朋友的生日', '长辈的生日'],
  mystery: ['门铃按时响', '群里匿名发言', '公共区域丢失物品', '照片里多了个人', '留言条', '钥匙被换过', '同一天反复出现的数字', '邻居的规律作息'],
  scifi: ['能回放十分钟的旧手机', '记忆可以借出一天', '电梯偶尔到错楼层', '会自己写日记的台灯', '平行版本的自己发来消息', '时间被租用', '天气预报能改一次', '梦境共享'],
  warm: ['老店要搬走', '楼下修鞋铺', '父亲学会用外卖', '给邻居留灯', '公交车司机的习惯', '菜场的问候', '阳台上的花', '最后一班夜班车']
};

const RELATIONS = ['同事', '室友', '家人', '朋友', '陌生人', '前任与合作方', '邻居', '师徒', '兄弟姐妹', '同行的旅伴'];
const MECHANICS = [
  { id: 'pure-dag', want: '无状态、至少 3 结局、路径 6–10 段' },
  { id: 'trust-int', want: '1 个 int 变量（0–3）+ 至少 1 个条件选项' },
  { id: 'enum-route', want: '1 个 enum 变量（3 取值）+ 至少 2 个不同结局依赖它' },
  { id: 'bool-flag', want: '1 个 bool 变量 + 1 个只在 true 时出现的选项' },
  { id: 'merge-back', want: '允许一次汇合，但汇合前选择必须留下可感知差异' },
  { id: 'fake-branch-trap', want: '存在两个相似选项，但后续内容必须不同（不得伪分支）' },
  { id: 'long-path', want: '一条 10 段长路径与一条 6 段短路径共存' },
  { id: 'three-enders', want: '3 个结局类型两两不同且实质不同' }
];
const DIFFICULTIES = ['简单', '常规', '偏难'];

const checks = (g, mech) => ([
  { check: 'structure', rule: 'schemaVersion=1；节点 12–20；起点 n1；无环；选项 2–3 个；选项文字 4–24 字不重复' },
  { check: 'reachability', rule: '所有节点从起点可达；所有结局可达；无死路（含带状态全状态检查）' },
  { check: 'path-length', rule: '每条路径 6–10 段' },
  { check: 'endings', rule: '≥3 个结局，kind 两两不同，结局正文相似度 < 0.6' },
  { check: 'no-fake-branch', rule: '不存在后继全文相同的伪分支' },
  { check: 'text-length', rule: '正文 60–140 汉字（硬限 40–180）' },
  { check: 'privacy', rule: '无手机号/邮箱/账号/真实个人信息' },
  { check: 'genre', rule: '题材为 ' + g + '，冲突属于该题材的日常冲突' },
  { check: 'mechanic', rule: mech.want },
  { check: 'semantics', rule: '人物动机成立；时间线自洽；角色不会知道玩家未获得的信息；选择有可感知后果' }
]);

const out = [];
for (let i = 0; i < N; i++) {
  const g = GENRES[i % GENRES.length];
  const conflict = CONFLICTS[g][i % CONFLICTS[g].length];
  const mech = MECHANICS[Math.floor(i / GENRES.length) % MECHANICS.length];
  const rel = pick(RELATIONS);
  const diff = DIFFICULTIES[(i + Math.floor(rnd() * 3)) % 3];
  const extra = rnd() < 0.18 ? pick(['结尾要留白', '不要出现死亡情节', '冲突不要太激烈', '允许一点荒诞', '结尾要有回甘', '不要写爱情线']) : '';
  out.push({
    id: 'ev-' + String(i + 1).padStart(5, '0'),
    genre: g, conflict, relation: rel, mechanic: mech.id, difficulty: diff,
    input: '题材' + g + '；核心冲突：' + conflict + '；主要人物关系：' + rel + '；分支机制要求：' + mech.want + (extra ? '；附加要求：' + extra : ''),
    checks: checks(g, mech),
    note: '评测输入：不要求为每条生成正式长篇故事；用于批量验证结构与审核流程。'
  });
}

const dir = path.resolve(__dirname, '..', '..', 'content', 'eval');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'evalset.jsonl'), out.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8');

const byGenre = {}, byMech = {}, byDiff = {};
out.forEach(o => { byGenre[o.genre] = (byGenre[o.genre] || 0) + 1; byMech[o.mechanic] = (byMech[o.mechanic] || 0) + 1; byDiff[o.difficulty] = (byDiff[o.difficulty] || 0) + 1; });
const summary = { at: new Date().toISOString(), count: out.length, byGenre, byMechanic: byMech, byDifficulty: byDiff, file: 'content/eval/evalset.jsonl' };
fs.writeFileSync(path.join(dir, 'evalset-summary.json'), JSON.stringify(summary, null, 1), 'utf8');
console.log(JSON.stringify(summary, null, 1));
