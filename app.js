// 社長めし 社長画面
// 状況（募集前／募集中／締切後／抽選後）に合わせて、押すボタンが1つ目立つ画面を出す。
(function () {
  'use strict';

  var CFG = window.SM_CONFIG || {};
  var $app = document.getElementById('app');
  var $reload = document.getElementById('reload');
  var $subtitle = document.getElementById('subtitle');
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var COLORS = ['#0F6E56', '#F2B33D', '#1D9E75', '#FBE3A6', '#5DCAA5', '#E8833A'];

  var S = {
    state: null,      // サーバーから来た今の状況
    view: '',         // '' ＝状況どおり／'new' ＝募集フォーム／'roulette'／'history' ＝これまでの社長めし
    history: null,    // これまでの社長めし（開いたときに読み込む）
    error: '',
    roulette: null,   // { steps, i, phase: 'ready'|'spinning'|'done', rot }
    draft: null       // 募集フォームの入力途中
  };

  // ───────── 小物 ─────────

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(sel) { return $app.querySelector(sel); }
  function on(sel, fn) { var el = $(sel); if (el) el.addEventListener('click', fn); }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  function lineUrl(text) { return 'https://line.me/R/share?text=' + encodeURIComponent(text); }
  function copy(text) {
    var done = function () { toast('コピーしました'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { copyOld(text); done(); });
    } else { copyOld(text); done(); }
  }
  function copyOld(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 何もしない */ }
    ta.remove();
  }
  function ymdOf(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function jpDate(s) {
    var d = parseYmd(s);
    return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEK[d.getDay()] + '）' : '';
  }
  function initial(name) { return String(name || '').trim().charAt(0); }

  var ICON = {
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1-5H5z"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    line: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s5.8-3.4 7.9-5.9C21.3 14.4 22 12.8 22 11c0-4.4-4.5-8-10-8z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    spin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 6"/></svg>'
  };

  // ───────── サーバー ─────────

  /** 動作確認用（dev/index.html の中で ?dev を付けて開いたときだけ、偽のサーバーを使う） */
  function DEV_API() {
    try {
      return /[?&]dev\b/.test(location.search) && window.parent !== window && window.parent.SM_DEV_API;
    } catch (e) { return null; }
  }

  function api(action, args) {
    var body = { action: action, args: args || {}, key: store('sm_key') || '' };
    var p;
    var dev = DEV_API();
    if (dev) {
      p = new Promise(function (ok) { setTimeout(ok, 350); }).then(function () { return dev(body); });
    } else if (!CFG.apiUrl) {
      return Promise.reject(new Error('部長の設定（config.js の apiUrl）がまだです'));
    } else {
      p = fetch(CFG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // text/plain にすると事前確認（CORS）が要らない
        body: JSON.stringify(body),
        redirect: 'follow'
      }).then(function (r) {
        return r.text().then(function (t) {
          try { return JSON.parse(t); } catch (e) {
            throw new Error('受付の応答が読めませんでした（' + r.status + '）。少し時間をおいて、もう一度お試しください');
          }
        });
      }, function () {
        throw new Error('通信できませんでした。電波の良いところで、もう一度お試しください');
      });
    }
    return p.then(function (res) {
      if (res.ok) return res.data;
      var err = new Error(res.error || 'エラーが起きました');
      err.code = res.code;
      if (res.code === 'auth') { store('sm_key', null); S.state = null; }
      throw err;
    });
  }

  function load() {
    if (!store('sm_key')) { render(); return; }
    $reload.classList.add('spin');
    return api('state').then(function (st) {
      S.state = st; S.error = '';
      render();
    }, function (e) {
      S.error = e.message;
      render();
    }).then(function () { $reload.classList.remove('spin'); });
  }

  // ───────── 画面の切り替え ─────────

  function render() {
    var st = S.state;
    var logged = !!store('sm_key');
    $reload.hidden = !logged || S.view === 'roulette';
    $subtitle.textContent = st && st.round && S.view !== 'new' && S.view !== 'history' && !(st.stage === 'drawn' && st.ended) ? st.round.id + 'の回' : '社長とスタッフの食事会';

    if (!logged) return renderLogin();
    if (S.view === 'roulette') return renderRoulette();
    if (S.view === 'history') return renderHistory();
    if (!st) {
      $app.innerHTML = S.error ? errBox() + '<button class="btn ghost" id="retry">もう一度読み込む</button>' : '<div class="spinner"></div>';
      on('#retry', load);
      return;
    }
    if (S.view === 'new' || st.stage === 'idle' || (st.stage === 'drawn' && st.ended)) return renderNew();
    if (st.stage === 'open') return renderOpen();
    if (st.stage === 'closed') return renderClosed();
    if (st.stage === 'drawn') return renderDrawn();
  }

  function errBox() { return S.error ? '<div class="err">' + esc(S.error) + '</div>' : ''; }

  function infoRows(r) {
    return '<div class="info">' +
      ICON.cal + '<div>' + esc(r.date) + '〜</div>' +
      ICON.shop + '<div>' + esc(r.shop) + (r.genre ? '<span class="muted">（' + esc(r.genre) + '）</span>' : '') + '</div>' +
      (r.url ? ICON.link + '<div><a href="' + esc(r.url) + '" target="_blank" rel="noopener">お店のページ</a></div>' : '') +
      ICON.clock + '<div>応募締切：' + esc(r.deadline) + '</div>' +
      '</div>';
  }

  function shareButtons(text, label) {
    return '<div class="btn-row">' +
      '<a class="btn line" data-line href="' + esc(lineUrl(text)) + '" target="_blank" rel="noopener">' + ICON.line + esc(label) + '</a>' +
      '<button class="btn ghost" data-copy>' + ICON.copy + 'コピー</button>' +
      '</div>';
  }
  function bindCopy(text) {
    Array.prototype.forEach.call($app.querySelectorAll('[data-copy]'), function (b) {
      b.addEventListener('click', function () { copy(text); });
    });
  }

  // ───────── 合言葉 ─────────

  function renderLogin() {
    $app.innerHTML =
      '<div class="card hero">' +
      '<div class="eyebrow">ようこそ</div>' +
      '<h2 class="maru">合言葉を入れてください</h2>' +
      '<p class="muted">部長から聞いた合言葉です。<br>この端末では次から入力しなくて大丈夫です。</p>' +
      errBox() +
      '<input type="password" id="key" autocomplete="current-password" placeholder="合言葉" style="text-align:center">' +
      '<button class="btn primary" id="enter">入る</button>' +
      '</div>';
    var input = $('#key');
    var go = function () {
      var k = input.value.trim();
      if (!k) { S.error = '合言葉を入れてください'; return renderLogin(); }
      store('sm_key', k);
      S.error = '';
      $app.innerHTML = '<div class="spinner"></div>';
      load();
    };
    on('#enter', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  // ───────── 募集フォーム ─────────

  function renderNew() {
    var st = S.state;
    var d = S.draft || (S.draft = { date: '', time: '19:00', shop: '', genre: '', url: '', deadline: '', deadlineTouched: false });
    var back = S.view === 'new' && st.stage === 'drawn' && !st.ended;
    var prev = st.stage === 'drawn' && st.ended
      ? '<div class="note">' + esc(st.round.id) + '（' + esc(st.round.shop) + '）はおつかれさまでした。次の回の募集をどうぞ。</div>' : '';
    $app.innerHTML =
      errBox() +
      '<div class="card">' +
      '<div class="center"><span class="pill">次の回</span></div>' +
      '<h2 class="maru center" style="margin:8px 0 2px;font-size:22px">社長めしの募集を始める</h2>' +
      '<p class="muted center" style="margin:0">お店と日にちを入れるだけです</p>' +
      prev +
      '<label class="f" for="f-date">日にち</label>' +
      '<div class="row2"><input type="date" id="f-date" min="' + esc(st.today) + '" value="' + esc(d.date) + '">' +
      '<input type="time" id="f-time" value="' + esc(d.time) + '" step="900"></div>' +
      '<div class="hint" id="h-date">' + esc(jpDate(d.date)) + '</div>' +
      '<label class="f" for="f-shop">お店の名前</label>' +
      '<input type="text" id="f-shop" value="' + esc(d.shop) + '" autocomplete="off">' +
      '<label class="f" for="f-genre">ジャンル<span class="opt">なくてもOK</span></label>' +
      '<input type="text" id="f-genre" value="' + esc(d.genre) + '" autocomplete="off">' +
      '<label class="f" for="f-url">お店のページ<span class="opt">なくてもOK</span></label>' +
      '<input type="url" id="f-url" value="' + esc(d.url) + '" placeholder="https://" autocomplete="off" inputmode="url">' +
      '<label class="f" for="f-deadline">応募の締切</label>' +
      '<input type="date" id="f-deadline" min="' + esc(st.today) + '" value="' + esc(d.deadline) + '">' +
      '<div class="hint" id="h-deadline"></div>' +
      '<button class="btn primary" id="start">募集を始める</button>' +
      (back ? '<button class="link" id="back">もどる</button>' : '') +
      '</div>' + footer();

    var fDate = $('#f-date'), fDeadline = $('#f-deadline');
    var sync = function () {
      d.date = fDate.value; d.time = $('#f-time').value; d.shop = $('#f-shop').value;
      d.genre = $('#f-genre').value; d.url = $('#f-url').value; d.deadline = fDeadline.value;
    };
    var deadlineHint = function () {
      var t = d.deadline ? jpDate(d.deadline) + 'の夜まで受け付けます' : '';
      if (d.deadline && !d.deadlineTouched) t += '（開催日の' + st.deadlineDays + '日前を入れています）';
      $('#h-deadline').textContent = t;
    };
    fDate.addEventListener('change', function () {
      sync();
      $('#h-date').textContent = jpDate(d.date);
      if (!d.deadlineTouched && d.date) {
        var day = parseYmd(d.date), today = parseYmd(st.today);
        var dl = new Date(day.getFullYear(), day.getMonth(), day.getDate() - st.deadlineDays);
        if (dl < today) dl = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
        if (dl < today) dl = today;
        d.deadline = ymdOf(dl);
        fDeadline.value = d.deadline;
      }
      deadlineHint();
    });
    fDeadline.addEventListener('change', function () { sync(); d.deadlineTouched = true; deadlineHint(); });
    ['#f-time', '#f-shop', '#f-genre', '#f-url'].forEach(function (s) { $(s).addEventListener('input', sync); });
    deadlineHint();
    bindFooter();
    on('#back', function () { S.view = ''; S.error = ''; render(); });

    on('#start', function () {
      sync();
      var miss = !d.date ? '日にちを選んでください' : !d.time ? '時間を入れてください' : !d.shop.trim() ? 'お店の名前を入れてください' : !d.deadline ? '締切を選んでください' : '';
      if (!miss && d.deadline >= d.date) miss = '締切は開催日より前の日にしてください';
      if (miss) { S.error = miss; renderNew(); window.scrollTo(0, 0); return; }
      S.error = '';
      confirmBox({
        title: 'この内容で募集を始めますか？',
        body: jpDate(d.date) + ' ' + d.time + '〜\n' + d.shop.trim() + (d.genre.trim() ? '（' + d.genre.trim() + '）' : '') + '\n締切：' + jpDate(d.deadline) +
          '\n\n応募フォームの受付が始まります。',
        ok: '募集を始める',
        run: function () {
          return api('start', { date: d.date, time: d.time, shop: d.shop, genre: d.genre, url: d.url, deadline: d.deadline }).then(function (st2) {
            S.state = st2; S.view = ''; S.draft = null; S.error = '';
            render();
            shareBox('募集を始めました', 'LINEグループに募集のお知らせを送りましょう。文面はここで書き直せます。', st2.recruitText, '募集をLINEで送る', true);
          });
        }
      });
    });
  }

  // ───────── 募集中 ─────────

  function renderOpen() {
    var st = S.state;
    var left = st.daysLeft <= 0 ? '今日が締切です' : '締切まであと' + st.daysLeft + '日';
    $app.innerHTML =
      errBox() +
      '<div class="card hero">' +
      '<span class="pill">募集中</span>' +
      '<div class="count"><div class="num">' + st.applicants + '<small>名</small></div><div class="cap">いまの応募・' + esc(left) + '</div></div>' +
      '</div>' +
      '<div class="card">' + infoRows(st.round) + '</div>' +
      shareButtons(st.recruitText, '募集をLINEで送る') +
      '<details' + (st.recruitEdited ? ' open' : '') + '><summary>募集の文面を見る・書き直す' +
      (st.recruitEdited ? ' <span class="pill gold">書き直し済み</span>' : '') + '</summary>' +
      recruitEditorHtml(st.recruitText) + '</details>' +
      entriesCard(st.entries || [], '応募した人と社長に聞いてみたいこと') +
      '<a class="link" href="apply/" target="_blank" rel="noopener">スタッフの応募ページを見る</a>' +
      '<button class="link" id="early">締切前だけど、もう抽選する</button>' +
      '<button class="link" id="cancel-round" style="color:var(--danger)">この募集を取り消す</button>' +
      footer();
    bindRecruitEditor($app);
    bindFooter();
    bindCancelRound();
    on('#early', function () {
      confirmBox({
        title: '締切前ですが抽選しますか？',
        body: 'いまの応募 ' + st.applicants + '名で抽選します。\n抽選すると応募の受付は終わります。',
        ok: '抽選をはじめる',
        run: function () { return startDraw(true); }
      });
    });
  }

  // ───────── 締切後 ─────────

  function renderClosed() {
    var st = S.state;
    var none = st.applicants === 0;
    $app.innerHTML =
      errBox() +
      '<div class="card hero">' +
      '<span class="pill gold">締切になりました</span>' +
      '<div class="count"><div class="num">' + st.applicants + '<small>名</small></div><div class="cap">の応募がありました</div></div>' +
      (none
        ? '<div class="note">応募がありませんでした。締切を延ばすときは部長に連絡してください。</div>'
        : '<p class="muted" style="margin:8px 0 0">ルーレットで' + Math.min(st.winnersCount, st.applicants) + '名を決めましょう！</p>' +
          '<button class="btn gold maru" id="draw" style="font-size:20px;min-height:64px">' + ICON.spin + '抽選をはじめる</button>') +
      '</div>' +
      '<div class="card">' + infoRows(st.round) + '</div>' +
      entriesCard(st.entries || [], '応募した人と社長に聞いてみたいこと') +
      '<button class="link" id="cancel-round" style="color:var(--danger)">この募集を取り消す</button>' +
      footer();
    bindFooter();
    bindCancelRound();
    on('#draw', function () {
      var b = $('#draw');
      b.disabled = true; b.textContent = '準備しています…';
      startDraw(false).catch(function (e) { S.error = e.message; render(); });
    });
  }

  // ───────── 募集の文面の書き直し ─────────

  function recruitEditorHtml(text) {
    return '<textarea class="recruit-ed" aria-label="募集の文面">' + esc(text) + '</textarea>' +
      '<div class="ed-row"><span class="ed-status">書き直すと自動で保存されます</span>' +
      '<button class="mini ed-reset" hidden>元の文面に戻す</button></div>';
  }

  /**
   * root の中の文面の欄を書き直せるようにする。止まって1秒・欄から離れたとき・LINE/コピーを押したときに保存。
   * LINEで送る・コピーは、いま欄に入っている文面を使う。
   */
  function bindRecruitEditor(root) {
    var ta = root.querySelector('.recruit-ed');
    if (!ta) return;
    var status = root.querySelector('.ed-status');
    var reset = root.querySelector('.ed-reset');
    var saved = ta.value, timer = null, pending = null;
    var setStatus = function (t) { if (status) status.textContent = t; };
    var showReset = function () { if (reset) reset.hidden = !(S.state && S.state.recruitEdited); };
    var sync = function () {
      Array.prototype.forEach.call(root.querySelectorAll('[data-line]'), function (a) { a.href = lineUrl(ta.value); });
    };
    var save = function () {
      clearTimeout(timer); timer = null;
      var text = ta.value;
      if (text === saved) return pending || Promise.resolve();
      setStatus('保存しています…');
      pending = api('save_recruit', { text: text }).then(function (st) {
        S.state = st; saved = text; pending = null;
        setStatus(st.recruitEdited ? '書き直した文面を保存しました' : '元の文面と同じです');
        showReset();
      }, function (e) {
        pending = null;
        setStatus('保存できませんでした：' + e.message);
      });
      return pending;
    };
    ta.addEventListener('input', function () {
      sync();
      setStatus('入力中…');
      clearTimeout(timer);
      timer = setTimeout(save, 1000);
    });
    ta.addEventListener('blur', save);
    Array.prototype.forEach.call(root.querySelectorAll('[data-line]'), function (a) { a.addEventListener('click', save); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-copy]'), function (b) {
      b.addEventListener('click', function () { copy(ta.value); save(); });
    });
    if (reset) reset.addEventListener('click', function () {
      confirmBox({
        title: '元の文面に戻しますか？', body: '書き直した内容は消えます。', ok: '元に戻す',
        run: function () {
          return api('save_recruit', { text: '' }).then(function (st) {
            S.state = st; ta.value = saved = st.recruitText;
            sync(); showReset(); setStatus('元の文面に戻しました');
          });
        }
      });
    });
    S.flushEdit = save;
    showReset();
  }

  /** 募集の取り消し（抽選の前だけ）。取り消した内容を募集フォームに入れておき、直して募集し直せるようにする */
  function bindCancelRound() {
    on('#cancel-round', function () {
      var st = S.state;
      confirmBox({
        title: 'この募集を取り消しますか？',
        body: st.round.date + '〜 ' + st.round.shop + '\n\n' +
          (st.applicants ? 'いま応募している' + st.applicants + '名の応募も無効になります。\n' : '') +
          '取り消すと元に戻せません。内容を直して募集し直すことはできます。',
        ok: '取り消す',
        danger: true,
        run: function () {
          return api('cancel_round').then(function (st2) {
            var c = st2.canceled;
            S.state = st2; S.error = ''; S.view = 'new';
            S.draft = { date: c.raw.date, time: c.raw.time || '19:00', shop: c.shop, genre: c.genre || '', url: c.url || '', deadline: c.raw.deadline, deadlineTouched: true };
            window.scrollTo(0, 0);
            render();
            toast('取り消しました。直して募集し直せます');
          });
        }
      });
    });
  }

  function startDraw(early) {
    return api('draw', { early: early }).then(function (st) {
      S.state = st; S.error = '';
      S.roulette = { steps: st.steps || [], i: 0, phase: 'ready', rot: 0, replay: false };
      S.view = st.steps && st.steps.length ? 'roulette' : '';
      window.scrollTo(0, 0);
      render();
    });
  }

  // ───────── ルーレット ─────────

  function renderRoulette() {
    var R = S.roulette, st = S.state;
    var step = R.steps[R.i];
    var total = R.steps.length;
    var weights = step.cands.map(function (c) { return c.weight; });
    var mixed = Math.max.apply(null, weights) !== Math.min.apply(null, weights);
    var dots = R.steps.map(function (_, i) { return '<i class="' + (i <= R.i ? 'on' : '') + '"></i>'; }).join('');
    var size = Math.min(340, $app.clientWidth - 16);
    var last = R.i === total - 1;

    $app.innerHTML =
      '<div class="rl-head">' +
      '<div class="step">' + (R.i + 1) + '人目 ／ ' + total + '人</div>' +
      '<h2 class="maru">' + esc(step.label) + '</h2>' +
      '<div class="dots">' + dots + '</div>' +
      '</div>' +
      '<div class="wheel-box" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg class="pointer" id="pointer" viewBox="0 0 34 44"><path d="M17 42 3 10a14 14 0 1 1 28 0z" fill="#B3402E" stroke="#fff" stroke-width="3"/><circle cx="17" cy="13" r="5" fill="#fff"/></svg>' +
      '<canvas id="wheel" width="' + size + '" height="' + size + '"></canvas>' +
      '<div class="hub maru">社長<br>めし</div>' +
      '</div>' +
      (mixed ? '<div class="legend">マスが大きい人ほど当たりやすくなっています' + (st.firstBoost > 1 ? '<br>（まだ参加したことがない人は' + st.firstBoost + '倍）' : '') + '</div>' : '<div class="legend">' + step.cands.length + '名の中から1名</div>') +
      '<div class="reveal" id="reveal"></div>' +
      '<button class="btn gold maru" id="go" style="font-size:20px;min-height:64px">' + ICON.spin + 'ルーレットを回す</button>' +
      '<button class="link" id="skip">' + (R.replay ? 'メンバー一覧にもどる' : '演出をとばして結果を見る') + '</button>';

    var canvas = $('#wheel');
    var segs = buildSegments(step.cands);
    paintWheel(canvas, segs, size);
    canvas.style.transform = 'rotate(0deg)';

    on('#skip', finishRoulette);
    on('#go', function () {
      var btn = $('#go');
      if (R.phase === 'done') {
        if (last) return finishRoulette();
        R.i++; R.phase = 'ready';
        return renderRoulette();
      }
      if (R.phase !== 'ready') return;
      R.phase = 'spinning';
      btn.disabled = true; btn.innerHTML = '回っています…';
      spinTo(canvas, segs, step.pick, function () {
        R.phase = 'done';
        var who = step.cands.filter(function (c) { return c.name === step.pick; })[0] || { name: step.pick, base: '' };
        $('#reveal').innerHTML =
          '<div class="lead">' + (R.i + 1) + '人目は…</div>' +
          '<div class="big maru">' + esc(who.name) + 'さん</div>' +
          (who.base ? '<div class="bs">' + esc(who.base) + '</div>' : '');
        confetti();
        btn.disabled = false;
        btn.className = 'btn primary maru';
        btn.style.fontSize = '18px';
        btn.innerHTML = last ? 'メンバーを見る' : '次の人へ（' + (R.i + 2) + '人目）';
        if (btn.scrollIntoView) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });   // 小さい画面でも結果とボタンが見えるように
      });
    });
  }

  function finishRoulette() {
    S.view = ''; S.roulette = null;
    window.scrollTo(0, 0);
    render();
  }

  /** 候補を、上（針の位置）から時計回りに重みの割合で並べる */
  function buildSegments(cands) {
    var total = cands.reduce(function (s, c) { return s + c.weight; }, 0) || 1;
    var a = 0;
    return cands.map(function (c, i) {
      var w = 360 * c.weight / total;
      var color = COLORS[i % COLORS.length];
      if (i === cands.length - 1 && i > 0 && i % COLORS.length === 0) color = COLORS[2];   // 最初のマスと同じ色が隣り合わないように
      var seg = { name: c.name, base: c.base, start: a, end: a + w, color: color };
      a += w;
      return seg;
    });
  }

  function paintWheel(canvas, segs, size) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    var c = size / 2, r = c - 6;
    var rad = function (deg) { return (deg - 90) * Math.PI / 180; };

    segs.forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, rad(s.start), rad(s.end));
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      if (segs.length > 1) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke(); }
    });

    segs.forEach(function (s) {
      var span = (s.end - s.start) * Math.PI / 180;
      var label = s.name.length > 7 ? s.name.slice(0, 6) + '…' : s.name;
      var fs = Math.min(19, span * r * 0.5, (r * 0.6) / Math.max(label.length, 1));
      fs = Math.max(fs, 10);
      var mid = (s.start + s.end) / 2;
      var flip = mid > 180 && mid < 360;   // 左半分は文字が逆さにならないよう向きを変える
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(rad(mid) + (flip ? Math.PI : 0));
      ctx.textAlign = flip ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + fs + 'px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';
      ctx.fillStyle = darkText(s.color) ? '#3B2A03' : '#ffffff';
      ctx.fillText(label, flip ? -(r - 16) : r - 16, 0);
      ctx.restore();
    });

    // 外周の金の輪と電球
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#F2B33D'; ctx.lineWidth = 8; ctx.stroke();
    for (var i = 0; i < 24; i++) {
      var t = i / 24 * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(c + Math.cos(t) * r, c + Math.sin(t) * r, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
    }
  }

  function darkText(hex) {
    var n = parseInt(hex.slice(1), 16);
    var l = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.62;
  }

  /** 当たりのマスの中（端を避けたどこか）で針が止まるように回す */
  function spinTo(canvas, segs, pick, done) {
    var seg = segs.filter(function (s) { return s.name === pick; })[0] || segs[0];
    var target = seg.start + (seg.end - seg.start) * (0.2 + Math.random() * 0.6);
    var turns = 3 + Math.floor(Math.random() * 2);   // 3秒で回るので回転数も減らし、回り始めの速さを前と同じくらいにする
    var final = turns * 360 + (360 - target);
    var dur = 3000, t0 = null, lastIdx = -1;   // 回る時間（ミリ秒）
    var pointer = document.getElementById('pointer');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) dur = 1200;

    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 4);
      var rot = final * e;
      canvas.style.transform = 'rotate(' + rot + 'deg)';
      var under = (360 - (rot % 360)) % 360;
      var idx = 0;
      for (var i = 0; i < segs.length; i++) if (under >= segs[i].start && under < segs[i].end) { idx = i; break; }
      if (idx !== lastIdx && segs.length > 1 && pointer) {
        pointer.classList.remove('tick'); void pointer.getBoundingClientRect(); pointer.classList.add('tick');
        lastIdx = idx;
      }
      if (p < 1) requestAnimationFrame(frame);
      else setTimeout(done, 250);
    }
    requestAnimationFrame(frame);
  }

  function confetti() {
    var box = document.createElement('div');
    box.className = 'confetti';
    var cols = ['#F2B33D', '#0F6E56', '#5DCAA5', '#E8833A', '#B3402E', '#FBE3A6'];
    for (var i = 0; i < 70; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = cols[i % cols.length];
      p.style.animationDuration = (1.8 + Math.random() * 1.6) + 's';
      p.style.animationDelay = (Math.random() * 0.4) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 4200);
  }

  // ───────── 抽選後 ─────────

  function renderDrawn() {
    var st = S.state;
    var active = st.winners.filter(function (w) { return w.status !== '辞退'; });
    var gap = st.winnersCount - active.length;
    var nextAlt = st.alternates.filter(function (a) { return a.status !== '辞退'; })[0];

    var members = st.winners.map(function (w) {
      var out = w.status === '辞退';
      var tag = out ? '<span class="pill gray">辞退</span>' : w.kind === '当選（繰上）' ? '<span class="pill gold">繰り上げ</span>' : '';
      return '<div class="member' + (out ? ' out' : '') + '">' +
        '<div class="avatar maru">' + esc(initial(w.name)) + '</div>' +
        '<div class="who"><div class="nm">' + esc(w.name) + 'さん</div>' + (w.base || tag ? '<div class="bs">' + esc(w.base || '') + ' ' + tag + '</div>' : '') +
        (w.ask && !out ? '<div class="ask">' + esc(w.ask) + '</div>' : '') + '</div>' +
        (out ? '' : '<button class="mini" data-decline="' + esc(w.name) + '">辞退</button>') +
        '</div>';
    }).join('');
    var alts = st.alternates.filter(function (a) { return a.status !== '辞退'; });

    $app.innerHTML =
      errBox() +
      '<div class="card hero">' +
      '<span class="pill">メンバー決定</span>' +
      '<h2 class="maru">' + esc(st.round.shop) + 'に行く<br>メンバーが決まりました！</h2>' +
      '<div class="muted">' + esc(st.round.date) + '〜</div>' +
      '</div>' +
      '<div class="card">' +
      '<p class="subhead">当選（' + active.length + '名）</p>' + members +
      (gap > 0 ? '<div class="note">あと' + gap + '名空いています。補欠がいないので、追加で声をかけてください。</div>' : '') +
      (alts.length ? '<p class="subhead" style="margin-top:14px">補欠</p><div class="muted">' +
        alts.map(function (a) { return esc(a.kind) + '：' + esc(a.name) + 'さん'; }).join('<br>') + '</div>' : '') +
      '</div>' +
      (st.everyone && st.everyone.length
        ? '<details class="month"><summary><span class="m-shop">応募した全員と聞いてみたいこと（' + st.everyone.length + '名）</span>' + CHEV + '</summary>' +
          '<div class="m-body">' + entryRows(st.everyone.map(function (e) {
            return { name: e.name, ask: e.ask, tag: e.kind.indexOf('当選') === 0 ? '当選' : e.kind.indexOf('補欠') === 0 ? e.kind : '' };
          })) + '</div></details>'
        : '') +
      shareButtons(st.announceText, '発表をLINEで送る') +
      '<details><summary>発表の文面を見る</summary><pre class="text">' + esc(st.announceText) + '</pre></details>' +
      (st.steps && st.steps.length ? '<button class="btn ghost" id="replay">' + ICON.spin + 'ルーレットをもう一度見る</button>' : '') +
      '<button class="link" id="next">次の回の募集を始める</button>' +
      footer();

    bindCopy(st.announceText);
    bindFooter();
    on('#replay', function () {
      S.roulette = { steps: st.steps, i: 0, phase: 'ready', rot: 0, replay: true };
      S.view = 'roulette';
      window.scrollTo(0, 0);
      render();
    });
    on('#next', function () { S.view = 'new'; S.error = ''; window.scrollTo(0, 0); render(); });
    Array.prototype.forEach.call($app.querySelectorAll('[data-decline]'), function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-decline');
        confirmBox({
          title: name + 'さんを辞退にしますか？',
          body: nextAlt ? nextAlt.kind + 'の' + nextAlt.name + 'さんが繰り上がります。' : '補欠がいないので、空きのままになります。',
          ok: '辞退にする',
          danger: true,
          run: function () {
            return api('decline', { name: name }).then(function (st2) {
              S.state = st2; S.error = '';
              render();
              if (st2.promoted && st2.promoted.length) {
                shareBox(st2.promoted.map(function (p) { return p.name + 'さん'; }).join('、') + 'が繰り上げ当選',
                  '本人にLINEで知らせましょう。発表文も新しいメンバーに変わっています。', st2.promoteText, '本人にLINEで送る');
              }
            });
          }
        });
      });
    });
  }

  // ───────── 応募した人と「社長に聞いてみたいこと」 ─────────

  var CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  function entryRows(list) {
    return list.map(function (e) {
      return '<div class="entry"><div class="nm">' + esc(e.name) + 'さん' +
        (e.tag ? ' <span class="pill' + (e.tag === '当選' ? '' : ' gray') + '">' + esc(e.tag) + '</span>' : '') + '</div>' +
        (e.ask ? '<div class="ask">' + esc(e.ask) + '</div>' : '<div class="ask none">聞いてみたいことは書いていません</div>') +
        '</div>';
    }).join('');
  }

  function entriesCard(list, title) {
    return '<div class="card"><p class="subhead">' + esc(title) + '（' + list.length + '名）</p>' +
      (list.length ? entryRows(list) : '<p class="muted" style="margin:4px 0 0">まだ応募はありません</p>') + '</div>';
  }

  // ───────── これまでの社長めし ─────────

  function renderHistory() {
    var back = '<button class="btn ghost small" id="h-back" style="margin-top:0">もどる</button>';
    if (!S.history) {
      $app.innerHTML = back + (S.error ? errBox() : '<div class="spinner"></div>');
      on('#h-back', leaveHistory);
      if (!S.error) {
        api('history').then(function (h) { S.history = h; render(); }, function (e) { S.error = e.message; render(); });
      }
      return;
    }
    var rounds = S.history.rounds;
    var items = rounds.map(function (r, i) {
      var members = r.members.length
        ? r.members.map(function (m) {
          var tag = m.promoted ? ' <span class="pill gold">繰り上げ</span>' : '';
          if (m.absent) tag += ' <span class="pill gray">欠席</span>';
          return '<div class="member"><div class="avatar maru">' + esc(initial(m.name)) + '</div>' +
            '<div class="who"><div class="nm">' + esc(m.name) + 'さん' + tag + '</div>' +
            (m.ask ? '<div class="ask">' + esc(m.ask) + '</div>' : '') + '</div></div>';
        }).join('')
        : '<p class="muted" style="margin:6px 0 0">当選者はいません</p>';
      return '<details class="month"' + (i === 0 ? ' open' : '') + '>' +
        '<summary><span class="m-id maru">' + esc(r.id) + '</span>' +
        '<span class="m-shop">' + esc(r.shop) + '</span>' +
        (r.upcoming ? '<span class="pill">これから</span>' : '') +
        '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
        '</summary>' +
        '<div class="m-body">' +
        '<div class="info">' + ICON.cal + '<div>' + esc(r.date) + '〜</div>' +
        ICON.shop + '<div>' + esc(r.shop) + (r.genre ? '<span class="muted">（' + esc(r.genre) + '）</span>' : '') +
        (r.url ? ' <a href="' + esc(r.url) + '" target="_blank" rel="noopener">お店のページ</a>' : '') + '</div></div>' +
        '<p class="subhead" style="margin:14px 0 0">メンバー（応募 ' + (r.applicants || 0) + '名から）</p>' + members +
        '</div></details>';
    }).join('');
    $app.innerHTML = back +
      '<h2 class="maru" style="font-size:22px;margin:18px 0 4px">これまでの社長めし</h2>' +
      '<p class="muted" style="margin:0 0 14px">' + (rounds.length ? rounds.length + '回 開催・新しい順' : 'まだ開催した回はありません') + '</p>' +
      items +
      (rounds.length > 1 ? '<button class="link" id="h-toggle">すべて開く</button>' : '');
    on('#h-back', leaveHistory);
    on('#h-toggle', function () {
      var all = $app.querySelectorAll('details.month');
      var open = !Array.prototype.every.call(all, function (d) { return d.open; });
      Array.prototype.forEach.call(all, function (d) { d.open = open; });
      $('#h-toggle').textContent = open ? 'すべて閉じる' : 'すべて開く';
    });
  }

  function leaveHistory() {
    S.view = ''; S.error = '';
    window.scrollTo(0, 0);
    render();
  }

  // ───────── ダイアログ ─────────

  function modal(html) {
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="sheet">' + html + '</div>';
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  function confirmBox(o) {
    var m = modal(
      '<h3 class="maru">' + esc(o.title) + '</h3><p>' + esc(o.body) + '</p>' +
      '<div class="err" id="m-err" hidden></div>' +
      '<button class="btn ' + (o.danger ? 'ghost' : 'primary') + '" id="m-ok"' + (o.danger ? ' style="color:var(--danger);border-color:var(--danger)"' : '') + '>' + esc(o.ok) + '</button>' +
      '<button class="btn ghost small" id="m-cancel">やめる</button>');
    m.querySelector('#m-cancel').addEventListener('click', function () { m.remove(); });
    var ok = m.querySelector('#m-ok');
    ok.addEventListener('click', function () {
      ok.disabled = true; ok.textContent = '送信しています…';
      Promise.resolve(o.run()).then(function () { m.remove(); }, function (e) {
        if (e.code === 'auth') { m.remove(); render(); return; }
        var box = m.querySelector('#m-err');
        box.hidden = false; box.textContent = e.message;
        ok.disabled = false; ok.textContent = o.ok;
      });
    });
  }

  /** 文面とLINEで送るボタンのダイアログ。editable のときは募集の文面をその場で書き直せる */
  function shareBox(title, lead, text, label, editable) {
    var m = modal(
      '<h3 class="maru">' + esc(title) + '</h3><p>' + esc(lead) + '</p>' +
      (editable ? recruitEditorHtml(text) : '<pre class="text">' + esc(text) + '</pre>') +
      '<a class="btn line" data-line href="' + esc(lineUrl(text)) + '" target="_blank" rel="noopener">' + ICON.line + esc(label) + '</a>' +
      '<div class="btn-row" style="grid-template-columns:1fr 1fr"><button class="btn ghost small" data-copy id="m-copy">' + ICON.copy + 'コピー</button>' +
      '<button class="btn ghost small" id="m-close">閉じる</button></div>');
    var close = function () {
      Promise.resolve(editable && S.flushEdit ? S.flushEdit() : null).then(function () {
        m.remove();
        if (editable) render();   // 書き直した文面を募集中の画面にも出す
      });
    };
    if (editable) {
      bindRecruitEditor(m);
      m.addEventListener('click', function (e) {   // 外側を押して閉じたときも保存して画面に出す
        if (e.target === m && S.flushEdit) S.flushEdit().then(render);
      });
    }
    else m.querySelector('#m-copy').addEventListener('click', function () { copy(text); });
    m.querySelector('#m-close').addEventListener('click', close);
  }

  function footer() {
    return '<button class="btn ghost" id="to-history" style="margin-top:28px">' + ICON.cal + 'これまでの社長めし</button>' +
      '<button class="link" id="logout" style="font-size:12px;margin-top:20px">この端末の合言葉を消す</button>';
  }
  function bindFooter() {
    on('#to-history', function () { S.view = 'history'; S.history = null; S.error = ''; window.scrollTo(0, 0); render(); });
    on('#logout', function () {
      confirmBox({
        title: 'この端末の合言葉を消しますか？', body: '次に開いたとき、もう一度合言葉を入れることになります。', ok: '消す',
        run: function () { store('sm_key', null); S.state = null; S.view = ''; render(); }
      });
    });
  }

  // ───────── はじまり ─────────

  $reload.addEventListener('click', function () {
    if (S.view === 'history') { S.history = null; S.error = ''; render(); return; }
    if (S.view !== 'roulette') Promise.resolve(S.flushEdit ? S.flushEdit() : null).then(load);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (S.flushEdit) S.flushEdit(); return; }   // LINEへ切り替えるときに書き直しを保存
    var a = document.activeElement;
    if (S.view !== 'roulette' && S.view !== 'new' && !document.querySelector('.modal') && !(a && a.classList && a.classList.contains('recruit-ed'))) load();
  });
  load();
})();
