// 社長めし 応募ページ（スタッフ用）
// 名前を入力して応募する／取り消す。いまの応募人数も見える。合言葉はいらない。
(function () {
  'use strict';

  var CFG = window.SM_CONFIG || {};
  var $app = document.getElementById('app');
  var $reload = document.getElementById('reload');

  var S = {
    st: null,        // サーバーから来た今の状況
    error: '',
    editing: false,  // 応募済みの人が「書き直す」を押した
    just: false      // いま応募したところ（お祝いを出す）
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

  /** この端末のしるし。応募した端末からだけ取り消せるようにするために使う */
  function deviceToken() {
    var t = store('sm_device');
    if (!t || !/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
      var a = new Uint8Array(18);
      (window.crypto || window.msCrypto).getRandomValues(a);
      t = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      store('sm_device', t);
    }
    return t;
  }

  var ICON = {
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1-5H5z"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };

  // ───────── サーバー ─────────

  /** 動作確認用（dev/index.html の中で ?dev を付けて開いたときだけ、偽のサーバーを使う） */
  function DEV_API() {
    try {
      return /[?&]dev\b/.test(location.search) && window.parent !== window && window.parent.SM_DEV_API;
    } catch (e) { return null; }
  }

  function api(action, args) {
    var body = { action: action, args: args || {} };
    var p;
    var dev = DEV_API();
    if (dev) {
      p = new Promise(function (ok) { setTimeout(ok, 350); }).then(function () { return dev(body); });
    } else if (!CFG.apiUrl) {
      return Promise.reject(new Error('準備中です。部長に連絡してください'));
    } else {
      p = fetch(CFG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
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
      throw err;
    });
  }

  /** keepError：応募に失敗したあとの読み直しでは、エラーの文を消さずに残す */
  function load(keepError) {
    $reload.classList.add('spin');
    return api('pub_round', { name: store('sm_name') || '', token: deviceToken() }).then(function (st) {
      S.st = st;
      if (keepError !== true) S.error = '';
      render();
    }, function (e) {
      S.error = e.message;
      render();
    }).then(function () { $reload.classList.remove('spin'); });
  }

  // ───────── 画面 ─────────

  function errBox() { return S.error ? '<div class="err">' + esc(S.error) + '</div>' : ''; }

  function infoRows(r) {
    return '<div class="info">' +
      ICON.cal + '<div>' + esc(r.date) + '〜</div>' +
      ICON.shop + '<div>' + esc(r.shop) + (r.genre ? '<span class="muted">（' + esc(r.genre) + '）</span>' : '') + '</div>' +
      (r.url ? ICON.link + '<div><a href="' + esc(r.url) + '" target="_blank" rel="noopener">お店のページ</a></div>' : '') +
      ICON.clock + '<div>応募締切：' + esc(r.deadline) + '</div>' +
      '</div>';
  }

  function render() {
    var st = S.st;
    if (!st) {
      $app.innerHTML = S.error ? errBox() + '<button class="btn ghost" id="retry">もう一度読み込む</button>' : '<div class="spinner"></div>';
      on('#retry', function () { load(); });
      return;
    }
    if (st.stage === 'none') {
      $app.innerHTML = errBox() +
        '<div class="card hero"><span class="pill gray">募集していません</span>' +
        '<h2 class="maru">いまは募集していません</h2>' +
        '<p class="muted">次の募集はLINEグループでお知らせします。<br>お楽しみに！</p></div>';
      return;
    }
    if (st.stage === 'canceled') {
      $app.innerHTML = errBox() +
        '<div class="card hero"><span class="pill gray">取り消し</span>' +
        '<h2 class="maru">' + esc(st.round.shop) + '</h2>' +
        '<p class="muted">今回の募集は取り消しになりました。<br>次の募集はLINEグループでお知らせします。</p></div>';
      return;
    }
    if (st.stage === 'drawn') {
      $app.innerHTML = errBox() +
        '<div class="card hero"><span class="pill">抽選が終わりました</span>' +
        '<h2 class="maru">' + esc(st.round.shop) + '</h2>' +
        '<p class="muted">結果はLINEグループで発表しています。<br>応募ありがとうございました！</p></div>' +
        '<div class="card">' + infoRows(st.round) + '</div>';
      return;
    }
    var head =
      '<div class="card hero">' +
      (st.stage === 'open' ? '<span class="pill">募集中</span>' : '<span class="pill gold">締切ました</span>') +
      '<div class="eyebrow" style="margin-top:8px">今月の社長めし</div>' +
      '<h2 class="maru">' + esc(st.round.shop) + '</h2>' +
      '<div class="count"><div class="num">' + st.applicants + '<small>名</small></div>' +
      '<div class="cap">いまの応募（定員' + st.winnersCount + '名・抽選）</div></div>' +
      '</div>' +
      '<div class="card">' + infoRows(st.round) + '</div>';

    if (st.stage === 'closed') {
      $app.innerHTML = errBox() + head + '<div class="note">締切ました。抽選の結果はLINEグループで発表します。</div>';
      return;
    }

    var mine = st.mine && st.mine.status === '応募' ? st.mine : null;
    if (mine && !S.editing) return renderApplied(head, mine);
    renderForm(head, mine);
  }

  function renderApplied(head, mine) {
    var body;
    if (mine.sameDevice) {
      body =
        '<div class="card applied">' +
        '<span class="pill">応募済み</span>' +
        '<div class="big maru">' + esc(mine.name) + 'さん</div>' +
        '<p class="muted" style="margin:0">' + (S.just ? '応募しました！ ' : '') + '締切後に抽選し、LINEグループで発表します。</p>' +
        (mine.ask ? '<div class="ask-box"><b>社長に聞いてみたいこと</b>' + esc(mine.ask) + '</div>' : '') +
        '<button class="btn ghost" id="edit">聞いてみたいことを書き直す</button>' +
        '<button class="btn danger-ghost" id="cancel">応募を取り消す</button>' +
        '</div>';
    } else {
      body =
        '<div class="card applied">' +
        '<span class="pill">応募済み</span>' +
        '<div class="big maru">' + esc(mine.name) + 'さん</div>' +
        '<p class="muted" style="margin:0">別の端末から応募済みです。<br>取り消しや書き直しは、応募した端末から行ってください。</p>' +
        '</div>';
    }
    $app.innerHTML = errBox() + head + body + '<button class="link" id="other">ちがう名前で応募する</button>';
    if (S.just) { confetti(); S.just = false; }
    on('#edit', function () { S.editing = true; S.error = ''; render(); });
    on('#other', function () { store('sm_name', null); S.st.mine = null; S.editing = false; S.error = ''; render(); });
    on('#cancel', function () {
      confirmBox({
        title: '応募を取り消しますか？',
        body: mine.name + 'さんの応募を取り消します。\n締切までなら、もう一度応募できます。',
        ok: '取り消す',
        danger: true,
        run: function () {
          return api('pub_cancel', { name: mine.name, token: deviceToken() }).then(function (st) {
            S.st = st; S.error = ''; S.editing = false;
            render();
            toast('取り消しました');
          });
        }
      });
    });
  }

  function renderForm(head, mine) {
    var st = S.st;
    var editing = !!(mine && S.editing);
    var current = editing ? mine.name : (store('sm_name') || '');
    var ruleNote = st.cycle ? '<p class="hint">一度当選したことがある方は応募できません。</p>' : '';

    $app.innerHTML = errBox() + head +
      '<div class="card">' +
      '<h3 class="maru" style="margin:0 0 4px;font-size:19px">' + (editing ? '書き直す' : '応募する') + '</h3>' +
      (editing
        ? '<p class="muted" style="margin:0">' + esc(mine.name) + 'さん</p>'
        : '<label class="f" for="f-name">お名前（フルネーム）</label>' +
          '<input type="text" id="f-name" value="' + esc(current) + '" placeholder="山田 花子" autocomplete="name" maxlength="30">' + ruleNote) +
      '<label class="f" for="f-ask">社長に聞いてみたいこと<span class="opt">なくてもOK</span></label>' +
      '<textarea id="f-ask" maxlength="200" placeholder="話してみたい話題があれば">' + esc(editing ? mine.ask : '') + '</textarea>' +
      '<div class="counter" id="cnt"></div>' +
      '<button class="btn primary" id="apply">' + (editing ? '書き直して保存する' : '応募する') + '</button>' +
      (editing ? '<button class="link" id="back">もどる</button>' : '') +
      '</div>';

    var ask = $('#f-ask');
    var count = function () { $('#cnt').textContent = ask.value.length + ' / 200'; };
    ask.addEventListener('input', count);
    count();
    on('#back', function () { S.editing = false; S.error = ''; render(); });
    on('#apply', function () {
      var name = editing ? mine.name : $('#f-name').value.trim();
      if (!name) { S.error = 'お名前を入力してください'; render(); window.scrollTo(0, 0); return; }
      var btn = $('#apply');
      btn.disabled = true; btn.textContent = '送信しています…';
      api('pub_apply', { name: name, ask: ask.value, token: deviceToken() }).then(function (st2) {
        store('sm_name', name);
        S.st = st2; S.error = ''; S.just = !editing; S.editing = false;
        window.scrollTo(0, 0);
        render();
        if (editing) toast('書き直しました');
      }, function (e) {
        S.error = e.message;
        store('sm_name', name);   // 入れた名前は消さずに残す
        load(true);
        window.scrollTo(0, 0);
      });
    });
  }

  // ───────── ダイアログと演出 ─────────

  function confirmBox(o) {
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="sheet">' +
      '<h3 class="maru">' + esc(o.title) + '</h3><p>' + esc(o.body) + '</p>' +
      '<div class="err" id="m-err" hidden></div>' +
      '<button class="btn ' + (o.danger ? 'danger-ghost' : 'primary') + '" id="m-ok">' + esc(o.ok) + '</button>' +
      '<button class="btn ghost small" id="m-cancel">やめる</button></div>';
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    m.querySelector('#m-cancel').addEventListener('click', function () { m.remove(); });
    var ok = m.querySelector('#m-ok');
    ok.addEventListener('click', function () {
      ok.disabled = true; ok.textContent = '送信しています…';
      Promise.resolve(o.run()).then(function () { m.remove(); }, function (e) {
        var box = m.querySelector('#m-err');
        box.hidden = false; box.textContent = e.message;
        ok.disabled = false; ok.textContent = o.ok;
      });
    });
  }

  function confetti() {
    var box = document.createElement('div');
    box.className = 'confetti';
    var cols = ['#F2B33D', '#0F6E56', '#5DCAA5', '#E8833A', '#B3402E', '#FBE3A6'];
    for (var i = 0; i < 50; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = cols[i % cols.length];
      p.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
      p.style.animationDelay = (Math.random() * 0.3) + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3800);
  }

  // ───────── はじまり ─────────

  $reload.addEventListener('click', function () { if (!document.querySelector('.modal')) load(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !S.editing && !document.querySelector('.modal') && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) load();
  });
  load();
})();
