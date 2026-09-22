/* 道具与事件铺垫检查（不调用模型）。
 * 对应任务书第 5 节「剧情审核」明确要求：道具和事件出现要有铺垫。
 *
 * 做法：把节点正文里提到的**具体道具/具名事件**当作「事实」，
 * 计算该节点的「祖先集合」（所有可能走到它的节点），若某个道具在节点里出现、
 * 却在它的全部祖先里都没出现过（也即没有任何路径铺垫），则报 prop_unbacked（major，高置信）。
 *
 * 这条检查能直接抓住两类典型错误：
 *   1. 凭空出现的道具：「票还在手里」（玩家这条路径从没买过票）
 *   2. 凭空出现的事件/设施：「接驳车来了」（前文从未出现接驳车）
 * 精度优先：只检查明确的具体名词，通用词（时间、天气、心情）不在词表内。
 */
'use strict';

/* 具体道具词表（保守：只收「一旦被主角持有/使用就是具体事实」的道具。
 * 不含咖啡/水/面包这类一次性消费品，也不含时间、天气、心情等通用词。） */
const PROPS = [
  '票', '登机牌', '机票', '车票', '行李', '箱子', '背包', '钱包', '房卡', '钥匙', '工牌',
  '收据', '凭条', '账单', '蛋糕', '蜡烛', '礼物', '便当', '饭盒', '狗粮', '猫粮', '药',
  '创可贴', '毯子', '枕头', '外套', '围巾', '充电宝', '水杯', '伞'
].filter((v, i, a) => a.indexOf(v) === i);

/* 事件/设施词表（一旦作为已发生的事出现，就需要铺垫） */
const EVENTS = ['接驳车', '摆渡车', '改签窗口', '退票窗口', '行李提取', '登机口', '候补', '延误证明'];

const ALL = Array.from(new Set(PROPS.concat(EVENTS)));

/* 事件/设施：只检查「延续性指代」——出现「还是那辆/又来了/回到/再次」这类说法时，
 * 说明该设施此前已经存在，必须有铺垫。首次出现（「接驳车来了」）属于当场引入，合法。 */
function continuationHit(text, p) {
  const t = String(text || '');
  /* 「票」是「购票/订票/取票/退票」等复合词的一部分时，不视为对道具的独立指代 */
  const P = p + '(?![页面|窗口|价|根|据|贩|务]|价|务|贩|款)';
  const pats = [
    '(?:还是|仍是|依然是|仍旧是|同一)(?:那|这)?(?:辆|趟|班)?' + p,
    '(?:回到|返回|又上|再上|再次|重新登|重新走)了?[^。；]{0,6}' + p,
    P + '[^。；]{0,3}?(?:又|再次|仍旧|依然)',
    '(?:那|这)(?:辆|趟|班)' + p
  ];
  return pats.some(x => new RegExp(x).test(t));
}

/* 「持有 / 使用」句型：只有这些句型才说明该道具是**主角手上的具体事实**，
 * 需要前文铺垫。泛泛的场景提及（别人刷别家的票）、比喻与列举（几杯咖啡的钱）
 * 不在此列，不报问题（精度优先：误报会直接把好作品拒收）。 */
function possessionHit(text, p) {
  const t = String(text || '');
  const P = '(?:' + p + ')';
  const pats = [
    /* 他的票 / 她的票 / 自己的票 / 两个人的票 */
    '(?:他|她|他们|两个人|自己的|他的|她的|俩人的)' + '的?' + P,
    /* 票还在手里 / 票留在包里 / 票塞进兜里 */
    P + '(?:还|仍|依然)?(?:在|留在|塞在|落在)(?:手里|手上|掌|包里|兜里|口袋里|身上|箱子里|袋子里)',
    /* 把票攥在手里 / 将票收起来 */
    '(?:把|将)' + P + '(?:攥|捏|握|拿|装|塞|放|收)',
    /* 拿着票 / 攥着票 / 掏出票 / 递过来的票 / 举起票 / 买到票 / 领到票 */
    '(?:拿着|捏着|攥着|握着|拎着|背着|抱着|掏出|递过|递来|举起|买到|买到手|领到|领了|拿到|接过来|翻开)' + '[^。；]{0,6}' + P,
    /* 票被捏得发软（无主语的持有状态） */
    P + '(?:被|已经)' + '[^。；]{0,4}(?:捏|攥|折|揉)'
  ];
  return pats.some(x => new RegExp(x).test(t));
}

/* 计算每个节点的祖先集合（含自身；用图上的传递闭包，128 路径以内可承受） */
function ancestors(story) {
  const nodes = (story && story.nodes) || [];
  const inbound = {};
  nodes.forEach(n => (n.choices || []).forEach(c => { (inbound[c.to] = inbound[c.to] || []).push(n.id); }));
  const memo = {};
  function collect(id, guard) {
    if (memo[id]) return memo[id];
    if (guard > 64) return new Set([id]);
    const out = new Set([id]);
    (inbound[id] || []).forEach(up => { collect(up, guard + 1).forEach(x => out.add(x)); });
    memo[id] = out;
    return out;
  }
  nodes.forEach(n => collect(n.id, 0));
  return { memo, inbound };
}

/* 找出节点正文里出现的道具/事件词（去掉同句内的「将来/假设」用法） */
function propsIn(text) {
  const t = String(text || '');
  const hits = [];
  ALL.forEach(p => {
    /* 排除「要是…」「如果…」「本该…」这类假设句里的道具 */
    const re = new RegExp(p, 'g');
    let m;
    while ((m = re.exec(t)) !== null) {
      const before = t.slice(Math.max(0, m.index - 12), m.index);
      if (/(要是|如果|本该|原本|原定|设想|假设|差点|险些)/.test(before)) continue;
      hits.push(p);
      break;
    }
  });
  return hits;
}

/* 主检查：返回 issues（severity/nodeId/issue/suggest/source/highConfidence） */
function checkProps(story) {
  const issues = [];
  const nodes = (story && story.nodes) || [];
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  const inboundMap = {};
  nodes.forEach(n => (n.choices || []).forEach(c => { (inboundMap[c.to] = inboundMap[c.to] || []).push(n.id); }));
  const { memo } = ancestors(story);

  nodes.forEach(node => {
    /* 起点节点（没有上游）天然是「故事的既定开场」，其中的道具属于初始设定，不检查铺垫。 */
    const ups0 = (inboundMap[node.id] || []).length;
    if (ups0 === 0) return;
    const text = String(node.text || '');
    /* 只检查「持有/使用」句型（道具）与「延续性指代」句型（设施）：
     * 泛泛提及与首次出现都不属于需要铺垫的具体事实。 */
    const mine = ALL.filter(p => possessionHit(text, p) || continuationHit(text, p));
    if (!mine.length) return;
    const anc = memo[node.id] || new Set([node.id]);
    mine.forEach(p => {
      /* 铺垫来源：**祖先节点**（不含自身）里出现过同一道具的持有/使用即视为有铺垫。 */
      let backed = false;
      anc.forEach(aid => {
        if (backed || aid === node.id) return;
        const up = byId[aid];
        if (up && (possessionHit(String(up.text || ''), p) || continuationHit(String(up.text || ''), p))) backed = true;
      });
      if (backed) return;
      /* 当场引入：本节点用出现动作首次引入，视为合法（例如「他从口袋里掏出票」）。 */
      if (/(拿出|掏出|取出|递来|递过|买到|领到|拿到|捡起|打开抽屉|翻开|塞进|取来|签下|发到)/.test(text)) {
        const introRe = new RegExp('(?:拿出|掏出|取出|递来|递过|买到|领到|拿到|捡起|翻开|取来|发到)[^。；]{0,8}' + p + '|' + p + '[^。；]{0,8}(?:到手|拿到|办好了|办下来)');
        if (introRe.test(text)) return;
      }
      issues.push({
        severity: 'major', nodeId: node.id, source: 'prop-unbacked', highConfidence: true,
        issue: '「' + p + '」在可走到本节点的所有路径中都没有出现过（无铺垫）',
        suggest: '或在更早的节点引入「' + p + '」，或删去本节点对它的指代（改为不依赖该道具的描写）'
      });
    });
  });
  return issues;
}

/* 去重：同一节点同一道具只报一次 */
function checkPropsDedup(story) {
  const seen = {};
  return checkProps(story).filter(i => {
    const k = i.nodeId + '|' + i.issue;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

/* 选项与落点一致性检查（不调用模型）——**已停用**。
 *
 * 曾尝试用「选项核心动词是否出现在落点正文」来判断答非所问，
 * 但对已通过的真实故事实测误报 12/12（例：选项「去柜台问全价票多少钱」，
 * 落点写「柜台后的屏幕转过来，数字一个个念出来」——语义一致，但字面没有「问」）。
 * 中文改写空间太大，词面比对不可靠，因此不作为验收项；
 * 该问题由模型编辑/路径审核（带 evidence 要求）负责，这里只保留函数供诊断使用。 */
function checkChoices(story) {
  return [];
}

module.exports = { checkProps: checkPropsDedup, checkChoices, propsIn, ancestors, PROPS, EVENTS };
