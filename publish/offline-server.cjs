/* 离线包内置微型静态服务器（无依赖、无网络、无密钥）。 */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=__dirname,PORT=parseInt(process.env.PORT||"8791",10);
const MIME={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8"};
http.createServer((req,res)=>{
  let p=decodeURIComponent(String(req.url).split("?")[0].split("#")[0]);
  if(p==="/")p="/index.html";
  const f=path.normalize(path.join(ROOT,p));
  if(!f.startsWith(ROOT)){res.writeHead(403);res.end("forbidden");return;}
  fs.stat(f,(e,st)=>{
    if(e||!st.isFile()){res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end("404");return;}
    res.writeHead(200,{"Content-Type":MIME[path.extname(f).toLowerCase()]||"application/octet-stream"});
    fs.createReadStream(f).pipe(res);
  });
}).listen(PORT,"127.0.0.1",()=>console.log("离线游玩服务：http://127.0.0.1:"+PORT+"/  （Ctrl+C 退出）"));