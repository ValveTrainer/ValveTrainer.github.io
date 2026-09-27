/* Plant Trainer v1 — app logic: router, progress, quiz engine, Plant Mentor, games, Ask Grok copy.
   Vanilla JavaScript. No network calls. Data comes from js/content.js. */
(function () {
  'use strict';

  var STORE_KEY = 'plantTrainer.v1';
  var QUIZ_LEN = 5, PASS_SCORE = 4;
  var PASS_TOAST = 'Section complete — support training only';
  var GROK_TOAST = 'Copied. Paste this into your Grok bot.';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var main = $('#main'), sidebar = $('#sidebar'), mentorLog = $('#mentorLog');

  var MOD = {};
  MODULES.forEach(function (m) { MOD[m.id] = m; });

  /* ---------------- Progress (localStorage) ---------------- */
  function defaults() {
    return { v: 1, role: 'operator', opened: {}, step: {}, skill: {}, passed: {}, quiz: {}, recent: {}, last: null, games: {} };
  }
  var state = load();
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaults();
      var s = JSON.parse(raw), d = defaults();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      return s;
    } catch (e) { return defaults(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage may be blocked; app still works */ }
  }
  function skillOf(id) { return state.skill[id] || 2; }
  function statusOf(id) {
    if (state.passed[id]) return 'pass';
    if (state.opened[id] || state.quiz[id]) return 'prog';
    return 'none';
  }
  var STATUS_LABEL = { none: 'Not started', prog: 'In progress', pass: 'Check passed' };
  function role() { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === state.role) return ROLES[i]; return ROLES[0]; }

  /* ---------------- Helpers ---------------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function groupTitle(g) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === g) return GROUPS[i].title; return ''; }
  function stateMark(id) {
    var s = statusOf(id);
    if (s === 'pass') return '<span class="side-state state-pass" title="Check passed" aria-label="Check passed">&#10004;</span>';
    if (s === 'prog') return '<span class="side-state state-prog" title="In progress" aria-label="In progress">&#9679;</span>';
    return '';
  }

  /* ---------------- Sidebar ---------------- */
  var currentModule = null;
  function renderSidebar(activeHash) {
    var h = '<a class="side-link' + (activeHash === '#/home' ? ' active' : '') + '" href="#/home">&#8962; Home</a>';
    GROUPS.forEach(function (g) {
      h += '<div class="side-group">' + esc(g.title) + '</div>';
      MODULES.filter(function (m) { return m.group === g.id; }).forEach(function (m) {
        var act = currentModule === m.id ? ' active' : '';
        h += '<a class="side-link' + act + '" href="#/m/' + m.id + '" data-mod="' + m.id + '"><span class="side-num">' + m.num + '</span>' + esc(m.title) + stateMark(m.id) + '</a>';
      });
    });
    h += '<div class="side-group">Practice</div>';
    h += '<a class="side-link' + (activeHash === '#/practice/valve' ? ' active' : '') + '" href="#/practice/valve">&#9881; Name that valve</a>';
    h += '<a class="side-link' + (activeHash === '#/practice/trace' ? ' active' : '') + '" href="#/practice/trace">&#10148; Trace the flow / first look</a>';
    sidebar.innerHTML = h;
  }

  /* ---------------- Router ---------------- */
  function route() {
    var hash = location.hash || '#/home';
    var parts = hash.replace(/^#\/?/, '').split('/');
    var view = parts[0] || 'home';
    currentModule = null;
    closeMentorIfMobile();
    if (view === 'm' && MOD[parts[1]]) {
      currentModule = parts[1];
      var n = parseInt(parts[2], 10) || state.step[parts[1]] || 1;
      renderLesson(parts[1], n);
    } else if (view === 'check' && MOD[parts[1]]) {
      currentModule = parts[1];
      renderCheck(parts[1]);
    } else if (view === 'sections') {
      renderSections();
    } else if (view === 'practice') {
      if (parts[1] === 'valve') renderValveGame();
      else if (parts[1] === 'trace') renderTraceGame();
      else renderPractice();
    } else {
      hash = '#/home';
      renderHome();
    }
    if (currentModule) { state.last = hash; save(); }
    renderSidebar(hash);
    $$('.bottombar button').forEach(function (b) {
      var nav = b.getAttribute('data-nav');
      b.classList.toggle('on', (nav === 'home' && view === 'home') || (nav === 'sections' && (view === 'sections' || view === 'm' || view === 'practice')) || (nav === 'check' && view === 'check'));
    });
    enhanceTerms();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', route);

  function enhanceTerms() {
    $$('.term, .svg-term', main).forEach(function (el) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      if (!el.getAttribute('aria-label') && el.classList.contains('svg-term')) el.setAttribute('aria-label', (el.getAttribute('data-part') || '') + ': explain in Plant Mentor');
    });
  }

  /* ---------------- Home ---------------- */
  function recommended() {
    return role().order.filter(function (id) { return !state.passed[id]; }).slice(0, 3);
  }
  function lastLabel() {
    if (!state.last) return null;
    var p = state.last.replace(/^#\/?/, '').split('/');
    var m = MOD[p[1]]; if (!m) return null;
    if (p[0] === 'check') return m.num + '. ' + m.title + ': Check';
    return m.num + '. ' + m.title + ': Step ' + (parseInt(p[2], 10) || state.step[m.id] || 1);
  }
  function renderHome() {
    var passedCount = MODULES.filter(function (m) { return state.passed[m.id]; }).length;
    var pct = Math.round(passedCount / MODULES.length * 100);
    var r = role();
    var h = '<h1>Plant Trainer</h1>';
    h += '<p>Plain-English training support for plant operators, console and field. Pressure, DP, P&amp;IDs, pumps, valves, vacuum, filtration, and LOTO, taught from the floor up. Free, and it works without internet once it is on your device.</p>';
    h += '<div class="card disclaimer" id="disclaimer"><strong>&#9888; Training support only.</strong> This app does not qualify anyone for a job or task, and it does not replace your site procedures, P&amp;IDs, permits, or LOTO. All tags and numbers are generic examples, not real setpoints. When in doubt, stop and ask.</div>';
    h += '<div class="card"><h2 style="margin-top:0">Your progress</h2><p><strong>' + passedCount + ' of ' + MODULES.length + '</strong> section Checks passed</p><div class="progressbar" aria-label="' + pct + ' percent of Checks passed"><span style="width:' + pct + '%"></span></div>';
    var ll = lastLabel();
    if (ll) h += '<div class="btn-row"><a class="btn btn-amber" id="continueBtn" href="' + esc(state.last) + '">&#9654; Continue where you left off: ' + esc(ll) + '</a></div>';
    else h += '<div class="btn-row"><a class="btn btn-amber" id="continueBtn" href="#/m/' + recommended().concat(['pressure'])[0] + '">&#9654; Start with ' + esc(MOD[recommended().concat(['pressure'])[0]].title) + '</a></div>';
    h += '</div>';

    h += '<div class="card"><h2 style="margin-top:0">I am a…</h2><div class="chips" role="group" aria-label="Choose your role">';
    ROLES.forEach(function (x) { h += '<button type="button" class="chip role-chip" data-role="' + x.id + '" aria-pressed="' + (x.id === state.role) + '">' + esc(x.label) + '</button>'; });
    h += '</div><p class="fig-note">Your role only changes the recommended list and which lesson box is highlighted. Everything stays open to everyone.</p>';
    var rec = recommended();
    h += '<h3>Recommended next for ' + esc(r.label) + '</h3>';
    if (rec.length) {
      h += '<ol class="rec-list" id="recList">';
      rec.forEach(function (id) { var m = MOD[id]; h += '<li><a href="#/m/' + id + '"><span class="side-num">' + m.num + '</span>' + esc(m.title) + ' <span class="status ' + statusOf(id) + '" style="margin:0 0 0 auto">' + STATUS_LABEL[statusOf(id)] + '</span></a></li>'; });
      h += '</ol>';
    } else h += '<p>Every section Check is passed on this device. Nice work. Keep sharp with the Practice games, and keep following your site procedures.</p>';
    h += '</div>';

    h += '<div class="card"><h2 style="margin-top:0">&#128172; Ask Plant Mentor</h2><p>Tap a question. Answers come from notes built into this app.</p><div class="chips">';
    HOME_CHIPS.forEach(function (c) { h += '<button type="button" class="chip mentor-chip" data-slug="' + c.slug + '" data-label="' + esc(c.label) + '">' + esc(c.label) + '</button>'; });
    h += '</div></div>';

    GROUPS.forEach(function (g) {
      h += '<h2>' + esc(g.title) + '</h2><div class="grid">';
      MODULES.filter(function (m) { return m.group === g.id; }).forEach(function (m) {
        var s = statusOf(m.id);
        h += '<a class="mod-card' + (s === 'pass' ? ' passed' : '') + '" href="#/m/' + m.id + '" data-mod="' + m.id + '"><h3>' + m.num + '. ' + esc(m.title) + (s === 'pass' ? ' <span class="state-pass">&#10004;</span>' : '') + '</h3><p>' + esc(m.summary) + '</p><span class="status ' + s + '">' + STATUS_LABEL[s] + '</span></a>';
      });
      h += '</div>';
    });
    h += '<h2>Practice</h2><div class="grid"><a class="mod-card" href="#/practice/valve"><h3>&#9881; Name that valve</h3><p>See a symbol or a job, pick the valve type. Instant feedback.</p></a><a class="mod-card" href="#/practice/trace"><h3>&#10148; Trace the flow / first look</h3><p>Click the first thing you would look at on a live system drawing.</p></a></div>';

    h += '<div class="card" id="resetCard" style="margin-top:28px"><h2 style="margin-top:0">Reset my progress</h2><p>Clears checkmarks, quiz levels, and your place in every lesson on this device.</p><div id="resetArea"><button type="button" class="btn btn-danger" id="resetBtn">Reset my progress</button></div></div>';
    main.innerHTML = h;
  }

  function renderSections() {
    var h = '<h1>Sections</h1><p>Open anything, any time. A section gets its green checkmark when you pass its Check (4 of 5).</p>';
    GROUPS.forEach(function (g) {
      h += '<h2>' + esc(g.title) + '</h2><ul class="rec-list">';
      MODULES.filter(function (m) { return m.group === g.id; }).forEach(function (m) {
        h += '<li><a href="#/m/' + m.id + '"><span class="side-num">' + m.num + '</span>' + esc(m.title) + stateMark(m.id) + '</a></li>';
      });
      h += '</ul>';
    });
    h += '<h2>Practice</h2><ul class="rec-list"><li><a href="#/practice/valve">&#9881; Name that valve</a></li><li><a href="#/practice/trace">&#10148; Trace the flow / first look</a></li></ul>';
    main.innerHTML = h;
  }

  /* ---------------- Lesson ---------------- */
  function stepsNav(id, cur) {
    var steps = STEPS[id], h = '<nav class="steps-nav" aria-label="Lesson steps">';
    steps.forEach(function (s, i) { h += '<a href="#/m/' + id + '/' + (i + 1) + '"' + (cur === i + 1 ? ' class="cur" aria-current="step"' : '') + ' title="' + esc(s.title) + '">' + (i + 1) + '</a>'; });
    h += '<a class="check' + (cur === 'check' ? ' cur' : '') + '" href="#/check/' + id + '">' + (state.passed[id] ? '&#10004; ' : '') + 'Check</a></nav>';
    return h;
  }
  function renderLesson(id, n) {
    var m = MOD[id], steps = STEPS[id];
    n = Math.max(1, Math.min(steps.length, n));
    var s = steps[n - 1];
    state.opened[id] = true; state.step[id] = n; save();
    var emph = role().emphasis;
    var h = '<div class="crumbs"><a href="#/home">Home</a> › ' + esc(groupTitle(m.group)) + ' › Section ' + m.num + '</div>';
    h += '<h1>' + m.num + '. ' + esc(m.title) + (state.passed[id] ? ' <span class="state-pass" title="Check passed">&#10004;</span>' : '') + '</h1>';
    h += stepsNav(id, n);
    h += '<h2 id="stepTitle">Step ' + n + ' of ' + steps.length + ': ' + esc(s.title) + '</h2>';
    if (n === 1 || n === steps.length) h += '<div class="field-warn" role="note"><strong>&#9888; Field reality:</strong> ' + esc(m.fieldReality) + '</div>';
    h += '<section class="block b-floor"><h3>Start on the floor</h3><p>' + s.floor + '</p></section>';
    h += '<section class="block b-words"><h3>Plant words</h3><p>' + s.words + '</p></section>';
    h += '<section class="block b-pic"><h3>Picture it</h3>' + s.pic + '</section>';
    h += '<section class="block b-bite"><h3>&#127769; Night-shift bite</h3><p>' + s.bite + '</p></section>';
    h += '<section class="block b-head"><h3>Check your head (not scored)</h3><p><strong>' + esc(s.head.q) + '</strong></p><button type="button" class="btn btn-small reveal-btn" aria-expanded="false">Show answer</button><div class="reveal-answer" hidden>' + esc(s.head.a) + '</div></section>';
    h += '<details class="lead' + (emph === 'operator' ? ' emph' : '') + '" open><summary>&#128736; Operator action</summary><div class="lead-body"><ul>' + m.operatorAction.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div></details>';
    h += '<details class="lead' + (emph === 'supervise' ? ' emph' : '') + '"' + (emph === 'supervise' ? ' open' : '') + '><summary>&#128101; If you supervise this: how to coach this</summary><div class="lead-body"><p><strong>Coaching question:</strong> ' + esc(m.supervise.coach) + '</p><p><strong>Stop the job if…</strong> ' + esc(m.supervise.stop) + '</p></div></details>';
    h += '<div class="btn-row">';
    if (n > 1) h += '<a class="btn" href="#/m/' + id + '/' + (n - 1) + '">&#8592; Back</a>';
    if (n < steps.length) h += '<a class="btn btn-amber" id="nextBtn" href="#/m/' + id + '/' + (n + 1) + '">Next: ' + esc(steps[n].title) + ' &#8594;</a>';
    else h += '<a class="btn btn-green" id="nextBtn" href="#/check/' + id + '">Take the Check &#8594;</a>';
    h += '</div>';
    main.innerHTML = h;
  }

  /* ---------------- Adaptive Check quiz ---------------- */
  function bank(id) { return QUESTIONS[id]; }
  function pickQuestion(id, q, target, dir) {
    var b = bank(id), recent = state.recent[id] || [];
    var avail = range(b.length).filter(function (i) { return q.asked.indexOf(i) < 0; });
    var best = null, bestScore = 1e9;
    shuffle(avail).forEach(function (i) {
      var d = b[i].difficulty, diff = Math.abs(d - target);
      var score = diff * 10;
      if (diff && dir < 0 && d > target) score += 3;        // after a miss, prefer easier fallbacks
      if (diff && dir > 0 && d < target) score += 3;        // after a hit, prefer harder fallbacks
      if (recent.indexOf(i) >= 0) score += 1;               // prefer questions not seen last attempt
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  }
  function startQuiz(id) {
    var q = { target: skillOf(id), asked: [], results: [], current: null, done: false };
    state.quiz[id] = q;
    nextQuestion(id, 0);
  }
  function nextQuestion(id, dir) {
    var q = state.quiz[id];
    var idx = pickQuestion(id, q, q.target, dir);
    q.asked.push(idx);
    q.current = { idx: idx, order: shuffle(range(bank(id)[idx].choices.length)), picked: null };
    save();
  }
  function renderCheck(id) {
    var m = MOD[id], q = state.quiz[id];
    state.opened[id] = true; save();
    var h = '<div class="crumbs"><a href="#/home">Home</a> › ' + esc(groupTitle(m.group)) + ' › Section ' + m.num + '</div>';
    h += '<h1>' + m.num + '. ' + esc(m.title) + ': Check</h1>' + stepsNav(id, 'check');
    if (!q) {
      if (state.passed[id]) h += '<div class="card"><p class="state-pass" style="font-size:1.2rem;font-weight:800">&#10004; Check passed on this device.</p><p>You can retake it any time for practice. Your checkmark stays.</p></div>';
      h += '<div class="card"><p><strong>5 scored questions.</strong> Pass with 4 of 5 to get the green checkmark.</p><p>The Check adapts: get one right and the next is a bit harder, miss one and you get the explanation right away and an easier next question.</p><p>Your level for this section: <strong>' + skillOf(id) + ' of 3</strong>.</p><div class="btn-row"><button type="button" class="btn btn-amber" id="startQuiz">Start the Check</button><a class="btn" href="#/m/' + id + '/1">Review the lesson first</a></div></div>';
      main.innerHTML = h; return;
    }
    if (q.done) { main.innerHTML = h + resultHTML(id, q); return; }
    var cq = bank(id)[q.current.idx], num = q.results.length + (q.current.picked !== null ? 0 : 1);
    num = Math.min(q.results.length + 1, QUIZ_LEN);
    if (q.current.picked !== null) num = q.results.length;
    h += '<div class="card" id="quizCard" data-qidx="' + q.current.idx + '" data-difficulty="' + cq.difficulty + '">';
    h += '<div class="quiz-meta"><span>Question ' + num + ' of ' + QUIZ_LEN + '</span><span class="pill lvl" id="qLevel">Level ' + cq.difficulty + '</span><span class="dots" aria-label="Score so far">' + range(QUIZ_LEN).map(function (i) { var r = q.results[i]; return '<span class="dot' + (r === true ? ' ok' : r === false ? ' bad' : '') + '"></span>'; }).join('') + '</span></div>';
    h += '<p class="q-text" id="qText">' + esc(cq.q) + '</p><div class="choices" role="group" aria-label="Answer choices">';
    var answered = q.current.picked !== null;
    q.current.order.forEach(function (ci) {
      var cls = 'choice';
      if (answered && ci === cq.answer) cls += ' correct';
      if (answered && ci === q.current.picked && ci !== cq.answer) cls += ' wrong';
      h += '<button type="button" class="' + cls + '" data-choice="' + ci + '"' + (answered ? ' disabled' : '') + '>' + esc(cq.choices[ci]) + '</button>';
    });
    h += '</div>';
    if (answered) {
      var right = q.current.picked === cq.answer;
      h += '<div class="feedback ' + (right ? 'ok' : 'bad') + '" id="feedback" role="alert"><strong>' + (right ? '&#10004; Right.' : '&#10008; Not quite.') + '</strong> ' + esc(cq.explain);
      if (!right) h += '<div class="btn-row"><a class="btn btn-small" id="reviewLink" href="#/m/' + id + '/' + cq.lessonStep + '">&#8617; Review this idea (Step ' + cq.lessonStep + ')</a></div>';
      h += '</div><div class="btn-row"><button type="button" class="btn btn-amber" id="nextQ">' + (q.results.length >= QUIZ_LEN ? 'See my result' : 'Next question &#8594;') + '</button></div>';
    }
    h += '</div>';
    main.innerHTML = h;
  }
  function answer(id, ci) {
    var q = state.quiz[id]; if (!q || q.current.picked !== null) return;
    var cq = bank(id)[q.current.idx];
    q.current.picked = ci;
    var right = ci === cq.answer;
    q.results.push(right);
    q.target = right ? Math.min(3, cq.difficulty + 1) : Math.max(1, cq.difficulty - 1);
    save(); renderCheck(id);
    var fb = $('#feedback'); if (fb) fb.scrollIntoView({ block: 'nearest' });
  }
  function advance(id) {
    var q = state.quiz[id];
    if (q.results.length >= QUIZ_LEN) { finish(id); return; }
    var lastRight = q.results[q.results.length - 1];
    nextQuestion(id, lastRight ? 1 : -1);
    renderCheck(id);
  }
  function finish(id) {
    var q = state.quiz[id];
    var score = q.results.filter(Boolean).length;
    q.done = true; q.score = score;
    state.recent[id] = q.asked.slice();
    if (score >= PASS_SCORE) {
      state.passed[id] = true;
      state.skill[id] = Math.min(3, skillOf(id) + 1);
      q.passed = true;
      save(); renderCheck(id); renderSidebar(location.hash);
      toast(PASS_TOAST);
    } else {
      state.skill[id] = Math.max(1, skillOf(id) - 1);
      q.passed = false;
      save(); renderCheck(id); renderSidebar(location.hash);
    }
  }
  function resultHTML(id, q) {
    var h;
    if (q.passed) {
      h = '<div class="card result pass" id="quizResult" data-result="pass"><div class="big">&#10004; ' + q.score + ' / ' + QUIZ_LEN + '</div><p style="font-size:1.2rem;font-weight:800">Section complete: support training only.</p><p>The green checkmark is saved on this device. It means you passed this practice Check, nothing more. Your site decides who is qualified.</p>';
      var nxt = recommended()[0];
      h += '<div class="btn-row" style="justify-content:center">' + (nxt ? '<a class="btn btn-amber" href="#/m/' + nxt + '">Next: ' + esc(MOD[nxt].title) + ' &#8594;</a>' : '') + '<a class="btn" href="#/home">Home</a><button type="button" class="btn" id="retryQuiz">Practice again</button></div></div>';
    } else {
      h = '<div class="card result fail" id="quizResult" data-result="fail"><div class="big">' + q.score + ' / ' + QUIZ_LEN + '</div><p style="font-size:1.2rem;font-weight:800">Not yet. You need 4 of 5.</p><p>This section stays open. Your level for this section is now <strong>' + skillOf(id) + ' of 3</strong>, so the next try starts a little easier. Review the steps you missed, then try again. Answers get shuffled.</p><div class="btn-row" style="justify-content:center"><button type="button" class="btn btn-amber" id="retryQuiz">Try the Check again</button><a class="btn" href="#/m/' + id + '/1">Review the lesson</a></div></div>';
    }
    return h;
  }

  /* ---------------- Plant Mentor ---------------- */
  var STOP = ('a an the is are was were be been of to in on at for and or but if then so do does did how what why when where which who whom this that these those it its i we you my our your me us can could should would will with from by about as into than too very just there here have has had get got our s').split(' ');
  function tokens(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9\-&\s]/g, ' ').split(/\s+/).filter(function (t) { return t && STOP.indexOf(t) < 0; });
  }
  function scoreEntry(slug, e, qtext, toks) {
    var s = 0, lower = ' ' + qtext.toLowerCase() + ' ';
    var slugWords = slug.replace(/-/g, ' ');
    if (lower.indexOf(' ' + slug + ' ') >= 0 || lower.indexOf(slugWords) >= 0) s += 5;
    e.tags.forEach(function (tag) {
      if (tag.indexOf(' ') >= 0) { if (lower.indexOf(tag) >= 0) s += 3; }
      else if (toks.indexOf(tag) >= 0) s += 2;
      else toks.forEach(function (t) { if (t.length > 3 && (t.indexOf(tag) === 0 || tag.indexOf(t) === 0) && Math.abs(t.length - tag.length) <= 3) s += 1; });
    });
    tokens(e.title).forEach(function (w) { if (w.length > 2 && toks.indexOf(w) >= 0) s += 1; });
    return s;
  }
  function searchKB(text) {
    var toks = tokens(text), results = [];
    Object.keys(KB).forEach(function (slug) { var sc = scoreEntry(slug, KB[slug], text, toks); if (sc > 0) results.push({ slug: slug, score: sc }); });
    results.sort(function (a, b) { return b.score - a.score; });
    return results;
  }
  function closestModules(text) {
    var toks = tokens(text), res = [];
    MODULES.forEach(function (m) {
      var s = 0;
      m.keywords.forEach(function (k) { if (toks.indexOf(k) >= 0) s += 2; });
      tokens(m.title + ' ' + m.summary).forEach(function (w) { if (w.length > 3 && toks.indexOf(w) >= 0) s += 1; });
      if (s) res.push({ id: m.id, s: s });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    var ids = res.slice(0, 3).map(function (r) { return r.id; });
    if (!ids.length) ids = recommended().length ? recommended() : ['pressure', 'dp', 'pid'];
    return ids;
  }
  function moduleContext() {
    var id = currentModule;
    if (id) return 'Section ' + MOD[id].num + ': ' + MOD[id].title;
    var hash = location.hash || '';
    if (hash.indexOf('#/practice') === 0) return 'Practice games';
    return 'Home (no specific section)';
  }
  function grokPrompt(question) {
    return 'You are helping a manufacturing plant operator.\n' +
      'Explain bottom-up and simply. Do not invent site procedures or setpoints.\n' +
      'Module context: ' + moduleContext() + '\n' +
      'Question: ' + question;
  }
  function copyText(text) {
    window.__lastCopied = text;
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }
  function askGrok(question, msgEl) {
    var p = grokPrompt(question);
    copyText(p).then(function (ok) {
      toast(ok ? GROK_TOAST : 'Could not copy automatically. Select the text in the box and copy it.');
    });
    if (msgEl && !msgEl.querySelector('textarea.grok-text')) {
      var d = document.createElement('div'); d.className = 'extra';
      d.innerHTML = '<strong>Prompt for your Grok bot</strong> (already copied if your device allows it):<textarea class="grok-text" readonly aria-label="Prompt to paste into Grok"></textarea>';
      d.querySelector('textarea').value = p;
      msgEl.appendChild(d);
    }
  }

  var msgCounter = 0;
  function addMsg(cls, html) {
    var d = document.createElement('div');
    d.className = 'msg ' + cls; d.id = 'msg' + (++msgCounter); d.innerHTML = html;
    mentorLog.appendChild(d);
    mentorLog.scrollTop = mentorLog.scrollHeight;
    try { d.scrollIntoView({ block: 'nearest' }); } catch (e) { }
    return d;
  }
  function actionsHTML(slug, question) {
    return '<div class="msg-actions">' +
      (slug ? '<button type="button" class="btn act-simpler" data-slug="' + slug + '">Say it even simpler</button><button type="button" class="btn act-super" data-slug="' + slug + '">Supervisor take</button>' : '') +
      '<button type="button" class="btn btn-amber act-grok" data-q="' + esc(question) + '">Ask Grok</button></div>';
  }
  function showKB(slug, userText) {
    var e = KB[slug]; if (!e) return;
    openMentor();
    addMsg('user', esc(userText));
    var m = MOD[e.module];
    var html = '<h4>' + esc(e.title) + '</h4><p>' + esc(e.answer) + '</p>';
    if (m) html += '<p><a class="lesson-link" href="#/m/' + m.id + '/' + e.step + '">&#128214; Open the lesson: ' + m.num + '. ' + esc(m.title) + ', Step ' + e.step + '</a></p>';
    var msg = addMsg('bot', html + actionsHTML(slug, userText));
    msg.setAttribute('data-slug', slug);
    return msg;
  }
  function askTyped(text) {
    text = text.trim(); if (!text) return;
    var res = searchKB(text);
    if (res.length && res[0].score >= 3) { showKB(res[0].slug, text); return; }
    openMentor();
    addMsg('user', esc(text));
    var mods = closestModules(text);
    var html = '<p>I don\'t have that memorized. Closest lessons: ' + mods.map(function (id) { return '<a href="#/m/' + id + '">' + MOD[id].num + '. ' + esc(MOD[id].title) + '</a>'; }).join(', ') + '.</p>';
    if (res.length) html += '<p>Maybe related: ' + res.slice(0, 3).map(function (r) { return '<button type="button" class="chip kb-suggest" data-slug="' + r.slug + '">' + esc(KB[r.slug].title) + '</button>'; }).join(' ') + '</p>';
    html += '<p class="fig-note">If you don\'t know, say so. I won\'t guess at site procedures or setpoints. You can send this question to your Grok bot:</p>';
    addMsg('bot', html + actionsHTML(null, text));
  }
  function mentorGreeting() {
    var h = '<h4>Hi, I\'m Plant Mentor.</h4><p>I answer from notes built into this app, so I work with bad wifi or none. Tap a question, tap any <span class="term-demo" style="color:var(--amber);border-bottom:2px dotted var(--amber)">amber underlined word</span> in a lesson, or type your own.</p><div class="chips">';
    MENTOR_CHIPS.forEach(function (c) { h += '<button type="button" class="chip mentor-chip" data-slug="' + c.slug + '" data-label="' + esc(c.label) + '">' + esc(c.label) + '</button>'; });
    h += '</div><p class="fig-note">I\'m training support only. I never replace your procedures, permits, or LOTO.</p>';
    addMsg('bot', h);
  }
  function isNarrow() { return window.matchMedia('(max-width: 1180px)').matches; }
  function openMentor() {
    document.body.classList.add('mentor-open');
    $('#mentorToggle').setAttribute('aria-expanded', 'true');
  }
  function closeMentor() {
    document.body.classList.remove('mentor-open');
    $('#mentorToggle').setAttribute('aria-expanded', 'false');
  }
  function closeMentorIfMobile() { if (isNarrow()) closeMentor(); }

  /* ---------------- Practice games ---------------- */
  var VALVE_TYPES = [
    { id: 'gate', label: 'Gate' }, { id: 'globe', label: 'Globe' }, { id: 'ball', label: 'Ball' },
    { id: 'butterfly', label: 'Butterfly' }, { id: 'check', label: 'Check' }, { id: 'control', label: 'Control valve' }
  ];
  var BT = '<path class="eq" d="M60 60 L140 120 L140 60 L60 120 z"/>';
  var VALVE_SYMBOLS = {
    gate: BT,
    globe: BT + '<circle class="fillam" cx="100" cy="90" r="10"/>',
    ball: BT + '<circle class="bub" cx="100" cy="90" r="16"/>',
    butterfly: BT + '<path class="amb" d="M100 48 V132"/>',
    check: BT + '<path class="fillam" d="M100 90 L140 60 L140 120 z"/><path class="ln" d="M150 150 H190" /><text x="100" y="165" text-anchor="middle" class="sm">flow →</text>',
    control: '<path class="eq" d="M60 80 L140 140 L140 80 L60 140 z"/><path class="th" d="M100 110 V50"/><path class="eq" d="M70 50 A30 30 0 0 1 130 50 z"/><path class="sig" d="M130 35 H190"/>'
  };
  var VALVE_EXPLAIN = {
    gate: 'Gate valve: a flat gate slides across the pipe. Fully open or fully closed. Isolation, not throttling.',
    globe: 'Globe valve: a plug moves to a seat for smooth throttling. Most control valves are globe style.',
    ball: 'Ball valve: quarter-turn ball with a hole. Quick, tight isolation.',
    butterfly: 'Butterfly valve: a disk turns in the pipe. Compact and common on big, low-pressure lines like cooling water.',
    check: 'Check valve: one-way. Flow opens it, backflow shuts it. Not isolation.',
    control: 'Control valve: a throttling valve with an actuator, moved by a controller like FIC-101.'
  };
  var VALVE_JOBS = [
    { a: 'ball', q: 'Quick, tight quarter-turn isolation on a pump suction.' },
    { a: 'globe', q: 'You need to hand-throttle a small bypass flow smoothly for an hour.' },
    { a: 'check', q: 'Stop liquid running backward through a pump when it trips.' },
    { a: 'control', q: 'Hold flow at setpoint automatically from FIC-101.' },
    { a: 'gate', q: 'Full-bore, low-restriction isolation on a big process line. Open or shut, never half.' },
    { a: 'butterfly', q: 'A large cooling water line at low pressure where a compact, lower-cost valve fits.' },
    { a: 'check', q: 'A pump discharge needs something that works with no person, no air, and no signal to stop backflow.' }
  ];
  var vg = null;
  function newValveGame() {
    var sym = shuffle(Object.keys(VALVE_SYMBOLS)).slice(0, 4).map(function (k) { return { type: 'symbol', a: k }; });
    var jobs = shuffle(VALVE_JOBS).slice(0, 4).map(function (j) { return { type: 'job', a: j.a, q: j.q }; });
    vg = { rounds: shuffle(sym.concat(jobs)), i: 0, score: 0, picked: null, done: false };
  }
  function renderValveGame() {
    if (!vg) newValveGame();
    var h = '<div class="crumbs"><a href="#/home">Home</a> › Practice</div><h1>&#9881; Name that valve</h1><p>Practice only. It does not replace a section Check. A strong score can bump your Valves level by one.</p>';
    if (vg.done) {
      var total = vg.rounds.length;
      h += '<div class="card result pass" id="gameResult" data-game="valve"><div class="big">' + vg.score + ' / ' + total + '</div><p style="font-weight:800">Game complete.</p>';
      h += vg.bumped ? '<p>Strong score. Your Valves section level went up to ' + skillOf('valves') + ' of 3.</p>' : '<p>' + (vg.score >= 7 ? 'Strong score. Your Valves level is already at the top.' : 'Score 7 or more to bump your Valves level. Review Section 6 if any of these surprised you.') + '</p>';
      h += '<div class="btn-row" style="justify-content:center"><button type="button" class="btn btn-amber" id="valveAgain">Play again</button><a class="btn" href="#/m/valves">Valves lesson</a><a class="btn" href="#/practice/trace">Trace the flow</a></div></div>';
      main.innerHTML = h; return;
    }
    var r = vg.rounds[vg.i];
    h += '<div class="card" id="valveCard"><div class="quiz-meta"><span>Round ' + (vg.i + 1) + ' of ' + vg.rounds.length + '</span><span class="score">Score: ' + vg.score + '</span></div>';
    if (r.type === 'symbol') h += '<p class="game-q">What valve is this P&amp;ID symbol?</p><svg class="fig game-sym" viewBox="0 0 200 180" role="img" aria-label="Valve symbol">' + VALVE_SYMBOLS[r.a] + '</svg>';
    else h += '<p class="game-q">Which valve is right for this job?</p><p style="font-size:1.1rem">' + esc(r.q) + '</p>';
    h += '<div class="choices">';
    VALVE_TYPES.forEach(function (t) {
      var cls = 'choice';
      if (vg.picked) { if (t.id === r.a) cls += ' correct'; else if (t.id === vg.picked) cls += ' wrong'; }
      h += '<button type="button" class="' + cls + ' valve-choice" data-valve="' + t.id + '"' + (vg.picked ? ' disabled' : '') + '>' + t.label + '</button>';
    });
    h += '</div>';
    if (vg.picked) {
      var ok = vg.picked === r.a;
      h += '<div class="feedback ' + (ok ? 'ok' : 'bad') + '" id="gameFeedback"><strong>' + (ok ? '&#10004; Right.' : '&#10008; Not this time.') + '</strong> ' + esc(VALVE_EXPLAIN[r.a]) + '</div><div class="btn-row"><button type="button" class="btn btn-amber" id="valveNext">' + (vg.i + 1 >= vg.rounds.length ? 'See my score' : 'Next round &#8594;') + '</button></div>';
    }
    h += '</div>';
    main.innerHTML = h;
  }

  var TRACE_PROMPTS = [
    { q: 'Filter PDT is high and flow is down. Click the first thing you look at.', ok: ['F-101', 'PDT-101'], show: 'F-101',
      explain: 'First look: the filter F-101 and its DP (PDT-101). High DP with low flow points at a restriction right there. Confirm it is real with a second reading: pump discharge PIT-102 should be a bit higher than normal and P-101 amps a bit lower. FV-101 is probably opening wide to make up for the filter, so do not chase the valve. Plan a swap or clean per procedure, and never open the housing under pressure.' },
    { q: 'Vacuum is falling and the knockout pot level is high. Click first look.', ok: ['KO-101'], show: 'KO-101',
      explain: 'First look: the knockout pot KO-101. A high level means liquid is not draining and is likely carrying over into vacuum pump VP-101, which chokes the liquid ring and weakens vacuum. Check the pot drain valve and line (a closed drain after a job is a classic). Then work back: condenser E-101 cooling water (more liquid and vapor load) and the seal water to VP-101. One change at a time.' },
    { q: 'Flow is low, FV-101 is 100% open, and pump discharge pressure is low and jumpy. Click first look.', ok: ['PIT-101', 'T-101'], show: 'PIT-101',
      explain: 'First look: the suction side, PIT-101 and tank T-101 level. Low, jumpy discharge with the control valve wide open says the pump is starving, not that the filter is plugged (filter plugging would push discharge pressure UP). Check tank level, the suction valve line-up, and the suction strainer. Listen for cavitation (gravel). Opening anything further downstream will not help.' }
  ];
  var tg = null;
  function newTraceGame() { tg = { i: 0, score: 0, picked: null, done: false }; }
  function renderTraceGame() {
    if (!tg) newTraceGame();
    var h = '<div class="crumbs"><a href="#/home">Home</a> › Practice</div><h1>&#10148; Trace the flow / first look</h1><p>Practice only. Read the prompt, then click the one thing on the drawing you would look at first. A perfect run can bump your Section 9 level by one.</p>';
    if (tg.done) {
      h += '<div class="card result pass" id="gameResult" data-game="trace"><div class="big">' + tg.score + ' / ' + TRACE_PROMPTS.length + '</div><p style="font-weight:800">Game complete.</p>';
      h += tg.bumped ? '<p>Perfect first looks. Your "Flow, pressure, and vacuum together" level went up to ' + skillOf('together') + ' of 3.</p>' : '<p>The habit that matters: find what moved first, confirm it with a second reading, change one thing.</p>';
      h += '<div class="btn-row" style="justify-content:center"><button type="button" class="btn btn-amber" id="traceAgain">Play again</button><a class="btn" href="#/m/together">Section 9 lesson</a><a class="btn" href="#/practice/valve">Name that valve</a></div></div>';
      main.innerHTML = h; return;
    }
    var p = TRACE_PROMPTS[tg.i];
    h += '<div class="card" id="traceCard"><div class="quiz-meta"><span>Prompt ' + (tg.i + 1) + ' of ' + TRACE_PROMPTS.length + '</span><span class="score">Score: ' + tg.score + '</span></div><p class="game-q" id="tracePrompt">' + esc(p.q) + '</p>';
    h += '<div class="trace-board" id="traceBoard">' + SYSTEM_SVG + '</div>';
    if (tg.picked) {
      var ok = p.ok.indexOf(tg.picked) >= 0;
      h += '<div class="feedback ' + (ok ? 'ok' : 'bad') + '" id="gameFeedback"><strong>' + (ok ? '&#10004; Good first look (' + esc(tg.picked) + ').' : '&#10008; You picked ' + esc(tg.picked) + '. Not the first look.') + '</strong> ' + esc(p.explain) + '</div><div class="btn-row"><button type="button" class="btn btn-amber" id="traceNext">' + (tg.i + 1 >= TRACE_PROMPTS.length ? 'See my score' : 'Next prompt &#8594;') + '</button></div>';
    } else h += '<p class="fig-note">Tap a symbol: tank, pump, instrument bubble, filter, valve, vessel, condenser, pot, or vacuum pump.</p>';
    h += '</div>';
    main.innerHTML = h;
    var board = $('#traceBoard');
    $$('[data-part]', board).forEach(function (g) {
      g.classList.remove('svg-term'); g.removeAttribute('data-term');
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', 'Look at ' + g.getAttribute('data-part'));
    });
    if (tg.picked) {
      var pk = board.querySelector('[data-part="' + tg.picked + '"]'); if (pk) pk.classList.add('picked');
      p.ok.forEach(function (o) { var el = board.querySelector('[data-part="' + o + '"]'); if (el) { el.classList.remove('picked'); el.classList.add('right'); } });
    }
  }
  function renderPractice() {
    main.innerHTML = '<h1>Practice</h1><p>Two short games. They never replace a section Check, have no timers, and keep no leaderboard.</p><div class="grid"><a class="mod-card" href="#/practice/valve"><h3>&#9881; Name that valve</h3><p>Symbol or job, pick the type.</p></a><a class="mod-card" href="#/practice/trace"><h3>&#10148; Trace the flow / first look</h3><p>Click your first look on a live drawing.</p></a></div>';
  }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var el;
    // Trace game clicks (handled before terms)
    if ((el = t.closest('#traceBoard [data-part]'))) {
      if (!tg.picked) {
        tg.picked = el.getAttribute('data-part');
        if (TRACE_PROMPTS[tg.i].ok.indexOf(tg.picked) >= 0) tg.score++;
        renderTraceGame();
      }
      return;
    }
    if ((el = t.closest('#main .term, #main .svg-term'))) {
      var slug = el.getAttribute('data-term');
      if (KB[slug]) showKB(slug, 'Explain: ' + (el.getAttribute('data-part') || el.textContent.trim()));
      return;
    }
    if ((el = t.closest('.mentor-chip, .kb-suggest'))) { showKB(el.getAttribute('data-slug'), el.getAttribute('data-label') || el.textContent); return; }
    if ((el = t.closest('.act-simpler'))) {
      var m1 = el.closest('.msg'); var e1 = KB[el.getAttribute('data-slug')];
      if (!m1.querySelector('.x-simpler')) { var d1 = document.createElement('div'); d1.className = 'extra x-simpler'; d1.innerHTML = '<strong>Even simpler:</strong> ' + esc(e1.simpler); m1.appendChild(d1); }
      return;
    }
    if ((el = t.closest('.act-super'))) {
      var m2 = el.closest('.msg'); var e2 = KB[el.getAttribute('data-slug')];
      if (!m2.querySelector('.x-super')) { var d2 = document.createElement('div'); d2.className = 'extra x-super'; var mm = MOD[e2.module]; d2.innerHTML = '<strong>Supervisor take:</strong> ' + esc(e2.supervisor) + (mm ? '<br><strong>Stop the job if…</strong> ' + esc(mm.supervise.stop) : ''); m2.appendChild(d2); }
      return;
    }
    if ((el = t.closest('.act-grok'))) { askGrok(el.getAttribute('data-q'), el.closest('.msg')); return; }
    if ((el = t.closest('#mentorLog a[href^="#/"]'))) { if (isNarrow()) closeMentor(); return; }
    if ((el = t.closest('.role-chip'))) { state.role = el.getAttribute('data-role'); save(); renderHome(); toast('Role set: ' + role().label + '. Nothing is hidden.'); return; }
    if ((el = t.closest('.reveal-btn'))) {
      var ans = el.nextElementSibling; ans.hidden = !ans.hidden; el.setAttribute('aria-expanded', String(!ans.hidden)); el.textContent = ans.hidden ? 'Show answer' : 'Hide answer'; return;
    }
    if (t.closest('#startQuiz')) { startQuiz(currentModule); renderCheck(currentModule); return; }
    if ((el = t.closest('.choice[data-choice]'))) { answer(currentModule, parseInt(el.getAttribute('data-choice'), 10)); return; }
    if (t.closest('#nextQ')) { advance(currentModule); return; }
    if (t.closest('#retryQuiz')) { startQuiz(currentModule); renderCheck(currentModule); return; }
    if ((el = t.closest('.valve-choice'))) {
      if (!vg.picked) { vg.picked = el.getAttribute('data-valve'); if (vg.picked === vg.rounds[vg.i].a) vg.score++; renderValveGame(); }
      return;
    }
    if (t.closest('#valveNext')) {
      vg.i++; vg.picked = null;
      if (vg.i >= vg.rounds.length) {
        vg.done = true;
        state.games.valve = { best: Math.max(vg.score, (state.games.valve || {}).best || 0), last: vg.score };
        if (vg.score >= 7 && skillOf('valves') < 3) { state.skill.valves = skillOf('valves') + 1; vg.bumped = true; }
        save();
      }
      renderValveGame(); return;
    }
    if (t.closest('#valveAgain')) { newValveGame(); renderValveGame(); return; }
    if (t.closest('#traceNext')) {
      tg.i++; tg.picked = null;
      if (tg.i >= TRACE_PROMPTS.length) {
        tg.done = true;
        state.games.trace = { best: Math.max(tg.score, (state.games.trace || {}).best || 0), last: tg.score };
        if (tg.score === TRACE_PROMPTS.length && skillOf('together') < 3) { state.skill.together = skillOf('together') + 1; tg.bumped = true; }
        save();
      }
      renderTraceGame(); return;
    }
    if (t.closest('#traceAgain')) { newTraceGame(); renderTraceGame(); return; }
    if (t.closest('#resetBtn')) {
      $('#resetArea').innerHTML = '<p><strong>Are you sure?</strong> This clears every checkmark and your place in every lesson on this device.</p><div class="btn-row"><button type="button" class="btn btn-danger" id="resetYes">Yes, reset my progress</button><button type="button" class="btn" id="resetNo">Cancel</button></div>';
      return;
    }
    if (t.closest('#resetNo')) { renderHome(); return; }
    if (t.closest('#resetYes')) {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { }
      state = defaults(); vg = null; tg = null; save();
      renderHome(); renderSidebar('#/home'); toast('Progress reset on this device.');
      return;
    }
    if ((el = t.closest('.bottombar button'))) {
      var nav = el.getAttribute('data-nav');
      if (nav === 'mentor') { if (document.body.classList.contains('mentor-open')) closeMentor(); else { openMentor(); } return; }
      closeMentor();
      if (nav === 'home') location.hash = '#/home';
      else if (nav === 'sections') location.hash = '#/sections';
      else if (nav === 'check') {
        var lastId = currentModule;
        if (!lastId && state.last) { var p = state.last.replace(/^#\/?/, '').split('/'); if (MOD[p[1]]) lastId = p[1]; }
        if (!lastId) lastId = recommended()[0] || 'pressure';
        location.hash = '#/check/' + lastId;
      }
      return;
    }
  });
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('.term, .svg-term, #traceBoard [data-part]')) {
      ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    if (ev.key === 'Escape' && document.body.classList.contains('mentor-open') && isNarrow()) closeMentor();
  });
  $('#mentorToggle').addEventListener('click', function () {
    if (isNarrow() && document.body.classList.contains('mentor-open')) closeMentor();
    else { openMentor(); $('#mentorInput').focus(); }
  });
  $('#mentorClose').addEventListener('click', closeMentor);
  $('#mentorGrok').addEventListener('click', function () {
    var inp = $('#mentorInput'), text = inp.value.trim();
    if (!text) { var users = $$('.msg.user', mentorLog); text = users.length ? users[users.length - 1].textContent : ''; }
    if (!text) { toast('Type your question first, then tap Ask Grok.'); inp.focus(); return; }
    inp.value = '';
    addMsg('user', esc(text));
    var msg = addMsg('bot', '<p>Sending this to your Grok bot is up to you. I copied a ready-made prompt with your question and the section you are in.</p>');
    askGrok(text, msg);
  });
  $('#mentorForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var inp = $('#mentorInput'); askTyped(inp.value); inp.value = '';
  });

  /* ---------------- Boot ---------------- */
  /* Small read-only hook for automated tests and debugging. */
  window.PlantTrainer = { get state() { return state; }, searchKB: searchKB, grokPrompt: grokPrompt, games: function () { return { valve: vg, trace: tg, tracePrompts: TRACE_PROMPTS }; } };
  mentorGreeting();
  route();
})();
