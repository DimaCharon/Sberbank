/* ══════════════════════════════════════════════════════════════
   ChБанк — демо мобильного банка (тёмная тема, как на скриншотах)
   Все данные виртуальные, состояние в localStorage.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (typeof window.structuredClone !== 'function') window.structuredClone = o => JSON.parse(JSON.stringify(o));

  /* ───────── утилиты ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  const NB = '\u202F';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = s => String(s).replace(/\D/g, '');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd4 = () => String(1000 + Math.floor(Math.random() * 9000));

  function money(n, dec) {
    const v = Math.abs(Number(n) || 0);
    const d = dec === undefined ? (v % 1 ? 2 : 0) : dec;
    return v.toFixed(d).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  }
  const rub = (n, dec) => money(n, dec) + NB + '₽';
  const signed = n => (n > 0 ? '+' : '−') + rub(Math.abs(n));
  const parseSum = s => Number(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  function fmtInputSum(s) {
    const d = num(s).slice(0, 9);
    if (!d) return '';
    return d.replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  }

  const MONTHS_PRE = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const dayKey = d => { const x = new Date(d), t = new Date(); t.setHours(0, 0, 0, 0); const y = new Date(x); y.setHours(0, 0, 0, 0); const k = Math.round((t - y) / 864e5); return k === 0 ? 'Сегодня' : k === 1 ? 'Вчера' : x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); };
  const hhmm = d => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const full = d => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ago = d => dayKey(d);
  const daysBack = n => Date.now() - n * 864e5;

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
  const pick = (a, s) => a[s % a.length];
  const initials = n => { const p = String(n).trim().split(/[\s.]+/).filter(Boolean); return ((p[0] || 'К')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); };

  function haptic(p) { if (!state.haptics) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

  /* СБП-значок (декоративный) */
  const SBP_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 12 12 2.5 18.5 6.5Z" fill="#F58220"/><path d="M12 12 21.5 12 17.5 18.5Z" fill="#E4007C"/><path d="M12 12 12 21.5 5.5 17.5Z" fill="#2E6FF2"/><path d="M12 12 2.5 12 6.5 5.5Z" fill="#21A038"/></svg>';
  function paintSbp() { $$('[data-sbp]').forEach(n => { if (!n.dataset.done) { n.innerHTML = SBP_SVG; n.dataset.done = 1; } }); }

  /* ───────── категории операций ───────── */
  const CAT = {
    market: { c: '#8B5CF6', sub: 'Покупки' }, cafe: { c: '#D97706', sub: 'Кафе и рестораны' },
    transport: { c: '#3B82F6', sub: 'Транспорт' }, taxi: { c: '#F59E0B', sub: 'Такси' },
    home: { c: '#14B8A6', sub: 'Дом и уют' }, mobile: { c: '#6366F1', sub: 'Связь' },
    sub: { c: '#EC4899', sub: 'Подписки' }, shop: { c: '#A855F7', sub: 'Оплата товаров и услуг' },
    pharm: { c: '#10B981', sub: 'Здоровье' }, fun: { c: '#F43F5E', sub: 'Развлечения' },
    gov: { c: '#64748B', sub: 'Госуслуги' }, salary: { c: '#21A038', sub: 'Поступления', ico: 'in' },
    p2p: { c: '#21A038', sub: 'Переводы', ico: 'out' }, p2pin: { c: '#21A038', sub: 'Переводы', ico: 'in' },
    topup: { c: '#21A038', sub: 'Пополнение', ico: 'plus' }, self: { c: '#2E6FF2', sub: 'Между своими', ico: 'swap' },
    bonus: { c: '#21A038', sub: 'Бонусы', ico: 'star' }
  };
  const ICO = {
    in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13M12 18l-5-5M12 18l5-5"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M14 7l5 5-5 5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v13M8 4 5 7M8 4l3 3M16 20V7M16 20l3-3M16 20l-3-3"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z"/></svg>'
  };
  function opIcon(t) {
    const c = CAT[t.c] || CAT.shop;
    if (c.ico) return `<span class="op__i" style="background:${c.c}">${ICO[c.ico]}</span>`;
    const m = String(t.t).match(/«(.+?)»/);
    const base = m ? m[1] : String(t.t);
    const txt = (base.slice(0, 2)).toLowerCase();
    return `<span class="op__i" style="background:${c.c}">${esc(txt)}</span>`;
  }

  /* ───────── состояние ───────── */
  const KEY = 'chbank.v2';
  const DEF = {
    user: null,
    acc: { last4: '', bal: 0 },
    sav: { last4: '', bal: 0 },
    card: { last4: '' },
    bonus: 0,
    hidden: false,
    haptics: true,
    notif: true,
    promoGone: false,
    txs: [],
    contacts: [],
    goals: [
      { t: 'Отпуск у моря', sum: 120000, have: 46500 },
      { t: 'Новый ноутбук', sum: 90000, have: 71200 }
    ]
  };
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEF);
      const p = JSON.parse(raw);
      return Object.assign(structuredClone(DEF), p);
    } catch (e) { return structuredClone(DEF); }
  }
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }, 120); };

  const total = () => state.acc.bal + state.sav.bal;
  const monthSpend = () => Math.abs(state.txs.filter(t => t.a < 0 && !t.st && new Date(t.d).getMonth() === new Date().getMonth()).reduce((s, t) => s + t.a, 0));

  function seedTxs() {
    const S = [
      ['Кофейня «Пенка»', 'cafe', -240, 0],
      ['Продукты «Лавка»', 'market', -1248.5, 0],
      ['Такси «Ветер»', 'taxi', -412, 1],
      ['Зарплата «Ромашка»', 'salary', 86000, 1],
      ['Аптека «Алоэ»', 'pharm', -563.2, 2],
      ['Книжный «Читалка»', 'shop', -890, 3],
      ['Перевод от Анны М.', 'p2pin', 2500, 4],
      ['ЖКУ «Домовой»', 'home', -4320.15, 5],
      ['Маркетплейс «Полка»', 'shop', -2188.9, 6],
      ['Кинотеатр «Кадр»', 'fun', -760, 7],
      ['Связь «Телла»', 'mobile', -450, 8],
      ['Подписка «Музыка+»', 'sub', -299, 9]
    ];
    state.txs = S.map((x, i) => ({
      t: x[0], c: x[1], a: x[2], d: daysBack(x[3]) - i * 36e5,
      s: (CAT[x[1]] || {}).sub || 'Операция'
    }));
  }

  /* ───────── тосты ───────── */
  function toast(text, type = 'ok', ttl = 2600) {
    const t = el('div', 'toast toast--' + type, `<i>${type === 'ok' ? '✓' : '!'}</i><span>${esc(text)}</span>`);
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, ttl);
  }

  /* ───────── шторки ───────── */
  function sheet(opts) {
    const root = el('div', 'sheet');
    root.innerHTML = '<div class="sheet__bd"></div><div class="sheet__panel"></div>';
    const panel = $('.sheet__panel', root);
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      root.classList.remove('is-open');
      haptic(6);
      setTimeout(() => root.remove(), 400);
      opts.onClose && opts.onClose();
    };
    const api = { root, panel, close, render, isOpen: () => !closed };
    function render(html) {
      panel.innerHTML = `<button class="sheet__close" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div class="grab"></div>${html}`;
      $('.sheet__close', panel).addEventListener('click', close);
      panel.scrollTop = 0;
      swipe(panel, close);
      paintSbp();
    }
    $('#sheets').appendChild(root);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
    $('.sheet__bd', root).addEventListener('click', close);
    render(opts.html || '');
    opts.onMount && opts.onMount(api);
    return api;
  }
  function swipe(panel, close) {
    let y0 = null, dy = 0;
    panel.addEventListener('pointerdown', e => {
      if (panel.scrollTop > 2 || e.target.closest('input,.sw')) return;
      y0 = e.clientY; dy = 0; panel.style.transition = 'none';
    });
    panel.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); if (dy) panel.style.transform = `translateY(${dy}px)`; });
    const end = () => { if (y0 === null) return; y0 = null; panel.style.transition = ''; panel.style.transform = ''; if (dy > 110) close(); dy = 0; };
    panel.addEventListener('pointerup', end); panel.addEventListener('pointerleave', end); panel.addEventListener('pointercancel', end);
  }

  /* ───────── push-экраны ───────── */
  function openPush(id) {
    const p = $(id);
    p.classList.add('is-open');
    haptic(8);
    const sc = $('.scroll', p); if (sc) sc.scrollTop = 0;
    return p;
  }
  function closePush(p) { p.classList.remove('is-open'); haptic(6); }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-back]');
    if (b) closePush(b.closest('.push'));
  });

  /* ───────── обработка и успех ───────── */
  function proc(title, ms = 1000) {
    return new Promise(res => {
      $('#procT').textContent = title;
      $('#fullProc').classList.add('is-open');
      haptic([10, 60, 10, 60, 10]);
      setTimeout(() => { $('#fullProc').classList.remove('is-open'); setTimeout(res, 200); }, ms);
    });
  }
  let lastOk = null;
  function showOk(o) {
    lastOk = o;
    $('#okTitle').textContent = o.title;
    $('#okSum').textContent = rub(o.sum);
    $('#okFee').textContent = o.fee || 'Комиссия 0 ₽';
    $('#okWho').textContent = o.who || '';
    $('#okNote').textContent = o.note || '';
    $('#okNote').style.display = o.note ? '' : 'none';
    const f = $('#fullOk');
    const ck = $('#fullOk .okcheck path');
    ck.style.animation = 'none'; void ck.getBoundingClientRect(); ck.style.animation = '';
    f.classList.remove('is-open'); void f.offsetWidth;
    f.classList.add('is-open');
    haptic([12, 50, 22]);
  }
  $('#okHome').addEventListener('click', () => {
    $('#fullOk').classList.remove('is-open');
    $$('.push.is-open').forEach(p => closePush(p));
    go('home');
  });
  $('#okCheck').addEventListener('click', () => { if (lastOk && lastOk.tx) receipt(lastOk.tx); });

  /* ───────── регистрация ───────── */
  let regStep = 0, reg = { phone: '', name: '', fam: '', pin: '' };
  function regRender() {
    const dots = $$('#regDots i');
    dots.forEach((d, i) => d.classList.toggle('is-on', i <= regStep));
    const b = $('#regBody');
    if (regStep === 0) {
      b.innerHTML = `<div class="reg__t">Регистрация</div>
        <div class="reg__s">Введите номер телефона — он станет вашим логином в ChБанке</div>
        <div class="reg__fields"><div class="inp" id="rPhoneBox"><label>Номер телефона</label><input id="rPhone" type="tel" inputmode="tel" placeholder="+7 (___) ___-__-__" autocomplete="off"></div></div>
        <button class="gbtn reg__btn" id="rNext">Продолжить</button>
        <div class="reg__note">Демо-приложение: данные хранятся только на этом устройстве</div>`;
      const i = $('#rPhone', b);
      i.addEventListener('input', () => { const c = i.selectionStart, l = i.value.length; i.value = fmtPhone(i.value); const d = i.value.length - l; i.setSelectionRange(c + d, c + d); reg.phone = i.value; });
      i.addEventListener('focus', () => $('#rPhoneBox', b).classList.add('is-focus'));
      i.addEventListener('blur', () => $('#rPhoneBox', b).classList.remove('is-focus'));
      $('#rNext', b).addEventListener('click', () => {
        if (num(reg.phone).length !== 11) { haptic([16, 40, 16]); const x = $('#rPhoneBox', b); x.classList.remove('is-err'); void x.offsetWidth; x.classList.add('is-err'); toast('Введите номер полностью', 'err'); return; }
        haptic(12); regStep = 1; regRender();
      });
    }
    if (regStep === 1) {
      b.innerHTML = `<div class="reg__t">Код из СМС</div>
        <div class="reg__s">Отправили код на ${esc(reg.phone)}. В демо подойдёт любые 4 цифры</div>
        <div class="code" id="rCodeBox"><i></i><i></i><i></i><i></i></div>
        <input id="rCode" inputmode="numeric" maxlength="4" style="position:absolute;opacity:0;width:1px;height:1px" autocomplete="off">
        <button class="reg__again" id="rAgain">Отправить код снова</button>
        <div class="reg__fields"><button class="gbtn reg__btn" id="rNext" disabled>Подтвердить</button></div>`;
      const inp = $('#rCode', b), boxes = $$('#rCodeBox i', b), btn = $('#rNext', b);
      setTimeout(() => inp.focus(), 350);
      const paint = () => {
        const v = inp.value;
        boxes.forEach((x, i) => { x.textContent = v[i] || ''; x.classList.toggle('is-on', !!v[i]); x.classList.toggle('is-cur', i === v.length && v.length < 4); });
        btn.disabled = v.length !== 4;
      };
      inp.addEventListener('input', () => { inp.value = num(inp.value).slice(0, 4); paint(); haptic(7); if (inp.value.length === 4) setTimeout(() => btn.click(), 220); });
      $('#rAgain', b).addEventListener('click', () => toast('Код отправлен повторно (демо)'));
      paint();
      btn.addEventListener('click', () => { if (inp.value.length !== 4) return; haptic(12); regStep = 2; regRender(); });
    }
    if (regStep === 2) {
      b.innerHTML = `<div class="reg__t">Как вас зовут?</div>
        <div class="reg__s">Имя и фамилия появятся на картах и в переводах</div>
        <div class="reg__fields">
          <div class="inp" id="bName"><label>Имя</label><input id="rName" type="text" placeholder="Ольга" autocomplete="off"></div>
          <div class="inp" id="bFam"><label>Фамилия</label><input id="rFam" type="text" placeholder="Кузнецова" autocomplete="off"></div>
        </div>
        <button class="gbtn reg__btn" id="rNext">Продолжить</button>`;
      $('#rName', b).addEventListener('input', e => reg.name = e.target.value);
      $('#rFam', b).addEventListener('input', e => reg.fam = e.target.value);
      $$('.inp input', b).forEach(i => { i.addEventListener('focus', () => i.closest('.inp').classList.add('is-focus')); i.addEventListener('blur', () => i.closest('.inp').classList.remove('is-focus')); });
      $('#rNext', b).addEventListener('click', () => {
        const bad = [];
        if (!reg.name.trim()) bad.push('#bName');
        if (!reg.fam.trim()) bad.push('#bFam');
        if (bad.length) { haptic([16, 40, 16]); bad.forEach(s => { const x = $(s, b); x.classList.remove('is-err'); void x.offsetWidth; x.classList.add('is-err'); }); toast('Заполните имя и фамилию', 'err'); return; }
        haptic(12); regStep = 3; regRender();
      });
    }
    if (regStep === 3 || regStep === 4) {
      const conf = regStep === 4;
      b.innerHTML = `<div class="reg__t">${conf ? 'Повторите код' : 'Придумайте код-пароль'}</div>
        <div class="reg__s">${conf ? 'Ещё раз, чтобы не ошибиться' : '4 цифры для входа в приложение'}</div>
        <div class="code" id="rCodeBox"><i></i><i></i><i></i><i></i></div>
        <input id="rCode" inputmode="numeric" maxlength="4" style="position:absolute;opacity:0;width:1px;height:1px" autocomplete="off">
        <div class="reg__fields"><button class="gbtn reg__btn" id="rNext" disabled>${conf ? 'Завершить' : 'Продолжить'}</button></div>`;
      const inp = $('#rCode', b), boxes = $$('#rCodeBox i', b), btn = $('#rNext', b);
      setTimeout(() => inp.focus(), 350);
      const paint = () => {
        const v = inp.value;
        boxes.forEach((x, i) => { x.textContent = '•'; x.style.color = v[i] ? '#fff' : 'transparent'; x.classList.toggle('is-on', !!v[i]); x.classList.toggle('is-cur', i === v.length && v.length < 4); });
        btn.disabled = v.length !== 4;
      };
      inp.addEventListener('input', () => { inp.value = num(inp.value).slice(0, 4); paint(); haptic(7); if (inp.value.length === 4) setTimeout(() => btn.click(), 220); });
      paint();
      btn.addEventListener('click', () => {
        if (inp.value.length !== 4) return;
        if (!conf) { reg.pin = inp.value; haptic(12); regStep = 4; regRender(); return; }
        if (inp.value !== reg.pin) {
          haptic([20, 60, 20]);
          $('#rCodeBox', b).classList.add('is-err');
          toast('Коды не совпадают', 'err');
          setTimeout(() => { inp.value = ''; paint(); $('#rCodeBox', b).classList.remove('is-err'); }, 450);
          return;
        }
        finishReg();
      });
    }
  }
  function finishReg() {
    state.user = { phone: reg.phone, name: reg.name.trim() + ' ' + reg.fam.trim(), pin: reg.pin };
    state.acc = { last4: rnd4(), bal: 15000 };
    state.sav = { last4: rnd4(), bal: 0 };
    do { state.card.last4 = rnd4(); } while (state.card.last4 === state.acc.last4);
    seedTxs();
    save();
    sessionStorage.setItem('chbank.sess', '1');
    haptic([14, 40, 14, 40, 14]);
    $('#scrReg').classList.remove('is-active');
    bootApp();
    setTimeout(() => toast('Добро пожаловать, ' + reg.name.trim() + '!'), 700);
  }

  /* ───────── PIN-вход ───────── */
  function showPin() {
    $('#pinWho').textContent = state.user ? state.user.phone : '';
    const dots = $$('#pinDots i');
    let code = '';
    const pad = $('#pinPad');
    pad.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'face', '0', 'back'].map(k =>
      k === 'back' ? '<button class="pin__key" data-k="back" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L2 12l7-7Z"/><path d="m12 9.5 5 5M17 9.5l-5 5"/></svg></button>'
        : k === 'face' ? '<button class="pin__key" data-k="face" type="button" style="font-size:12px;font-weight:600">Face<br>ID</button>'
          : `<button class="pin__key" data-k="${k}" type="button">${k}</button>`).join('');
    const paint = () => dots.forEach((d, i) => d.classList.toggle('is-on', i < code.length));
    const enter = () => { sessionStorage.setItem('chbank.sess', '1'); haptic([12, 40, 20]); $('#scrPin').classList.remove('is-active'); bootApp(); };
    pad.onclick = e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      haptic(8);
      if (b.dataset.k === 'back') { code = code.slice(0, -1); paint(); return; }
      if (b.dataset.k === 'face') return enter();
      if (code.length < 4) code += b.dataset.k;
      paint();
      if (code.length === 4) setTimeout(() => {
        if (code === state.user.pin) enter();
        else { haptic([24, 60, 24]); $('#pinDots').classList.add('is-err'); setTimeout(() => { $('#pinDots').classList.remove('is-err'); code = ''; paint(); }, 430); }
      }, 160);
    };
    $('#pinFace').onclick = enter;
    paint();
  }

  /* ───────── вкладки ───────── */
  const TABS = ['home', 'saves', 'life', 'pay', 'credit'];
  let tab = 'home';
  function go(name) {
    if (!TABS.includes(name)) return;
    tab = name;
    $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'scr' + name[0].toUpperCase() + name.slice(1)));
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.tab === name));
    haptic(6);
    if (name === 'home') renderHome(false);
    if (name === 'saves') renderSaves();
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.tab)));

  /* ───────── главная ───────── */
  let shownBal = null;
  function renderHome(animate = true) {
    const b = state.hidden ? null : state.acc.bal;
    const node = $('#balMain');
    if (state.hidden) node.textContent = '••••••';
    else if (!animate) { node.textContent = rub(b, 2); shownBal = b; }
    else {
      const from = shownBal == null ? b : shownBal, to = b, t0 = performance.now();
      (function step(ts) {
        const k = clamp((ts - t0) / 650, 0, 1), e = 1 - Math.pow(1 - k, 3);
        node.textContent = rub(from + (to - from) * e, 2);
        if (k < 1) requestAnimationFrame(step); else shownBal = to;
      })(t0);
    }
    $('#tileBal').textContent = state.hidden ? '••••••' : rub(state.acc.bal, 2);
    $('#tileAcc').textContent = 'Счёт •• ' + state.acc.last4;
    $('#tileCardLast').textContent = state.card.last4;
    $('#tileBonusVal').textContent = state.bonus.toLocaleString('ru-RU');
    $('#promo').style.display = state.promoGone ? 'none' : '';
    renderHomeHist();
  }
  function opRow(t, i) {
    const c = CAT[t.c] || CAT.shop;
    const isNew = t.fresh && !t.k; t.k = 1;
    const st = t.st === 'decl' ? '<div class="op__st">Недостаточно средств</div>' : '';
    const warn = t.st === 'decl' ? '<span class="op__warn">!</span>' : '';
    return `<button class="op ${isNew ? 'is-new' : ''}" data-op="${state.txs.indexOf(t)}" style="animation-delay:${Math.min(i * 40, 320)}ms" type="button">
      ${opIcon(t)}
      <span class="op__tx"><span class="op__t">${esc(t.t)}</span><span class="op__s">${esc(ago(t.d))} • ${esc(t.s || c.sub)}</span>${st}</span>
      <span class="op__r"><span class="op__a ${t.a > 0 ? 'is-in' : ''}">${t.a > 0 ? signed(t.a) : rub(Math.abs(t.a))}</span>${warn}</span>
    </button>`;
  }
  function renderHomeHist() {
    const box = $('#homeHist');
    box.innerHTML = state.txs.slice(0, 4).map((t, i) => opRow(t, i)).join('');
    bindOps(box);
  }
  function bindOps(box) {
    $$('.op', box).forEach(b => b.addEventListener('click', () => { haptic(8); receipt(state.txs[+b.dataset.op]); }));
  }

  /* ───────── история (push) ───────── */
  let histF = 'all';
  function renderHist() {
    const list = state.txs.filter(t =>
      histF === 'all' ? true :
        histF === 'income' ? t.a > 0 :
          histF === 'expense' ? t.a < 0 && t.c !== 'self' :
            t.c === 'p2p' || t.c === 'p2pin' || t.c === 'self' || t.c === 'topup');
    const groups = {};
    list.forEach(t => { (groups[dayKey(t.d)] = groups[dayKey(t.d)] || []).push(t); });
    const box = $('#histFull');
    if (!list.length) { box.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M9 14.2s1.2-1.6 3-1.6 3 1.6 3 1.6M9.4 9.6h.01M14.6 9.6h.01" stroke-width="2"/></svg><span>Операций пока нет</span></div>'; return; }
    let i = 0;
    box.innerHTML = Object.entries(groups).map(([g, arr]) =>
      `<div class="hgroup"><div class="hgroup__t">${esc(g)}</div>${arr.map(t => opRow(t, i++)).join('')}</div>`).join('');
    bindOps(box);
  }
  $$('#histFilt .chip').forEach(c => c.addEventListener('click', () => {
    $$('#histFilt .chip').forEach(x => x.classList.remove('is-on'));
    c.classList.add('is-on'); histF = c.dataset.f; haptic(9); renderHist();
  }));
  $('#histMore').addEventListener('click', () => { renderHist(); openPush('#pushHist'); });
  $('#histToggle').addEventListener('click', () => { haptic(8); $('.hist').classList.toggle('is-closed'); });

  /* ───────── экран счёта ───────── */
  function renderAcc() {
    $('#accLast').textContent = state.acc.last4;
    $('#accBal').textContent = state.hidden ? '••••••' : rub(state.acc.bal, 2);
    $('#accSpend').textContent = 'Расходы в ' + MONTHS_PRE[new Date().getMonth()] + ': ' + rub(monthSpend());
    $('#accCardLast').textContent = state.card.last4;
    $('#trFromBal').textContent = state.hidden ? '••••••' : rub(state.acc.bal, 2);
    $('#trFromName').textContent = 'Платёжный счёт •• ' + state.acc.last4;
    $('#topToName').textContent = 'Платёжный счёт •• ' + state.acc.last4;
  }

  /* ───────── шторка «Перевести» ───────── */
  function transferSheet() {
    const contacts = state.contacts.slice(0, 4);
    const S = sheet({
      html: `<div class="sheet__t">Перевести</div>
      <div class="ppl">
        <button class="pplitem pplitem--new" data-a="new" type="button">
          <span class="pplitem__a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M14 7l5 5-5 5"/></svg><span class="sbpbadge"><i class="sbpmark" data-sbp style="width:15px;height:15px"></i></span></span>
          <span class="pplitem__n">Новый перевод</span>
        </button>
        ${contacts.map((c, i) => `<button class="pplitem" data-c="${i}" type="button"><span class="pplitem__a">${esc(initials(c.name))}</span><span class="pplitem__n">${esc(c.name)}</span></button>`).join('')}
        <button class="pplitem" data-a="tpl" type="button"><span class="pplitem__a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z"/></svg></span><span class="pplitem__n">Шаблоны переводов</span></button>
        <button class="pplitem" data-a="auto" type="button"><span class="pplitem__a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/></svg></span><span class="pplitem__n">Автопереводы</span></button>
      </div>
      <div class="sheet__body" style="margin-top:8px">
        <button class="srow" data-a="own" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v13M8 4 5 7M8 4l3 3M16 20V7M16 20l3-3M16 20l-3-3"/></svg>Между своими счетами</button>
        <button class="srow" data-a="world" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.4 2.3 3.6 5.2 3.6 8.6s-1.2 6.3-3.6 8.6c-2.4-2.3-3.6-5.2-3.6-8.6s1.2-6.3 3.6-8.6Z"/></svg>В другую страну</button>
        <button class="glink" data-a="pay" type="button">Перейти в платежи</button>
      </div>`
    });
    const p = S.panel;
    paintSbp();
    p.addEventListener('click', e => {
      const b = e.target.closest('[data-a],[data-c]'); if (!b) return;
      haptic(12);
      if (b.dataset.c !== undefined) { const c = state.contacts[+b.dataset.c]; S.close(); openTransfer({ phone: c.phone, name: c.name }); return; }
      const a = b.dataset.a;
      if (a === 'new') { S.close(); openTransfer(); }
      if (a === 'own') { S.close(); ownSheet(); }
      if (a === 'world') toast('Демо: переводы за рубеж недоступны');
      if (a === 'pay') { S.close(); go('pay'); }
      if (a === 'tpl' || a === 'auto') toast('Демо: раздел появится позже');
    });
  }

  /* ───────── между своими ───────── */
  function ownSheet() {
    let from = 'acc', sumStr = '';
    const S = sheet({ html: '' });
    const names = { acc: () => 'Платёжный счёт •• ' + state.acc.last4, sav: () => 'Накопительный счёт •• ' + state.sav.last4 };
    const bals = { acc: () => state.acc.bal, sav: () => state.sav.bal };
    function render() {
      const to = from === 'acc' ? 'sav' : 'acc';
      S.render(`<div class="sheet__t">Между своими счетами</div>
        <div class="sheet__s">Деньги перемещаются мгновенно и без комиссии</div>
        <div class="sheet__body">
          <div class="fcard fcard--row" id="swap" style="cursor:pointer">
            <span class="fcard__tx"><label>Откуда → куда</label><b>${esc(names[from]())}</b><i>→ ${esc(names[to]())} · ${rub(bals[to](), 2)}</i></span>
            <span class="fromsel"><i class="rsq" style="background:var(--surf3)">⇄</i></span>
          </div>
          <div class="fcard"><label>Сколько</label><input id="ownSum" type="text" inputmode="decimal" placeholder="0 ₽" value="${esc(fmtInputSum(sumStr))}" autocomplete="off"></div>
          <div class="chipsrow">${[1000, 5000, 10000, 15000].map(v => `<button class="chip" data-v="${v}" type="button">${v.toLocaleString('ru-RU')} ₽</button>`).join('')}</div>
        </div>
        <div class="sheet__foot"><button class="gbtn" id="ownGo" type="button">Перевести ${sumStr ? rub(parseSum(sumStr)) : '0 ₽'}</button></div>`);
      const p = S.panel, inp = $('#ownSum', p), btn = $('#ownGo', p);
      const upd = () => { btn.textContent = 'Перевести ' + (sumStr ? rub(parseSum(sumStr)) : '0 ₽'); inp.value = fmtInputSum(sumStr); $$('.chip', p).forEach(c => c.classList.toggle('is-on', num(c.dataset.v) === num(sumStr) && !!sumStr)); };
      inp.addEventListener('input', () => { sumStr = num(inp.value).slice(0, 9); upd(); });
      $$('.chip', p).forEach(c => c.addEventListener('click', () => { sumStr = c.dataset.v; haptic(12); upd(); }));
      $('#swap', p).addEventListener('click', () => { from = to; haptic(10); render(); });
      btn.addEventListener('click', () => {
        const v = parseSum(sumStr);
        if (!v) { toast('Укажите сумму', 'err'); return; }
        if (v > bals[from]()) { toast('Недостаточно средств', 'err'); haptic([20, 50, 20]); return; }
        S.close();
        proc('Переводим', 700).then(() => {
          if (from === 'acc') { state.acc.bal -= v; state.sav.bal += v; } else { state.sav.bal -= v; state.acc.bal += v; }
          state.acc.bal = Math.round(state.acc.bal * 100) / 100; state.sav.bal = Math.round(state.sav.bal * 100) / 100;
          state.txs.unshift({ t: 'Между своими счетами', s: names[from]() + ' → ' + names[to](), c: 'self', a: -v, d: Date.now(), fresh: 1 });
          save(); renderHome(); renderAcc(); renderSaves();
          showOk({ title: 'Перевели', sum: v, who: names[to](), note: 'Перевод между своими счетами · без комиссии', tx: state.txs[0] });
        });
      });
      upd();
    }
    render();
  }

  /* ───────── новый перевод ───────── */
  const BANKS = [
    { id: 'ch', n: 'ChБанк', c: '#21A038', l: 'C', sbp: 1 },
    { id: 'vega', n: 'Вега Банк', c: '#2E6FF2', l: 'В', sbp: 1 },
    { id: 'other', n: 'Другой банк', c: '#565B58', ico: 'bank' },
    { id: 'world', n: 'Другая страна', c: '#565B58', ico: 'globe' }
  ];
  let trBank = 'ch';
  function renderBanks(who) {
    $('#trBanks').innerHTML = BANKS.map(b => `
      <button class="bank ${b.id === trBank ? 'is-on' : ''}" data-b="${b.id}" type="button">
        <span class="bank__lg">
          <span class="bank__c" style="background:${b.c}">${b.ico === 'bank' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5 12 5l8 4.5M5.5 10v7M9.8 10v7M14.2 10v7M18.5 10v7M4 18.5h16"/></svg>' : b.ico === 'globe' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.4 2.3 3.6 5.2 3.6 8.6s-1.2 6.3-3.6 8.6c-2.4-2.3-3.6-5.2-3.6-8.6s1.2-6.3 3.6-8.6Z"/></svg>' : esc(b.l)}</span>
          ${b.sbp ? '<span class="bank__c"><i class="sbpmark" data-sbp style="width:22px;height:22px"></i></span>' : ''}
        </span>
        <span class="bank__n">${esc(b.n)}</span>
        <span class="bank__p">${esc(who || '')}</span>
      </button>`).join('');
    paintSbp();
    $$('#trBanks .bank').forEach(b => b.addEventListener('click', () => { trBank = b.dataset.b; haptic(10); renderBanks(currentWho()); }));
  }
  let trFromAcc = 'acc';
  function currentWho() { return ($('#trName').value || '').trim(); }
  function openTransfer(pre) {
    const P = openPush('#pushTr');
    const ip = $('#trPhone'), inm = $('#trName'), ava = $('#trAva'), isum = $('#trSum');
    ip.value = pre && pre.phone ? fmtPhone(pre.phone) : '';
    inm.value = pre && pre.name ? pre.name : '';
    isum.value = '';
    $('#trMsg').value = '';
    trFromAcc = 'acc';
    const refreshAva = () => {
      const n = inm.value.trim();
      if (n) { ava.textContent = initials(n); ava.classList.add('is-on'); }
      else { ava.classList.remove('is-on'); ava.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8.4" r="3.6"/><path d="M5 19.6a7.2 7.2 0 0 1 14 0"/></svg>'; }
      renderBanks(n ? n.split(' ')[0] : '');
    };
    refreshAva();
    const updBtn = () => { const v = parseSum(isum.value); $('#trGo').textContent = 'Перевести ' + (v ? rub(v) : '0 ₽'); };
    ip.oninput = () => { const c = ip.selectionStart, l = ip.value.length; ip.value = fmtPhone(ip.value); const d = ip.value.length - l; ip.setSelectionRange(c + d, c + d); if (num(ip.value).length === 11 && !inm.dataset.touched) { inm.value = nameFor(ip.value) || ''; refreshAva(); } };
    inm.oninput = () => { inm.dataset.touched = '1'; refreshAva(); };
    isum.oninput = () => { const c = isum.selectionStart, l = isum.value.length; isum.value = fmtInputSum(isum.value) ? fmtInputSum(isum.value) + NB + '₽' : ''; const d = isum.value.length - l; isum.setSelectionRange(c + d, c + d); $$('#trChips .chip').forEach(x => x.classList.toggle('is-on', num(x.dataset.v) === num(isum.value))); updBtn(); };
    $$('#trChips .chip').forEach(c => c.onclick = () => { isum.value = fmtInputSum(c.dataset.v) + NB + '₽'; $$('#trChips .chip').forEach(x => x.classList.toggle('is-on', x === c)); haptic(12); updBtn(); });
    $('#trFrom').onclick = () => {
      const S = sheet({
        html: `<div class="sheet__t">Откуда</div><div class="sheet__body"><div class="slist">
          ${['acc', 'sav'].map(k => `<button class="srow2" data-k="${k}" type="button"><span>${k === 'acc' ? 'Платёжный счёт •• ' + state.acc.last4 : 'Накопительный счёт •• ' + state.sav.last4}</span><em>${rub(k === 'acc' ? state.acc.bal : state.sav.bal, 2)}</em></button>`).join('')}
        </div></div>`
      });
      $$('.srow2', S.panel).forEach(b => b.addEventListener('click', () => {
        trFromAcc = b.dataset.k; haptic(10); S.close();
        $('#trFromBal').textContent = rub(trFromAcc === 'acc' ? state.acc.bal : state.sav.bal, 2);
        $('#trFromName').textContent = trFromAcc === 'acc' ? 'Платёжный счёт •• ' + state.acc.last4 : 'Накопительный счёт •• ' + state.sav.last4;
      }));
    };
    $('#trGo').onclick = () => {
      const phone = ip.value, name = inm.value.trim(), v = parseSum(isum.value);
      const fromBal = trFromAcc === 'acc' ? state.acc.bal : state.sav.bal;
      if (num(phone).length !== 11 || !name) {
        haptic([16, 40, 16]);
        const c = $('#trRcard'); c.classList.remove('is-err'); void c.offsetWidth; c.classList.add('is-err');
        toast(num(phone).length !== 11 ? 'Введите номер получателя' : 'Укажите имя и фамилию', 'err');
        return;
      }
      if (!v) { toast('Укажите сумму перевода', 'err'); haptic([16, 40, 16]); return; }
      const bank = BANKS.find(b => b.id === trBank);
      if (v > fromBal) {
        haptic([20, 50, 20]);
        state.txs.unshift({ t: name, s: 'Перевод в ' + bank.n + ' через СБП · ' + phone, c: 'p2p', a: -v, d: Date.now(), st: 'decl', fresh: 1 });
        save(); renderHome(); renderHist();
        toast('Недостаточно средств — операция отклонена', 'err', 3400);
        return;
      }
      closePush(P);
      proc('Переводим', 1000).then(() => {
        if (trFromAcc === 'acc') state.acc.bal = Math.round((state.acc.bal - v) * 100) / 100;
        else state.sav.bal = Math.round((state.sav.bal - v) * 100) / 100;
        const tx = { t: name, s: 'Перевод в ' + bank.n + ' через СБП · ' + phone, c: 'p2p', a: -v, d: Date.now(), fresh: 1, msg: $('#trMsg').value, meta: { phone, name, bank: bank.n } };
        state.txs.unshift(tx);
        state.contacts = [{ name, phone }].concat(state.contacts.filter(c => c.phone !== phone)).slice(0, 6);
        state.bonus += Math.max(1, Math.round(v * 0.02));
        save(); renderHome(); renderAcc(); renderHist();
        showOk({
          title: 'Перевели', sum: v, who: name,
          note: 'Перевод в ' + bank.n + ' через СБП по номеру телефона ' + phone,
          tx
        });
      });
    };
  }
  function fmtPhone(raw) {
    let d = num(raw);
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    const p = d.slice(1);
    let out = '+7';
    if (p.length) out += ' (' + p.slice(0, 3);
    if (p.length >= 3) out += ')';
    if (p.length > 3) out += ' ' + p.slice(3, 6);
    if (p.length > 6) out += '-' + p.slice(6, 8);
    if (p.length > 8) out += '-' + p.slice(8, 10);
    return out;
  }

  const FN = ['Ольга', 'Анна', 'Мария', 'Дмитрий', 'Сергей', 'Екатерина', 'Алексей', 'Наталья', 'Игорь', 'Юлия', 'Павел', 'Светлана', 'Андрей', 'Дарья', 'Максим', 'Елена'];
  const LN = ['К', 'С', 'М', 'В', 'П', 'Л', 'Т', 'Н', 'Д', 'Б', 'Г', 'Ж', 'Р', 'Ф'];
  function nameFor(phone) { const h = hash(num(phone)); return pick(FN, h) + ' ' + pick(LN, h >> 3) + '.'; }

  /* ───────── пополнение ───────── */
  let topTo = 'acc';
  function openTopup(target) {
    topTo = target || 'acc';
    const P = openPush('#pushTop');
    const isum = $('#topSum');
    isum.value = '';
    const names = () => topTo === 'acc' ? 'Платёжный счёт •• ' + state.acc.last4 : 'Накопительный счёт •• ' + state.sav.last4;
    $('#topToName').textContent = names();
    const upd = () => { const v = parseSum(isum.value); $('#topGo').textContent = 'Пополнить ' + (v ? rub(v) : '0 ₽'); };
    isum.oninput = () => { const c = isum.selectionStart, l = isum.value.length; isum.value = fmtInputSum(isum.value) ? fmtInputSum(isum.value) + NB + '₽' : ''; const d = isum.value.length - l; isum.setSelectionRange(c + d, c + d); $$('#topChips .chip').forEach(x => x.classList.toggle('is-on', num(x.dataset.v) === num(isum.value))); upd(); };
    $$('#topChips .chip').forEach(c => c.onclick = () => { isum.value = fmtInputSum(c.dataset.v) + NB + '₽'; $$('#topChips .chip').forEach(x => x.classList.toggle('is-on', x === c)); haptic(12); upd(); });
    $('#topTo').onclick = () => { topTo = topTo === 'acc' ? 'sav' : 'acc'; $('#topToName').textContent = names(); haptic(10); };
    $('#topGo').onclick = () => {
      const v = parseSum(isum.value);
      if (!v) { toast('Укажите сумму', 'err'); haptic([16, 40, 16]); return; }
      closePush(P);
      proc('Пополняем', 900).then(() => {
        if (topTo === 'acc') state.acc.bal = Math.round((state.acc.bal + v) * 100) / 100;
        else state.sav.bal = Math.round((state.sav.bal + v) * 100) / 100;
        const tx = { t: 'Пополнение', s: names() + ' · без комиссии', c: 'topup', a: v, d: Date.now(), fresh: 1 };
        state.txs.unshift(tx);
        state.bonus += Math.max(1, Math.round(v * 0.01));
        save(); renderHome(); renderAcc(); renderSaves(); renderHist();
        const wb = $('.wallet__bal'); wb.classList.remove('is-hit'); void wb.offsetWidth; wb.classList.add('is-hit');
        showOk({ title: 'Пополнили', sum: v, who: names(), note: 'Пополнение через СБП · без комиссии', tx });
      });
    };
    upd();
  }

  /* ───────── чек операции ───────── */
  function receipt(t) {
    const c = CAT[t.c] || CAT.shop;
    sheet({
      html: `<div class="sheet__t" style="text-align:center">${esc(t.t)}</div>
      <div style="text-align:center;font-size:26px;font-weight:700;letter-spacing:-.8px;margin-top:10px;font-variant-numeric:tabular-nums;${t.a > 0 ? 'color:#4CD97B' : ''}">${t.a > 0 ? signed(t.a) : rub(Math.abs(t.a))}</div>
      <div style="text-align:center"><span class="status ${t.st === 'decl' ? 'status--bad' : 'status--ok'}"><i></i>${t.st === 'decl' ? 'Отклонено' : 'Исполнено'}</span></div>
      <div class="sheet__body">
        <div class="dets">
          <div class="det"><span>Категория</span><b>${esc(c.sub || t.s)}</b></div>
          <div class="det"><span>Дата и время</span><b>${esc(full(t.d))}</b></div>
          <div class="det"><span>Счёт</span><b>Платёжный •• ${esc(state.acc.last4)}</b></div>
          <div class="det"><span>Комиссия</span><b style="color:#4CD97B">0 ₽</b></div>
          <div class="det"><span>Номер операции</span><b>${String(hash(t.t + t.d)).slice(0, 10)}</b></div>
          ${t.meta ? `<div class="det"><span>Получатель</span><b>${esc(t.meta.name)}<br>${esc(t.meta.phone)}</b></div>` : ''}
          ${t.msg ? `<div class="det"><span>Сообщение</span><b>${esc(t.msg)}</b></div>` : ''}
        </div>
      </div>
      <div class="sheet__foot">
        <button class="dbtn" id="rcShare" type="button">Поделиться чеком</button>
      </div>`,
      onMount(S) {
        $('#rcShare', S.panel).addEventListener('click', () => {
          haptic(12);
          const txt = 'ChБанк · ' + t.t + '\n' + signed(t.a) + '\n' + full(t.d);
          if (navigator.share) navigator.share({ title: 'Чек', text: txt }).catch(() => {});
          else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Чек скопирован')).catch(() => toast('Чек сохранён'));
          else toast('Чек сохранён');
        });
      }
    });
  }

  /* ───────── услуги и платежи ───────── */
  const SERVICES = [
    { i: '📱', t: 'Мобильная связь', k: 'mobile' }, { i: '🏠', t: 'ЖКХ', k: 'home' },
    { i: '⚡️', t: 'Электричество', k: 'home' }, { i: '🌐', t: 'Интернет и ТВ', k: 'mobile' },
    { i: '🎬', t: 'Кино и музыка', k: 'fun' }, { i: '🎮', t: 'Игры', k: 'fun' },
    { i: '🚕', t: 'Такси', k: 'taxi' }, { i: '🛒', t: 'Маркетплейсы', k: 'shop' },
    { i: '🏛️', t: 'Госуслуги', k: 'gov' }, { i: '', t: 'Налоги', k: 'gov' },
    { i: '🚓', t: 'Штрафы', k: 'gov' }, { i: '❤️', t: 'Благотворительность', k: 'bonus' }
  ];
  function paySheet(svc) {
    let sumStr = '', acc = '';
    const needAcc = /связ|Интернет|Мобиль/.test(svc.t);
    const S = sheet({ html: '' });
    function render() {
      S.render(`<div class="sheet__t">${esc(svc.t)}</div>
        <div class="sheet__s">Оплата со счёта •• ${esc(state.acc.last4)} · без комиссии</div>
        <div class="sheet__body">
          ${needAcc ? `<div class="fcard"><label>Номер телефона или договор</label><input id="psAcc" class="f-sm" type="tel" placeholder="+7 (___) ___-__-__" value="${esc(acc)}" autocomplete="off"></div>` : ''}
          <div class="fcard"><label>Сколько</label><input id="psSum" type="text" inputmode="decimal" placeholder="0 ₽" value="${esc(fmtInputSum(sumStr))}" autocomplete="off"></div>
          <div class="chipsrow">${[300, 500, 1000, 2000].map(v => `<button class="chip" data-v="${v}" type="button">${v.toLocaleString('ru-RU')} ₽</button>`).join('')}</div>
        </div>
        <div class="sheet__foot"><button class="gbtn" id="psGo" type="button">Оплатить ${sumStr ? rub(parseSum(sumStr)) : '0 ₽'}</button></div>`);
      const p = S.panel, isum = $('#psSum', p), btn = $('#psGo', p), ia = $('#psAcc', p);
      if (ia) ia.addEventListener('input', () => { acc = ia.value; if (needAcc && num(acc) && acc.length < 20) ia.value = fmtPhone(acc) || acc; });
      const upd = () => { btn.textContent = 'Оплатить ' + (sumStr ? rub(parseSum(sumStr)) : '0 ₽'); isum.value = fmtInputSum(sumStr) ? fmtInputSum(sumStr) + NB + '₽' : ''; $$('.chip', p).forEach(c => c.classList.toggle('is-on', num(c.dataset.v) === num(sumStr) && !!sumStr)); };
      isum.addEventListener('input', () => { sumStr = num(isum.value).slice(0, 9); upd(); });
      $$('.chip', p).forEach(c => c.addEventListener('click', () => { sumStr = c.dataset.v; haptic(12); upd(); }));
      btn.addEventListener('click', () => {
        const v = parseSum(sumStr);
        if (!v) { toast('Укажите сумму', 'err'); return; }
        if (needAcc && num(acc).length < 11) { haptic([16, 40, 16]); toast('Укажите номер', 'err'); return; }
        if (v > state.acc.bal) {
          haptic([20, 50, 20]);
          state.txs.unshift({ t: svc.t, s: (acc ? acc + ' · ' : '') + 'Оплата услуги', c: svc.k, a: -v, d: Date.now(), st: 'decl', fresh: 1 });
          save(); renderHome(); renderHist();
          S.close(); toast('Недостаточно средств — операция отклонена', 'err', 3400);
          return;
        }
        S.close();
        proc('Проводим платёж', 900).then(() => {
          state.acc.bal = Math.round((state.acc.bal - v) * 100) / 100;
          const tx = { t: svc.t, s: (acc ? acc + ' · ' : '') + 'Оплата услуги', c: svc.k, a: -v, d: Date.now(), fresh: 1 };
          state.txs.unshift(tx);
          state.bonus += Math.max(1, Math.round(v * 0.03));
          save(); renderHome(); renderAcc(); renderHist();
          showOk({ title: 'Оплатили', sum: v, who: svc.t, note: (acc ? acc + ' · ' : '') + 'Оплата услуги · без комиссии', tx });
        });
      });
      upd();
    }
    render();
  }
  function gridSheet() {
    sheet({
      html: `<div class="sheet__t">Все сервисы</div>
      <div class="sheet__body"><div class="tiles" style="grid-template-columns:repeat(4,1fr)">${SERVICES.map((s, i) => `<button class="tile" data-s="${i}" type="button"><i>${s.i}</i><span>${esc(s.t)}</span></button>`).join('')}</div></div>`,
      onMount(S) {
        $$('.tile', S.panel).forEach(b => b.addEventListener('click', () => { haptic(12); S.close(); paySheet(SERVICES[+b.dataset.s]); }));
      }
    });
  }

  /* ───────── QR ───────── */
  function qrSheet() {
    const S = sheet({
      html: `<div class="sheet__t">Сканер QR</div>
      <div class="sheet__s">Наведите камеру на код продавца</div>
      <div class="sheet__body">
        <div class="qr"><div class="qr__cam"></div><div class="qr__frame"><i></i><i></i><i></i><i></i><div class="qr__line"></div></div><div class="qr__t">Демо: код найдётся сам через пару секунд</div></div>
      </div>`,
      onClose() { clearTimeout(timer); }
    });
    const timer = setTimeout(() => {
      S.close();
      const v = 320;
      proc('Оплачиваем по QR', 900).then(() => {
        if (v > state.acc.bal) {
          state.txs.unshift({ t: 'Кофейня «Пенка»', s: 'Оплата по QR', c: 'cafe', a: -v, d: Date.now(), st: 'decl', fresh: 1 });
          save(); renderHome(); renderHist(); toast('Недостаточно средств', 'err'); return;
        }
        state.acc.bal = Math.round((state.acc.bal - v) * 100) / 100;
        const tx = { t: 'Кофейня «Пенка»', s: 'Оплата по QR · без комиссии', c: 'cafe', a: -v, d: Date.now(), fresh: 1 };
        state.txs.unshift(tx);
        state.bonus += 6;
        save(); renderHome(); renderAcc(); renderHist();
        showOk({ title: 'Оплатили', sum: v, who: 'Кофейня «Пенка»', note: 'Оплата по QR-коду · без комиссии', tx });
      });
    }, 2600);
  }

  /* ───────── накопления ───────── */
  function renderSaves() {
    $('#savBal').textContent = state.hidden ? '••••••' : rub(state.sav.bal, 2);
    $('#goals').innerHTML = state.goals.map(g => {
      const p = clamp(Math.round(g.have / g.sum * 100), 0, 100);
      return `<div class="goal"><div class="goal__t"><span>${esc(g.t)}</span><em>${rub(g.have)} / ${rub(g.sum)}</em></div><div class="goal__bar"><b style="width:${p}%"></b></div><div class="goal__s">Осталось ${rub(g.sum - g.have)} · ${p}%</div></div>`;
    }).join('');
  }
  $('#savTop').addEventListener('click', () => openTopup('sav'));
  $('#savOut').addEventListener('click', () => {
    if (!state.sav.bal) { toast('На накопительном счёте пусто', 'err'); return; }
    const v = state.sav.bal;
    state.sav.bal = 0; state.acc.bal = Math.round((state.acc.bal + v) * 100) / 100;
    state.txs.unshift({ t: 'Вывод с накопительного', s: 'На платёжный счёт •• ' + state.acc.last4, c: 'self', a: v, d: Date.now(), fresh: 1 });
    save(); renderHome(); renderAcc(); renderSaves(); renderHist();
    toast(rub(v) + ' выведено на платёжный счёт');
  });
  $('#addGoal').addEventListener('click', () => toast('Демо: создание целей скоро'));

  /* ───────── жизнь / платежи / кредиты ───────── */
  function renderLife() {
    $('#lifeTiles').innerHTML = SERVICES.slice(0, 8).map((s, i) => `<button class="tile" data-s="${i}" type="button"><i>${s.i}</i><span>${esc(s.t)}</span></button>`).join('');
    $$('#lifeTiles .tile').forEach(b => b.addEventListener('click', () => { haptic(12); paySheet(SERVICES[+b.dataset.s]); }));
    $('#subsList').innerHTML = [
      { t: 'Музыка+', p: 299, c: 'l-pk' }, { t: 'Кино онлайн', p: 399, c: 'l-p' }, { t: 'Облако 100 ГБ', p: 149, c: 'l-b' }
    ].map((s, i) => `<div class="lrow"><i class="lico ${s.c}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z"/></svg></i><span>${esc(s.t)} · ${s.p} ₽/мес</span><button class="dbtn dbtn--sm" data-sub="${i}">Отключить</button></div>`).join('');
    $$('[data-sub]').forEach(b => b.addEventListener('click', () => { haptic(10); toast('Демо: подписка осталась активной'); }));
    $('#payTiles').innerHTML = SERVICES.slice(0, 8).map((s, i) => `<button class="tile" data-s="${i}" type="button"><i>${s.i}</i><span>${esc(s.t)}</span></button>`).join('');
    $$('#payTiles .tile').forEach(b => b.addEventListener('click', () => { haptic(12); paySheet(SERVICES[+b.dataset.s]); }));
  }
  $$('#scrPay [data-pay]').forEach(b => b.addEventListener('click', () => {
    haptic(12);
    const k = b.dataset.pay;
    if (k === 'phone') openTransfer();
    else if (k === 'own') ownSheet();
    else toast('Демо: раздел «' + b.querySelector('span').textContent + '»');
  }));
  $('#crBtn').addEventListener('click', () => {
    sheet({
      html: `<div class="sheet__t">Кредит наличными</div><div class="sheet__s">Предварительное решение сразу</div>
        <div class="sheet__body">
          <div class="fcard"><label>Сумма</label><input id="crSum" type="text" inputmode="numeric" value="300${NB}000" autocomplete="off"></div>
          <div class="chipsrow">${[100000, 300000, 500000, 1000000].map(v => `<button class="chip" data-v="${v}" type="button">${(v / 1000)} тыс ₽</button>`).join('')}</div>
          <div class="fcard"><label>Срок</label><input id="crTerm" type="text" inputmode="numeric" value="24 мес" autocomplete="off"></div>
        </div>
        <div class="sheet__foot"><button class="gbtn" id="crGo" type="button">Отправить заявку</button></div>`,
      onMount(S) {
        $$('.chip', S.panel).forEach(c => c.addEventListener('click', () => { $('#crSum', S.panel).value = num(c.dataset.v).replace(/\B(?=(\d{3})+(?!\d))/g, NB); haptic(10); }));
        $('#crGo', S.panel).addEventListener('click', () => { S.close(); proc('Проверяем', 1100).then(() => toast('Одобрено! Демо-кредит не выдаётся 🙂')); });
      }
    });
  });
  $('#crCard').addEventListener('click', () => toast('Заявка на карту принята (демо)'));

  /* ───────── чат ───────── */
  const QUICK = ['Мой баланс', 'Как перевести деньги?', 'Бонусы', 'Где история?'];
  let chatOn = false;
  function chatInit() {
    if (chatOn) return; chatOn = true;
    $('#chatQuick').innerHTML = QUICK.map(q => `<button type="button">${q}</button>`).join('');
    $$('#chatQuick button').forEach(b => b.addEventListener('click', () => send(b.textContent)));
    push('bot', 'Здравствуйте, ' + (state.user ? state.user.name.split(' ')[0] : '') + '! Я помощник ChБанка: подскажу баланс, помогу с переводом или оплатой.');
  }
  function push(kind, text) {
    const box = $('#chatScroll');
    box.appendChild(el('div', 'bub bub--' + (kind === 'me' ? 'me' : 'bot'), esc(text).replace(/\n/g, '<br>') + `<span class="bub__time">${hhmm(Date.now())}</span>`));
    requestAnimationFrame(() => box.scrollTop = box.scrollHeight);
  }
  function send(v) {
    v = (v || '').trim(); if (!v) return;
    chatInit(); push('me', v); $('#chatText').value = ''; haptic(8);
    const t = el('div', 'bub bub--bot bub--typing', '<i></i><i></i><i></i>');
    $('#chatScroll').appendChild(t); $('#chatScroll').scrollTop = 1e6;
    setTimeout(() => { t.remove(); push('bot', answer(v)); }, 650 + Math.random() * 500);
  }
  function answer(q) {
    const s = q.toLowerCase();
    if (/баланс|скольк|остат/.test(s)) return 'В кошельке ' + rub(state.acc.bal, 2) + ' на платёжном счёте •• ' + state.acc.last4 + ' и ' + rub(state.sav.bal, 2) + ' на накопительном.';
    if (/перев|отправ/.test(s)) return 'Счёт → «Перевести» → «Новый перевод»: номер телефона, имя в формате «Ольга К.», сумма — и деньги уйдут через СБП без комиссии.';
    if (/себе|пополн/.test(s)) return 'Нажмите «Пополнить» на экране счёта, выберите сумму — она зачислится мгновенно.';
    if (/бонус|спасиб/.test(s)) return 'У вас ' + state.bonus.toLocaleString('ru-RU') + ' бонусов ChСпасибо — начисляем 2% с переводов.';
    if (/истор|операц/.test(s)) return 'Главный → «История · Ещё»: там все операции с фильтрами и чеками.';
    if (/привет|здрав/.test(s)) return 'Привет! Чем помочь: баланс, перевод или оплата?';
    if (/qr|кьюар/.test(s)) return 'Главный → значок сканера слева от плитки счёта. Наведите камеру — оплата пройдёт сама (демо).';
    return 'Записал: «' + q + '». Умею показывать баланс, подсказывать про переводы, бонусы и историю.';
  }
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); send($('#chatText').value); });

  /* ───────── поиск ───────── */
  function searchSheet() {
    const S = sheet({
      html: `<div class="sheet__body" style="margin-top:0">
        <div class="fcard" style="margin-bottom:12px"><input id="sq" class="f-sm" type="search" placeholder="Поиск: услуга, операция, получатель" autocomplete="off"></div>
        <div id="sres"></div></div>`
    });
    const q = $('#sq', S.panel), res = $('#sres', S.panel);
    function draw() {
      const v = q.value.trim().toLowerCase();
      const sv = v ? SERVICES.filter(s => s.t.toLowerCase().includes(v)) : SERVICES.slice(0, 8);
      const tx = v ? state.txs.filter(t => (t.t + ' ' + t.s).toLowerCase().includes(v)).slice(0, 5) : [];
      res.innerHTML =
        (sv.length ? `<div class="sect" style="margin-top:4px"><div class="sect__t" style="font-size:15px">Сервисы</div></div><div class="tiles" style="grid-template-columns:repeat(4,1fr)">${sv.map(s => `<button class="tile" data-t="${esc(s.t)}" data-k="${s.k}" type="button"><i>${s.i}</i><span>${esc(s.t)}</span></button>`).join('')}</div>` : '') +
        (tx.length ? `<div class="sect"><div class="sect__t" style="font-size:15px">Операции</div></div><div class="hist__list">${tx.map((t, i) => opRow(t, i)).join('')}</div>` : '') +
        (v && !sv.length && !tx.length ? '<div class="empty"><span>Ничего не нашли</span></div>' : '');
      $$('.tile', res).forEach(b => b.addEventListener('click', () => { S.close(); paySheet({ t: b.dataset.t, k: b.dataset.k }); }));
      bindOps(res);
    }
    q.addEventListener('input', draw); draw();
    setTimeout(() => q.focus(), 380);
  }

  /* ───────── профиль и настройки ───────── */
  function profileSheet() {
    const u = state.user || { name: '—', phone: '—' };
    sheet({
      html: `<div style="display:flex;align-items:center;gap:14px;margin-top:4px">
          <span class="op__i" style="width:56px;height:56px;background:var(--green);font-size:19px">${esc(initials(u.name))}</span>
          <span><b style="font-size:19px;letter-spacing:-.4px;display:block">${esc(u.name)}</b><span style="font-size:14px;color:var(--txt2)">${esc(u.phone)}</span></span>
        </div>
        <div class="sheet__body"><div class="slist">
          <button class="srow2" data-a="set" type="button"><span>Настройки</span><u class="arr"></u></button>
          <button class="srow2" data-a="name" type="button"><span>Изменить имя</span><em>${esc(u.name)}</em></button>
          <button class="srow2" data-a="cards" type="button"><span>Мои карты и счета</span><em>3</em></button>
          <button class="srow2" data-a="exit" type="button"><span>Выйти из профиля</span></button>
          <button class="srow2" data-a="wipe" type="button" style="color:var(--orange)"><span style="color:var(--orange)">Сбросить регистрацию</span></button>
        </div></div>`,
      onMount(S) {
        S.panel.addEventListener('click', e => {
          const b = e.target.closest('[data-a]'); if (!b) return;
          haptic(10);
          const a = b.dataset.a;
          if (a === 'set') { S.close(); settingsSheet(); }
          if (a === 'cards') { S.close(); cardsSheet(); }
          if (a === 'name') {
            S.close();
            sheet({
              html: `<div class="sheet__t">Ваши данные</div><div class="sheet__body">
                <div class="inp"><label>Имя и фамилия</label><input id="nm" type="text" value="${esc(u.name)}" autocomplete="off"></div></div>
                <div class="sheet__foot"><button class="gbtn" id="nmGo" type="button">Сохранить</button></div>`,
              onMount(S2) {
                $('#nmGo', S2.panel).addEventListener('click', () => {
                  const v = $('#nm', S2.panel).value.trim();
                  if (v) { state.user.name = v; save(); toast('Сохранено'); }
                  S2.close();
                });
              }
            });
          }
          if (a === 'exit') { S.close(); sessionStorage.removeItem('chbank.sess'); location.reload(); }
          if (a === 'wipe') {
            S.close();
            sheet({
              html: `<div class="sheet__t">Сбросить всё?</div><div class="sheet__s">Профиль, счета и история будут удалены с устройства</div>
                <div class="sheet__foot"><button class="gbtn" id="wYes" type="button" style="background:var(--orange)">Да, сбросить</button><button class="dbtn" id="wNo" type="button">Отмена</button></div>`,
              onMount(S3) {
                $('#wNo', S3.panel).addEventListener('click', S3.close);
                $('#wYes', S3.panel).addEventListener('click', () => { localStorage.removeItem(KEY); sessionStorage.clear(); location.reload(); });
              }
            });
          }
        });
      }
    });
  }
  function settingsSheet() {
    sheet({
      html: `<div class="sheet__t">Настройки</div>
      <div class="sheet__body"><div class="slist">
        <div class="srow2"><span>Скрыть баланс</span><label class="sw"><input type="checkbox" id="swHide" ${state.hidden ? 'checked' : ''}><i></i></label></div>
        <div class="srow2"><span>Вибрация</span><label class="sw"><input type="checkbox" id="swHap" ${state.haptics ? 'checked' : ''}><i></i></label></div>
        <div class="srow2"><span>Уведомления</span><label class="sw"><input type="checkbox" id="swNot" ${state.notif ? 'checked' : ''}><i></i></label></div>
        <button class="srow2" id="stSec" type="button"><span>Безопасность</span><u class="arr"></u></button>
        <button class="srow2" id="stTar" type="button"><span>Условия тарифа</span><u class="arr"></u></button>
      </div></div>`,
      onMount(S) {
        $('#swHide', S.panel).addEventListener('change', e => { state.hidden = e.target.checked; save(); renderHome(); renderAcc(); applyEye(); haptic(12); });
        $('#swHap', S.panel).addEventListener('change', e => { state.haptics = e.target.checked; save(); haptic(20); });
        $('#swNot', S.panel).addEventListener('change', e => { state.notif = e.target.checked; save(); });
        $('#stSec', S.panel).addEventListener('click', () => toast('Демо: безопасность на максимуме 🛡'));
        $('#stTar', S.panel).addEventListener('click', () => { S.close(); tariffSheet(); });
      }
    });
  }
  function tariffSheet() {
    sheet({
      html: `<div class="sheet__t">Условия тарифа</div>
      <div class="sheet__body"><div class="dets">
        <div class="det"><span>Обслуживание</span><b style="color:#4CD97B">0 ₽</b></div>
        <div class="det"><span>Переводы по СБП</span><b>без комиссии</b></div>
        <div class="det"><span>Бонусы с переводов</span><b>2%</b></div>
        <div class="det"><span>Лимит переводов в сутки</span><b>300 000 ₽</b></div>
        <div class="det"><span>Ставка накопительного счёта</span><b>14% годовых</b></div>
      </div></div>`
    });
  }
  function cardsSheet() {
    sheet({
      html: `<div class="sheet__t">Карты и счета</div>
      <div class="sheet__body"><div class="dets">
        <div class="det"><span>Платёжный счёт</span><b>•• ${esc(state.acc.last4)} · ${rub(state.acc.bal, 2)}</b></div>
        <div class="det"><span>Накопительный счёт</span><b>•• ${esc(state.sav.last4)} · ${rub(state.sav.bal, 2)}</b></div>
        <div class="det"><span>Карта МИР</span><b>•• ${esc(state.card.last4)}</b></div>
      </div>
      <div class="sheet__foot"><button class="dbtn" id="cpReq" type="button">Скопировать реквизиты</button></div>`,
      onMount(S) {
        $('#cpReq', S.panel).addEventListener('click', () => {
          haptic(12);
          const txt = 'ChБанк · ' + state.user.name + '\nСчёт 40817810' + state.acc.last4 + '\nКарта •• ' + state.card.last4;
          if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Реквизиты скопированы')).catch(() => toast('Реквизиты: ' + txt, 'ok', 4000));
          else toast('Реквизиты: ' + txt, 'ok', 4000);
        });
      }
    });
  }
  function menuSheet() {
    sheet({
      html: `<div class="sheet__t">Меню</div>
      <div class="sheet__body"><div class="slist">
        <button class="srow2" data-a="prof" type="button"><span>Профиль</span><u class="arr"></u></button>
        <button class="srow2" data-a="set" type="button"><span>Настройки</span><u class="arr"></u></button>
        <button class="srow2" data-a="qr" type="button"><span>Сканер QR</span><u class="arr"></u></button>
        <button class="srow2" data-a="chat" type="button"><span>Помощник</span><u class="arr"></u></button>
        <button class="srow2" data-a="srv" type="button"><span>Все сервисы</span><u class="arr"></u></button>
      </div></div>`,
      onMount(S) {
        S.panel.addEventListener('click', e => {
          const b = e.target.closest('[data-a]'); if (!b) return;
          haptic(10); S.close();
          const a = b.dataset.a;
          if (a === 'prof') profileSheet();
          if (a === 'set') settingsSheet();
          if (a === 'qr') qrSheet();
          if (a === 'chat') { chatInit(); openPush('#pushChat'); }
          if (a === 'srv') gridSheet();
        });
      }
    });
  }

  /* ───────── глаз ───────── */
  function applyEye() {
    $('#eyeIco').innerHTML = state.hidden
      ? '<path d="M3 3l18 18"/><path d="M10.7 6.3A9.6 9.6 0 0 1 12 6.2c6 0 9.5 5.8 9.5 5.8a17 17 0 0 1-3.2 3.9M6.5 8A16.4 16.4 0 0 0 2.5 12S6 17.8 12 17.8a9.6 9.6 0 0 0 3.5-.7"/>'
      : '<path d="M2.5 12S6 6.2 12 6.2 21.5 12 21.5 12 18 17.8 12 17.8 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>';
  }

  /* ───────── кнопки главной ───────── */
  $('#btnWallet').addEventListener('click', () => { renderAcc(); openPush('#pushAcc'); });
  $('#tileCard').addEventListener('click', () => { renderAcc(); openPush('#pushAcc'); });
  $('#tileBonus').addEventListener('click', () => toast('Бонусов ChСпасибо: ' + state.bonus.toLocaleString('ru-RU')));
  $('#btnQr').addEventListener('click', () => { haptic(12); qrSheet(); });
  $('#btnShield').addEventListener('click', () => toast('Защита счёта включена 🛡'));
  $('#btnEye').addEventListener('click', () => { state.hidden = !state.hidden; save(); applyEye(); renderHome(false); renderAcc(); haptic(14); toast(state.hidden ? 'Баланс скрыт' : 'Баланс виден'); });
  $('#btnDots').addEventListener('click', () => menuSheet());
  $('#btnGrid').addEventListener('click', () => gridSheet());
  $('#btnAvatar').addEventListener('click', () => profileSheet());
  $('#btnSearch').addEventListener('click', () => searchSheet());
  $('#btnChat').addEventListener('click', () => { chatInit(); openPush('#pushChat'); });
  $('#promoX').addEventListener('click', () => { state.promoGone = true; save(); $('#promo').classList.add('is-gone'); setTimeout(() => $('#promo').style.display = 'none', 320); haptic(8); });
  $('#promoBtn').addEventListener('click', () => { haptic([14, 40, 14]); toast('Вклад «Мечта» открыт (демо)'); });
  $('#accPlus').addEventListener('click', () => openTopup('acc'));
  $('#actTopup').addEventListener('click', () => openTopup('acc'));
  $('#actTransfer').addEventListener('click', () => transferSheet());
  $('#actPay').addEventListener('click', () => gridSheet());
  $('#accPay').addEventListener('click', () => toast('ChPay: оплатите телефоном (демо)'));
  $('#accCard').addEventListener('click', () => cardsSheet());
  $('#accGear').addEventListener('click', () => settingsSheet());
  $('#infoTariff').addEventListener('click', () => tariffSheet());
  $('#shareAcc').addEventListener('click', () => {
    haptic(12);
    const txt = 'Совместный счёт ChБанка •• ' + state.acc.last4;
    if (navigator.share) navigator.share({ title: 'ChБанк', text: txt }).catch(() => {});
    else toast('Ссылка на совместный счёт скопирована');
  });

  /* ───────── ripple ───────── */
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest('.gbtn,.dbtn,.wbtn,.chip,.tile,.act3,.hbtn,.tab,.op,.lrow,.pill,.achip,.bank,.sq,.wtile,.pplitem,.srow,.srow2');
    if (!t) return;
    const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.1;
    const light = t.matches('.gbtn,.chip.is-on,.pplitem--new .pplitem__a');
    const dark = t.matches('.wbtn');
    const s = el('span', 'ripple' + (dark ? ' ripple--dark' : light ? ' ripple--light' : ''));
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
    t.style.overflow = 'hidden';
    t.appendChild(s);
    setTimeout(() => s.remove(), 620);
  }, { passive: true });

  /* ───────── запуск ───────── */
  function bootApp() {
    $('#app').classList.add('is-ready');
    $$('.screen').forEach(s => s.classList.remove('is-active'));
    $('#scrHome').classList.add('is-active');
    applyEye(); paintSbp();
    renderHome(false); shownBal = state.acc.bal; renderHome(true);
    renderAcc(); renderSaves(); renderLife(); renderHist();
    go('home');
  }
  function start() {
    paintSbp();
    if (!state.user) { regStep = 0; regRender(); $('#scrReg').classList.add('is-active'); return; }
    if (sessionStorage.getItem('chbank.sess')) { bootApp(); return; }
    $('#scrPin').classList.add('is-active');
    showPin();
  }
  start();
})();
