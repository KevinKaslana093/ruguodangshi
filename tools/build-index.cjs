/* 构建故事索引：扫描 content/stories/*.json → 全部通过校验的写入 player/stories/ 并生成 index.json。
 * 只发布通过校验的故事；未通过者在报告中列出，绝不进入播放器目录。
 * 用法：node tools/build-index.cjs [--check]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const V = require('../shared/validate.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'content', 'stories');
const OUT = path.join(ROOT, 'player', 'stories');
/* 播放器自带的共享文件（schema/runtime）：发布包必须自足，
 * 不能依赖 ../shared/，否则静态托管与离线包都会因缺文件而加载失败。 */
const VENDOR = ['schema.js', 'runtime.js'];
const VENDOR_OUT = path.join(ROOT, 'player', 'lib');
const CHECK = process.argv.indexOf('--check') !== -1;

function main() {
  if (!fs.existsSync(SRC)) { console.error('没有 content/stories 目录'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  /* 同步共享文件到 player/lib/，使播放器目录自足 */
  fs.mkdirSync(VENDOR_OUT, { recursive: true });
  if (!CHECK) {
    VENDOR.forEach(f => {
      fs.copyFileSync(path.join(ROOT, 'shared', f), path.join(VENDOR_OUT, f));
    });
    console.log('已同步共享文件：' + VENDOR.join('、') + ' → player/lib/');
  }
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.json')).sort();
  const ok = [], bad = [];
  for (const f of files) {
    let story;
    try { story = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); }
    catch (e) { bad.push({ file: f, reason: 'JSON 解析失败：' + e.message }); continue; }
    const res = V.validateStory(story, { wantPaths: false });
    if (!res.ok) { bad.push({ file: f, reason: res.errors.slice(0, 3).map(e => e.code + ':' + e.message).join('；') }); continue; }
    ok.push({ file: f, story });

    /* 清理旧版本文件（同 ID 不同内容版本由单个文件承载，不需要清理） */
    if (!CHECK) fs.writeFileSync(path.join(OUT, f), JSON.stringify(story, null, 1), 'utf8');
  }

  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    count: ok.length,
    genres: require('../shared/schema.js').GENRES.map(g => g.id),
    stories: ok.map(({ file, story }) => {
      const res = V.validateStory(story, {});
      return {
        storyId: story.storyId,
        file: file,
        title: story.title,
        genreId: story.genreId,
        tagline: story.tagline,
        summary: story.summary,
        estimatedMinutes: story.estimatedMinutes,
        endingCount: story.endings.length,
        nodeCount: story.nodes.length,
        tags: story.tags,
        cover: story.cover,
        contentVersion: story.contentVersion,
        avgPathLen: res.metrics.avgPathLen,
        pathMode: (res.metrics.paths || {}).mode
      };
    })
  };
  if (!CHECK) fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1), 'utf8');

  console.log('通过校验并发布：' + ok.length + ' 个故事');
  if (bad.length) {
    console.log('未发布（校验失败）：' + bad.length + ' 个');
    bad.slice(0, 20).forEach(b => console.log('  ✗ ' + b.file + ' → ' + b.reason));
  }
  if (ok.length) {
    const byGenre = {};
    ok.forEach(({ story }) => { byGenre[story.genreId] = (byGenre[story.genreId] || 0) + 1; });
    console.log('题材分布：' + JSON.stringify(byGenre));
  }
  if (CHECK && bad.length) process.exitCode = 1;
}

main();
