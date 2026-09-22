/* 覆盖与质量报告：对正式库中每个故事重新做程序遍历，输出：
 *  - 结构合法性、节点/结局数、路径数（穷举或有界+覆盖）、(节点,状态)覆盖、
 *  - 结局分布（程序侧 vs 抽样）、模型路径审核的抽样口径、
 *  - 与内容库文件的比对（是否全部可加载）。
 * 输出：reports/coverage.json（机器可读）+ 终端摘要。
 * 用法：node tools/verify/coverage.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const V = require('../../shared/validate.js');
const S = require('../../shared/schema.js');

const ROOT = path.resolve(__dirname, '..', '..');
const STORIES = path.join(ROOT, 'content', 'stories');
const REVIEW = path.join(ROOT, 'content', 'review');
const OUT = path.join(ROOT, 'reports', 'coverage.json');

function main() {
  const files = fs.existsSync(STORIES) ? fs.readdirSync(STORIES).filter(f => f.endsWith('.json')).sort() : [];
  const rows = [];
  let allOk = true;
  for (const f of files) {
    const storyId = f.replace(/\.json$/, '');
    const story = JSON.parse(fs.readFileSync(path.join(STORIES, f), 'utf8'));
    const res = V.validateStory(story, { wantPaths: false });
    const paths = (res.metrics.paths || {});
    const pathReview = (() => { try { return JSON.parse(fs.readFileSync(path.join(REVIEW, storyId + '-paths.json'), 'utf8')).review; } catch (e) { return null; } })();
    const editorReview = (() => { try { return JSON.parse(fs.readFileSync(path.join(REVIEW, storyId + '-editor.json'), 'utf8')).review; } catch (e) { return null; } })();
    if (!res.ok) allOk = false;
    rows.push({
      storyId, file: f, title: story.title, genreId: story.genreId,
      ok: res.ok, errorCodes: [...new Set(res.errors.map(e => e.code))],
      nodeCount: res.metrics.nodeCount, endingCount: res.metrics.endingCount,
      avgNodeCjk: res.metrics.avgNodeCjk, avgPathLen: res.metrics.avgPathLen,
      totalChoices: res.metrics.totalChoices,
      pathMode: paths.mode || null, pathCount: paths.counted != null ? paths.counted : null,
      pathCapped: !!paths.capped,
      pairCoverage: paths.totalPairs ? (paths.visitedPairs + '/' + paths.totalPairs) : null,
      stateSpace: paths.stateSpace != null ? paths.stateSpace : null,
      endingReachProgram: res.metrics.endingReach || {},
      modelPathReview: pathReview ? {
        verdict: pathReview.verdict, issues: (pathReview.pathIssues || []).length,
        sampled: pathReview.sampled, total: pathReview.totalPaths, note: pathReview.samplingNote
      } : null,
      modelEditorReview: editorReview ? { verdict: editorReview.verdict, issues: (editorReview.editorIssues || []).length } : null
    });
  }
  const summary = {
    at: new Date().toISOString(),
    total: rows.length,
    structureValidRate: rows.length ? +(rows.filter(r => r.ok).length / rows.length * 100).toFixed(1) + '%' : null,
    exhaustiveCount: rows.filter(r => r.pathMode === 'exhaustive').length,
    boundedCount: rows.filter(r => r.pathMode === 'bounded').length,
    note: '程序侧遍历与模型侧路径阅读分开统计；有界模式不代表穷举，报告中如实标注。',
    rows
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 1), 'utf8');
  console.log('故事总数：' + rows.length + '；结构合法率：' + summary.structureValidRate);
  console.log('穷举路径 ' + summary.exhaustiveCount + ' 个；有界+覆盖 ' + summary.boundedCount + ' 个');
  rows.forEach(r => {
    console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.storyId + '《' + r.title + '》' + r.genreId +
      ' 节点' + r.nodeCount + ' 结局' + r.endingCount + ' 路径' + r.pathCount + '(' + r.pathMode + ')' +
      ' 覆盖' + r.pairCoverage + ' 模型审' + (r.modelPathReview ? (r.modelPathReview.verdict + '/' + r.modelPathReview.sampled + '抽样') : '无'));
  });
  console.log('报告：' + OUT);
  if (!allOk) process.exitCode = 1;
}
main();
