/* ══════════════════════════════════════════════════════════════
   ChБанк — демо мобильного банка
   Всё состояние живёт в localStorage, деньги — виртуальные.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* страховка для старых WebView */
  if (typeof window.structuredClone !== 'function') {
    window.structuredClone = o => JSON.parse(JSON.stringify(o));
  }

  /* ───────── утилиты ───────── */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const NBSP = '\u202F';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function money(n, dec) {
    const v = Math.abs(Number(n) || 0);
    const d = dec === undefined ? (v % 1 ? 2 : 0) : dec;
    return v.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }
  const rub = (n, dec) => money(n, dec) + NBSP + '₽';
  /* сумма со знаком: «−3 500 ₽» / «+12 000 ₽» */
  const signed = n => (n > 0 ? '+' : '−') + rub(Math.abs(n));
  const num = (s) => String(s).replace(/\D/g, '');

  function ago(d) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const diff = Math.round((t - x) / 864e5);
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Вчера';
    if (diff < 7) return diff + ' дня назад';
    return x.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }
  const hhmm = d => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const full = d => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
  const daysBack = n => Date.now() - n * 864e5;

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
  function pick(arr, seed) { return arr[seed % arr.length]; }

  function initials(name) {
    const p = String(name).trim().split(/[\s.]+/).filter(Boolean);
    return ((p[0] || 'Ч')[0] + (p[1] ? p[1][0] : (p[0][1] || ''))).toUpperCase();
  }
  function personColor(seed) {
    const c = [['#3CC86B', '#0A6E2E'], ['#5AA9FF', '#1E4FD1'], ['#FFB057', '#E0600A'],
               ['#C08CFF', '#6D28D9'], ['#FF8BB0', '#DB2777'], ['#4FD8D2', '#0C7C8F'],
               ['#FFD35C', '#C08A05'], ['#8FE0AE', '#128C3A']];
    return c[seed % c.length];
  }

  function haptic(p) {
    if (!state.haptics) return;
    try { navigator.vibrate && navigator.vibrate(p); } catch (e) {}
  }

  /* ───────── каталог категорий ───────── */
  const CAT = {
    self:      { icon: '🔄', grad: 'q-g',  label: 'Перевод себе' },
    p2p:       { icon: '👤', grad: 'q-b',  label: 'Перевод' },
    topup:     { icon: '💚', grad: 'q-g',  label: 'Пополнение' },
    salary:    { icon: '💼', grad: 'q-g',  label: 'Зачисление' },
    market:    { icon: '🛒', grad: 'q-g',  label: 'Продукты' },
    cafe:      { icon: '☕', grad: 'q-o',  label: 'Кафе' },
    transport: { icon: '🚇', grad: 'q-b',  label: 'Транспорт' },
    taxi:      { icon: '🚕', grad: 'q-y',  label: 'Такси' },
    fuel:      { icon: '⛽️', grad: 'q-gr', label: 'Топливо' },
    home:      { icon: '🏠', grad: 'q-t',  label: 'Дом и ЖКХ' },
    mobile:    { icon: '📱', grad: 'q-p',  label: 'Связь' },
    sub:       { icon: '🎬', grad: 'q-pk', label: 'Подписки' },
    shop:      { icon: '🛍️', grad: 'q-pk', label: 'Покупки' },
    pharm:     { icon: '💊', grad: 'q-t',  label: 'Аптека' },
    fun:       { icon: '🎮', grad: 'q-p',  label: 'Развлечения' },
    bonus:     { icon: '⭐️', grad: 'q-y',  label: 'Бонусы' },
    card:      { icon: '💳', grad: 'q-gr', label: 'Карта' },
    gov:       { icon: '🏛️', grad: 'q-b',  label: 'Госуслуги' }
  };
  const cat = k => CAT[k] || { icon: '💠', grad: 'q-gr', label: 'Операция' };

  /* ───────── состояние ───────── */
  const KEY = 'chbank.v1';
  const now = new Date();

  const DEFAULT = {
    name: 'Иван Петров',
    id: '4821 9076',
    hidden: false,
    theme: 'light',
    haptics: true,
    bonus: 3482,
    cards: [
      { id: 'c1', name: 'Дебетовая ChБанк', type: 'card--green', sys: 'MIR', num: '2202 20•• •••• 4821', holder: 'IVAN PETROV', exp: '09/29', bal: 128450.75, main: true },
      { id: 'c2', name: 'ChБанк Прайм', type: 'card--dark', sys: 'MIR', num: '5412 75•• •••• 1093', holder: 'IVAN PETROV', exp: '04/28', bal: 42300 },
      { id: 'c3', name: 'Накопительный счёт', type: 'card--blue', sys: '16% годовых', num: '4081 78•• •••• 7712', holder: 'IVAN PETROV', exp: '', bal: 96120.40 }
    ],
    txs: [
      { t: 'Перевод • Ольга К.',        s: '+7 (916) •••-••-42 · по номеру телефона', c: 'p2p',       a: -3500,    d: daysBack(0) + 3.2e6,  n: 1 },
      { t: 'Пятёрочка',                 s: 'Москва, ул. Ленина, 12 · продукты',        c: 'market',    a: -1846.40, d: daysBack(0) + 1.1e6,  n: 0, b: '+36' },
      { t: 'Метро Москвы',              s: 'Тройка · поездка',                         c: 'transport', a: -57,      d: daysBack(0) + 4e5,    n: 0 },
      { t: 'Кофейня «Правда»',         s: 'Утренний кофе и круассан',                 c: 'cafe',      a: -420,     d: daysBack(1) + 6e6,    n: 0, b: '+8' },
      { t: 'Зачисление зарплаты',       s: 'ООО «Ромашка» · за октябрь',               c: 'salary',    a: 145000,   d: daysBack(1) + 3e6,    n: 1 },
      { t: 'Яндекс Такси',              s: 'Поездка по городу · 18 минут',             c: 'taxi',      a: -684,     d: daysBack(2) + 7e6,    n: 0 },
      { t: 'ЖКХ · Квартплата',          s: 'ЕПД за октябрь · по подписке',             c: 'home',      a: -6240.18, d: daysBack(2) + 2e6,    n: 1, b: '+124' },
      { t: 'Ozon',                      s: 'Заказ №4417-882 · 3 товара',               c: 'shop',      a: -4290,    d: daysBack(3) + 5e6,    n: 0, b: '+85' },
      { t: 'МТС',                       s: 'Мобильная связь · +7 (916) 214-88-05',     c: 'mobile',    a: -650,     d: daysBack(3) + 1.5e6,  n: 1 },
      { t: 'Перевод себе',              s: 'На накопительный счёт',                    c: 'self',      a: -15000,   d: daysBack(4) + 4e6,    n: 1 },
      { t: 'Аптека «Горздрав»',        s: 'Витамины и мелочи',                        c: 'pharm',     a: -892.50,  d: daysBack(4) + 9e5,    n: 0 },
      { t: 'Кинотеатр «Октябрь»',      s: '2 билета · сеанс 19:40',                   c: 'fun',       a: -1180,    d: daysBack(5) + 6e6,    n: 0 },
      { t: 'Подписка ChPlay',           s: 'Ежемесячное списание',                     c: 'sub',       a: -399,     d: daysBack(5) + 1e6,    n: 1 },
      { t: 'Лукойл АЗС',                s: 'Топливо, 42 литра',                        c: 'fuel',      a: -2760,    d: daysBack(6) + 5e6,    n: 0, b: '+55' },
      { t: 'Перевод • Дмитрий С.',      s: '+7 (903) •••-••-18 · по номеру телефона',  c: 'p2p',       a: -8000,    d: daysBack(7) + 4e6,    n: 1 },
      { t: 'Возврат • Магнит',          s: 'Возврат покупки',                          c: 'market',    a: 640,      d: daysBack(7) + 1e6,    n: 1 },
      { t: 'Перевод • Анна М.',         s: '+7 (926) •••-••-77 · по номеру телефона',  c: 'p2p',       a: 12000,    d: daysBack(8) + 3e6,    n: 1 },
      { t: 'Wildberries',               s: 'Заказ №991-2210 · курьером',               c: 'shop',      a: -3120.90, d: daysBack(9) + 6e6,    n: 0, b: '+62' },
      { t: 'Кафе «Хачапури»',          s: 'Ужин на двоих',                            c: 'cafe',      a: -2450,    d: daysBack(10) + 7e6,   n: 0 },
      { t: 'Бонусы Спасибо',            s: 'Начисление за покупки',                    c: 'bonus',     a: 1,        d: daysBack(11) + 2e6,   n: 1, txt: '+486 бонусов' }
    ],
    lastPerson: null,
    lastPhone: null
  };

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT);
      const p = JSON.parse(raw);
      if (!p || !Array.isArray(p.cards) || !p.cards.length) return structuredClone(DEFAULT);
      return Object.assign(structuredClone(DEFAULT), p);
    } catch (e) { return structuredClone(DEFAULT); }
  }
  let saveT;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }, 120); }

  const total = () => state.cards.reduce((s, c) => s + c.bal, 0);
  const mainCard = () => state.cards.find(c => c.main) || state.cards[0];
  const cardById = id => state.cards.find(c => c.id === id) || mainCard();
  let activeCard = mainCard();

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = state.theme === 'dark' ? '#0A0F0C' : '#1FA84B';
    const sw = $('#swTheme'); if (sw) sw.checked = state.theme === 'dark';
  }

  /* ───────── рендер: карты ───────── */
  const waveSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 8.5a7 7 0 0 1 0 7M11 6a11 11 0 0 1 0 12M15 4a15 15 0 0 1 0 16"/></svg>';

  function renderCards() {
    const wrap = $('#cards');
    wrap.innerHTML = state.cards.map(c => `
      <button class="card ${c.type} ${c.id === activeCard.id ? '' : 'is-dim'}" data-card="${c.id}" type="button">
        <i class="card__glow"></i><i class="card__grid"></i>
        <div class="card__top">
          <span class="card__bank"><i>Ch</i>ChБанк</span>
          <span class="card__chip"></span>
          <span class="card__wave">${waveSvg}</span>
        </div>
        <div class="card__mid">
          <span class="card__sum">${state.hidden ? '••••••' : rub(c.bal)}</span>
          <span class="card__num">${c.num}</span>
        </div>
        <div class="card__bot"><span>${esc(c.name)}</span><span class="card__sys">${esc(c.sys)}</span></div>
      </button>`).join('');
    $('#cardDots').innerHTML = state.cards.map(c => `<i class="${c.id === activeCard.id ? 'is-on' : ''}"></i>`).join('');
    $$('#cards .card').forEach(b => b.addEventListener('click', () => { haptic(8); openCard(cardById(b.dataset.card)); }));
  }

  /* карусель: активная карта = та, что ближе к центру */
  let scrollT;
  function bindCarousel() {
    const wrap = $('#cards');
    wrap.addEventListener('scroll', () => {
      clearTimeout(scrollT);
      scrollT = setTimeout(() => {
        const mid = wrap.scrollLeft + wrap.clientWidth / 2;
        let best = state.cards[0], bd = 1e9;
        $$('.card', wrap).forEach(n => {
          const c = n.offsetLeft + n.offsetWidth / 2;
          const d = Math.abs(c - mid);
          if (d < bd) { bd = d; best = cardById(n.dataset.card); }
        });
        if (best.id !== activeCard.id) { activeCard = best; renderCards(); renderBal(false); }
      }, 90);
    }, { passive: true });
  }

  /* ───────── рендер: баланс ───────── */
  let shown = 0, rafId;
  function renderBal(animate = true) {
    const node = $('#balTotal');
    const t = state.hidden ? 0 : total();
    $('#balLabel').textContent = state.cards.length > 1 ? 'Общий баланс · ' + state.cards.length + ' счёта' : 'Баланс';
    if (state.hidden) { cancelAnimationFrame(rafId); shown = 0; node.textContent = '••••••'; return; }
    if (!animate) { cancelAnimationFrame(rafId); shown = t; node.textContent = money(t, 2); return; }
    cancelAnimationFrame(rafId);
    const from = shown || t, to = t, t0 = performance.now(), dur = 720;
    (function step(ts) {
      const k = clamp((ts - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      shown = from + (to - from) * e;
      node.textContent = money(shown, 2);
      if (k < 1) rafId = requestAnimationFrame(step);
      else { shown = to; node.textContent = money(to, 2); }
    })(t0);
  }

  function bumpBalance() {
    const v = $('.bal__val');
    v.classList.remove('is-hit'); void v.offsetWidth; v.classList.add('is-hit');
  }

  /* ───────── рендер: операции ───────── */
  let filter = 'all';
  function txList() {
    return state.txs.slice().sort((a, b) => b.d - a.d).filter(t =>
      filter === 'all' ? true :
      filter === 'income' ? t.a > 0 :
      filter === 'expense' ? t.a < 0 && t.c !== 'self' :
      t.c === 'p2p' || t.c === 'self' || t.c === 'topup');
  }
  function renderTxs(animate = true) {
    const box = $('#txList'), list = txList();
    $('#txEmpty').hidden = list.length > 0;
    box.innerHTML = list.slice(0, 30).map((t, i) => {
      const c = cat(t.c);
      const isIn = t.a > 0;
      const delay = animate ? Math.min(i * 32, 380) : 0;
      return `<button class="tx ${t.n && !t.k ? 'is-new' : ''}" data-i="${state.txs.indexOf(t)}" style="animation-delay:${delay}ms" type="button">
        <i class="tx__i ${c.grad}">${c.icon}</i>
        <span class="tx__main">
          <span class="tx__t">${esc(t.t)}</span>
          <span class="tx__s">${esc(t.s)}</span>
        </span>
        <span class="tx__r">
          <span class="tx__a ${isIn ? 'is-in' : 'is-out'}">${t.txt ? esc(t.txt) : signed(t.a)}</span>
          <span class="tx__b">${ago(t.d)}, ${hhmm(t.d)}</span>
        </span>
      </button>`;
    }).join('');
    $$('#txList .tx').forEach(b => b.addEventListener('click', () => { haptic(8); openTx(state.txs[+b.dataset.i]); }));
    if (animate) setTimeout(() => state.txs.forEach(t => { t.k = 1; }), 1400);
  }

  function renderInsight() {
    const month = state.txs.filter(t => new Date(t.d).getMonth() === now.getMonth());
    const out = Math.abs(month.filter(t => t.a < 0).reduce((s, t) => s + t.a, 0));
    const inc = month.filter(t => t.a > 0 && !t.txt).reduce((s, t) => s + t.a, 0);
    $('#insOut').textContent = rub(out);
    $('#insIn').textContent = rub(inc);
    const bars = [42, 68, 35, 88, 56, 74, 48];
    const mx = Math.max(...bars);
    $('#chart').innerHTML = bars.map((b, i) =>
      `<i class="${b === mx ? 'is-max' : ''}" style="height:${b}%;animation-delay:${i * 55}ms"></i>`).join('');
    $('#statBonus').textContent = state.bonus.toLocaleString('ru-RU');
    $('#statCards').textContent = state.cards.length;
    $('#statOps').textContent = state.txs.length;
    $('#rowCards').textContent = state.cards.length;
    $('#profName').textContent = state.name;
    $('#profId').textContent = state.id;
    $('#profAva').textContent = initials(state.name);
    $$('.ava--sm').forEach(n => n.textContent = initials(state.name));
  }

  /* ───────── навигация по вкладкам ───────── */
  const TABS = ['home', 'pay', 'chat', 'prof'];
  let tab = 'home';
  function go(name, dir = 1) {
    if (!TABS.includes(name)) return;
    tab = name;
    $$('.screen').forEach(s => {
      const on = s.id === 'screen-' + name;
      s.classList.toggle('is-out', !on && dir > 0);
      s.classList.toggle('is-active', on);
    });
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.tab === name));
    const idx = TABS.indexOf(name), ind = $('#tabInd');
    if (ind) ind.style.transform = `translateX(${idx * 100}%)`;
    const sc = $('.screen.is-active .scroll'); if (sc) sc.scrollTop = 0;
    if (name === 'home') { renderBal(true); renderInsight(); }
    haptic(6);
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => { haptic(10); go(t.dataset.tab); }));

  /* ───────── тосты ───────── */
  function toast(text, type = 'ok', ttl = 2600) {
    const t = el('div', 'toast toast--' + type, `<i>${type === 'ok' ? '✓' : type === 'err' ? '!' : 'i'}</i><span>${esc(text)}</span>`);
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, ttl);
  }

  /* ───────── конфетти ───────── */
  function confetti(n = 34) {
    const box = $('#confetti');
    const colors = ['#4CD97B', '#1FA84B', '#FFD35C', '#5AA9FF', '#FF8BB0', '#C08CFF', '#4FD8D2'];
    for (let i = 0; i < n; i++) {
      const p = el('i');
      p.style.background = colors[i % colors.length];
      p.style.left = (44 + Math.random() * 12) + '%';
      p.style.top = '30%';
      box.appendChild(p);
      const dx = (Math.random() - .5) * 460, dy = -120 - Math.random() * 320;
      p.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * .6}px,${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px,${dy + 760}px) rotate(${Math.random() * 900}deg)`, opacity: 0 }
      ], { duration: 1500 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)', delay: Math.random() * 120 })
        .onfinish = () => p.remove();
    }
  }

  /* ───────── шторки ───────── */
  let openSheets = [];
  function sheet(opts) {
    const root = el('div', 'sheet');
    root.innerHTML = `<div class="sheet__bd"></div><div class="sheet__panel"></div>`;
    const panel = $('.sheet__panel', root);
    const close = () => {
      if (!root.isConnected) return;
      root.classList.remove('is-open');
      openSheets = openSheets.filter(s => s !== api);
      haptic(6);
      setTimeout(() => root.remove(), 400);
      opts.onClose && opts.onClose();
    };
    const api = { root, panel, close, render };
    function render(html) {
      panel.innerHTML = `<button class="sheet__close" type="button" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button><div class="grab"></div>${html}`;
      $('.sheet__close', panel).addEventListener('click', close);
      panel.scrollTop = 0;
      swipe(panel, close);
    }
    $('#sheets').appendChild(root);
    openSheets.push(api);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
    $('.sheet__bd', root).addEventListener('click', close);
    render(opts.html || '');
    opts.onMount && opts.onMount(api);
    return api;
  }
  function swipe(panel, close) {
    let y0 = null, dy = 0;
    panel.addEventListener('pointerdown', e => {
      if (panel.scrollTop > 2) return;
      if (e.target.closest('.keys,.field input,.sw')) return;
      y0 = e.clientY; dy = 0; panel.style.transition = 'none';
    });
    panel.addEventListener('pointermove', e => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (y0 === null) return;
      y0 = null; panel.style.transition = ''; panel.style.transform = '';
      if (dy > 110) close();
      dy = 0;
    };
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
    panel.addEventListener('pointerleave', end);
  }

  /* ───────── полноэкранные модалки ───────── */
  function fscreen(opts) {
    const root = el('div', 'fscreen');
    let f, closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      root.classList.remove('is-open');
      haptic(6);
      setTimeout(() => root.remove(), 460);
      opts.onClose && opts.onClose();
    };
    root.innerHTML = `<div class="fscreen__top">
        <button class="icon-btn icon-btn--grey" data-x type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="fscreen__title">${esc(opts.title || '')}</div>
        <span style="width:40px"></span>
      </div>
      <div class="fscreen__body"></div>`;
    $('#full').appendChild(root);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
    $('[data-x]', root).addEventListener('click', close);
    f = { root, close, isOpen: () => !closed && document.body.contains(root), body: $('.fscreen__body', root) };
    opts.mount && opts.mount(f.body, close, f);
    return f;
  }

  /* ───────── клавиатура ───────── */
  function keypad(onKey) {
    const back = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L2 12l7-7Z"/><path d="m12 9.5 5 5M17 9.5l-5 5"/></svg>';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'fn', '0', 'back'];
    return `<div class="keys">${keys.map(k =>
      k === 'back' ? `<button class="key" data-k="back" type="button">${back}</button>` :
      k === 'fn' ? `<button class="key key--fn" data-k="clear" type="button">C</button>` :
      `<button class="key" data-k="${k}" type="button">${k}</button>`).join('')}</div>`;
  }
  function bindKeypad(root, onKey) {
    $$('.key', root).forEach(b => b.addEventListener('click', () => {
      haptic(7);
      const k = b.dataset.k;
      if (k === 'back') onKey('back');
      else if (k === 'clear') onKey('clear');
      else onKey(k);
      b.animate([{ transform: 'scale(.9)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }));
  }

  /* форматирование суммы: "12 500,50" */
  function fmtSum(digits) {
    if (!digits.length) return '';
    let d = digits.replace(/^0+(?=\d)/, '');
    if (!d) return '0';
    const hasComma = digits.includes(',');
    let int = d, frac = '';
    if (hasComma) { const p = d.split(','); int = p[0] || '0'; frac = (p[1] || '').slice(0, 2); }
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return int + (hasComma ? ',' + frac : '');
  }
  function parseSum(str) { return Number(String(str).replace(/[^\d,]/g, '').replace(',', '.')) || 0; }

  /* ───────── имена получателей ───────── */
  const FN = ['Ольга', 'Анна', 'Мария', 'Дмитрий', 'Сергей', 'Екатерина', 'Алексей', 'Наталья',
    'Игорь', 'Юлия', 'Павел', 'Светлана', 'Андрей', 'Дарья', 'Максим', 'Елена',
    'Никита', 'Ксения', 'Артём', 'Виктория', 'Роман', 'Полина', 'Иван', 'Татьяна'];
  const LN = ['К', 'С', 'М', 'В', 'П', 'Л', 'Т', 'Н', 'Д', 'Б', 'Г', 'Ж', 'З', 'Р', 'Ф', 'Х'];
  function nameFor(phone) {
    const d = num(phone);
    if (d.length < 4) return null;
    const h = hash(d);
    return pick(FN, h) + ' ' + pick(LN, h >> 3) + '.';
  }

  /* ───────── ввод номера телефона ───────── */
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
  function fmtCardNum(raw) {
    const d = num(raw).slice(0, 19);
    return d.replace(/(.{4})/g, '$1 ').trim();
  }
  function maskPhone(p) {
    const d = num(p);
    return '+7 (' + d.slice(1, 4) + ') •••-••-' + d.slice(9, 11);
  }

  /* ═════════════ ПЕРЕВОД ═════════════ */
  function openTransfer(prefill) {
    let mode = (prefill && prefill.mode) || 'phone';
    let phone = prefill && prefill.phone ? fmtPhone(prefill.phone) : (state.lastPhone ? fmtPhone(state.lastPhone) : '');
    let cardNo = (prefill && prefill.cardNo) || '';
    let name = prefill && prefill.name ? prefill.name : '';
    let sum = '';
    let sumStr = '';
    let fromCard = mainCard();
    let step = 1;
    const S = sheet({ html: '' });

    function render() {
      S.render(step === 1 ? htmlStep1() : htmlStep2());
      const body = $('.sheet__body', S.panel);
      body.classList.add('step');
      if (step === 1) wire1(); else wire2();
    }

    function htmlStep1() {
      return `
      <div class="sheet__title">Перевод</div>
      <div class="sheet__sub">По номеру телефона — без комиссии</div>
      <div class="sheet__body">
        <div class="seg" id="segMode">
          <button data-m="phone" class="${mode === 'phone' ? 'is-on' : ''}" type="button">По телефону</button>
          <button data-m="card" class="${mode === 'card' ? 'is-on' : ''}" type="button">По карте</button>
        </div>
        ${mode === 'phone' ? `
          <div class="field" id="fPhone">
            <label>Номер телефона получателя</label>
            <div class="field__row">
              <span class="field__ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18.5h2"/></svg>
              </span>
              <input id="iPhone" type="tel" inputmode="tel" placeholder="+7 (___) ___-__-__" value="${esc(phone)}" autocomplete="off">
              ${phone ? `<button class="field__act" data-clear="iPhone" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
            </div>
            <div class="field__hint" id="phoneHint">Введите номер — имя подставится автоматически</div>
          </div>
          <div class="field" id="fName">
            <label>Имя и фамилия получателя</label>
            <div class="field__row">
              <span class="field__ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
              </span>
              <input id="iName" type="text" placeholder="Например: Ольга К." value="${esc(name)}" autocomplete="off">
            </div>
            <div class="field__hint">Формат: Ольга К.</div>
          </div>
          ${state.lastPerson ? `<button class="person" id="lastP" type="button" style="width:100%">
            <span class="person__ava" style="background:linear-gradient(140deg,${personColor(hash(state.lastPerson.phone)).join(',')})">${esc(initials(state.lastPerson.name))}</span>
            <span><span class="person__n">${esc(state.lastPerson.name)}</span><span class="person__p">${esc(state.lastPerson.phone)}</span></span>
            <span class="person__tag">Повторить</span></button>` : ''}
        ` : `
          <div class="field" id="fCard">
            <label>Номер карты получателя</label>
            <div class="field__row">
              <span class="field__ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 10h19"/></svg>
              </span>
              <input id="iCard" type="tel" inputmode="numeric" placeholder="0000 0000 0000 0000" value="${esc(cardNo)}" autocomplete="off">
            </div>
            <div class="field__hint" id="cardHint">Карта любого банка · зачисление за секунды</div>
          </div>
          <div class="field" id="fName2">
            <label>Имя получателя <span style="color:var(--txt-3)">(необязательно)</span></label>
            <div class="field__row">
              <span class="field__ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
              </span>
              <input id="iName2" type="text" placeholder="Ольга К." value="${esc(name)}" autocomplete="off">
            </div>
          </div>
        `}
        <div class="pick" style="margin-top:14px">
          <button class="pick__row" id="fromRow" type="button">
            <span class="pick__mini" style="background:linear-gradient(140deg,#3CC86B,#0A6E2E)"></span>
            <span class="pick__t"><b>Списать с</b><em>${esc(fromCard.name)} · ${esc(fromCard.num)}</em></span>
            <span class="pick__s">${state.hidden ? '•••' : rub(fromCard.bal)}</span>
          </button>
        </div>
      </div>
      <div class="sheet__foot">
        <button class="btn" id="toStep2" type="button">Далее</button>
        <button class="btn btn--ghost" data-close type-close type="button">Отмена</button>
      </div>`;
    }

    function wire1() {
      const p = S.panel;
      $$('#segMode button', p).forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; haptic(9); render(); }));
      $('[data-close]', p).addEventListener('click', S.close);
      $('#fromRow', p).addEventListener('click', chooseFrom);

      if (mode === 'phone') {
        const ip = $('#iPhone', p);
        ip.addEventListener('input', () => {
          const cur = ip.selectionStart; const before = ip.value.length;
          ip.value = fmtPhone(ip.value);
          const delta = ip.value.length - before;
          ip.setSelectionRange(cur + delta, cur + delta);
          phone = ip.value;
          const n = nameFor(phone);
          const hint = $('#phoneHint', p);
          const iname = $('#iName', p);
          if (n && num(phone).length === 11) {
            if (!iname.dataset.touched) iname.value = n;
            hint.className = 'field__hint is-ok';
            hint.innerHTML = '✓ Получатель найден в ChБанке';
          } else {
            hint.className = 'field__hint';
            hint.textContent = 'Введите номер — имя подставится автоматически';
          }
        });
        const iname = $('#iName', p);
        iname.addEventListener('input', () => { iname.dataset.touched = '1'; name = iname.value; });
        const lp = $('#lastP', p);
        if (lp) lp.addEventListener('click', () => {
          phone = state.lastPerson.phone; name = state.lastPerson.name; haptic(12); render();
        });
        $('[data-clear="iPhone"]', p) && $('[data-clear="iPhone"]', p).addEventListener('click', () => { phone = ''; render(); setTimeout(() => $('#iPhone', S.panel).focus(), 60); });
        if (num(phone).length === 11 && !name) { const n = nameFor(phone); if (n) { name = n; $('#iName', p).value = n; } }
      } else {
        const ic = $('#iCard', p);
        ic.addEventListener('input', () => {
          const cur = ic.selectionStart; const before = ic.value.length;
          ic.value = fmtCardNum(ic.value);
          const delta = ic.value.length - before;
          ic.setSelectionRange(cur + delta, cur + delta);
          cardNo = ic.value;
          const hint = $('#cardHint', p);
          if (num(cardNo).length >= 16) { hint.className = 'field__hint is-ok'; hint.innerHTML = '✓ Карта найдена · ' + pick(['ChБанк', 'ChБанк', 'Другой банк'], hash(num(cardNo))); }
        });
        const i2 = $('#iName2', p);
        i2 && i2.addEventListener('input', () => { name = i2.value; });
      }
      $('#toStep2', p).addEventListener('click', () => {
        const ok = mode === 'phone' ? num(phone).length === 11 : num(cardNo).length >= 16;
        if (!ok) {
          haptic([16, 40, 16]);
          const f = $(mode === 'phone' ? '#fPhone' : '#fCard', p);
          f.classList.remove('is-err'); void f.offsetWidth; f.classList.add('is-err');
          const h = $(mode === 'phone' ? '#phoneHint' : '#cardHint', p);
          h.className = 'field__hint is-bad';
          h.textContent = mode === 'phone' ? 'Введите полный номер телефона' : 'Введите номер карты (16–19 цифр)';
          toast(mode === 'phone' ? 'Укажите номер получателя' : 'Укажите номер карты', 'err');
          return;
        }
        if (mode === 'phone' && !name.trim()) {
          name = nameFor(phone) || 'Получатель';
        }
        haptic(12); step = 2; render();
      });
    }

    function chooseFrom() {
      const s2 = sheet({
        html: `<div class="sheet__title">Списать с</div><div class="sheet__sub">Выберите карту или счёт</div>
        <div class="sheet__body"><div class="pick">${state.cards.map(c => `
          <button class="pick__row ${c.id === fromCard.id ? 'is-on' : ''}" data-pick="${c.id}" type="button">
            <span class="pick__mini" style="background:linear-gradient(140deg,${c.type === 'card--dark' ? '#3A4652,#10161B' : c.type === 'card--blue' ? '#4FD8D2,#1B4FD1' : '#3CC86B,#0A6E2E'})"></span>
            <span class="pick__t"><b>${esc(c.name)}</b><em>${esc(c.num)}</em></span>
            <span class="pick__s">${state.hidden ? '•••' : rub(c.bal)}</span>
            <span class="pick__chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg></span>
          </button>`).join('')}</div></div>`
      });
      $$('[data-pick]', s2.panel).forEach(b => b.addEventListener('click', () => {
        fromCard = cardById(b.dataset.pick); haptic(12); s2.close(); render();
      }));
    }

    function htmlStep2() {
      const who = mode === 'phone' ? name.trim() : (name.trim() || 'Получатель по карте');
      const dst = mode === 'phone' ? phone : cardNo;
      const col = personColor(hash(num(dst) || who));
      return `
      <div class="sheet__title">Сумма перевода</div>
      <div class="sheet__sub">Комиссия 0 ₽ · зачисление мгновенно</div>
      <div class="sheet__body">
        <div class="person">
          <span class="person__ava" style="background:linear-gradient(140deg,${col[0]},${col[1]})">${esc(initials(who))}</span>
          <span><span class="person__n">${esc(who)}</span><span class="person__p">${esc(dst)}</span></span>
          <span class="person__tag">Проверьте</span>
        </div>
        <div class="biglbl">Сколько перевести</div>
        <div class="bigsum ${sumStr ? '' : 'is-ph'}" id="sumOut">${sumStr ? esc(fmtSum(sumStr)) : '0'}${sumStr ? '<em>₽</em>' : '<em>₽</em>'}</div>
        <div class="field__hint" style="justify-content:center;text-align:center" id="availHint">Доступно ${rub(fromCard.bal)} · ${esc(fromCard.name)}</div>
        <div class="amounts" style="margin-top:14px">${[300, 500, 1000, 2000, 5000, 10000].map(v =>
          `<button class="amt" data-amt="${v}" type="button">${v.toLocaleString('ru-RU')}</button>`).join('')}</div>
        ${keypad()}
      </div>
      <div class="sheet__foot">
        <button class="btn" id="doSend" type="button" ${sum ? '' : 'disabled'}>Перевести ${sum ? rub(sum) : ''}</button>
        <button class="btn btn--ghost" id="backStep" type="button">Назад</button>
      </div>`;
    }

    function wire2() {
      const p = S.panel;
      $('#backStep', p).addEventListener('click', () => { haptic(9); step = 1; render(); });
      const out = $('#sumOut', p), btn = $('#doSend', p);
      function upd() {
        out.classList.toggle('is-ph', !sumStr);
        out.innerHTML = esc(fmtSum(sumStr) || '0') + '<em>₽</em>';
        out.classList.add('is-tick'); setTimeout(() => out.classList.remove('is-tick'), 160);
        sum = parseSum(sumStr);
        btn.disabled = !sum || sum <= 0;
        btn.textContent = 'Перевести ' + (sum ? rub(sum) : '');
        const h = $('#availHint', p);
        if (sum > fromCard.bal) { h.className = 'field__hint is-bad'; h.style.justifyContent = 'center'; h.textContent = 'Недостаточно средств · доступно ' + rub(fromCard.bal); }
        else { h.className = 'field__hint'; h.style.justifyContent = 'center'; h.textContent = 'Доступно ' + rub(fromCard.bal) + ' · ' + fromCard.name; }
      }
      bindKeypad(p, k => {
        if (k === 'back') sumStr = sumStr.slice(0, -1);
        else if (k === 'clear') sumStr = '';
        else {
          if (k === ',' ) { if (!sumStr.includes(',')) sumStr = (sumStr || '0') + ','; }
          else if (num(sumStr).length < 9) sumStr += k;
        }
        upd();
      });
      $$('.amt', p).forEach(b => b.addEventListener('click', () => {
        $$('.amt', p).forEach(x => x.classList.remove('is-on'));
        b.classList.add('is-on');
        sumStr = String(b.dataset.amt); haptic(12); upd();
      }));
      btn.addEventListener('click', () => {
        if (!sum || sum <= 0) return;
        if (sum > fromCard.bal) {
          haptic([20, 50, 20]);
          const h = $('#availHint', p); h.className = 'field__hint is-bad';
          h.textContent = 'Недостаточно средств — пополните баланс';
          btn.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 340 });
          toast('Недостаточно средств на карте', 'err');
          return;
        }
        confirmTransfer();
      });
      upd();
    }

    function confirmTransfer() {
      const who = mode === 'phone' ? name.trim() : (name.trim() || 'Получатель по карте');
      const dst = mode === 'phone' ? phone : cardNo;
      const s2 = sheet({
        html: `<div class="sheet__title">Подтвердите перевод</div>
        <div class="sheet__sub">Проверьте данные — деньги уйдут сразу</div>
        <div class="sheet__body">
          <div class="dets">
            <div class="det"><span>Получатель</span><b>${esc(who)}</b></div>
            <div class="det"><span>${mode === 'phone' ? 'Телефон' : 'Карта'}</span><b>${esc(dst)}</b></div>
            <div class="det"><span>Списать с</span><b>${esc(fromCard.name)}</b></div>
            <div class="det det--dash"><span>Комиссия</span><b style="color:var(--brand)">0 ₽</b></div>
            <div class="det"><span>Итого к списанию</span><b style="font-size:16px">${rub(sum)}</b></div>
          </div>
        </div>
        <div class="sheet__foot">
          <button class="btn" id="ok" type="button">Подтвердить · ${rub(sum)}</button>
          <button class="btn btn--ghost" id="no" type="button">Вернуться</button>
        </div>`
      });
      $('#no', s2.panel).addEventListener('click', () => { s2.close(); });
      $('#ok', s2.panel).addEventListener('click', () => {
        haptic([14, 40, 14]);
        s2.close(); S.close();
        doTransfer(who, dst, sum, fromCard, mode);
      });
    }

    render();
  }

  function doTransfer(who, dst, amount, fromCard, mode) {
    processing('Переводим деньги', who, () => {
      fromCard.bal = Math.round((fromCard.bal - amount) * 100) / 100;
      state.txs.unshift({
        t: 'Перевод • ' + who,
        s: (mode === 'phone' ? maskPhone(dst) : dst) + ' · ' + fromCard.name,
        c: 'p2p', a: -amount, d: Date.now(), n: 1,
        meta: { who, dst, mode }
      });
      state.lastPerson = mode === 'phone' ? { name: who, phone: dst } : state.lastPerson;
      state.lastPhone = mode === 'phone' ? dst : state.lastPhone;
      state.bonus += Math.round(amount * 0.02);
      save(); renderCards(); renderBal(true); renderTxs(); renderInsight();
      const idn = 'CH' + String(Date.now()).slice(-8);
      success({
        sum: amount,
        title: who,
        sub: (mode === 'phone' ? dst : 'Карта ' + dst) + ' · деньги уже в пути',
        rows: [['Получатель', who], [mode === 'phone' ? 'Телефон' : 'Номер карты', dst],
               ['Списано с', fromCard.name + ' · ' + fromCard.num], ['Комиссия', '0 ₽'],
               ['Дата', full(Date.now())], ['Номер операции', idn]],
        primary: 'Готово',
        onPrimary: () => { go('home'); },
        second: 'Перевести ещё',
        onSecond: () => openTransfer(mode === 'phone' ? { phone: dst, name: who } : { mode: 'card', cardNo: dst, name: who })
      });
      confetti(30);
    });
  }

  /* ───────── обработка + успех ───────── */
  function processing(title, sub, done, ms = 1100) {
    const f = fscreen({
      title: 'ChБанк',
      mount(body) {
        body.innerHTML = `<div class="proc">
          <div class="proc__ring"></div>
          <div class="proc__t">${esc(title)}</div>
          <div class="proc__s">${esc(sub || '')}</div>
          <div class="proc__dots"><i></i><i></i><i></i></div>
        </div>`;
      }
    });
    haptic([10, 60, 10, 60, 10]);
    setTimeout(() => { f.close(); setTimeout(done, 240); }, ms);
    return f;
  }

  function success(o) {
    const f = fscreen({
      title: 'Операция выполнена',
      mount(body) {
        body.innerHTML = `
          <div class="ok">
            <div class="ok__ring"><div class="ok__c">
              <svg viewBox="0 0 24 24"><path d="m5.5 12.5 4.2 4.2L18.5 8"/></svg>
            </div></div>
            <div class="ok__sum">${o.income ? '+' : '−'}${rub(o.sum)}</div>
            <div class="ok__t">${esc(o.title || '')}</div>
            <div class="ok__s">${esc(o.sub || '')}</div>
          </div>
          <div class="receipt">${(o.rows || []).map(r => `<div class="det"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>
          <div class="fscreen__foot">
            <button class="btn" data-ok type="button">${esc(o.primary || 'Готово')}</button>
            ${o.second ? `<button class="btn btn--ghost" data-2 type="button">${esc(o.second)}</button>` : ''}
            <button class="btn btn--ghost" data-share type="button">Поделиться чеком</button>
          </div>`;
        $('[data-ok]', body).addEventListener('click', () => { f.close(); o.onPrimary && o.onPrimary(); });
        const b2 = $('[data-2]', body);
        if (b2) b2.addEventListener('click', () => { f.close(); o.onSecond && o.onSecond(); });
        $('[data-share]', body).addEventListener('click', () => {
          haptic(14);
          const txt = `ChБанк: ${o.income ? '+' : '−'}${rub(o.sum)} — ${o.title || ''}`;
          if (navigator.share) navigator.share({ title: 'Чек ChБанк', text: txt }).catch(() => {});
          else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Чек скопирован в буфер обмена'));
          else toast('Чек сохранён');
        });
      }
    });
    haptic([12, 50, 22]);
    return f;
  }

  /* ═════════════ ПЕРЕВОД СЕБЕ (мгновенно) ═════════════ */
  function openSelf() {
    let sumStr = '';
    let target = state.cards.find(c => !c.main) || mainCard();
    const src = mainCard();
    const S = sheet({ html: '' });

    function render() {
      S.render(`
      <div class="sheet__title">Перевести себе</div>
      <div class="sheet__sub">Выберите сумму — она сразу зачислится на баланс</div>
      <div class="sheet__body">
        <div class="person">
          <span class="person__ava" style="background:linear-gradient(140deg,#3CC86B,#0A6E2E)">${esc(initials(state.name))}</span>
          <span><span class="person__n">${esc(state.name)}</span><span class="person__p">Это вы · перевод без комиссии</span></span>
          <span class="person__tag">0 ₽</span>
        </div>
        <div class="biglbl">Сумма зачисления</div>
        <div class="bigsum ${sumStr ? '' : 'is-ph'}" id="sumOut">${esc(fmtSum(sumStr) || '0')}<em>₽</em></div>
        <div class="amounts" style="margin-top:8px">${[500, 1000, 2000, 5000, 10000, 25000].map(v =>
          `<button class="amt" data-amt="${v}" type="button">${v.toLocaleString('ru-RU')}</button>`).join('')}</div>
        ${keypad()}
        <div class="pick" style="margin-top:14px">
          <button class="pick__row" id="tgt" type="button">
            <span class="pick__mini" style="background:linear-gradient(140deg,${target.type === 'card--dark' ? '#3A4652,#10161B' : target.type === 'card--blue' ? '#4FD8D2,#1B4FD1' : '#3CC86B,#0A6E2E'})"></span>
            <span class="pick__t"><b>Зачислить на</b><em>${esc(target.name)} · ${esc(target.num)}</em></span>
            <span class="pick__s">${state.hidden ? '•••' : rub(target.bal)}</span>
          </button>
        </div>
      </div>
      <div class="sheet__foot">
        <button class="btn" id="go" type="button" ${sumStr ? '' : 'disabled'}>Зачислить ${sumStr ? rub(parseSum(sumStr)) : ''}</button>
      </div>`);
      const p = S.panel;
      const out = $('#sumOut', p), goBtn = $('#go', p);
      function upd() {
        out.classList.toggle('is-ph', !sumStr);
        out.innerHTML = esc(fmtSum(sumStr) || '0') + '<em>₽</em>';
        out.classList.add('is-tick'); setTimeout(() => out.classList.remove('is-tick'), 160);
        const v = parseSum(sumStr);
        goBtn.disabled = !v;
        goBtn.textContent = 'Зачислить ' + (v ? rub(v) : '');
        $$('.amt', p).forEach(x => x.classList.toggle('is-on', String(v) === x.dataset.amt && !!sumStr));
      }
      bindKeypad(p, k => {
        if (k === 'back') sumStr = sumStr.slice(0, -1);
        else if (k === 'clear') sumStr = '';
        else if (num(sumStr).length < 9) sumStr += k;
        upd();
      });
      $$('.amt', p).forEach(b => b.addEventListener('click', () => {
        sumStr = String(b.dataset.amt); haptic(14); upd();
        b.animate([{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      }));
      $('#tgt', p).addEventListener('click', () => {
        const others = state.cards.filter(c => c.id !== target.id);
        const s2 = sheet({
          html: `<div class="sheet__title">Куда зачислить</div><div class="sheet__body"><div class="pick">${others.map(c => `
            <button class="pick__row" data-p="${c.id}" type="button">
              <span class="pick__mini" style="background:linear-gradient(140deg,${c.type === 'card--dark' ? '#3A4652,#10161B' : c.type === 'card--blue' ? '#4FD8D2,#1B4FD1' : '#3CC86B,#0A6E2E'})"></span>
              <span class="pick__t"><b>${esc(c.name)}</b><em>${esc(c.num)}</em></span>
              <span class="pick__s">${state.hidden ? '•••' : rub(c.bal)}</span>
            </button>`).join('')}</div></div>`
        });
        $$('[data-p]', s2.panel).forEach(b => b.addEventListener('click', () => {
          target = cardById(b.dataset.p); s2.close(); haptic(12); render();
        }));
      });
      goBtn.addEventListener('click', () => {
        const v = parseSum(sumStr);
        if (!v) return;
        haptic([12, 40, 18]);
        S.close();
        setTimeout(() => {
          target.bal = Math.round((target.bal + v) * 100) / 100;
          state.txs.unshift({ t: 'Перевод себе', s: 'На ' + target.name + ' · ' + target.num, c: 'self', a: v, d: Date.now(), n: 1, self: true });
          state.bonus += 50;
          save(); activeCard = target; renderCards(); renderBal(true); renderTxs(); renderInsight(); bumpBalance();
          const b = $('.bal__val'); if (b) { b.classList.remove('is-hit'); void b.offsetWidth; b.classList.add('is-hit'); }
          confetti(20);
          toast('+' + rub(v) + ' зачислено на ' + target.name);
        }, 240);
      });
      upd();
    }
    render();
  }

  /* ═════════════ ПОПОЛНЕНИЕ / ЗАЧИСЛЕНИЕ ═════════════ */
  function openTopup(presetSum) {
    let target = mainCard();
    let sumStr = presetSum ? String(presetSum) : '';
    const S = sheet({ html: '' });

    function render() {
      S.render(`
      <div class="sheet__title">Пополнить</div>
      <div class="sheet__sub">Деньги зачисляются мгновенно и без комиссии</div>
      <div class="sheet__body">
        <div class="pick">
          <button class="pick__row" id="tgt" type="button">
            <span class="pick__mini" style="background:linear-gradient(140deg,${target.type === 'card--dark' ? '#3A4652,#10161B' : target.type === 'card--blue' ? '#4FD8D2,#1B4FD1' : '#3CC86B,#0A6E2E'})"></span>
            <span class="pick__t"><b>${esc(target.name)}</b><em>${esc(target.num)}</em></span>
            <span class="pick__s">${state.hidden ? '•••' : rub(target.bal)}</span>
          </button>
        </div>
        <div class="biglbl" style="margin-top:18px">Сумма пополнения</div>
        <div class="bigsum ${sumStr ? '' : 'is-ph'}" id="sumOut">${esc(fmtSum(sumStr) || '0')}<em>₽</em></div>
        <div class="amounts" style="margin-top:8px">${[100, 500, 1000, 3000, 5000, 15000].map(v =>
          `<button class="amt" data-amt="${v}" type="button">${v.toLocaleString('ru-RU')}</button>`).join('')}</div>
        <div class="field">
          <label>Или введите свою сумму</label>
          <div class="field__row">
            <span class="field__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>
            <input id="iSum" type="text" inputmode="decimal" placeholder="0" value="${esc(fmtSum(sumStr))}" autocomplete="off">
            <span style="font-size:16px;font-weight:700;color:var(--txt-2)">₽</span>
          </div>
        </div>
        ${keypad()}
      </div>
      <div class="sheet__foot">
        <button class="btn" id="go" type="button" ${sumStr ? '' : 'disabled'}>Пополнить ${sumStr ? rub(parseSum(sumStr)) : ''}</button>
      </div>`);
      const p = S.panel;
      const out = $('#sumOut', p), goBtn = $('#go', p), inp = $('#iSum', p);
      function upd() {
        out.classList.toggle('is-ph', !sumStr);
        out.innerHTML = esc(fmtSum(sumStr) || '0') + '<em>₽</em>';
        const v = parseSum(sumStr);
        goBtn.disabled = !v;
        goBtn.textContent = 'Пополнить ' + (v ? rub(v) : '');
        if (document.activeElement !== inp) inp.value = fmtSum(sumStr);
        $$('.amt', p).forEach(x => x.classList.toggle('is-on', String(v) === x.dataset.amt && !!sumStr));
      }
      bindKeypad(p, k => {
        if (k === 'back') sumStr = sumStr.slice(0, -1);
        else if (k === 'clear') sumStr = '';
        else if (num(sumStr).length < 9) sumStr += k;
        haptic(6); upd();
      });
      $$('.amt', p).forEach(b => b.addEventListener('click', () => { sumStr = String(b.dataset.amt); haptic(14); upd(); }));
      inp.addEventListener('focus', () => inp.closest('.field').classList.add('is-focus'));
      inp.addEventListener('blur', () => inp.closest('.field').classList.remove('is-focus'));
      inp.addEventListener('input', () => { sumStr = num(inp.value).slice(0, 9); upd(); });
      $('#tgt', p).addEventListener('click', () => {
        const s2 = sheet({
          html: `<div class="sheet__title">Выберите счёт</div><div class="sheet__body"><div class="pick">${state.cards.map(c => `
            <button class="pick__row ${c.id === target.id ? 'is-on' : ''}" data-p="${c.id}" type="button">
              <span class="pick__mini" style="background:linear-gradient(140deg,${c.type === 'card--dark' ? '#3A4652,#10161B' : c.type === 'card--blue' ? '#4FD8D2,#1B4FD1' : '#3CC86B,#0A6E2E'})"></span>
              <span class="pick__t"><b>${esc(c.name)}</b><em>${esc(c.num)}</em></span>
              <span class="pick__s">${state.hidden ? '•••' : rub(c.bal)}</span>
              <span class="pick__chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg></span>
            </button>`).join('')}</div></div>`
        });
        $$('[data-p]', s2.panel).forEach(b => b.addEventListener('click', () => { target = cardById(b.dataset.p); s2.close(); haptic(12); render(); }));
      });
      goBtn.addEventListener('click', () => {
        const v = parseSum(sumStr);
        if (!v) return;
        haptic([12, 40, 18]);
        S.close();
        processing('Пополняем счёт', target.name + ' · ' + rub(v), () => {
          target.bal = Math.round((target.bal + v) * 100) / 100;
          state.txs.unshift({ t: 'Пополнение', s: target.name + ' · ' + target.num, c: 'topup', a: v, d: Date.now(), n: 1 });
          state.bonus += Math.round(v * 0.01);
          save(); activeCard = target; renderCards(); renderBal(true); renderTxs(); renderInsight(); bumpBalance();
          success({
            sum: v, income: true, title: 'Счёт пополнен', sub: target.name + ' · ' + target.num,
            rows: [['Сумма', rub(v)], ['Комиссия', '0 ₽'], ['Новый баланс', rub(target.bal)], ['Дата', full(Date.now())], ['Номер операции', 'CH' + String(Date.now()).slice(-8)]],
            primary: 'Отлично', onPrimary: () => go('home'), second: 'Пополнить ещё', onSecond: () => openTopup()
          });
          confetti(26);
        }, 900);
      });
      upd();
    }
    render();
  }

  /* ═════════════ КАРТА ═════════════ */
  function openCard(c) {
    const S = sheet({ html: '' });
    S.render(`
    <div class="sheet__title">${esc(c.name)}</div>
    <div class="sheet__sub">${esc(c.num)} · действует до ${esc(c.exp || '—')}</div>
    <div class="sheet__body">
      <button class="card ${c.type}" style="width:100%;aspect-ratio:1.62/1" type="button" id="bigCard">
        <i class="card__glow"></i><i class="card__grid"></i>
        <div class="card__top"><span class="card__bank"><i>Ch</i>ChБанк</span><span class="card__chip"></span><span class="card__wave">${waveSvg}</span></div>
        <div class="card__mid">
          <span class="card__sum">${state.hidden ? '••••••' : rub(c.bal)}</span>
          <span class="card__num" id="cnum">${c.num.replace(/•/g, '7')}</span>
        </div>
        <div class="card__bot"><span>${esc(c.holder)}</span><span class="card__sys">${esc(c.sys)}</span></div>
      </button>
      <div class="quick" style="margin:16px 0 0">
        <button class="qbtn" data-a="topup"><i class="qbtn__i q-g"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></i><span>Пополнить</span></button>
        <button class="qbtn" data-a="transfer"><i class="qbtn__i q-b"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h13l-3.2-3.2"/><path d="M21 16H8l3.2 3.2"/></svg></i><span>Перевести</span></button>
        <button class="qbtn" data-a="copy"><i class="qbtn__i q-o"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.4"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></i><span>Реквизиты</span></button>
        <button class="qbtn" data-a="settings"><i class="qbtn__i q-gr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3V3a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 4.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg></i><span>Настройки</span></button>
      </div>
      <div class="sec" style="margin-top:18px">
        <div class="sec__head"><h2 class="sec__title" style="font-size:16px">Последние операции</h2></div>
        <div class="txs">${state.txs.slice(0, 3).map(t => { const cc = cat(t.c); return `
          <div class="tx"><i class="tx__i ${cc.grad}">${cc.icon}</i>
          <span class="tx__main"><span class="tx__t">${esc(t.t)}</span><span class="tx__s">${ago(t.d)}</span></span>
          <span class="tx__r"><span class="tx__a ${t.a > 0 ? 'is-in' : ''}">${t.txt ? esc(t.txt) : signed(t.a)}</span></span></div>`; }).join('')}</div>
      </div>
    </div>`);
    const p = S.panel;
    let revealed = false;
    $('#bigCard', p).addEventListener('click', () => {
      const n = $('#cnum', p);
      revealed = !revealed;
      n.textContent = revealed ? c.num.replace(/•/g, () => String(hash(c.num) % 10)) : c.num;
      haptic(10);
      if (revealed) { navigator.clipboard && navigator.clipboard.writeText(n.textContent.replace(/\s/g, '')).catch(() => {}); toast('Номер карты скопирован'); }
    });
    const acts = { topup: () => { S.close(); openTopup(); }, transfer: () => { S.close(); openTransfer(); },
      copy: () => { haptic(12); navigator.clipboard && navigator.clipboard.writeText('Получатель: ' + state.name + '\nСчёт: 40817810' + num(c.num) + '\nБанк: ChБанк\nБИК: 044525225').catch(() => {}); toast('Реквизиты скопированы'); },
      settings: () => cardSettings(c) };
    $$('[data-a]', p).forEach(b => b.addEventListener('click', () => { haptic(10); acts[b.dataset.a](); }));
  }

  function cardSettings(c) {
    const S = sheet({ html: '' });
    S.render(`
    <div class="sheet__title">Настройки карты</div>
    <div class="sheet__sub">${esc(c.name)} · ${esc(c.num)}</div>
    <div class="sheet__body">
      <div class="group">
        <div class="row row--static"><i class="row__i i-g"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3 5 6v5.5c0 4.3 2.9 7.6 7 9.5 4.1-1.9 7-5.2 7-9.5V6l-7-3Z"/></svg></i><span>Онлайн-покупки</span><label class="sw"><input type="checkbox" checked><i></i></label></div>
        <div class="row row--static"><i class="row__i i-b"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/></svg></i><span>Push-уведомления</span><label class="sw"><input type="checkbox" checked><i></i></label></div>
        <div class="row row--static"><i class="row__i i-p"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></i><span>Бесконтактная оплата</span><label class="sw"><input type="checkbox" checked><i></i></label></div>
      </div>
      <div class="sec"><button class="btn btn--ghost btn--danger" id="block" type="button">Заблокировать карту</button></div>
    </div>`);
    $('#block', S.panel).addEventListener('click', () => {
      haptic([20, 60, 20]); S.close();
      toast('Демо: карта не блокируется 🙂', 'err');
    });
  }

  /* ═════════════ ДЕТАЛИ ОПЕРАЦИИ ═════════════ */
  function openTx(t) {
    const c = cat(t.c);
    const isIn = t.a > 0;
    fscreen({
      title: 'Операция',
      mount(body) {
        body.innerHTML = `
        <div class="txhero">
          <i class="txhero__i ${c.grad}">${c.icon}</i>
          <div class="txhero__a" style="${isIn ? 'color:var(--brand)' : ''}">${t.txt ? esc(t.txt) : signed(t.a)}</div>
          <div class="txhero__t">${esc(t.t)}</div>
          <div class="txhero__s">${esc(t.s)}</div>
          <span class="status status--ok"><i></i>Исполнено</span>
        </div>
        <div class="receipt">
          <div class="det"><span>Категория</span><b>${c.label}</b></div>
          <div class="det"><span>Дата и время</span><b>${full(t.d)}</b></div>
          <div class="det"><span>Счёт списания</span><b>${esc(mainCard().name)}</b></div>
          <div class="det det--dash"><span>Комиссия</span><b style="color:var(--brand)">0 ₽</b></div>
          <div class="det"><span>Номер операции</span><b>CH${String(hash(t.t + t.d)).slice(0, 8)}</b></div>
          ${t.b ? `<div class="det"><span>Бонусы Спасибо</span><b style="color:var(--brand)">${esc(t.b)}</b></div>` : ''}
        </div>
        <div class="fscreen__foot">
          ${t.a < 0 && t.meta ? `<button class="btn" data-rep type="button">Повторить перевод</button>` : ''}
          <button class="btn ${t.a < 0 && t.meta ? 'btn--ghost' : ''}" data-ch type="button">Написать в чат об операции</button>
          <button class="btn btn--ghost" data-sh type="button">Поделиться чеком</button>
        </div>`;
        const rep = $('[data-rep]', body);
        if (rep) rep.addEventListener('click', () => {
          openTransfer({ mode: t.meta.mode, phone: t.meta.mode === 'phone' ? t.meta.dst : '', cardNo: t.meta.mode === 'card' ? t.meta.dst : '', name: t.meta.who });
        });
        $('[data-ch]', body).addEventListener('click', () => { go('chat'); setTimeout(() => botSay('Вижу операцию «' + t.t + '» на ' + rub(Math.abs(t.a)) + '. Чем помочь?'), 500); });
        $('[data-sh]', body).addEventListener('click', () => {
          const txt = `ChБанк · ${t.t}\n${signed(t.a)}\n${full(t.d)}`;
          if (navigator.share) navigator.share({ title: 'Чек', text: txt }).catch(() => {});
          else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Чек скопирован')).catch(() => toast('Чек сохранён'));
          else toast('Чек сохранён');
        });
      }
    });
  }

  /* ═════════════ ПЛАТЕЖИ: каталог ═════════════ */
  const FAV = [
    { i: '🏠', g: 'q-t', t: 'Квартплата', s: 'по подписке' },
    { i: '📱', g: 'q-o', t: 'МТС', s: '+7 916 ••-05' },
    { i: '⚡️', g: 'q-y', t: 'Мосэнерго', s: 'счёт 4417' },
    { i: '🌐', g: 'q-b', t: 'Интернет', s: 'Ростелеком' },
    { i: '🎬', g: 'q-pk', t: 'ChPlay', s: '399 ₽/мес' }
  ];
  const GROUPS = {
    tilesTransfer: [
      { i: '👤', g: 'q-b', t: 'По номеру телефона', a: 'transfer' },
      { i: '💳', g: 'q-g', t: 'Между своими', a: 'self' },
      { i: '🏦', g: 'q-gr', t: 'В другой банк', a: 'transfer' },
      { i: '⚡️', g: 'q-t', t: 'По СБП', a: 'sbp' },
      { i: '🧾', g: 'q-o', t: 'По реквизитам', a: 'req' },
      { i: '🌍', g: 'q-p', t: 'За рубеж', a: 'abroad' },
      { i: '💼', g: 'q-y', t: 'Самозанятым', a: 'self2' },
      { i: '↩️', g: 'q-pk', t: 'Запросить деньги', a: 'req2' }
    ],
    tilesMobile: [
      { i: '📕', g: 'q-pk', t: 'МТС', a: 'mobile' },
      { i: '🐝', g: 'q-y', t: 'билайн', a: 'mobile' },
      { i: '🟩', g: 'q-g', t: 'МегаФон', a: 'mobile' },
      { i: '⬛️', g: 'q-gr', t: 'T2', a: 'mobile' }
    ],
    tilesBills: [
      { i: '🏠', g: 'q-t', t: 'ЖКХ', a: 'bill' },
      { i: '⚡️', g: 'q-y', t: 'Электричество', a: 'bill' },
      { i: '💧', g: 'q-b', t: 'Вода', a: 'bill' },
      { i: '🔥', g: 'q-o', t: 'Газ', a: 'bill' },
      { i: '🌐', g: 'q-p', t: 'Интернет и ТВ', a: 'bill' },
      { i: '🏫', g: 'q-g', t: 'Детский сад', a: 'bill' },
      { i: '🎓', g: 'q-pk', t: 'Образование', a: 'bill' },
      { i: '🛡️', g: 'q-gr', t: 'Страхование', a: 'bill' }
    ],
    tilesFun: [
      { i: '🎬', g: 'q-pk', t: 'Кино и музыка', a: 'fun' },
      { i: '🎮', g: 'q-p', t: 'Игры', a: 'fun' },
      { i: '🍔', g: 'q-o', t: 'Еда и кафе', a: 'fun' },
      { i: '🛍️', g: 'q-g', t: 'Маркетплейсы', a: 'fun' },
      { i: '✈️', g: 'q-b', t: 'Авиабилеты', a: 'fun' },
      { i: '🏨', g: 'q-t', t: 'Отели', a: 'fun' },
      { i: '🚆', g: 'q-gr', t: 'Поезда', a: 'fun' },
      { i: '🎟️', g: 'q-y', t: 'Билеты', a: 'fun' }
    ],
    tilesGov: [
      { i: '🏛️', g: 'q-b', t: 'Госуслуги', a: 'gov' },
      { i: '🚓', g: 'q-o', t: 'Штрафы ГИБДД', a: 'gov' },
      { i: '📑', g: 'q-gr', t: 'Налоги ФНС', a: 'gov' },
      { i: '❤️', g: 'q-pk', t: 'Благотворительность', a: 'charity' }
    ]
  };

  function renderPay() {
    $('#favRow').innerHTML = FAV.map(f => `<button class="fav" data-fav="${esc(f.t)}" type="button"><i class="${f.g}">${f.i}</i><span>${esc(f.t)}</span><em>${esc(f.s)}</em></button>`).join('');
    $$('#favRow .fav').forEach(b => b.addEventListener('click', () => payService(b.dataset.fav, '⭐️', 'q-y')));
    Object.keys(GROUPS).forEach(id => {
      const box = $('#' + id);
      if (!box) return;
      box.innerHTML = GROUPS[id].map(t => `<button class="tile" data-a="${t.a}" data-t="${esc(t.t)}" data-i="${t.i}" data-g="${t.g}" type="button"><i class="${t.g}">${t.i}</i><span>${esc(t.t)}</span></button>`).join('');
      $$('.tile', box).forEach(b => b.addEventListener('click', () => tileAction(b.dataset, b)));
    });
  }

  function tileAction(d) {
    haptic(12);
    const a = d.a;
    if (a === 'transfer') return openTransfer();
    if (a === 'self' || a === 'self2') return openSelf();
    if (a === 'req' || a === 'req2') return payService(d.t, d.i, d.g);
    if (a === 'qr') return openQR();
    if (a === 'sbp' || a === 'abroad') return openTransfer();
    return payService(d.t, d.i, d.g);
  }

  /* универсальный платёж */
  function payService(title, icon, grad, needAccount = true) {
    let acc = '', sumStr = '';
    const presets = { 'МТС': 300, 'билайн': 300, 'МегаФон': 300, 'T2': 300 };
    const S = sheet({ html: '' });
    function render() {
      S.render(`
      <div class="sheet__title">${esc(title)}</div>
      <div class="sheet__sub">Оплата со счёта ${esc(mainCard().name)}</div>
      <div class="sheet__body">
        <div class="person">
          <span class="person__ava" style="font-size:24px;background:var(--surf-2)">${icon}</span>
          <span><span class="person__n">${esc(title)}</span><span class="person__p">Комиссия 0 ₽ · зачисление мгновенно</span></span>
        </div>
        ${needAccount ? `<div class="field"><label>${/мобильн|МТС|билайн|МегаФон|T2/i.test(title) ? 'Номер телефона' : 'Лицевой счёт / номер договора'}</label>
          <div class="field__row"><span class="field__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg></span>
          <input id="iAcc" type="tel" inputmode="tel" placeholder="${/МТС|билайн|МегаФон|T2/i.test(title) ? '+7 (___) ___-__-__' : '1234567890'}" value="${esc(acc)}" autocomplete="off"></div></div>` : ''}
        <div class="biglbl">Сумма</div>
        <div class="bigsum ${sumStr ? '' : 'is-ph'}" id="sumOut">${esc(fmtSum(sumStr) || '0')}<em>₽</em></div>
        <div class="amounts" style="margin-top:8px">${[presets[title] || 100, presets[title] ? presets[title] * 2 : 500, 1000, 2000, 5000, 10000].map(v =>
          `<button class="amt" data-amt="${v}" type="button">${v.toLocaleString('ru-RU')}</button>`).join('')}</div>
        ${keypad()}
      </div>
      <div class="sheet__foot"><button class="btn" id="go" type="button" ${sumStr ? '' : 'disabled'}>Оплатить ${sumStr ? rub(parseSum(sumStr)) : ''}</button></div>`);
      const p = S.panel;
      const out = $('#sumOut', p), goBtn = $('#go', p);
      const ia = $('#iAcc', p);
      if (ia) ia.addEventListener('input', () => {
        if (/МТС|билайн|МегаФон|T2/.test(title)) ia.value = fmtPhone(ia.value);
        acc = ia.value;
      });
      function upd() {
        out.classList.toggle('is-ph', !sumStr);
        out.innerHTML = esc(fmtSum(sumStr) || '0') + '<em>₽</em>';
        const v = parseSum(sumStr);
        goBtn.disabled = !v; goBtn.textContent = 'Оплатить ' + (v ? rub(v) : '');
        $$('.amt', p).forEach(x => x.classList.toggle('is-on', String(v) === x.dataset.amt && !!sumStr));
      }
      bindKeypad(p, k => {
        if (k === 'back') sumStr = sumStr.slice(0, -1);
        else if (k === 'clear') sumStr = '';
        else if (num(sumStr).length < 9) sumStr += k;
        haptic(6); upd();
      });
      $$('.amt', p).forEach(b => b.addEventListener('click', () => { sumStr = String(b.dataset.amt); haptic(14); upd(); }));
      goBtn.addEventListener('click', () => {
        const v = parseSum(sumStr);
        if (!v) return;
        if (needAccount && acc.trim().length < 4) {
          haptic([16, 40, 16]);
          const f = ia.closest('.field'); f.classList.remove('is-err'); void f.offsetWidth; f.classList.add('is-err');
          toast('Заполните номер или счёт', 'err'); ia.focus(); return;
        }
        const src = mainCard();
        if (v > src.bal) { toast('Недостаточно средств на карте', 'err'); haptic([20, 50, 20]); return; }
        haptic([12, 40, 18]); S.close();
        processing('Проводим платёж', title + ' · ' + rub(v), () => {
          src.bal = Math.round((src.bal - v) * 100) / 100;
          const ckey = /МТС|билайн|МегаФон|T2|связ/i.test(title) ? 'mobile'
            : /ЖКХ|Электро|Вода|Газ|квартплат/i.test(title) ? 'home'
            : /Кино|музык|Игры|ChPlay|Еда|Маркет|Авиа|Отел|Поезд|Билет|Развл/i.test(title) ? 'fun'
            : /Гос|Штраф|Налог/i.test(title) ? 'gov' : 'sub';
          state.txs.unshift({ t: title, s: (acc ? acc + ' · ' : '') + src.name, c: ckey, a: -v, d: Date.now(), n: 1 });
          state.bonus += Math.round(v * 0.03);
          save(); renderCards(); renderBal(true); renderTxs(); renderInsight(); bumpBalance();
          success({
            sum: v, title: title, sub: 'Платёж проведён успешно',
            rows: [['Услуга', title], acc ? ['Счёт / номер', acc] : null, ['Списано с', src.name + ' · ' + src.num], ['Комиссия', '0 ₽'], ['Дата', full(Date.now())], ['Номер операции', 'CH' + String(Date.now()).slice(-8)]].filter(Boolean),
            primary: 'Готово', onPrimary: () => go('pay'), second: 'Повторить платёж', onSecond: () => payService(title, icon, grad)
          });
        }, 900);
      });
      upd();
    }
    render();
  }

  /* ═════════════ QR ═════════════ */
  function openQR() {
    let stream = null, F;
    F = fscreen({
      title: 'Сканер QR-кода',
      mount(body) {
        body.innerHTML = `
        <div class="qr">
          <video id="cam" playsinline muted autoplay style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none"></video>
          <div class="qr__cam" id="camFake"></div>
          <div class="qr__frame"><i></i><i></i><i></i><i></i><div class="qr__line"></div></div>
          <div class="qr__t">Наведите камеру на QR-код</div>
          <div class="qr__s">Оплата по QR проходит без комиссии.<br>Демо-режим: код «найдётся» сам через пару секунд.</div>
          <div class="qr__found" id="found">
            <div class="qr__code">
              <svg viewBox="0 0 100 100" fill="#0E1410">
                ${(() => { let s = ''; const h = hash('chbank-qr'); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if ((hash(x + '-' + y + h) % 3)) s += `<rect x="${8 + x * 7}" y="${8 + y * 7}" width="6" height="6" rx="1"/>`; return s; })()}
                <rect x="8" y="8" width="24" height="24" rx="4" fill="none" stroke="#0E1410" stroke-width="6"/>
                <rect x="68" y="8" width="24" height="24" rx="4" fill="none" stroke="#0E1410" stroke-width="6"/>
                <rect x="8" y="68" width="24" height="24" rx="4" fill="none" stroke="#0E1410" stroke-width="6"/>
              </svg>
            </div>
          </div>
        </div>
        <div class="fscreen__foot">
          <button class="btn btn--ghost" id="myQr" type="button">Показать мой QR-код</button>
        </div>`;
        const v = $('#cam', body);
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(s => { stream = s; v.srcObject = s; v.style.display = 'block'; $('#camFake', body).style.display = 'none'; })
            .catch(() => {});
        }
        const t = setTimeout(() => {
          if (!F.isOpen()) return;                    // экран уже закрыли — не «находим» код
          $('#found', body).classList.add('is-on');
          haptic([14, 40, 14]);
          setTimeout(() => { if (F.isOpen()) { F.close(); qrResult(); } }, 900);
        }, 2600);
        $('#myQr', body).addEventListener('click', () => showMyQR(F.close));
      },
      onClose() { if (stream) stream.getTracks().forEach(tr => tr.stop()); }
    });
  }
  function qrResult() {
    const sum = 540;
    const src = mainCard();
    processing('Оплачиваем по QR', 'Кофейня «Правда» · ' + rub(sum), () => {
      src.bal = Math.round((src.bal - sum) * 100) / 100;
      state.txs.unshift({ t: 'Оплата по QR', s: 'Кофейня «Правда» · ' + src.name, c: 'cafe', a: -sum, d: Date.now(), n: 1, b: '+10' });
      state.bonus += 10;
      save(); renderCards(); renderBal(true); renderTxs(); renderInsight();
      success({ sum, title: 'Кофейня «Правда»', sub: 'Оплата по QR-коду прошла успешно', rows: [['Сумма', rub(sum)], ['Комиссия', '0 ₽'], ['Бонусы Спасибо', '+10'], ['Дата', full(Date.now())]], primary: 'Готово', onPrimary: () => go('home') });
    }, 900);
  }
  function showMyQR(closeParent) {
    const S = sheet({ html: '' });
    S.render(`
    <div class="sheet__title">Мой QR-код</div>
    <div class="sheet__sub">Покажите его, чтобы вам перевели деньги</div>
    <div class="sheet__body" style="display:flex;flex-direction:column;align-items:center">
      <div style="width:220px;height:220px;background:#fff;border-radius:22px;padding:16px;box-shadow:var(--shadow)">
        <svg viewBox="0 0 100 100" fill="#0E1410" style="width:100%;height:100%">
          ${(() => { let s = ''; const h = hash(state.id); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if ((hash(x + '|' + y + '|' + h) % 3)) s += `<rect x="${8 + x * 7}" y="${8 + y * 7}" width="6" height="6" rx="1"/>`; return s; })()}
          <rect x="8" y="8" width="24" height="24" rx="4" fill="none" stroke="#0E1410" stroke-width="6"/>
          <rect x="68" y="8" width="24" height="24" rx="4" fill="none" stroke="#0E1410" stroke-width="6"/>
          <rect x="8" y="68" width="24" height="24" rx="4" fill="none" stroke="#0E1410" stroke-width="6"/>
        </svg>
      </div>
      <div style="margin-top:14px;font-weight:700;font-size:16px">${esc(state.name)}</div>
      <div style="font-size:12.5px;color:var(--txt-2);margin-top:4px">ChBank ID ${esc(state.id)}</div>
      <div class="sheet__foot" style="width:100%"><button class="btn" id="qrSelf" type="button">Получить перевод себе</button></div>
    </div>`);
    $('#qrSelf', S.panel).addEventListener('click', () => { S.close(); closeParent && closeParent(); setTimeout(openSelf, 260); });
  }

  /* ═════════════ УВЕДОМЛЕНИЯ ═════════════ */
  function openNotif() {
    const N = [
      { i: '💸', g: 'q-g', t: 'Перевод Ольге К. выполнен', s: '3 500 ₽ · без комиссии, деньги уже у получателя', d: '2 часа назад', n: 1 },
      { i: '🛡️', g: 'q-b', t: 'Новый вход в ChБанк', s: 'Москва · iPhone. Это были вы? Всё в порядке.', d: 'Сегодня, 09:12', n: 1 },
      { i: '⭐️', g: 'q-y', t: 'Начислили 486 бонусов', s: 'За покупки на сумму 16 200 ₽ на этой неделе', d: 'Вчера', n: 1 },
      { i: '🏠', g: 'q-t', t: 'Квартплата списана', s: '6 240,18 ₽ по подписке. Следующее списание 1 ноября.', d: '2 дня назад' },
      { i: '🎁', g: 'q-pk', t: 'Прайм на 30 дней бесплатно', s: 'Подключите подписку и получайте 5% кэшбэка', d: '3 дня назад' }
    ];
    const S = sheet({ html: '' });
    S.render(`<div class="sheet__title">Уведомления</div><div class="sheet__sub">3 новых сообщения</div>
      <div class="sheet__body"><div class="list">${N.map((x, i) => `
        <button class="ntf" style="animation-delay:${i * 55}ms" data-n="${i}" type="button">
          <i class="ntf__i ${x.g}">${x.i}</i>
          <span><span class="ntf__t">${esc(x.t)}</span><span class="ntf__s">${esc(x.s)}</span><span class="ntf__d">${esc(x.d)}</span></span>
          ${x.n ? '<span class="ntf__new"></span>' : ''}
        </button>`).join('')}</div></div>
      <div class="sheet__foot"><button class="btn btn--ghost" id="readAll" type="button">Отметить все прочитанными</button></div>`);
    $$('.ntf', S.panel).forEach(b => b.addEventListener('click', () => {
      const d = $('.ntf__new', b); if (d) { d.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }], { duration: 260 }).onfinish = () => d.remove(); }
      haptic(8);
      const i = +b.dataset.n;
      if (i === 0) { S.close(); openTransfer({ name: 'Ольга К.', phone: '+79160000042' }); }
      if (i === 4) { S.close(); toast('Демо: подписка уже подключена ✨'); }
    }));
    $('#readAll', S.panel).addEventListener('click', () => {
      $$('.ntf__new', S.panel).forEach(d => d.remove());
      const bd = $('.icon-btn .badge'); if (bd) bd.remove();
      haptic(14); toast('Все уведомления прочитаны');
    });
  }

  /* ═════════════ ПОИСК ═════════════ */
  function openSearch() {
    const ALL = [
      ...GROUPS.tilesTransfer, ...GROUPS.tilesMobile, ...GROUPS.tilesBills, ...GROUPS.tilesFun, ...GROUPS.tilesGov
    ];
    const S = sheet({ html: '' });
    S.render(`
    <div class="sheet__body" style="margin-top:2px">
      <div class="field is-focus"><div class="field__row">
        <span class="field__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg></span>
        <input id="q" type="search" placeholder="Услуга, операция или получатель" autocomplete="off">
      </div></div>
      <div id="res"></div>
    </div>`);
    const q = $('#q', S.panel), res = $('#res', S.panel);
    function draw(v) {
      const s = v.trim().toLowerCase();
      const svc = s ? ALL.filter(t => t.t.toLowerCase().includes(s)) : [];
      const txs = s ? state.txs.filter(t => (t.t + ' ' + t.s).toLowerCase().includes(s)).slice(0, 6) : [];
      const pop = !s ? ALL.slice(0, 8) : [];
      res.innerHTML =
        (svc.length ? `<div class="sec"><div class="sec__head"><h2 class="sec__title" style="font-size:15px">Сервисы</h2></div><div class="tiles">${svc.map(t => `<button class="tile" data-a="${t.a}" data-t="${esc(t.t)}" data-i="${t.i}" data-g="${t.g}" type="button"><i class="${t.g}">${t.i}</i><span>${esc(t.t)}</span></button>`).join('')}</div></div>` : '') +
        (pop.length ? `<div class="sec"><div class="sec__head"><h2 class="sec__title" style="font-size:15px">Популярное</h2></div><div class="tiles">${pop.map(t => `<button class="tile" data-a="${t.a}" data-t="${esc(t.t)}" data-i="${t.i}" data-g="${t.g}" type="button"><i class="${t.g}">${t.i}</i><span>${esc(t.t)}</span></button>`).join('')}</div></div>` : '') +
        (txs.length ? `<div class="sec"><div class="sec__head"><h2 class="sec__title" style="font-size:15px">Операции</h2></div><div class="txs">${txs.map(t => { const c = cat(t.c); return `<button class="tx" data-tx="${state.txs.indexOf(t)}" type="button"><i class="tx__i ${c.grad}">${c.icon}</i><span class="tx__main"><span class="tx__t">${esc(t.t)}</span><span class="tx__s">${esc(t.s)}</span></span><span class="tx__r"><span class="tx__a ${t.a > 0 ? 'is-in' : ''}">${signed(t.a)}</span><span class="tx__b">${ago(t.d)}</span></span></button>`; }).join('')}</div></div>` : '') +
        (s && !svc.length && !txs.length ? `<div class="txs__empty" style="padding:30px 0"><p>Ничего не нашли по запросу «${esc(s)}»</p></div>` : '');
      $$('.tile', res).forEach(b => b.addEventListener('click', () => { S.close(); tileAction(b.dataset); }));
      $$('[data-tx]', res).forEach(b => b.addEventListener('click', () => { S.close(); openTx(state.txs[+b.dataset.tx]); }));
    }
    q.addEventListener('input', () => draw(q.value));
    draw('');
    setTimeout(() => q.focus(), 380);
  }

  /* ═════════════ АНАЛИТИКА ═════════════ */
  function openAnalytics() {
    const month = state.txs.filter(t => new Date(t.d).getMonth() === now.getMonth());
    const byCat = {};
    month.filter(t => t.a < 0).forEach(t => { byCat[t.c] = (byCat[t.c] || 0) + Math.abs(t.a); });
    const arr = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const totalOut = arr.reduce((s, x) => s + x[1], 0) || 1;
    const inc = month.filter(t => t.a > 0 && !t.txt).reduce((s, t) => s + t.a, 0);
    fscreen({
      title: 'Расходы за ' + now.toLocaleDateString('ru-RU', { month: 'long' }),
      mount(body) {
        body.innerHTML = `
        <div class="statrow" style="margin-top:4px">
          <div class="stat"><b style="font-size:15px">${rub(totalOut)}</b><span>Потрачено</span></div>
          <div class="stat"><b style="font-size:15px;color:var(--brand)">${rub(inc)}</b><span>Поступило</span></div>
          <div class="stat"><b style="font-size:15px">${rub(state.bonus)}</b><span>Бонусов</span></div>
        </div>
        <div class="sec"><div class="sec__head"><h2 class="sec__title" style="font-size:16px">По категориям</h2></div>
          <div class="group" style="padding:6px 14px">
            ${arr.map((x, i) => { const c = cat(x[0]); const p = Math.round(x[1] / totalOut * 100); return `
              <div class="det" style="align-items:center;animation:rise .4s ${i * 50}ms backwards">
                <span style="display:flex;align-items:center;gap:10px;color:var(--txt)"><i class="tx__i ${c.grad}" style="width:32px;height:32px;border-radius:11px;font-size:15px">${c.icon}</i>${c.label}</span>
                <b>${rub(x[1])} <em style="font-style:normal;color:var(--txt-2);font-weight:500;font-size:11.5px">· ${p}%</em></b>
              </div>
              <div style="height:5px;border-radius:3px;background:var(--line);overflow:hidden;margin:-6px 0 10px">
                <div style="height:100%;width:${p}%;border-radius:3px;background:linear-gradient(90deg,#2EBF5E,#8FE0AE);animation:grow-x .8s ${i * 60}ms cubic-bezier(.22,1,.36,1) backwards"></div>
              </div>`; }).join('') || '<div class="det"><span>Пока нет расходов</span></div>'}
          </div>
        </div>
        <div class="fscreen__foot"><button class="btn" data-x2 type="button">Понятно</button></div>`;
        $('[data-x2]', body).addEventListener('click', () => body.closest('.fscreen').querySelector('[data-x]').click());
      }
    });
  }

  /* ═════════════ ЧАТ ═════════════ */
  const QUICK = ['Мой баланс', 'Перевести деньги', 'Заблокировать карту', 'Бонусы Спасибо', 'Кэшбэк за октябрь'];
  let chatInit = false;
  function initChat() {
    if (chatInit) return; chatInit = true;
    $('#chatQuick').innerHTML = QUICK.map(q => `<button type="button">${q}</button>`).join('');
    $$('#chatQuick button').forEach(b => b.addEventListener('click', () => { send(b.textContent); }));
    push('day', 'Сегодня');
    push('bot', 'Здравствуйте, ' + state.name.split(' ')[0] + '! Я помощник ChБанка. Знаю всё про ваши карты, переводы и бонусы. Спросите что угодно 🙂');
  }
  function push(kind, text) {
    const box = $('#chatScroll');
    if (kind === 'day') { box.appendChild(el('div', 'daysep', esc(text))); }
    else {
      const b = el('div', 'bub bub--' + (kind === 'me' ? 'me' : 'bot'),
        esc(text).replace(/\n/g, '<br>') + `<span class="bub__time">${hhmm(Date.now())}</span>`);
      box.appendChild(b);
    }
    requestAnimationFrame(() => box.scrollTop = box.scrollHeight);
  }
  function typing() {
    const box = $('#chatScroll');
    const t = el('div', 'bub bub--bot bub--typing', '<i></i><i></i><i></i>');
    box.appendChild(t); box.scrollTop = box.scrollHeight;
    return () => t.remove();
  }
  function send(text) {
    const v = (text || '').trim();
    if (!v) return;
    initChat();
    push('me', v);
    $('#chatText').value = '';
    haptic(8);
    const done = typing();
    setTimeout(() => { done(); push('bot', botAnswer(v)); }, 620 + Math.random() * 500);
  }
  function botSay(t) { initChat(); const done = typing(); setTimeout(() => { done(); push('bot', t); }, 400); }
  function botAnswer(q) {
    const s = q.toLowerCase();
    if (/баланс|скольк|остат|деньг/.test(s))
      return 'Ваш общий баланс — ' + rub(total()) + '.\n' + state.cards.map(c => '• ' + c.name + ': ' + rub(c.bal)).join('\n');
    if (/перев|отправ|скин|закинь/.test(s))
      return 'Перевожу! Откройте «Перевод», введите номер получателя и имя в формате «Ольга К.», укажите сумму — и деньги уйдут мгновенно, без комиссии.';
    if (/себе|пополн|зачисл/.test(s))
      return 'Чтобы перевести себе, нажмите «Себе» на главной, выберите сумму — и она сразу зачислится на баланс. Хотите, открою этот экран?';
    if (/блок|замороз|потерял|украли/.test(s))
      return 'В демо-режиме карты не блокируются по-настоящему 🙂 В реальном банке это делается в разделе Карта → Настройки → Заблокировать.';
    if (/бонус|спасиб|кэшбэк|кешбек/.test(s))
      return 'У вас ' + state.bonus.toLocaleString('ru-RU') + ' бонусов «Спасибо». Ими можно оплатить до 99% покупки у партнёров.';
    if (/карт|реквизит|счёт|счет/.test(s))
      return 'У вас ' + state.cards.length + ' счёта: ' + state.cards.map(c => c.name).join(', ') + '. Нажмите на карту на главной, чтобы увидеть номер и реквизиты.';
    if (/qr|кьюар|куар/.test(s))
      return 'QR-код на главной → «QR-код». Наведите камеру на код продавца — оплата пройдёт без комиссии.';
    if (/привет|здрав|добрый|хай/.test(s))
      return 'Привет! Рад вас видеть в ChБанке 👋 Чем помочь: баланс, перевод или бонусы?';
    if (/спасиб|благод/.test(s))
      return 'Всегда пожалуйста! 💚 Обращайтесь в любое время.';
    if (/операци|истори|траты|расход/.test(s)) {
      const m = state.txs.filter(t => t.a < 0).slice(0, 3).map(t => '• ' + t.t + ' — ' + rub(Math.abs(t.a))).join('\n');
      return 'Последние списания:\n' + m + '\nПолная история — на главной внизу.';
    }
    if (/лимит/.test(s))
      return 'Ваш лимит на переводы — 300 000 ₽ в сутки и 1 500 000 ₽ в месяц. Изменить можно в Профиль → Лимиты и подписки.';
    if (/\?/.test(s))
      return 'Хороший вопрос! Я умею показывать баланс, делать переводы себе и по номеру телефона, платить за связь и ЖКХ. Напишите, например, «мой баланс».';
    return 'Записал: «' + q + '». Могу показать баланс, помочь с переводом или оплатить услуги — просто напишите, что нужно.';
  }
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); send($('#chatText').value); });
  $('[data-attach]').addEventListener('click', () => toast('Демо: вложения недоступны'));
  $('[data-call]').addEventListener('click', () => toast('Звонок в банк: 900 (демо)'));

  /* ═════════════ ПРОФИЛЬ: разделы ═════════════ */
  const SETTINGS = {
    cards: { title: 'Мои карты и счета', build(body, close) {
      body.innerHTML = `<div class="list">${state.cards.map(c => `
        <button class="card ${c.type}" data-c="${c.id}" style="width:100%;aspect-ratio:1.75/1" type="button">
          <i class="card__glow"></i><i class="card__grid"></i>
          <div class="card__top"><span class="card__bank"><i>Ch</i>ChБанк</span><span class="card__chip"></span><span class="card__wave">${waveSvg}</span></div>
          <div class="card__mid"><span class="card__sum">${state.hidden ? '••••••' : rub(c.bal)}</span><span class="card__num">${c.num}</span></div>
          <div class="card__bot"><span>${esc(c.name)}</span><span class="card__sys">${esc(c.sys)}</span></div>
        </button>`).join('')}
        <button class="btn btn--ghost" id="addCard" type="button">Заказать новую карту</button></div>`;
      $$('[data-c]', body).forEach(b => b.addEventListener('click', () => { close(); openCard(cardById(b.dataset.c)); }));
      $('#addCard', body).addEventListener('click', () => { haptic(14); toast('Демо: выпуск карт недоступен'); });
    } },
    secure: { title: 'Безопасность и вход', build(body) {
      body.innerHTML = `<div class="group">
        ${row('i-g', 'Код-пароль при входе', sw(true))}
        ${row('i-b', 'Face ID / отпечаток', sw(true))}
        ${row('i-p', 'Уведомления о входах', sw(true))}
        ${row('i-o', 'Подтверждение переводов', sw(true))}
        ${row('i-r', 'Скрыть баланс на главной', sw(state.hidden, 'hide'))}
      </div>
      <div class="sec"><div class="group">${row('i-gr', 'Устройства с доступом', '<em class="row__v">iPhone 15</em><u class="row__ar"></u>')}</div></div>
      <p class="disclaimer">Демо-приложение: переключатели сохраняются только здесь.</p>`;
      bindSwitches(body);
    } },
    notif: { title: 'Уведомления', build(body) {
      body.innerHTML = `<div class="group">
        ${row('i-g', 'Push об операциях', sw(true))}
        ${row('i-b', 'СМС о списаниях', sw(false))}
        ${row('i-y', 'Акции и бонусы', sw(true))}
        ${row('i-p', 'Звук уведомления', sw(true))}
        ${row('i-t', 'Вибрация', sw(state.haptics, 'hapt'))}
      </div>`;
      bindSwitches(body);
    } },
    limits: { title: 'Лимиты и подписки', build(body) {
      body.innerHTML = `<div class="group">
        ${row('i-g', 'Переводы в сутки', '<em class="row__v">300 000 ₽</em><u class="row__ar"></u>')}
        ${row('i-b', 'Переводы в месяц', '<em class="row__v">1 500 000 ₽</em><u class="row__ar"></u>')}
        ${row('i-o', 'Снятие наличных', '<em class="row__v">150 000 ₽</em><u class="row__ar"></u>')}
        ${row('i-p', 'Онлайн-покупки', '<em class="row__v">100 000 ₽</em><u class="row__ar"></u>')}
      </div>
      <div class="sec"><div class="sec__head"><h2 class="sec__title" style="font-size:16px">Подписки</h2></div>
      <div class="group">${row('i-pk', 'ChPlay · 399 ₽/мес', '<em class="row__v">Активна</em><u class="row__ar"></u>')}${row('i-y', 'Прайм · 199 ₽/мес', '<em class="row__v">Активна</em><u class="row__ar"></u>')}${row('i-t', 'Антивирус · 99 ₽/мес', '<em class="row__v">Откл.</em><u class="row__ar"></u>')}</div></div>`;
    } },
    help: { title: 'Помощь и поддержка', build(body) {
      body.innerHTML = `<div class="group">
        ${row('i-g', 'Написать в чат', '<u class="row__ar"></u>', 'chat')}
        ${row('i-b', 'Позвонить 900', '<u class="row__ar"></u>', 'call')}
        ${row('i-o', 'Частые вопросы', '<u class="row__ar"></u>', 'faq')}
        ${row('i-p', 'О приложении', '<em class="row__v">1.0.0</em><u class="row__ar"></u>', 'about')}
      </div>`;
      $$('[data-go]', body).forEach(b => b.addEventListener('click', () => {
        const g = b.dataset.go;
        if (g === 'chat') { b.closest('.fscreen').querySelector('[data-x]').click(); go('chat'); }
        if (g === 'call') toast('Номер банка: 900 (демо)');
        if (g === 'faq') faq(b.closest('.fscreen'));
        if (g === 'about') toast('ChБанк 1.0.0 — демонстрационное приложение');
      }));
    } }
  };
  function row(grad, label, right, go) {
    return `<div class="row ${go ? '' : 'row--static'}" ${go ? `data-go="${go}"` : ''}>${grad && grad.startsWith('i-') ? `<i class="row__i ${grad}">${rowIcon(grad)}</i>` : ''}<span>${esc(label)}</span>${right || ''}</div>`;
  }
  const ICONS = {
    'i-g': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5.5c0 4.3 2.9 7.6 7 9.5 4.1-1.9 7-5.2 7-9.5V6l-7-3Z"/></svg>',
    'i-b': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/></svg>',
    'i-p': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.6 1.6"/></svg>',
    'i-o': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10M8 10l4 4 4-4"/><path d="M5 19h14"/></svg>',
    'i-r': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.3 4M6.4 8A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9.7 9.7 0 0 0 3.6-.7"/></svg>',
    'i-y': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18.5h2"/></svg>',
    'i-t': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    'i-pk': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg>',
    'i-gr': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>'
  };
  const rowIcon = g => ICONS[g] || ICONS['i-gr'];
  function sw(on, key) { return `<label class="sw"><input type="checkbox" ${on ? 'checked' : ''} ${key ? `data-sw="${key}"` : ''}><i></i></label>`; }
  function bindSwitches(body) {
    $$('[data-sw]', body).forEach(i => i.addEventListener('change', () => {
      haptic(12);
      if (i.dataset.sw === 'hide') { state.hidden = i.checked; save(); renderCards(); renderBal(false); applyEye(); }
      if (i.dataset.sw === 'hapt') { state.haptics = i.checked; save(); const s = $('#swHapt'); if (s) s.checked = i.checked; }
    }));
  }
  function faq(f) {
    const body = $('.fscreen__body', f.root);
    body.innerHTML = `<div class="group">
      ${['Как перевести себе?', 'Как перевести по номеру телефона?', 'Есть ли комиссия?', 'Где история операций?', 'Это настоящий банк?'].map(q =>
        `<button class="row" data-q="${esc(q)}" type="button"><i class="row__i i-g"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4"/><path d="M12 17h.01" stroke-width="2.2"/><circle cx="12" cy="12" r="9"/></svg></i><span>${esc(q)}</span><u class="row__ar"></u></button>`).join('')}
    </div>`;
    const A = {
      'Как перевести себе?': 'Главная → «Себе» → выберите сумму → «Зачислить». Деньги попадут на выбранный счёт мгновенно.',
      'Как перевести по номеру телефона?': 'Главная → «Перевод» → введите номер и имя получателя в формате «Ольга К.» → сумму → «Подтвердить».',
      'Есть ли комиссия?': 'Нет. В демо все переводы и платежи без комиссии.',
      'Где история операций?': 'На главной внизу: «История операций». Нажмите на операцию, чтобы увидеть чек.',
      'Это настоящий банк?': 'Нет. ChБанк — учебное демо-приложение: деньги и получатели виртуальные.'
    };
    $$('[data-q]', body).forEach(b => b.addEventListener('click', () => toast(A[b.dataset.q], 'ok', 4200)));
  }
  function openSettings(key) {
    const s = SETTINGS[key]; if (!s) return;
    fscreen({ title: s.title, mount: (body, close) => s.build(body, close) });
  }
  $$('[data-set]').forEach(b => b.addEventListener('click', () => { haptic(10); openSettings(b.dataset.set); }));

  function applyEye() {
    const i = $('#eyeIcon');
    i.innerHTML = state.hidden
      ? '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.3 4M6.4 8A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9.7 9.7 0 0 0 3.6-.7"/>'
      : '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
    $('#balTotal').textContent = state.hidden ? '••••••' : money(total(), 2);
    $('#balHint').textContent = state.hidden ? 'Баланс скрыт — нажмите на глаз' : 'Деньги зачисляются мгновенно';
  }

  /* ═════════════ ГЛОБАЛЬНЫЕ КНОПКИ ═════════════ */
  $('#btnTopup').addEventListener('click', () => { haptic(12); openTopup(); });
  $('#btnEye').addEventListener('click', () => {
    state.hidden = !state.hidden; save(); haptic(14);
    renderCards(); renderBal(false); applyEye();
    toast(state.hidden ? 'Баланс скрыт' : 'Баланс снова виден');
  });
  $('#btnNotif').addEventListener('click', () => { haptic(10); openNotif(); });
  $('#btnAvatar').addEventListener('click', () => { haptic(10); go('prof'); });
  $('#btnSearch').addEventListener('click', () => { haptic(10); openSearch(); });
  $('#btnSearch2').addEventListener('click', () => { haptic(10); openSearch(); });
  $('#insight').addEventListener('click', () => { haptic(10); openAnalytics(); });
  $('#btnAll').addEventListener('click', () => { haptic(10); openAnalytics(); });
  $('[data-promo]').addEventListener('click', e => { e.stopPropagation(); haptic([14, 40, 14]); toast('Прайм подключён на 30 дней бесплатно ✨'); confetti(26); });
  $$('[data-more]').forEach(b => b.addEventListener('click', () => { haptic(10); toast('Раздел «' + b.textContent + '» — в демо доступны основные услуги'); }));
  $('[data-fav]').addEventListener('click', () => toast('Избранное можно менять в полной версии'));

  $$('.qbtn[data-act]').forEach(b => b.addEventListener('click', () => {
    haptic(14);
    const a = b.dataset.act;
    if (a === 'self') openSelf();
    else if (a === 'transfer') openTransfer();
    else if (a === 'pay') go('pay');
    else if (a === 'qr') openQR();
  }));

  $$('#filters .chip').forEach(c => c.addEventListener('click', () => {
    $$('#filters .chip').forEach(x => x.classList.remove('is-on'));
    c.classList.add('is-on'); filter = c.dataset.f; haptic(9); renderTxs();
  }));

  $('#swTheme').addEventListener('change', e => {
    state.theme = e.target.checked ? 'dark' : 'light'; save(); applyTheme(); haptic(14);
    toast(state.theme === 'dark' ? 'Тёмная тема включена 🌙' : 'Светлая тема включена ☀️');
  });
  $('#btnTheme').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    save(); applyTheme(); haptic(14);
  });
  $('#swHapt').addEventListener('change', e => { state.haptics = e.target.checked; save(); haptic(20); });

  $('#btnReset').addEventListener('click', () => {
    const S = sheet({ html: `<div class="sheet__title">Сбросить демо-данные?</div>
      <div class="sheet__sub">Баланс, история операций и настройки вернутся к исходным</div>
      <div class="sheet__foot" style="margin-top:24px">
        <button class="btn btn--dark" id="yes" type="button">Да, сбросить</button>
        <button class="btn btn--ghost" id="no" type="button">Отмена</button></div>` });
    $('#no', S.panel).addEventListener('click', S.close);
    $('#yes', S.panel).addEventListener('click', () => {
      localStorage.removeItem(KEY);
      state = structuredClone(DEFAULT);
      activeCard = mainCard();
      save(); applyTheme(); applyEye(); renderCards(); renderBal(false); renderTxs(); renderInsight(); renderPay();
      S.close(); haptic([16, 50, 16]); toast('Демо-данные сброшены');
    });
  });
  $('#btnExit').addEventListener('click', () => {
    sessionStorage.removeItem('chbank.pin');
    location.reload();
  });

  /* ───────── ripple + pull-to-refresh ───────── */
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest('.btn,.qbtn,.tile,.chip,.amt,.key,.tab,.fav,.row,.ntf,.pick__row');
    if (!t) return;
    const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.1;
    const light = t.matches('.btn:not(.btn--ghost):not(.btn--light),.key:not(.key--fn),.chip.is-on,.amt.is-on,.tab.is-on');
    const s = el('span', 'ripple' + (light ? '' : ' ripple--dark'));
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
    t.style.overflow = 'hidden';
    t.appendChild(s);
    setTimeout(() => s.remove(), 620);
  }, { passive: true });

  (function pullToRefresh() {
    const sc = $('#scrollHome'); if (!sc) return;
    let y0 = null, pulling = false;
    sc.addEventListener('touchstart', e => { if (sc.scrollTop <= 0) { y0 = e.touches[0].clientY; } }, { passive: true });
    sc.addEventListener('touchmove', e => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 40 && !pulling) { pulling = true; $('.ptr').classList.add('is-on'); }
    }, { passive: true });
    const end = () => {
      if (pulling) {
        haptic([10, 40, 10]);
        setTimeout(() => {
          $('.ptr').classList.remove('is-on');
          state.txs.forEach(t => { t.n = 0; t.k = 1; }); save();
          renderTxs(false); renderBal(true); renderInsight();
          toast('Данные обновлены');
        }, 900);
      }
      pulling = false; y0 = null;
    };
    sc.addEventListener('touchend', end);
    sc.addEventListener('touchcancel', end);
  })();

  /* ───────── PIN-экран ───────── */
  (function pin() {
    const root = $('#pin');
    if (sessionStorage.getItem('chbank.pin')) { root.classList.add('is-gone'); setTimeout(() => root.remove(), 500); boot(); return; }
    const dots = $$('#pinDots i');
    let code = '';
    const pad = $('#pinPad');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'face', '0', 'back'];
    pad.innerHTML = keys.map(k => k === 'back'
      ? `<button class="pin__key" data-k="back" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L2 12l7-7Z"/><path d="m12 9.5 5 5M17 9.5l-5 5"/></svg></button>`
      : k === 'face' ? `<button class="pin__key pin__key--fn" data-k="face" type="button">Face<br>ID</button>`
      : `<button class="pin__key" data-k="${k}" type="button">${k}</button>`).join('');
    function paint() { dots.forEach((d, i) => d.classList.toggle('is-on', i < code.length)); }
    function enter() {
      sessionStorage.setItem('chbank.pin', '1');
      haptic([12, 40, 20]);
      root.classList.add('is-gone');
      setTimeout(() => { root.remove(); boot(); }, 460);
    }
    function fail() {
      haptic([24, 60, 24]);
      $('#pinDots').classList.add('is-err');
      setTimeout(() => { $('#pinDots').classList.remove('is-err'); code = ''; paint(); }, 420);
    }
    pad.addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k;
      haptic(8);
      if (k === 'back') { code = code.slice(0, -1); paint(); return; }
      if (k === 'face') { enter(); return; }
      if (code.length < 4) { code += k; paint(); b.animate([{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'cubic-bezier(.34,1.56,.64,1)' }); }
      if (code.length === 4) setTimeout(() => (code === '0000' ? fail() : enter()), 180);
    });
    $('#pinFace').addEventListener('click', enter);
    document.addEventListener('keydown', e => {
      if (!document.body.contains(root)) return;
      if (/^[0-9]$/.test(e.key)) { const b = pad.querySelector(`[data-k="${e.key}"]`); b && b.click(); }
      if (e.key === 'Backspace') pad.querySelector('[data-k="back"]').click();
    });
  })();

  function boot() {
    applyTheme();
    applyEye();
    renderCards(); bindCarousel();
    renderBal(false); shown = total();
    renderTxs(); renderInsight(); renderPay(); initChat();
    $$('#swHapt').forEach(s => s.checked = state.haptics);
    $('#app').classList.add('is-ready');
    go('home');
    setTimeout(() => { if (window.innerWidth < 560) toast('Совет: потяните экран вниз, чтобы обновить', 'ok', 3200); }, 1600);
  }

  /* ───────── защита от «липких» ховеров на тач-экранах ───────── */
  window.addEventListener('blur', () => {
    const a = document.activeElement;
    if (a && a.blur && a.tagName === 'BUTTON') a.blur();
  });

})();
