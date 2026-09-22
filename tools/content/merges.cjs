/* 合并点一致性程序检查（不调用模型）。
 * 目的：合并点最典型的错误是「地点 / 在场状态」冲突（上一步人物留在 A 地，合并点却写他在 B 地）。
 * 这类冲突不需要模型判断，用词表 + 上游文本比对即可发现，属于「程序侧独立验证」能力。
 *
 * 精度优先：本检查的误报会直接导致好作品被隔离，因此规则保守，
 *   只在地点属于**不同场景域**（机场 vs 酒店）时才判冲突；
 *   同一场景域内的细化地点（机场/候机厅/登机口）视为一致，不报。
 * 严重度：
 *   · major：地点跨域冲突、在场与「独自/先走」直接矛盾 —— 高置信，计入验收门槛。
 *   · minor：在场缺少上游支持 —— 提示性，交给定点修复参考，但不单独否决作品。
 *
 * 与模型审核分开统计（见 produce.cjs 的 mergeCheck 记录）。
 */
'use strict';

/* 场景域：同一域内的地点视为一致 */
const PLACE_DOMAINS = [
  { domain: 'airport', places: ['机场', '航站楼', '候机厅', '登机口', '安检', '行李提取', '摆渡车', '值机'] },
  { domain: 'hotel', places: ['酒店', '房间', '大堂', '前台', '客房', '旅馆', '民宿'] },
  { domain: 'station', places: ['车站', '地铁', '火车站', '月台', '售票处', '候车厅'] },
  { domain: 'shop', places: ['便利店', '超市', '咖啡店', '餐厅', '面馆', '小店', '商店'] },
  { domain: 'home', places: ['家里', '客厅', '卧室', '厨房', '阳台', '宿舍', '楼道', '走廊', '门口'] },
  { domain: 'work', places: ['办公室', '会议室', '工位', '公司'] },
  { domain: 'hospital', places: ['医院', '诊室', '病房'] },
  { domain: 'school', places: ['学校', '教室', '图书馆'] },
  { domain: 'transit', places: ['出租车', '大巴', '公交车', '车里', '车上'] }
];

function domainOf(place) {
  for (let i = 0; i < PLACE_DOMAINS.length; i++) {
    if (PLACE_DOMAINS[i].places.indexOf(place) >= 0) return PLACE_DOMAINS[i].domain;
  }
  return 'other:' + place;
}
function allPlaces() {
  const out = [];
  PLACE_DOMAINS.forEach(d => d.places.forEach(p => out.push(p)));
  return out;
}

/* 时间指代 / 反事实标记：含这些标记的句子不计入场景地点（避免把时间表达误判为地点）。 */
const TIME_REF_RE = /(那一刻|那时候|那天|时候|当天|时间|早已|已经过去|来不及|错过了|本该|原本|原定|要是|如果当时|设想|假设)/;

/* 明确的天色/时段表达（用于合并点时间一致性检查） */
const DAY_PHASE = [
  { phase: 'night', re: /(夜里|午夜|深夜|半夜|凌晨|天色还黑|夜色|天没亮|没亮天|后半夜)/, name: '夜里' },
  { phase: 'dawn', re: /(天刚亮|天蒙蒙亮|东方发白|破晓|天快亮|天在亮|渐渐亮起来|一点点亮)/, name: '清晨将亮' },
  { phase: 'morning', re: /(早上|清晨|一早|上午|天亮后|天已经亮了|天亮了|大亮|天亮透)/, name: '上午/天亮后' },
  { phase: 'noon', re: /(中午|正午|晌午)/, name: '中午' },
  { phase: 'afternoon', re: /(下午|午后|日头偏西|傍晚前)/, name: '下午' },
  { phase: 'evening', re: /(傍晚|黄昏|天色渐暗|天黑前|日头落|晚霞)/, name: '傍晚' },
  { phase: 'nightfall', re: /(天黑|入夜|天彻底黑|夜已深)/, name: '入夜' }
];
const PHASE_ORDER = ['night', 'dawn', 'morning', 'noon', 'afternoon', 'evening', 'nightfall'];

function dayPhase(text) {
  const t = String(text || '');
  for (let i = 0; i < DAY_PHASE.length; i++) if (DAY_PHASE[i].re.test(t)) return DAY_PHASE[i];
  return null;
}

/* 外部状态断言（这些事实在不同上游路径上可能不同，合并点不应断言） */
const STATE_ASSERTS = [
  { re: /(班次|航班)[^。；]{0,8}(都|全|已|已经)?(作废|取消|停运|飞了|走完)/, name: '班次状态' },
  { re: /(钱|预算|现金)[^。；]{0,6}(已经)?(花光|用尽|不够|见底|只剩)/, name: '钱的状态' },
  { re: /(行李|箱子)[^。；]{0,6}(已经)?(托运|寄走|丢了|在柜台)/, name: '行李状态' },
  { re: /(票)[^。；]{0,6}(已经)?(买到|退掉|改好|作废)/, name: '票的状态' }
];

/* 场景地点：在**非时间指代**的句子里出现的所有地点词（含无动词的裸地点短语，
 * 例如「凌晨的酒店房间里」）。这样既能抓住真实的地点冲突，
 * 又能避免把「会议室里的那一刻」「看了看时间」这类时间表达当成地点。 */
function scenePlaces(text) {
  const t = String(text || '');
  const hits = [];
  t.split(/[。；！？!?；\n]/).filter(Boolean).forEach(seg => {
    if (TIME_REF_RE.test(seg)) return;
    allPlaces().forEach(p => { if (seg.indexOf(p) >= 0) hits.push(p); });
  });
  return hits;
}

/* 定位短语：只认「在某地（里/内/中/上/门口/里面）」这类**所在**表达（更精确，用于报告措辞） */
function locativePlaces(text) {
  const t = String(text || '');
  const hits = [];
  t.split(/[。；！？!?；\n]/).filter(Boolean).forEach(seg => {
    if (TIME_REF_RE.test(seg)) return;
    allPlaces().forEach(p => {
      const re = new RegExp('(?:在|回到|走进|走到|到了|来到|进入|赶往|返回|坐在|站在|守在|待在|停在)' + p + '[里内中上]?');
      if (re.test(seg)) hits.push(p);
    });
  });
  return hits;
}

/* 仅出现地名（不含定位短语）——用于「提到过」的弱证据，不单独触发冲突 */
function mentionedPlaces(text) {
  return allPlaces().filter(p => String(text || '').indexOf(p) >= 0);
}

/* 明确的「两人共同」标记（保守：只认这些词） */
const PAIR_RE = /(两个人|两人|俩人|二人)/;
/* 明确的「独自 / 先走 / 分开」标记 */
const SINGLE_RE = /(一个人|独自|自己先走|先走了|先走一步|各自|分开走|散了)/;

function charNames(story) {
  return ((story && story.characters) || []).map(c => (c && c.name) || '').filter(Boolean);
}
function namesIn(text, names) {
  const t = String(text || '');
  return names.filter(n => t.indexOf(n) >= 0);
}

/* 主检查：返回 issues（severity/nodeId/issue/suggest/source/highConfidence） */
function checkMerges(story) {
  const issues = [];
  const nodes = (story && story.nodes) || [];
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  const inbound = {};
  nodes.forEach(n => (n.choices || []).forEach(c => { (inbound[c.to] = inbound[c.to] || []).push(n.id); }));
  const names = charNames(story);

  Object.keys(inbound).forEach(id => {
    const ups = inbound[id];
    if (ups.length < 2) return;
    const node = byId[id];
    if (!node) return;
    const text = String(node.text || '');
    const mineLoc = scenePlaces(text);
    const mineDomains = Array.from(new Set(mineLoc.map(domainOf)));
    const minePair = PAIR_RE.test(text);

    const upper = ups.map(u => {
      const t = String((byId[u] && byId[u].text) || '');
      return { id: u, text: t, loc: scenePlaces(t), domains: Array.from(new Set(scenePlaces(t).map(domainOf))), pair: PAIR_RE.test(t), single: SINGLE_RE.test(t), names: namesIn(t, names) };
    });

    /* (1) 地点跨域冲突（高置信） */
    if (mineDomains.length) {
      upper.forEach(u => {
        if (!u.domains.length) return;
        const shared = u.domains.filter(d => mineDomains.indexOf(d) >= 0);
        if (shared.length) return;
        issues.push({
          severity: 'major', nodeId: id, source: 'merge-location', highConfidence: true,
          issue: '合并点场景与上游 ' + u.id + ' 不一致（上游 ' + u.loc.join('、') + '，此处 ' + mineLoc.join('、') + '）',
          suggest: '把合并点改写为所有上游共有的处境（时间/天气/心情），或在上游补出转移过程'
        });
      });
    }

    /* (4) 合并点断言了会随上游变化的外部状态（高置信：上游之间存在该状态的真假分歧） */
    const mineStates = STATE_ASSERTS.filter(s => s.re.test(text)).map(s => s.name);
    if (mineStates.length) {
      /* 只有上游对该状态存在分歧时才报（上游都没提 = 允许，因为可能是更早节点建立的共同前提） */
      const upperHas = mineStates.filter(name => {
        const st = STATE_ASSERTS.filter(s => s.name === name)[0];
        const pos = upper.filter(u => st.re.test(u.text)).length;
        const neg = upper.filter(u => !st.re.test(u.text)).length;
        return pos > 0 && neg > 0;                  /* 上游之间不一致 */
      });
      upperHas.forEach(name => {
        issues.push({
          severity: 'major', nodeId: id, source: 'merge-state', highConfidence: true,
          issue: '合并点断言了「' + name + '」，但上游对该状态说法不一致',
          suggest: '删去这条状态断言，改为不依赖它的处境或心情描写'
        });
      });
    }

    /* (2) 在场与「独自/先走」直接矛盾（高置信） */
    if (minePair && upper.some(u => u.single)) {
      const bad = upper.filter(u => u.single).map(u => u.id);
      issues.push({
        severity: 'major', nodeId: id, source: 'merge-actor', highConfidence: true,
        issue: '合并点写两人在场，但上游 ' + bad.join('、') + ' 写了独自/先走，直接矛盾',
        suggest: '统一在场状态：或把合并点改为独自处境，或补出会合过程'
      });
    } else if (minePair) {
      /* (3) 在场缺少上游支持（提示性，不计入门槛） */
      const supported = upper.some(u => u.pair || u.names.length >= 2);
      if (!supported) {
        issues.push({
          severity: 'minor', nodeId: id, source: 'merge-actor', highConfidence: false,
          issue: '合并点写「两人」，但上游未出现第二个人物（上游 ' + ups.join('、') + '）',
          suggest: '若第二人确实该在场，在上游补一句他如何赶到；否则改写为不含在场信息的处境'
        });
      }
    }

    /* (5) 合并点时段早于某个上游的时段（时间倒流，高置信） */
    const minePhase = dayPhase(text);
    if (minePhase) {
      const mi = PHASE_ORDER.indexOf(minePhase.phase);
      upper.forEach(u => {
        const up = dayPhase(u.text);
        if (!up) return;
        const ui = PHASE_ORDER.indexOf(up.phase);
        /* 同一天内倒退 ≥2 档才算冲突（避免“凌晨/清晨”这类相邻表述误报） */
        if (mi < ui - 1) {
          issues.push({
            severity: 'major', nodeId: id, source: 'merge-time', highConfidence: true,
            issue: '合并点时段（' + minePhase.name + '）早于上游 ' + u.id + '（' + up.name + '），时间倒流',
            suggest: '把合并点时段改为不早于上游（或删去时段描写），也可明确写成隔了一天'
          });
        }
      });
    }
  });
  return issues;
}

module.exports = { checkMerges, locativePlaces, scenePlaces, mentionedPlaces, dayPhase, domainOf, PLACE_DOMAINS, DAY_PHASE };
