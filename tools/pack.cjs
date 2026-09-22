/* 发布打包（静态站点 + 离线整包）。
 * - publish/：播放器（player/）+ 故事文件 + 索引 + 离线说明；不含任何密钥、不含生成工具。
 * - 打包前校验：扫描 publish/ 内所有文本文件，确认没有密钥样式字符串、没有 LLM 端点、没有生成接口调用。
 * - 离线包：outputs/如果当时-离线包.zip，内置微型启动脚本（node 或 python 均可）与全部故事。
 * 用法：node tools/pack.cjs [--no-zip]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PLAYER = path.join(ROOT, 'player');
const PUB = path.join(ROOT, 'publish');
const OUT = path.join(ROOT, '..', '..', 'outputs');   // 2026-09-21/story/outputs
const NO_ZIP = process.argv.indexOf('--no-zip') !== -1;

/* 禁止出现在发布包里的样式 */
const FORBIDDEN = [
  { name: 'sk- 样式密钥', re: /sk-[A-Za-z0-9_\-]{16,}/ },
  { name: 'OLLAMA_API_KEY', re: /OLLAMA_API_KEY/ },
  { name: 'LLM_API_KEY', re: /LLM_API_KEY/ },
  { name: 'Bearer 令牌', re: /Bearer\s+[A-Za-z0-9._\-]{16,}/ },
  { name: 'ollama.com 端点', re: /ollama\.com/ },
  { name: 'chat/completions 生成接口', re: /chat\/completions/ },
  { name: 'api_key 字段', re: /["']?api[_-]?key["']?\s*[:=]/i }
];

function walk(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, cb); else cb(p);
  }
}
function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function main() {
  rmrf(PUB);
  fs.mkdirSync(PUB, { recursive: true });
  copyDir(PLAYER, PUB);

  /* publish 根目录 = 播放器根目录（player/ 的内容整体复制到此），
   * 因此 / 直接由播放器的 index.html 提供服务 —— 不要再写任何转跳页，
   * 否则会覆盖播放器自身的 index.html，使离线包只剩一个转跳页。 */

  const index = JSON.parse(fs.readFileSync(path.join(PUB, 'stories', 'index.json'), 'utf8'));
  fs.writeFileSync(path.join(PUB, 'DEPLOY.md'), [
    '# 如果当时 · 静态发布包',
    '',
    '- 纯静态站点（HTML/CSS/JS/JSON），可直接托管在任意静态服务器 / 对象存储 / 本地文件系统。',
    '- 播放器不包含任何模型密钥，也不存在生成接口：所有故事与分支均已提前写好并保存在 `stories/`。',
    '- 分享链接形如 `#/s/<storyId>`，只包含故事 ID。',
    '- 进度与解锁记录保存在浏览器 localStorage。',
    '- 首次访问需要能取到站点文件；全部文件取回后，已下载内容可离线游玩。',
    '',
    '本包故事数：' + index.count + '。',
    '生成时间：' + index.generatedAt + '。'
  ].join('\n'), 'utf8');

  /* 离线包说明 + 启动脚本 */
  fs.writeFileSync(path.join(PUB, '离线游玩说明.txt'), [
    '如果当时 —— 离线游玩',
    '',
    '方式一（推荐）：双击 启动-离线游玩.cmd（Windows，需要已安装 Node.js 18+），',
    '  浏览器会自动打开 http://127.0.0.1:8791/。',
    '',
    '方式二：用任意静态服务器指向本目录，例如：',
    '  npx --yes serve .            # 或 python -m http.server 8791',
    '然后浏览器访问对应地址。',
    '',
    '注意：直接双击 index.html（file:// 方式）时浏览器会拦截本地 JSON 读取，',
    '因此需要以上任一本地服务器方式启动；这不影响在线托管的静态站点。'
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(PUB, '启动-离线游玩.cmd'), [
    '@echo off',
    'cd /d "%~dp0"',
    'where node >nul 2>nul',
    'if errorlevel 1 (',
    '  echo 需要 Node.js 18+。请安装后重试，或用 python -m http.server 8791 启动。',
    '  pause',
    '  exit /b 1',
    ')',
    'start "" http://127.0.0.1:8791/',
    'node offline-server.cjs',
    'pause'
  ].join('\r\n'), 'utf8');
  fs.writeFileSync(path.join(PUB, 'offline-server.cjs'), [
    '/* 离线包内置微型静态服务器（无依赖、无网络、无密钥）。 */',
    "'use strict';",
    "const http=require('http'),fs=require('fs'),path=require('path');",
    'const ROOT=__dirname,PORT=parseInt(process.env.PORT||"8791",10);',
    'const MIME={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8"};',
    'http.createServer((req,res)=>{',
    '  let p=decodeURIComponent(String(req.url).split("?")[0].split("#")[0]);',
    '  if(p==="/")p="/index.html";',
    '  const f=path.normalize(path.join(ROOT,p));',
    '  if(!f.startsWith(ROOT)){res.writeHead(403);res.end("forbidden");return;}',
    '  fs.stat(f,(e,st)=>{',
    '    if(e||!st.isFile()){res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end("404");return;}',
    '    res.writeHead(200,{"Content-Type":MIME[path.extname(f).toLowerCase()]||"application/octet-stream"});',
    '    fs.createReadStream(f).pipe(res);',
    '  });',
    '}).listen(PORT,"127.0.0.1",()=>console.log("离线游玩服务：http://127.0.0.1:"+PORT+"/  （Ctrl+C 退出）"));'
  ].join('\n'), 'utf8');

  /* 扫描禁止样式 */
  const hits = [];
  walk(PUB, (p) => {
    const ext = path.extname(p).toLowerCase();
    if (!['.html', '.js', '.cjs', '.json', '.css', '.txt', '.md', '.cmd', '.svg'].includes(ext)) return;
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch (e) { return; }
    FORBIDDEN.forEach(rule => {
      if (rule.re.test(text)) hits.push({ file: path.relative(PUB, p), rule: rule.name });
    });
  });

  console.log('发布包：' + PUB);
  console.log('故事数：' + index.count + '；文件数：' + countFiles(PUB));
  if (hits.length) {
    console.log('❌ 发布包中检出禁止内容：');
    hits.forEach(h => console.log('   - ' + h.file + ' → ' + h.rule));
    process.exitCode = 1;
  } else {
    console.log('✅ 凭据/端点扫描：未检出密钥样式、模型端点或生成接口调用');
  }

  if (!NO_ZIP) {
    fs.mkdirSync(OUT, { recursive: true });
    const zip = path.join(OUT, '如果当时-离线包.zip');
    rmrf(zip);
    let zipped = false;

    /* 必须是**真正的 zip**（早期版本用 `tar -a -cf x.zip`，GNU tar 无法生成 zip，
     * 只会写出一个改名成 .zip 的 tar 文件 —— 解压工具会报
     * 「End-of-central-directory signature not found」。）
     * 因此改为：① PowerShell Compress-Archive（Windows 原生）
     *            ② python zipfile（stdlib）
     *            ③ Node 内置 zlib 手写 zip（无外部依赖）
     * 三条路都要产出**合法 zip**；都失败时明确报错，绝不产出假 zip。 */
    const ok = () => zipped && fs.existsSync(zip) && isRealZip(zip);
    /* 注意：PowerShell 的 Compress-Archive 在 Windows 上会写入**反斜杠**路径分隔符，
     * 导致 unzip / 7-Zip / macOS 归档工具报「appears to use backslashes as path separators」
     * 而拒绝或错误解压。因此优先使用**自带的正斜杠 zip 写入器**（无外部依赖，
     * 跨平台可解压），仅当它失败时才退回 PowerShell。 */
    if (!ok()) {
      try {
        writeZipNode(PUB, zip);
        zipped = true;
      } catch (e0) {
        console.log('内置 zip 写入失败，退回 PowerShell：' + e0.message);
      }
    }
    if (!ok()) {
      try {
        execFileSync('powershell', ['-NoProfile', '-Command',
          "Compress-Archive -Path '" + PUB.replace(/'/g, "''") + "\\*' -DestinationPath '" + zip.replace(/'/g, "''") + "' -Force"
        ], { stdio: 'inherit' });
        zipped = true;
      } catch (e1) {
        if (ok()) { /* Compress-Archive 有时返回非零但仍写出文件 */ }
        else { zipped = false; }
      }
    }
    if (!ok()) {
      try {
        execFileSync('python', ['-c',
          'import sys,os,zipfile\n' +
          'src,dst=sys.argv[1],sys.argv[2]\n' +
          'if os.path.exists(dst): os.remove(dst)\n' +
          'z=zipfile.ZipFile(dst,"w",zipfile.ZIP_DEFLATED)\n' +
          'for dp,_,fns in os.walk(src):\n' +
          '    for fn in fns:\n' +
          '        p=os.path.join(dp,fn)\n' +
          '        z.write(p,os.path.relpath(p,src))\n' +
          'z.close()\n',
          PUB, zip
        ], { stdio: 'inherit' });
        zipped = true;
      } catch (e2) {
        if (!ok()) { zipped = false; }
      }
    }
    if (!ok()) {
      try {
        writeZipNode(PUB, zip);
        zipped = true;
      } catch (e3) {
        console.log('打包 zip 失败（可手动压缩 ' + PUB + '）：' + e3.message);
      }
    }
    if (ok()) {
      console.log('离线包：' + zip + '（' + (fs.statSync(zip).size / 1024).toFixed(0) + ' KB，zip 校验通过）');
    } else if (fs.existsSync(zip)) {
      rmrf(zip);
      console.log('离线包生成失败：已删除不合法的输出文件（避免给用户一个打不开的包）');
    }
  }
}

/* 校验文件是否为**真正的 zip**（本地文件头 PK\x03\x04 或空档 PK\x05\x06） */
function isRealZip(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } catch (e) { return false; }
}

/* 最后退路：用 Node 内置 zlib 手写一个合法 zip（无外部依赖）。 */
function writeZipNode(srcDir, outFile) {
  const zlib = require('zlib');
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  })(srcDir);

  const chunks = [];
  const central = [];
  let offset = 0;
  const dosTime = () => {
    const d = new Date();
    return { t: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff,
             d: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff };
  };
  const { t, d } = dosTime();

  for (const f of files) {
    const name = path.relative(srcDir, f).split(path.sep).join('/');
    const nameBuf = Buffer.from(name, 'utf8');
    const data = fs.readFileSync(f);
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data);
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);   /* UTF-8 文件名 */
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(t, 10);
    local.writeUInt16LE(d, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(t, 12);
    cen.writeUInt16LE(d, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(outFile, Buffer.concat([Buffer.concat(chunks), cenBuf, end]));
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function countFiles(dir) { let n = 0; walk(dir, () => n++); return n; }
main();
