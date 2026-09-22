/* 本地进度与解锁记录（localStorage）。刷新后可恢复；不要求账号系统。 */
(function () {
  'use strict';
  var P = 'rd.progress.';
  var U = 'rd.unlocked';
  var SETTINGS = 'rd.settings';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function safeDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function saveProgress(state) {
    return safeSet(P + state.storyId, JSON.stringify({
      schemaVersion: 1, storyId: state.storyId, contentVersion: state.contentVersion,
      nodeId: state.nodeId, flags: state.flags, visited: state.visited,
      choices: state.choices, ended: !!state.ended, savedAt: Date.now()
    }));
  }
  function loadProgress(storyId) {
    var raw = safeGet(P + storyId);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function clearProgress(storyId) { safeDel(P + storyId); }

  function allProgress() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(P) !== 0) continue;
        try { out.push(JSON.parse(localStorage.getItem(k))); } catch (e) {}
      }
    } catch (e) {}
    return out.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
  }

  function unlockedMap() {
    var raw = safeGet(U);
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }
  function unlocked(storyId) { return unlockedMap()[storyId] || []; }
  function markUnlocked(storyId, endingId) {
    var m = unlockedMap();
    var list = m[storyId] || [];
    if (list.indexOf(endingId) === -1) { list.push(endingId); m[storyId] = list; safeSet(U, JSON.stringify(m)); }
    return m[storyId];
  }
  function settings() {
    var raw = safeGet(SETTINGS);
    var def = { motion: 'on' };
    if (!raw) return def;
    try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
  }
  function setSetting(k, v) { var s = settings(); s[k] = v; safeSet(SETTINGS, JSON.stringify(s)); return s; }

  window.RDStore = {
    saveProgress: saveProgress, loadProgress: loadProgress, clearProgress: clearProgress,
    allProgress: allProgress, unlocked: unlocked, markUnlocked: markUnlocked,
    settings: settings, setSetting: setSetting
  };
})();
