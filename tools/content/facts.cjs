/* 「既成事实」分歧检查（不调用模型）。
 *
 * 背景（来自实测）：本流水线最难收敛的错误是——两条分支对**同一件事的成败**给出不同结果，
 * 随后汇合到同一场，导致汇合点必然与其中一条路径冲突。
 *   例：分支 A「刷卡住进了套房」，分支 B「在长椅上熬一夜」→ 汇合点写什么都会被一边反驳。
 *
 * 做法：把「已办成」的词（住进/买到/办好了/签了/拿到了/付了钱…）当作**既成事实断言**，
 * 在同一个合并点的不同上游分支之间比较：若同一「事务域」上出现了互相冲突的断言（办成 vs 没办成），
 * 或两条分支对同一事务域给出不同的既成结果，则报 blocker（高置信）。
 *
 * 精度优先：只在同一事务域（票务/住宿/交通/餐食/联络/金钱）内比对，
 * 且要求两条分支都对该域有明确断言；否则不报。
 */
'use strict';

const MG = require('./merges.cjs');

/* 事务域：词表 → 域 */
const DOMAINS = [
  { id: 'lodging', name: '住宿', words: ['房间', '套房', '标间', '房卡', '前台', '住下', '入住', '开了一间', '开了房', '押金'] },
  { id: 'ticket', name: '票务', words: ['票', '改签', '退票', '候补', '登机牌', '机票', '车票', '购票', '订票'] },
  { id: 'transit', name: '交通', words: ['大巴', '出租车', '接驳车', '摆渡车', '地铁', '公交', '拼车', '车来了'] },
  { id: 'food', name: '餐食', words: ['吃饭', '吃上', '点餐', '外卖', '泡面', '饭', '热饭', '夜宵'] },
  { id: 'contact', name: '联络', words: ['打电话', '接通', '联系人', '发消息', '联系上', '回复'] },
  { id: 'money', name: '金钱', words: ['刷卡', '付钱', '付款', '转账', '现金', '借钱', '掏钱', '结账'] },
  { id: 'info', name: '信息', words: ['问到了', '打听到', '查到', '得知', '确认了', '问清了'] }
];

/* 「已办成」的断言模式（成功侧） */
const DONE_RE = /(已|已经|办好了|办成了|住进|住下|签了|买到|买到手|订好|订上了|拿到|取到|付了|结过账|刷卡|确认了|问到了|打听到|联系上|接通了|吃上了|上了车|进了|开好房|拿到手|排到了|改好了|办妥|搞定)/;
/* 「没办成」的断言模式（失败侧） */
const UNDONE_RE = /(没办成|没成|没买到|没订上|没住|没进|没排上|没能|不成|办不了|开不了|住不了|没有房间|没房|没票|没座位|排不上|放弃了|算了|没吃上|没联系上|打不通|没拿到|没付|掏不出|没钱|凑不出)/;

function domainHits(text) {
  const t = String(text || '');
  const out = [];
  DOMAINS.forEach(d => {
    const hit = d.words.filter(w => t.indexOf(w) >= 0);
    if (hit.length) out.push({ id: d.id, name: d.name, words: hit });
  });
  return out;
}

/* 判断一段文本对某个域是「办成」「没办成」还是「未定」 */
function domainStance(text, domainId) {
  const d = DOMAINS.filter(x => x.id === domainId)[0];
  if (!d) return 'none';
  const t = String(text || '');
  /* 逐句判断，避免不同句子的成败互相污染 */
  const sentences = t.split(/[。！？；\n]/).filter(s => s.trim());
  let done = false, undone = false;
  sentences.forEach(s => {
    const inDomain = d.words.some(w => s.indexOf(w) >= 0);
    if (!inDomain) return;
    if (DONE_RE.test(s)) done = true;
    if (UNDONE_RE.test(s)) undone = true;
  });
  if (done && undone) return 'mixed';
  if (done) return 'done';
  if (undone) return 'undone';
  return 'none';
}

/* 主检查：对每个合并点，比较其各上游分支在同一域上的立场 */
function checkFacts(story) {
  const issues = [];
  const nodes = (story && story.nodes) || [];
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  const inbound = {};
  nodes.forEach(n => (n.choices || []).forEach(c => { (inbound[c.to] = inbound[c.to] || []).push(n.id); }));

  nodes.forEach(node => {
    const ups = inbound[node.id] || [];
    if (ups.length < 2) return;
    /* 收集每个上游的域立场 */
    const stanceByUp = ups.map(uid => {
      const up = byId[uid];
      const t = up ? String(up.text || '') : '';
      const stances = {};
      domainHits(t).forEach(h => { stances[h.id] = { stance: domainStance(t, h.id), name: h.name }; });
      return { uid, text: t, stances };
    });
    /* 按域比较：某个域上出现 done vs undone，或不同上游给出不同既成结果 */
    const domains = new Set();
    stanceByUp.forEach(s => Object.keys(s.stances).forEach(d => domains.add(d)));
    domains.forEach(d => {
      const withStance = stanceByUp.filter(s => s.stances[d] && s.stances[d].stance !== 'none' && s.stances[d].stance !== 'mixed');
      if (withStance.length < 2) return;
      const kinds = new Set(withStance.map(s => s.stances[d].stance));
      if (kinds.size < 2) return;   /* 都办成 或 都没办成 → 不冲突 */
      const name = withStance[0].stances[d].name;
      issues.push({
        severity: 'blocker', nodeId: node.id, source: 'fact-divergence', highConfidence: true,
        issue: '汇合点 ' + node.id + ' 的上游在「' + name + '」上既成事实不一致：' +
          withStance.map(s => s.uid + '=' + s.stances[d].stance).join('，'),
        suggest: '把冲突的既成结果改成「正在谈/正在试」的过程表述（成败留到结局），或在图上彻底分开这两条分支',
        evidence: withStance[0].text.slice(0, 30)
      });
    });
  });
  return issues;
}

/* 同层同场检查（不调用模型）。
 *
 * 背景：分层的格栅图里，同一层的两个节点是「同一场戏的两种做法」，它们下一层会汇合。
 * 若同层的两个节点写了不同地点/不同时段（一个在机场、一个在酒店），
 * 汇合点无论怎么写都会和其中一条路径冲突 —— 这是本流水线最主要的失败来源。
 *
 * 做法：同一层的两个节点，用 merges.cjs 的地点/时段词表比对；
 * 若两者的场景地点属于不同「场景域」，或时段互相矛盾，则报 blocker（高置信）。
 */
function checkLevels(story, levels) {
  const issues = [];
  if (!levels) return issues;
  const nodes = (story && story.nodes) || [];
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });

  /* 按层归组 */
  const groups = {};
  Object.keys(levels).forEach(id => {
    const lv = levels[id];
    (groups[lv] = groups[lv] || []).push(id);
  });

  Object.keys(groups).forEach(lv => {
    const ids = groups[lv].filter(id => byId[id]);
    if (ids.length < 2) return;
    /* 两两比对 */
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byId[ids[i]], b = byId[ids[j]];
        const ta = String(a.text || ''), tb = String(b.text || '');
        const da = MG.scenePlaces(ta).map(MG.domainOf);
        const db = MG.scenePlaces(tb).map(MG.domainOf);
        const sa = new Set(da), sb = new Set(db);
        /* 各自有明确场景域、且完全不相交 → 疑似不同场景 */
        if (sa.size && sb.size && !Array.from(sa).some(x => sb.has(x))) {
          issues.push({
            severity: 'blocker', nodeId: a.id, source: 'level-scene', highConfidence: true,
            issue: '同层节点 ' + a.id + ' 与 ' + b.id + ' 不在同一场景（' + Array.from(sa).join('/') + ' vs ' + Array.from(sb).join('/') + '）',
            suggest: '同层是同一场戏的两种做法：把两者的地点/时段改为一致，只保留做法的差别',
            evidence: ta.slice(0, 24)
          });
        }
        /* 时段矛盾 */
        const pa = MG.dayPhase(ta), pb = MG.dayPhase(tb);
        if (pa && pb && pa.phase !== pb.phase && Math.abs(pa.phase - pb.phase) >= 2) {
          issues.push({
            severity: 'major', nodeId: a.id, source: 'level-time', highConfidence: true,
            issue: '同层节点时段不一致（' + a.id + '=' + pa.name + '，' + b.id + '=' + pb.name + '）',
            suggest: '同层必须发生在同一时段',
            evidence: ta.slice(0, 24)
          });
        }
      }
    }
  });
  return issues;
}

module.exports = { checkFacts, checkLevels, domainHits, domainStance, DOMAINS };
