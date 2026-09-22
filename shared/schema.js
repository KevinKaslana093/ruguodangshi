/* 「如果当时」共享 schema 常量与基础校验（冻结 v1）
 * 同时供 Node（验证器/生产工具）与浏览器（播放器运行时校验）使用。
 * 无任何网络访问，无副作用。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.RD = window.RD || {}; window.RD.Schema = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  var GENRES = [
    { id: 'office',   name: '职场喜剧', tone: '荒诞但克制，不嘲讽具体真人', avoid: '不写真实公司名与真实人事' },
    { id: 'dorm',     name: '宿舍日常', tone: '群像、琐碎、好笑', avoid: '不写真实宿舍与真实同学' },
    { id: 'pet',      name: '宠物奇遇', tone: '宠物视角的误解与温柔', avoid: '不宣称动物心理的准确性' },
    { id: 'travel',   name: '旅行事故', tone: '计划赶不上变化的狼狈', avoid: '不写真实事故伤亡' },
    { id: 'birthday', name: '生日惊喜', tone: '暖、笨拙、真诚', avoid: '不写真实人物隐私' },
    { id: 'mystery',  name: '轻悬疑',   tone: '小谜题、日常细节、不血腥', avoid: '不写犯罪细节与真实案件' },
    { id: 'scifi',    name: '轻科幻',   tone: '一个自洽的小设定，不做技术说明', avoid: '不硬拗科学解释' },
    { id: 'warm',     name: '温暖日常', tone: '平静、细腻、有回甘', avoid: '不煽情过度' }
  ];

  var COVER_PATTERNS = ['grid', 'dots', 'lines', 'waves', 'rings', 'arc'];
  var ENDING_KINDS = ['happy', 'bittersweet', 'twist', 'open', 'regret', 'surprise'];
  var VAR_TYPES = ['bool', 'int', 'enum'];
  var COND_OPS = ['eq', 'ne', 'gte', 'lte', 'in'];

  var LIMITS = {
    title:      { min: 4,  max: 24 },
    tagline:    { max: 48 },
    summary:    { min: 40, max: 140 },
    charName:   { min: 1,  max: 10 },
    charDesc:   { max: 30 },
    tag:        { min: 1,  max: 6 },
    tagsCount:  { min: 2,  max: 5 },
    characters: { min: 2,  max: 6 },
    nodeLabel:  { max: 14 },
    nodeText:   { min: 40, max: 180 },      // 目标 60–140
    nodeTextTarget: { min: 60, max: 140 },
    choiceText: { min: 4,  max: 24 },
    choicesPerNode: { min: 2, max: 3 },
    nodesTotal: { min: 8,  max: 40 },
    nodesPremium: { min: 12, max: 20 },     // A 档精品
    pathNodes:  { min: 5,  max: 12 },       // 单条游玩路径 6–10（A 档），硬限 5–12
    pathNodesPremium: { min: 6, max: 10 },
    endingsMin: 3,
    estimatedMinutes: { min: 3, max: 6 },
    storyIdPattern: /^sc-[0-9]{4,6}$/,
    nodeIdPattern: /^n[0-9]{1,3}$/,
    varsMax: 4,
    stateSpaceMax: 4096,
    maxPathsExhaustive: 128
  };

  var PRIVACY_PATTERNS = [
    { re: /(?:\+?86[- ]?)?1[3-9][0-9]{9}/, why: '疑似手机号' },
    { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, why: '疑似邮箱' },
    { re: /(?:微信|QQ|支付宝)\s*[:：]?\s*[A-Za-z0-9_-]{5,}/, why: '疑似账号' },
    { re: /(?:身份证|护照)\s*[:：]?\s*[0-9A-Z]{6,}/, why: '疑似证件号' }
  ];

  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isStr(v) { return typeof v === 'string'; }

  /* 汉字数（CJK）与码点数，用于长度判定 */
  function cjkCount(s) {
    var m = String(s).match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
    return m ? m.length : 0;
  }
  function charLen(s) { return Array.from(String(s)).length; }

  /* 文本形状检查：不允许尖括号/脚本样式/控制字符 */
  function textShapeError(s) {
    if (!isStr(s)) return '必须是字符串';
    if (/[<>]/.test(s)) return '不得包含尖括号';
    if (/javascript:|on[a-z]+\s*=/i.test(s)) return '不得包含脚本样式内容';
    /* eslint-disable no-control-regex */
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) return '不得包含控制字符';
    return null;
  }

  function privacyHit(s) {
    if (!isStr(s)) return null;
    for (var i = 0; i < PRIVACY_PATTERNS.length; i++) {
      if (PRIVACY_PATTERNS[i].re.test(s)) return PRIVACY_PATTERNS[i].why;
    }
    return null;
  }

  function genreById(id) {
    for (var i = 0; i < GENRES.length; i++) if (GENRES[i].id === id) return GENRES[i];
    return null;
  }

  /* 收集故事内全部文本（用于隐私与相似度） */
  function storyTexts(story) {
    var out = [];
    if (!isPlainObject(story)) return out;
    ['title', 'tagline', 'summary'].forEach(function (k) { if (isStr(story[k])) out.push(story[k]); });
    (story.characters || []).forEach(function (c) {
      if (isStr(c && c.name)) out.push(c.name);
      if (isStr(c && c.desc)) out.push(c.desc);
    });
    (story.endings || []).forEach(function (e) { if (isStr(e && e.title)) out.push(e.title); });
    (story.nodes || []).forEach(function (n) {
      if (!isPlainObject(n)) return;
      if (isStr(n.text)) out.push(n.text);
      if (isStr(n.label)) out.push(n.label);
      (n.choices || []).forEach(function (c) { if (isStr(c && c.text)) out.push(c.text); });
      if (n.ending && isStr(n.ending.title)) out.push(n.ending.title);
    });
    return out;
  }

  /* 字符 n-gram 相似度（0–1），用于结局与伪分支检测 */
  function similarity(a, b, n) {
    n = n || 3;
    var A = String(a || ''), B = String(b || '');
    if (A.length < n || B.length < n) return A === B ? 1 : 0;
    var setA = new Set(), setB = new Set(), i;
    for (i = 0; i + n <= A.length; i++) setA.add(A.slice(i, i + n));
    for (i = 0; i + n <= B.length; i++) setB.add(B.slice(i, i + n));
    var inter = 0;
    setA.forEach(function (g) { if (setB.has(g)) inter++; });
    return (2 * inter) / (setA.size + setB.size);
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    GENRES: GENRES,
    COVER_PATTERNS: COVER_PATTERNS,
    ENDING_KINDS: ENDING_KINDS,
    VAR_TYPES: VAR_TYPES,
    COND_OPS: COND_OPS,
    LIMITS: LIMITS,
    isPlainObject: isPlainObject,
    isStr: isStr,
    cjkCount: cjkCount,
    charLen: charLen,
    textShapeError: textShapeError,
    privacyHit: privacyHit,
    genreById: genreById,
    storyTexts: storyTexts,
    similarity: similarity,
    privacyPatterns: PRIVACY_PATTERNS
  };
});
