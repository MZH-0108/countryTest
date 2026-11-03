/* 上岸计划：纯静态备考应用。数据存本机，可选同步到用户自己的私有 GitHub 仓库。 */
(function () {
  'use strict';
  var KEY = 'ct.state.v1', SYNC_KEY = 'ct.sync.v1', APP_VERSION = '1.0.0';
  var MODULES = ['言语理解', '判断推理', '资料分析', '数量关系', '常识判断'];
  var WHY = ['不会', '粗心', '概念不清', '时间不够'];
  var PLATFORMS = ['粉笔', '华图', '中公', '四海公考', '真题模考', '其他'];
  var G = window.GUIDE;
  var BANK = (window.QB || []).map(function (q) {
    return { id: q[0], m: q[1], t: q[2], q: q[3], o: q[4], a: q[5], e: q[6], p: q[7] };
  });
  var $ = function (id) { return document.getElementById(id); };
  var view = $('view');

  /* ---------- 工具 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ds(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseD(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayDiff(a, b) { return Math.round((parseD(b) - parseD(a)) / 864e5); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return ds(d); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.className = 'show'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, 2400); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

  /* ---------- 状态 ---------- */
  function blank() {
    return { attempts: {}, essays: {}, externals: {}, custom: {}, done: {}, settings: { weeklyHours: 6, startDate: G.phases[0].from, exams: G.exams.map(function (e) { return { id: e.id, name: e.name, date: e.date, subjects: e.subjects }; }), updatedAt: 0 } };
  }
  var S = load();
  function load() {
    var b = blank();
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o) Object.keys(b).forEach(function (k) { if (o[k]) b[k] = o[k]; });
    } catch (e) { /* 存储不可用时按空状态运行 */ }
    return b;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('本机存储失败，请导出备份'); }
    queueSync();
  }
  /* 合并规则：记录按 id 取并集，同 id 取 updatedAt 较新的一条；settings 取较新的一份。 */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  function stamp(x) { return x ? (x.updatedAt || x.ts || 0) : 0; }
  function mergeMap(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) if (!o[k] || stamp(b[k]) > stamp(o[k])) o[k] = b[k];
    return o;
  }
  function merge(a, b) {
    var r = blank();
    ['attempts', 'essays', 'externals', 'custom', 'done'].forEach(function (k) { r[k] = mergeMap(a[k] || {}, b[k] || {}); });
    r.settings = stamp(b.settings) > stamp(a.settings) ? b.settings : a.settings;
    return r;
  }

  /* ---------- 题目与错题 ---------- */
  function allQ() {
    var c = Object.keys(S.custom).map(function (k) { return S.custom[k]; }).filter(function (q) { return !q.deleted; });
    return BANK.concat(c);
  }
  function findQ(id) { var a = allQ(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function attemptsByQ() {
    var m = {};
    Object.keys(S.attempts).forEach(function (k) { var a = S.attempts[k]; (m[a.q] = m[a.q] || []).push(a); });
    Object.keys(m).forEach(function (k) { m[k].sort(function (x, y) { return x.ts - y.ts; }); });
    return m;
  }
  var GAPS = [1, 3, 7];
  /* 做错后进入错题本；之后连续做对 3 次（间隔 1、3、7 天）即视为掌握。 */
  function wrongBook() {
    var m = attemptsByQ(), out = [];
    Object.keys(m).forEach(function (id) {
      var list = m[id], streak = 0, wrongAt = 0, last = null, i;
      for (i = 0; i < list.length; i++) { last = list[i]; if (last.ok) streak++; else { streak = 0; wrongAt = last.ts; } }
      if (!wrongAt || streak >= GAPS.length) return;
      var q = findQ(id); if (!q) return;
      var due = addDays(ds(new Date(last.ts)), GAPS[streak]);
      var lastWrong = list.filter(function (a) { return !a.ok; }).pop();
      out.push({ q: q, streak: streak, due: due, isDue: due <= ds(), why: lastWrong.why || '', times: list.filter(function (a) { return !a.ok; }).length });
    });
    return out.sort(function (a, b) { return a.due < b.due ? -1 : 1; });
  }
  function unseen(mod) {
    var m = attemptsByQ();
    return allQ().filter(function (q) { return q.m === mod && !m[q.id]; });
  }
  function moduleStats() {
    var res = {}, byId = {};
    allQ().forEach(function (q) { byId[q.id] = q; });
    MODULES.forEach(function (m) { res[m] = { total: 0, ok: 0, sec: 0 }; });
    Object.keys(S.attempts).forEach(function (k) { var a = S.attempts[k], q = byId[a.q]; if (q && res[q.m]) { res[q.m].total++; if (a.ok) res[q.m].ok++; res[q.m].sec += a.sec || 0; } });
    Object.keys(S.externals).forEach(function (k) { var e = S.externals[k]; if (!e.deleted && res[e.module]) { res[e.module].total += +e.total || 0; res[e.module].ok += +e.correct || 0; } });
    return res;
  }
  function weakest() {
    var st = moduleStats(), best = null, bv = 2;
    MODULES.forEach(function (m) { var s = st[m]; if (s.total >= 10) { var v = s.ok / s.total; if (v < bv) { bv = v; best = m; } } });
    return best;
  }

  /* ---------- 学习计划 ---------- */
  function phaseOf(date) {
    for (var i = 0; i < G.phases.length; i++) { var p = G.phases[i]; if (date >= p.from && date <= p.to) return p; }
    return null;
  }
  function startOf() { return S.settings.startDate || G.phases[0].from; }
  function focusOf(date, ph) {
    var w = Math.floor(dayDiff(ph.from < startOf() ? startOf() : ph.from, date) / 7);
    return ph.weeks[Math.max(0, w) % ph.weeks.length];
  }
  function minutesOf(date) {
    var dow = parseD(date).getDay(), h = +S.settings.weeklyHours || 6;
    return Math.round(h * 60 * ((dow === 0 || dow === 6) ? 0.2 : 0.12));
  }
  function nextEssay(kind) {
    var did = {};
    Object.keys(S.essays).forEach(function (k) { var e = S.essays[k]; if (!e.deleted) did[e.eid] = 1; });
    var l = window.ESSAYS.filter(function (e) { return e.kind === kind; });
    return l.filter(function (e) { return !did[e.id]; })[0] || l[0];
  }
  function tasksFor(date) {
    var out = [], ph = phaseOf(date);
    if (date < startOf()) {
      return [{ k: 'prep', t: '六级优先', d: '计划从 ' + startOf() + ' 开始。现在可以先熟悉网站，或试做几道题。', href: '#/practice', min: 0 }];
    }
    if (!ph) return [{ k: 'free', t: '自由复习', d: '当前不在计划阶段内，可在设置中更新考试日期。', href: '#/practice', min: 0 }];
    var budget = minutesOf(date), dow = parseD(date).getDay(), weekend = dow === 0 || dow === 6;
    var focus = focusOf(date, ph), weak = weakest();
    var due = wrongBook().filter(function (w) { return w.isDue; }).length;
    if (due) { var n = Math.min(due, 10); out.push({ k: 'review', t: '复习错题 ' + n + ' 题', d: '按遗忘间隔回做，先把会错的题清掉。', href: '#/wrong', min: Math.round(n * 1.5) }); }
    if (dow === 1) out.push({ k: 'learn', t: '学习方法：' + focus, d: '看要点并听一节对应基础课，本周主攻这个模块。', href: '#/learn', min: 25 });
    if (ph.mock && dow === 6) out.push({ k: 'mock', t: '完成 1 套限时模考', d: '在粉笔等平台用真题模考，做完录入成绩。', href: '#/add', min: 120 });
    else if (ph.essay && dow === 0) {
      var e = nextEssay(ph.essay);
      out.push({ k: 'essay', t: '写作：' + e.title, d: e.kind + '·' + e.type + '。写完复制给 AI 批改。', href: '#/write/' + e.id, min: e.minutes });
    }
    var used = out.reduce(function (s, x) { return s + x.min; }, 0), left = Math.max(15, budget - used);
    var cnt = Math.max(5, Math.min(20, Math.round(left / 1.5 / 5) * 5));
    if (out.length && used >= budget) return out;
    if (unseen(focus).length >= 5) out.push({ k: 'practice', t: focus + '专项 ' + cnt + ' 题', d: '本站原创题，做完看解析。', href: '#/practice/' + encodeURIComponent(focus) + '/' + cnt, min: Math.round(cnt * 1.5) });
    else out.push({ k: 'external', t: '外部平台：' + focus + ' ' + cnt + ' 题', d: '本站该模块新题不足，到粉笔等平台做，完成后录入。', href: '#/add', min: Math.round(cnt * 1.5) });
    if (weekend && weak && weak !== focus) out.push({ k: 'weak', t: '补薄弱：' + weak + ' 10 题', d: '这是你目前正确率最低的模块。', href: '#/practice/' + encodeURIComponent(weak) + '/10', min: 15 });
    if (ph.news) out.push({ k: 'news', t: '看时政 10 分钟', d: '以官方媒体为准，记下 1 条可用于申论的表述。', href: '', min: 10 });
    return out;
  }

  /* ---------- 页面 ---------- */
  var NAV = [['today', '今日', 1], ['learn', '学习', 1], ['practice', '刷题', 1], ['wrong', '错题', 0], ['write', '写作', 1], ['stats', '统计', 0], ['add', '录入', 0], ['settings', '设置', 0], ['me', '更多', 2]];
  function renderNav(cur) {
    $('nav').innerHTML = '<div class="brand">上岸计划</div>' + NAV.map(function (n) {
      var cls = (n[2] === 2 ? 'mobile ' : n[2] === 0 ? 'desk ' : '') + (cur === n[0] ? 'on' : '');
      return '<a class="' + cls + '" href="#/' + n[0] + '">' + n[1] + '</a>';
    }).join('');
  }
  function title(t) { $('pageTitle').textContent = t; document.title = t + ' · 上岸计划'; }

  var pages = {};
  pages.today = function () {
    title('今日任务');
    var d = ds(), ph = phaseOf(d), tasks = tasksFor(d), st = moduleStats();
    var tot = 0, ok = 0; MODULES.forEach(function (m) { tot += st[m].total; ok += st[m].ok; });
    var due = wrongBook().filter(function (w) { return w.isDue; }).length;
    var h = '<div class="grid">' + S.settings.exams.map(function (e) {
      return '<div class="stat"><b>' + Math.max(0, dayDiff(d, e.date)) + ' 天</b><span>' + esc(e.name) + '（预估）</span></div>';
    }).join('') + '</div>';
    var done = tasks.filter(function (t) { var x = S.done[d + '|' + t.k]; return x && x.on; }).length;
    h += '<section class="card"><h2>' + d + (ph ? ' · ' + esc(ph.name) : '') + '</h2>';
    if (ph && d >= startOf()) h += '<p class="mut small">' + esc(ph.goal) + ' 今日预算约 ' + minutesOf(d) + ' 分钟，已完成 ' + done + '/' + tasks.length + '。</p>';
    tasks.forEach(function (t) {
      var key = d + '|' + t.k, isD = !!(S.done[key] && S.done[key].on);
      h += '<div class="task' + (isD ? ' done' : '') + '"><input type="checkbox" aria-label="标记完成：' + esc(t.t) + '" data-k="' + esc(key) + '"' + (isD ? ' checked' : '') + '><div class="body"><div class="t">' + esc(t.t) + (t.min ? ' <span class="mut small">约 ' + t.min + ' 分钟</span>' : '') + '</div><div class="mut small">' + esc(t.d) + '</div>' + (t.href ? '<a class="small" href="' + t.href + '">去完成</a>' : '') + '</div></div>';
    });
    h += '</section><div class="grid"><div class="stat"><b>' + tot + '</b><span>累计做题</span></div><div class="stat"><b>' + pct(ok, tot) + '%</b><span>总正确率</span></div><div class="stat"><b>' + due + '</b><span>待复习错题</span></div></div>';
    view.innerHTML = h;
    view.querySelectorAll('input[data-k]').forEach(function (c) {
      c.onchange = function () { S.done[c.dataset.k] = { updatedAt: Date.now(), on: c.checked }; save(); route(); };
    });
  };

  pages.learn = function () {
    title('学什么');
    var d = ds(), h = '<section class="card"><h2>备考路线</h2>';
    G.phases.forEach(function (p) {
      var cur = d >= p.from && d <= p.to;
      h += '<div class="list-item"><b>' + esc(p.name) + '</b> ' + (cur ? '<span class="tag">当前</span>' : '') + '<div class="mut small">' + p.from + ' 至 ' + p.to + '</div><div class="small">' + esc(p.goal) + '</div></div>';
    });
    h += '</section><p class="mut small">“当前”按今天日期显示；实际任务从你设定的开始日期起安排。</p>';
    Object.keys(G.modules).forEach(function (m) {
      var g = G.modules[m];
      h += '<section class="card"><h2>' + esc(m) + '</h2><p class="small">' + esc(g.share) + '</p><h3>学习顺序</h3><ol class="clean small">' + g.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol><h3>常见失误</h3><ul class="clean small">' + g.mistakes.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' + (MODULES.indexOf(m) > -1 ? '<a class="btn ghost" href="#/practice/' + encodeURIComponent(m) + '/10">练 10 题</a>' : '<a class="btn ghost" href="#/write">去写作</a>') + '</section>';
    });
    view.innerHTML = h;
  };

  var session = null;
  pages.practice = function (a) {
    if (a[0] && a[1]) { startSession(decodeURIComponent(a[0]), +a[1], a[2] || 'learn'); return; }
    title('刷题');
    var pick = { m: MODULES[0], n: 10, mode: 'learn' };
    function draw() {
      var q = allQ().filter(function (x) { return x.m === pick.m; }), u = unseen(pick.m).length;
      view.innerHTML = '<section class="card"><h2>选择模块</h2><div class="pick">' + MODULES.map(function (m) { return '<button type="button" data-m="' + m + '" class="' + (m === pick.m ? 'on' : '') + '"><b>' + m + '</b><span class="mut small">' + allQ().filter(function (x) { return x.m === m; }).length + ' 题</span></button>'; }).join('') + '</div><p class="mut small" style="margin-top:10px">本模块共 ' + q.length + ' 题，未做 ' + u + ' 题。</p><h3>题量</h3><div class="chips" id="ns">' + [5, 10, 20].map(function (n) { return '<button type="button" data-n="' + n + '" class="' + (n === pick.n ? 'on' : '') + '">' + n + ' 题</button>'; }).join('') + '</div><h3>模式</h3><div class="chips" id="ms"><button type="button" data-v="learn" class="' + (pick.mode === 'learn' ? 'on' : '') + '">练习：每题看解析</button><button type="button" data-v="exam" class="' + (pick.mode === 'exam' ? 'on' : '') + '">限时：交卷后看解析</button></div><a class="btn" href="#/practice/' + encodeURIComponent(pick.m) + '/' + pick.n + '/' + pick.mode + '">开始</a></section><p class="mut small">本站题目为原创练习题。图形推理第一版未内置，请在外部平台练习。考前仍要做真题。</p>';
      view.querySelectorAll('.pick button').forEach(function (b) { b.onclick = function () { pick.m = b.dataset.m; draw(); }; });
      view.querySelectorAll('#ns button').forEach(function (b) { b.onclick = function () { pick.n = +b.dataset.n; draw(); }; });
      view.querySelectorAll('#ms button').forEach(function (b) { b.onclick = function () { pick.mode = b.dataset.v; draw(); }; });
    }
    draw();
  };
  function startSession(mod, n, mode, ids) {
    var pool;
    if (ids) pool = ids.map(findQ).filter(Boolean);
    else {
      var u = shuffle(unseen(mod)), old = shuffle(allQ().filter(function (q) { return q.m === mod; }).filter(function (q) { return u.indexOf(q) < 0; }));
      pool = u.concat(old).slice(0, n);
      /* 资料分析按材料聚合，避免在材料之间来回跳。 */
      if (mod === '资料分析') pool.sort(function (a, b) { return (a.p || '') < (b.p || '') ? -1 : 1; });
    }
    if (!pool.length) { view.innerHTML = '<section class="card"><p>这里还没有题目。</p><a class="btn" href="#/practice">返回</a></section>'; return; }
    session = { mode: mode, qs: pool.map(function (q) { return { q: q, order: shuffle([0, 1, 2, 3].slice(0, q.o.length)), pick: null, t0: 0, sec: 0, aid: null }; }), i: 0, start: Date.now(), limit: pool.length * 90, finished: false };
    drawQ();
  }
  function record(s) {
    var id = uid(), a = { id: id, q: s.q.id, ok: s.pick === s.q.a, c: s.pick, ts: Date.now(), sec: s.sec };
    a.updatedAt = a.ts; S.attempts[id] = a; s.aid = id; save();
  }
  function drawQ() {
    var se = session, s = se.qs[se.i], q = s.q, showing = se.mode === 'learn' ? s.pick !== null : se.finished;
    if (!s.t0) s.t0 = Date.now();
    title(se.mode === 'exam' ? '限时练习' : '练习');
    var h = '<section class="card"><div class="q-meta"><span>' + (se.i + 1) + ' / ' + se.qs.length + ' · ' + esc(q.m) + '·' + esc(q.t) + '</span><span id="clock"></span></div>';
    if (q.p && window.PASSAGES[q.p]) h += '<div class="passage">' + esc(window.PASSAGES[q.p]) + '</div>';
    h += '<div class="stem">' + esc(q.q) + '</div>';
    s.order.forEach(function (oi, n) {
      var cls = '';
      if (showing) { if (oi === q.a) cls = 'right'; else if (oi === s.pick) cls = 'wrong'; } else if (oi === s.pick) cls = 'sel';
      h += '<button type="button" class="opt ' + cls + '" data-o="' + oi + '"' + (showing ? ' disabled' : '') + '>' + 'ABCD'.charAt(n) + '. ' + esc(q.o[oi]) + '</button>';
    });
    if (showing) {
      var ok = s.pick === q.a;
      h += '<p><b style="color:var(--' + (ok ? 'ok' : 'bad') + ')">' + (s.pick === null ? '未作答' : ok ? '回答正确' : '回答错误') + '</b></p><div class="exp small">' + esc(q.e || '暂无解析') + '</div>';
      if (!ok && s.aid) h += '<div class="small mut">错因：</div><div class="chips" id="why">' + WHY.map(function (w) { return '<button type="button" data-w="' + w + '" class="' + (S.attempts[s.aid].why === w ? 'on' : '') + '">' + w + '</button>'; }).join('') + '</div>';
    }
    h += '<div class="row">';
    if (se.i > 0 && (se.mode === 'exam' || se.finished)) h += '<button class="btn ghost" id="prev" type="button">上一题</button>';
    if (se.i < se.qs.length - 1) { if (showing || se.mode === 'exam') h += '<button class="btn" id="next" type="button">下一题</button>'; }
    else if (se.finished || (se.mode === 'learn' && showing)) h += '<button class="btn" id="end" type="button">查看结果</button>';
    if (se.mode === 'exam' && !se.finished) h += '<button class="btn ghost" id="submit" type="button">交卷</button>';
    h += '</div></section>';
    view.innerHTML = h;
    view.querySelectorAll('.opt').forEach(function (b) {
      b.onclick = function () {
        s.pick = +b.dataset.o;
        if (se.mode === 'learn') { s.sec = Math.round((Date.now() - s.t0) / 1000); record(s); }
        drawQ();
      };
    });
    view.querySelectorAll('#why button').forEach(function (b) { b.onclick = function () { var a = S.attempts[s.aid]; a.why = b.dataset.w; a.updatedAt = Date.now(); save(); drawQ(); }; });
    var go = function (d) { return function () { se.i += d; drawQ(); }; };
    if ($('prev')) $('prev').onclick = go(-1);
    if ($('next')) $('next').onclick = go(1);
    if ($('end')) $('end').onclick = result;
    if ($('submit')) $('submit').onclick = submitExam;
    tick();
  }
  function submitExam() {
    var se = session; if (se.finished) return;
    var avg = Math.round((Date.now() - se.start) / 1000 / se.qs.length);
    se.finished = true;
    se.qs.forEach(function (s) { s.sec = avg; if (s.pick !== null) record(s); });
    result();
  }
  function tick() {
    clearTimeout(tick.t);
    var se = session, c = $('clock'); if (!se || !c) return;
    var sec = Math.round((Date.now() - se.start) / 1000);
    if (se.mode === 'exam' && !se.finished) {
      var left = se.limit - sec;
      if (left <= 0) { submitExam(); return; }
      c.textContent = '剩余 ' + Math.floor(left / 60) + ':' + pad(left % 60);
    } else c.textContent = Math.floor(sec / 60) + ':' + pad(sec % 60);
    if (!se.finished) tick.t = setTimeout(tick, 1000);
  }
  function result() {
    var se = session; clearTimeout(tick.t); title('本次结果');
    var ok = se.qs.filter(function (s) { return s.pick === s.q.a; }).length, n = se.qs.length;
    view.innerHTML = '<div class="grid"><div class="stat"><b>' + ok + '/' + n + '</b><span>正确题数</span></div><div class="stat"><b>' + pct(ok, n) + '%</b><span>正确率</span></div><div class="stat"><b>' + Math.round((Date.now() - se.start) / 60000) + '</b><span>分钟</span></div></div><section class="card"><h2>题目回看</h2>' + se.qs.map(function (s, i) { return '<a class="list-item" href="#" data-i="' + i + '"><span class="tag ' + (s.pick === s.q.a ? '' : 'warn') + '">' + (s.pick === s.q.a ? '对' : '错') + '</span>' + esc(s.q.q.slice(0, 40)) + '</a>'; }).join('') + '<div class="row" style="margin-top:12px"><a class="btn" href="#/practice">继续刷题</a><a class="btn ghost" href="#/today">回到今日</a></div></section>';
    view.querySelectorAll('[data-i]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); se.i = +a.dataset.i; se.finished = true; drawQ(); }; });
  }

  pages.wrong = function () {
    title('错题本');
    var w = wrongBook(), due = w.filter(function (x) { return x.isDue; });
    var h = '<div class="grid"><div class="stat"><b>' + w.length + '</b><span>未掌握</span></div><div class="stat"><b>' + due.length + '</b><span>今天到期</span></div><div class="stat"><b>' + GAPS.length + ' 次</b><span>连续做对算掌握</span></div></div>';
    h += '<section class="card">' + (due.length ? '<button class="btn" id="rev" type="button">复习到期错题（' + Math.min(due.length, 20) + ' 题）</button>' : '<p class="mut">今天没有到期的错题。</p>') + '</section>';
    if (w.length) h += '<section class="card"><h2>全部错题</h2>' + w.map(function (x) { return '<div class="list-item"><span class="tag">' + esc(x.q.m) + '</span>' + (x.why ? '<span class="tag warn">' + esc(x.why) + '</span>' : '') + '<div class="small">' + esc(x.q.q.slice(0, 70)) + '</div><div class="mut small">错 ' + x.times + ' 次，已连对 ' + x.streak + ' 次，' + (x.isDue ? '今天复习' : x.due + ' 复习') + '</div></div>'; }).join('') + '</section>';
    view.innerHTML = h;
    if ($('rev')) $('rev').onclick = function () { startSession('', 0, 'learn', due.slice(0, 20).map(function (x) { return x.q.id; })); };
  };

  function latestEssay(eid) {
    var l = Object.keys(S.essays).map(function (k) { return S.essays[k]; }).filter(function (e) { return e.eid === eid && !e.deleted; });
    return l.sort(function (a, b) { return b.updatedAt - a.updatedAt; })[0] || null;
  }
  function gradePrompt(e, text) {
    return '你是国考、省考和事业单位笔面试的资深阅卷老师。请严格批改下面的作答，不要迁就。\n\n【科目】' + e.kind + '·' + e.type + '\n【材料】' + e.material + '\n【题目】' + e.task + '\n【评分权重】' + e.rubric + '\n【参考要点】' + e.points.join('；') + '\n\n【我的作答】\n' + text + '\n\n请输出：\n1. 总分（百分制）和各评分项得分\n2. 遗漏或错误的要点\n3. 3 条最优先的修改建议\n4. 一份修改后的示范答案（遵守字数限制）\n5. 下次练习时要注意的一件事';
  }
  function copy(text) {
    var fallback = function () { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 忽略 */ } t.remove(); toast(ok ? '已复制' : '复制失败，请手动复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('已复制，去 AI 对话里粘贴'); }, fallback); else fallback();
  }
  pages.write = function (a) {
    if (a[0]) return essayPage(a[0]);
    title('写作与批改');
    var kinds = ['申论', '综应', '面试'];
    view.innerHTML = kinds.map(function (k) {
      return '<section class="card"><h2>' + k + '</h2>' + window.ESSAYS.filter(function (e) { return e.kind === k; }).map(function (e) {
        var l = latestEssay(e.id);
        return '<a class="list-item" href="#/write/' + e.id + '"><b>' + esc(e.title) + '</b> <span class="tag">' + esc(e.type) + '</span>' + (l ? '<span class="tag warn">' + (l.score ? l.score + ' 分' : '已写') + '</span>' : '') + '<div class="mut small">限时 ' + e.minutes + ' 分钟，' + e.limit + ' 字内</div></a>';
      }).join('') + '</section>';
    }).join('');
  };
  function essayPage(id) {
    var e = window.ESSAYS.filter(function (x) { return x.id === id; })[0];
    if (!e) { location.hash = '#/write'; return; }
    title(e.title);
    var r = latestEssay(id) || { id: uid(), eid: id, text: '', feedback: '', score: '', ts: Date.now() };
    view.innerHTML = '<section class="card"><span class="tag">' + esc(e.kind) + '·' + esc(e.type) + '</span><p class="small">' + esc(e.material) + '</p><p><b>' + esc(e.task) + '</b></p><details class="small"><summary>写完再看：参考要点</summary><ul class="clean">' + e.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></details></section><section class="card"><label class="f">我的作答（<span id="wc">0</span> / ' + e.limit + ' 字）<textarea class="big" id="ans"></textarea></label><div class="row"><button class="btn ghost" id="sv" type="button">保存</button><button class="btn" id="cp" type="button">复制批改指令</button><a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener">打开 Claude</a></div></section><section class="card"><h2>批改结果</h2><label class="f">分数（百分制）<input id="sc" inputmode="numeric" type="number" min="0" max="100"></label><label class="f">把 AI 的批改结果贴到这里<textarea id="fb"></textarea></label><button class="btn" id="sf" type="button">保存批改</button></section>';
    var ans = $('ans'), fb = $('fb'), sc = $('sc'), wc = $('wc');
    ans.value = r.text; fb.value = r.feedback || ''; sc.value = r.score || '';
    var cnt = function () { wc.textContent = ans.value.replace(/\s/g, '').length; }; cnt(); ans.oninput = cnt;
    var store = function () { r.text = ans.value; r.feedback = fb.value; r.score = sc.value; r.updatedAt = Date.now(); S.essays[r.id] = r; save(); };
    $('sv').onclick = function () { store(); toast('已保存'); };
    $('sf').onclick = function () { store(); toast('批改已保存'); };
    $('cp').onclick = function () { if (!ans.value.trim()) { toast('请先写作答'); return; } store(); copy(gradePrompt(e, ans.value)); };
  }

  pages.stats = function () {
    title('学习统计');
    var st = moduleStats(), w = weakest();
    var h = '<section class="card"><h2>模块正确率</h2><p class="mut small">含本站和外部录入。' + (w ? '目前最弱：' + w + '。' : '每个模块做满 10 题后判断薄弱项。') + '</p>' + MODULES.map(function (m) {
      var s = st[m], p = pct(s.ok, s.total);
      return '<div class="bar"><span>' + m.slice(0, 4) + '</span><i><b style="width:' + p + '%"></b></i><span>' + (s.total ? p + '% · ' + s.total + '题' : '暂无') + '</span></div>';
    }).join('') + '</section>';
    var days = [], d = ds(), i;
    for (i = 13; i >= 0; i--) days.push(addDays(d, -i));
    var perDay = {}; Object.keys(S.attempts).forEach(function (k) { var x = ds(new Date(S.attempts[k].ts)); perDay[x] = (perDay[x] || 0) + 1; });
    Object.keys(S.externals).forEach(function (k) { var e = S.externals[k]; if (!e.deleted) perDay[e.date] = (perDay[e.date] || 0) + (+e.total || 0); });
    var mx = Math.max.apply(null, days.map(function (x) { return perDay[x] || 0; }).concat([1]));
    h += '<section class="card"><h2>最近 14 天做题量</h2>' + days.map(function (x) { var n = perDay[x] || 0; return '<div class="bar"><span>' + x.slice(5) + '</span><i><b style="width:' + pct(n, mx) + '%"></b></i><span>' + n + ' 题</span></div>'; }).join('') + '</section>';
    var whyC = {}; Object.keys(S.attempts).forEach(function (k) { var a = S.attempts[k]; if (a.why) whyC[a.why] = (whyC[a.why] || 0) + 1; });
    Object.keys(S.externals).forEach(function (k) { var e = S.externals[k]; if (!e.deleted && e.why) whyC[e.why] = (whyC[e.why] || 0) + 1; });
    h += '<section class="card"><h2>错因</h2>' + (Object.keys(whyC).length ? Object.keys(whyC).map(function (k) { return '<span class="tag warn">' + esc(k) + ' ' + whyC[k] + '</span>'; }).join('') : '<p class="mut small">做错时选择错因后会显示在这里。</p>') + '</section>';
    var ext = Object.keys(S.externals).map(function (k) { return S.externals[k]; }).filter(function (e) { return !e.deleted; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 10);
    if (ext.length) h += '<section class="card"><h2>最近外部记录</h2>' + ext.map(function (e) { return '<div class="list-item small"><b>' + esc(e.platform) + ' · ' + esc(e.module) + '</b> ' + e.correct + '/' + e.total + '（' + pct(+e.correct, +e.total) + '%）<div class="mut">' + e.date + (e.min ? '，' + e.min + ' 分钟' : '') + (e.why ? '，' + esc(e.why) : '') + '</div></div>'; }).join('') + '</section>';
    view.innerHTML = h;
  };

  pages.add = function () {
    title('录入');
    var opts = function (l) { return l.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join(''); };
    view.innerHTML = '<section class="card"><h2>录入外部平台成绩</h2><div class="row small" style="margin-bottom:10px"><a href="https://www.fenbi.com" target="_blank" rel="noopener">打开粉笔</a><a href="https://www.huatu.com" target="_blank" rel="noopener">打开华图</a><a href="https://www.offcn.com" target="_blank" rel="noopener">打开中公</a></div><div class="two"><label class="f">平台<select id="ep">' + opts(PLATFORMS) + '</select></label><label class="f">模块<select id="em">' + opts(MODULES) + '</select></label><label class="f">总题数<input id="et" type="number" inputmode="numeric" min="1"></label><label class="f">做对题数<input id="ec" type="number" inputmode="numeric" min="0"></label><label class="f">用时（分钟，可不填）<input id="en" type="number" inputmode="numeric" min="0"></label><label class="f">主要错因<select id="ew"><option value="">不填</option>' + opts(WHY) + '</select></label></div><button class="btn" id="es" type="button">保存成绩</button></section><section class="card"><h2>录入自己的题目</h2><p class="mut small">只录入你有权使用的题目或自己的错题笔记，存放在你的私有仓库中。</p><label class="f">模块<select id="qm">' + opts(MODULES) + '</select></label><label class="f">题干<textarea id="qq"></textarea></label><div class="two">' + ['A', 'B', 'C', 'D'].map(function (x, i) { return '<label class="f">选项 ' + x + '<input id="qo' + i + '"></label>'; }).join('') + '</div><label class="f">正确答案<select id="qa"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></label><label class="f">解析<textarea id="qe"></textarea></label><button class="btn" id="qs" type="button">保存题目</button></section>';
    $('es').onclick = function () {
      var t = +$('et').value, c = +$('ec').value;
      if (!t || c < 0 || c > t) { toast('请检查题数'); return; }
      var id = uid(); S.externals[id] = { id: id, date: ds(), platform: $('ep').value, module: $('em').value, total: t, correct: c, min: +$('en').value || 0, why: $('ew').value, updatedAt: Date.now() };
      save(); toast('已保存'); $('et').value = ''; $('ec').value = ''; $('en').value = '';
    };
    $('qs').onclick = function () {
      var o = [0, 1, 2, 3].map(function (i) { return $('qo' + i).value.trim(); });
      if (!$('qq').value.trim() || o.some(function (x) { return !x; })) { toast('请填写题干和四个选项'); return; }
      var id = 'u' + uid(); S.custom[id] = { id: id, m: $('qm').value, t: '自录', q: $('qq').value.trim(), o: o, a: +$('qa').value, e: $('qe').value.trim(), updatedAt: Date.now() };
      save(); toast('题目已保存'); ['qq', 'qe', 'qo0', 'qo1', 'qo2', 'qo3'].forEach(function (x) { $(x).value = ''; });
    };
  };

  pages.me = function () {
    title('更多');
    view.innerHTML = '<section class="card">' + [['wrong', '错题本'], ['stats', '学习统计'], ['add', '录入成绩和题目'], ['settings', '设置与同步']].map(function (x) { return '<a class="list-item" href="#/' + x[0] + '"><b>' + x[1] + '</b></a>'; }).join('') + '</section>';
  };

  pages.settings = function () {
    title('设置与同步');
    var c = syncCfg();
    view.innerHTML = '<section class="card"><h2>GitHub 同步</h2><p class="mut small">进度保存到你自己的私有仓库。令牌只存在当前设备，不会同步；请使用只授权数据仓库的细粒度令牌。公共电脑上不要填写。</p><div class="two"><label class="f">用户名<input id="so" autocomplete="off" placeholder="MZH-0108"></label><label class="f">数据仓库名<input id="sr" autocomplete="off" placeholder="countryTest-data"></label></div><label class="f">访问令牌<input id="st" type="password" autocomplete="off"></label><div class="row"><button class="btn" id="ss" type="button">保存并同步</button><button class="btn ghost" id="sn" type="button">立即同步</button><button class="btn bad" id="sx" type="button">清除本机令牌</button></div><p class="small mut" id="sinfo"></p></section><section class="card"><h2>学习安排</h2><div class="two"><label class="f">每周小时数<input id="wh" type="number" min="1" max="40" step="0.5"></label><label class="f">开始日期<input id="sd" type="date"></label></div>' + S.settings.exams.map(function (e, i) { return '<label class="f">' + esc(e.name) + '（' + esc(e.subjects) + '，公告后修改）<input id="ex' + i + '" type="date" value="' + esc(e.date) + '"></label>'; }).join('') + '<button class="btn" id="sp" type="button">保存安排</button></section><section class="card"><h2>备份</h2><div class="row"><button class="btn ghost" id="exp" type="button">导出数据</button><label class="btn ghost">导入数据<input id="imp" type="file" accept="application/json" hidden></label></div><p class="mut small">导入时与本机数据合并，不会覆盖已有记录。</p></section><p class="mut small">题库 ' + BANK.length + ' 题，版本 ' + (APP_VERSION) + '。考试日期均为预估，以官方公告为准。</p>';
    $('so').value = c.owner || ''; $('sr').value = c.repo || ''; $('st').value = c.token || '';
    $('wh').value = S.settings.weeklyHours; $('sd').value = S.settings.startDate;
    $('sinfo').textContent = syncMsg();
    $('ss').onclick = function () {
      localStorage.setItem(SYNC_KEY, JSON.stringify({ owner: $('so').value.trim(), repo: $('sr').value.trim(), token: $('st').value.trim() }));
      syncNow(true);
    };
    $('sn').onclick = function () { syncNow(true); };
    $('sx').onclick = function () { localStorage.removeItem(SYNC_KEY); route(); toast('已清除'); };
    $('sp').onclick = function () {
      S.settings.weeklyHours = +$('wh').value || 6; S.settings.startDate = $('sd').value || S.settings.startDate;
      S.settings.exams.forEach(function (e, i) { e.date = $('ex' + i).value || e.date; });
      S.settings.updatedAt = Date.now(); save(); toast('已保存');
    };
    $('exp').onclick = function () {
      var u = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })), a = document.createElement('a');
      a.href = u; a.download = '上岸计划备份-' + ds() + '.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    };
    $('imp').onchange = function () {
      var f = this.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { S = merge(S, JSON.parse(r.result)); save(); toast('已合并导入'); route(); } catch (e) { toast('文件格式不对'); } };
      r.readAsText(f);
    };
  };

  /* ---------- GitHub 同步 ---------- */
  var FILE = 'progress.json', syncState = { status: 'idle', at: 0, msg: '' }, syncing = false, again = false, syncTimer = null;
  function syncCfg() { try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); } catch (e) { return {}; } }
  function syncOn() { var c = syncCfg(); return c.owner && c.repo && c.token; }
  function syncMsg() {
    if (!syncOn()) return '尚未设置同步，数据只保存在本设备。';
    if (syncState.status === 'err') return '同步失败：' + syncState.msg + '。数据已保存在本机，稍后会重试。';
    if (syncState.at) return '上次同步：' + new Date(syncState.at).toLocaleString();
    return '已设置，等待同步。';
  }
  function pill() {
    var p = $('syncPill');
    p.className = 'sync' + (syncState.status === 'ok' ? ' ok' : syncState.status === 'err' ? ' err' : '');
    p.textContent = !syncOn() ? '本机已保存' : syncState.status === 'run' ? '同步中' : syncState.status === 'ok' ? '已同步' : syncState.status === 'err' ? '待同步' : '待同步';
    var i = $('sinfo'); if (i) i.textContent = syncMsg();
  }
  function queueSync() { clearTimeout(syncTimer); if (syncOn()) syncTimer = setTimeout(function () { syncNow(false); }, 4000); }
  function b64(s) { var b = new TextEncoder().encode(s), o = '', i; for (i = 0; i < b.length; i += 8192) o += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(o); }
  function apiUrl(c) { return 'https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) + '/contents/' + FILE; }
  function failure(status) {
    return status === 401 ? '令牌无效或已过期' : status === 403 ? '令牌权限不足或请求受限' : status === 404 ? '找不到数据仓库' : '服务器返回 ' + status;
  }
  async function pullRemote(c) {
    var head = { Authorization: 'Bearer ' + c.token };
    var r = await fetch(apiUrl(c) + '?t=' + Date.now(), { headers: Object.assign({ Accept: 'application/vnd.github.object+json' }, head), cache: 'no-store' });
    if (r.status === 404) {
      var repo = await fetch('https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo), { headers: head, cache: 'no-store' });
      if (!repo.ok) throw new Error(failure(repo.status));
      return { sha: null, data: null };
    }
    if (!r.ok) throw new Error(failure(r.status));
    var meta = await r.json();
    var raw = await fetch(apiUrl(c) + '?r=' + Date.now(), { headers: Object.assign({ Accept: 'application/vnd.github.raw+json' }, head), cache: 'no-store' });
    if (!raw.ok) throw new Error(failure(raw.status));
    return { sha: meta.sha, data: await raw.json() };
  }
  async function syncNow(manual) {
    var c = syncCfg();
    if (!syncOn()) { if (manual) toast('请先填写用户名、仓库名和令牌'); return; }
    if (syncing) { again = true; return; }
    syncing = true; syncState.status = 'run'; pill();
    try {
      for (var i = 0; i < 3; i++) {
        var rem = await pullRemote(c), merged = rem.data ? merge(S, rem.data) : S;
        var body = canon(merged);
        var changedLocal = body !== canon(S);
        if (rem.data && body === canon(rem.data)) { if (changedLocal) applyRemote(merged); break; }
        var put = await fetch(apiUrl(c), { method: 'PUT', headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '同步学习进度 ' + new Date().toISOString(), content: b64(body), sha: rem.sha || undefined }) });
        if (put.ok) { if (changedLocal) applyRemote(merged); break; }
        if ((put.status === 409 || put.status === 422) && i < 2) continue;
        throw new Error(failure(put.status));
      }
      syncState = { status: 'ok', at: Date.now(), msg: '' };
      if (manual) toast('同步完成');
    } catch (e) {
      syncState = { status: 'err', at: syncState.at, msg: e.name === 'TypeError' ? '网络连接不上 GitHub' : e.message };
      if (manual) toast(syncState.msg);
    }
    syncing = false; pill();
    if (again) { again = false; syncNow(false); }
  }
  function applyRemote(m) {
    S = m; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 忽略 */ }
    if (!/^#\/(practice\/|write\/)/.test(location.hash) && !session) route();
  }

  /* ---------- 路由与启动 ---------- */
  function route() {
    var parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/'), name = parts[0];
    if (!pages[name]) name = 'today';
    if (!(name === 'practice' && parts[1])) { session = null; clearTimeout(tick.t); }
    renderNav(name);
    pages[name](parts.slice(1));
    window.scrollTo(0, 0);
  }
  $('syncPill').onclick = function () { if (syncOn()) syncNow(true); else location.hash = '#/settings'; };
  window.addEventListener('hashchange', route);
  window.addEventListener('online', function () { syncNow(false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) syncNow(false); });
  setInterval(function () { if (syncState.status === 'err') syncNow(false); }, 120000);
  route(); pill(); syncNow(false);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 不支持时仍可在线使用 */ });
  }
  window.__ct = { merge: merge, wrongBook: wrongBook, tasksFor: tasksFor, state: function () { return S; } };
})();
