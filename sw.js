/* 离线缓存：更新版本号后，浏览器会下载新文件。 */
var CACHE='ct-1.0.0';
var FILES=['./','index.html','styles.css','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','data/q1-changshi-yanyu.js','data/q2-shuliang-panduan.js','data/q3-ziliao.js','data/essays.js','data/guide.js'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(FILES)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==CACHE}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  var u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(function(hit){
    return hit||fetch(e.request).catch(function(){return e.request.mode==='navigate'?caches.match('index.html'):Response.error()});
  }));
});
