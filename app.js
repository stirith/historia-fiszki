'use strict';

const STORE_KEY = 'historia-fiszki-v1';

const DEFAULT_SETTINGS = {
  count: 10,       // 0 = wszystkie
  reverse: true,   // quiz pyta też odwrotnie: definicja → nazwa pojęcia
  speak: false,    // czytanie pytań na głos
};

const PRAISE = ['Brawo! 🎉', 'Super! ⭐', 'Świetnie! 🙌', 'Tak jest! 💪', 'Ekstra! 🌟'];

// Ile kolejnych dobrych odpowiedzi, żeby pytanie liczyło się jako „umiem”.
const MASTERED_AFTER = 2;

// ---------- dane ----------

const CARDS = SECTIONS.flatMap(s => s.cards.map((c, i) => ({
  ...c, id: `${s.id}-${i + 1}`, sec: s.id, ch: s.id.split('.')[0],
})));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const groupOf = c => c.tag || (c.t ? 'def' : null);

// Dwie błędne odpowiedzi: własne z danych albo odpowiedzi z tej samej grupy (najpierw z tego samego rozdziału).
function distractors(c, field) {
  if (field === 'a' && c.zle) return shuffle(c.zle).slice(0, 2);
  const g = field === 't' ? 'def' : groupOf(c);
  const others = CARDS.filter(o => o.id !== c.id && o[field] && o[field] !== c[field]);
  const sameGroup = others.filter(o => (field === 't' || g) && groupOf(o) === g);
  const sources = [
    shuffle(sameGroup.filter(o => o.ch === c.ch)), shuffle(sameGroup),
    shuffle(others.filter(o => o.ch === c.ch && !o.zle)), shuffle(others),
  ];
  const out = [];
  for (const src of sources) {
    for (const o of src) {
      if (out.length === 2) return out;
      if (!out.includes(o[field])) out.push(o[field]);
    }
  }
  return out;
}

function buildQuestion(c, opts = {}) {
  const rev = c.t && !opts.noReverse && state.settings.reverse && Math.random() < 0.4;
  const field = rev ? 't' : 'a';
  return {
    c, rev,
    label: rev ? 'Jak to nazywamy?' : `Rozdział ${c.sec}`,
    prompt: rev ? c.a : c.q,
    correct: c[field],
    options: shuffle([c[field], ...distractors(c, field)]),
  };
}

// ---------- stan ----------

let state;
let view = 'home';
let session = null;
let advanceTimer = null;

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* brak dostępu do pamięci */ }
  const all = SECTIONS.map(x => x.id);
  if (!s) return { selected: all, settings: { ...DEFAULT_SETTINGS }, stats: {}, activity: {} };
  return {
    selected: Array.isArray(s.selected) ? s.selected.filter(id => all.includes(id)) : all,
    settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
    stats: s.stats || {},
    activity: s.activity || {},
  };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* tryb prywatny */ }
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const selectedCards = () => CARDS.filter(c => state.selected.includes(c.sec));
const statOf = c => state.stats[c.id] || { r: 0, w: 0, c: 0 };
const isMastered = c => (statOf(c).c || 0) >= MASTERED_AFTER;

function hardCards() {
  return CARDS.filter(c => {
    const st = state.stats[c.id];
    return st && st.w > 0 && (st.c || 0) < MASTERED_AFTER;
  });
}

function record(c, ok) {
  const st = { c: 0, ...statOf(c) };
  if (ok) { st.r++; st.c++; } else { st.w++; st.c = 0; }
  state.stats[c.id] = st;
  state.activity[isoDate(new Date())] = true;
  save();
}

function streak() {
  const d = new Date();
  if (!state.activity[isoDate(d)]) d.setDate(d.getDate() - 1);
  let count = 0;
  while (state.activity[isoDate(d)]) { count++; d.setDate(d.getDate() - 1); }
  return count;
}

// ---------- mowa ----------

let plVoice = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  plVoice = vs.find(v => v.lang === 'pl-PL') || vs.find(v => v.lang && v.lang.startsWith('pl')) || null;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\(.*?\)/g, ''));
  u.lang = 'pl-PL';
  if (plVoice) u.voice = plVoice;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

function autoSpeak(text) {
  if (state.settings.speak) speak(text);
}

// ---------- widoki ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function speakBtn(text, extra = '') {
  return `<button type="button" class="speak ${extra}" data-action="speak" data-text="${esc(text)}" aria-label="Przeczytaj na głos">🔊</button>`;
}

function topbar(idx, total) {
  const pct = total ? Math.round((idx / total) * 100) : 0;
  return `<div class="bar">
    <button class="close" data-action="home" aria-label="Zakończ">✕</button>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <span class="pos">${Math.min(idx + 1, total)}/${total}</span>
  </div>`;
}

function viewHome() {
  const sel = selectedCards();
  const hard = hardCards();
  const mastered = CARDS.filter(isMastered).length;
  const fire = streak();
  const dis = sel.length ? '' : 'disabled';
  const chapters = CHAPTERS.map(ch => {
    const secs = SECTIONS.filter(s => s.id.startsWith(ch.id + '.'));
    const allOn = secs.every(s => state.selected.includes(s.id));
    return `<div class="chapter">
      <button class="ch-head ${allOn ? 'on' : ''}" data-action="toggleChapter" data-id="${ch.id}">
        <span>${ch.emoji}</span><b>${ch.id}. ${esc(ch.name)}</b></button>
      <div class="chips">${secs.map(s => `<button class="chip ${state.selected.includes(s.id) ? 'on' : ''}" data-action="toggleSection" data-id="${s.id}">
        ${s.id} ${esc(s.name)}<small>${s.cards.length}</small></button>`).join('')}</div>
    </div>`;
  }).join('');
  return `
  <header class="top">
    <h1>Historia <span aria-hidden="true">📜</span></h1>
    <p class="sub">Sprawdzian: rozdziały 5–8</p>
  </header>
  <section class="progress-card">
    <div class="pc-head"><p>Umiesz <b>${mastered}</b> z <b>${CARDS.length}</b> pytań</p>
      ${fire ? `<div class="streak" title="Dni nauki z rzędu">🔥 ${fire}</div>` : ''}</div>
    <div class="meter"><span style="width:${Math.round((mastered / CARDS.length) * 100)}%"></span></div>
    <small>Pytanie umiesz, gdy odpowiesz dobrze ${MASTERED_AFTER} razy z rzędu.</small>
  </section>
  <h2 class="section">Co ćwiczysz</h2>
  ${chapters}
  <p class="count">${sel.length ? `Wybrane pytania: <b>${sel.length}</b>` : 'Zaznacz tematy, które chcesz poćwiczyć'}</p>
  <div class="big">
    <button class="big-btn cards" data-action="startCards" ${dis}>
      <span class="ico">🃏</span><span><b>Fiszki</b><small>pytanie → odwróć → odpowiedź</small></span>
    </button>
    <button class="big-btn test" data-action="startTest" ${dis}>
      <span class="ico">✅</span><span><b>Quiz</b><small>wybierz dobrą odpowiedź z 3</small></span>
    </button>
    ${hard.length ? `<button class="big-btn hard" data-action="startHard">
      <span class="ico">🔁</span><span><b>Trudne pytania</b><small>${hard.length} do powtórki</small></span>
    </button>` : ''}
    <button class="big-btn exam" data-action="startExam">
      <span class="ico">📝</span><span><b>Próbny sprawdzian</b><small>wszystkie ${CARDS.length} pytań, bez podpowiedzi</small></span>
    </button>
  </div>`;
}

function viewSheet() {
  return `
  <header class="top"><h1>Ściąga</h1><p class="sub">Wszystko, co trzeba umieć – do czytania przed sprawdzianem</p></header>
  ${CHAPTERS.map(ch => `<details class="sheet" open>
    <summary>${ch.emoji} ${ch.id}. ${esc(ch.name)}</summary>
    ${SECTIONS.filter(s => s.id.startsWith(ch.id + '.')).map(s => `<h3>${s.id} ${esc(s.name)}</h3>
      <dl>${s.cards.map(c => `<div class="${isMastered(c) ? 'known' : ''}"><dt>${esc(c.q)}</dt><dd>${esc(c.a)}${c.more ? `<small>${esc(c.more)}</small>` : ''}</dd></div>`).join('')}</dl>`).join('')}
  </details>`).join('')}`;
}

function seg(key, options) {
  const cur = state.settings[key];
  return `<div class="seg" role="radiogroup">${options.map(([val, label]) =>
    `<button role="radio" aria-checked="${cur === val}" class="${cur === val ? 'on' : ''}" data-action="set" data-key="${key}" data-val="${val}">${label}</button>`).join('')}</div>`;
}

function toggle(key, label, hint) {
  return `<label class="toggle"><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
    <input type="checkbox" data-setting="${key}" ${state.settings[key] ? 'checked' : ''}><i></i></label>`;
}

function viewSettings() {
  return `
  <header class="top"><h1>Ustawienia</h1></header>
  <div class="settings">
    <section><h2>Liczba pytań w quizie</h2>${seg('count', [[5, '5'], [10, '10'], [20, '20'], [0, 'Wszystkie']])}</section>
    <section class="toggles">
      ${toggle('reverse', 'Pytaj też odwrotnie', 'Quiz czasem podaje definicję i pyta, jak nazywamy to pojęcie')}
      ${toggle('speak', 'Czytaj pytania na głos', 'Telefon przeczyta pytanie i odpowiedź')}
    </section>
    <section><h2>Dane</h2>
      <button class="ghost wide" data-action="resetStats">Wyzeruj postępy</button>
    </section>
    <p class="hint">Pytania na podstawie podręcznika „Wczoraj i dziś” kl. 4, rozdziały 5–8 i strony „Warto zapamiętać”.</p>
  </div>`;
}

function viewCards() {
  const s = session;
  if (s.idx >= s.queue.length) return cardsSummary();
  const c = s.queue[s.idx];
  return `
  ${topbar(s.idx, s.queue.length)}
  <div class="stage ${s.flipped ? 'flipped' : ''}" id="stage">
    <button class="flashcard" data-action="flip" aria-label="Odwróć fiszkę">
      <span class="inner">
        <span class="face front"><small>Rozdział ${c.sec}</small><b>${esc(c.q)}</b><em>Powiedz odpowiedź, potem dotknij</em></span>
        <span class="face back"><small>${c.t ? esc(c.t) : 'Odpowiedź'}</small><b>${esc(c.a)}</b>${c.more ? `<em>${esc(c.more)}</em>` : ''}</span>
      </span>
    </button>
    <div class="card-tools">${speakBtn(s.flipped ? c.a : c.q)}</div>
    <div class="rate">
      <button class="rate-btn no" data-action="cardNo">😕 Jeszcze nie</button>
      <button class="rate-btn yes" data-action="cardYes">😊 Umiem</button>
    </div>
  </div>`;
}

function cardsSummary() {
  const s = session;
  return `
  <div class="summary">
    <div class="big-emoji">${s.unknown.length ? '💪' : '🏆'}</div>
    <h1>Umiesz ${s.known.length} z ${s.queue.length}</h1>
    <p class="sub">${s.unknown.length ? 'Powtórz te, których jeszcze nie umiesz.' : 'Wszystko opanowane!'}</p>
    ${s.unknown.length ? `<button class="primary wide" data-action="repeatCards">Powtórz nieumiane (${s.unknown.length})</button>` : ''}
    <button class="ghost wide" data-action="startTestFromCards">Zrób quiz z tych pytań</button>
    <button class="ghost wide" data-action="home">Wróć</button>
  </div>`;
}

function viewTest() {
  const s = session;
  if (s.idx >= s.items.length) return testSummary();
  const q = s.items[s.idx];
  const f = s.feedback;
  const options = q.options.map((o, i) => {
    const cls = f ? (o === q.correct ? 'right' : o === f.given ? 'wrong' : 'dim') : '';
    return `<button class="opt ${cls}" data-action="choose" data-i="${i}" ${f ? 'disabled' : ''}>${esc(o)}</button>`;
  }).join('');
  let fb = '';
  if (f) {
    const lines = [];
    if (q.rev) lines.push(`<p><b>${esc(q.c.t)}</b> – ${esc(q.c.a)}</p>`);
    else if (!f.ok) lines.push(`<p>Poprawnie: <b>${esc(q.correct)}</b></p>`);
    if (q.c.more) lines.push(`<p class="more">${esc(q.c.more)}</p>`);
    if (f.requeued) lines.push('<p class="again">🔁 To pytanie wróci za chwilę.</p>');
    fb = `<div class="feedback ${f.ok ? 'ok' : 'bad'}">
      <p class="fb-title">${f.title}</p>${lines.join('')}
      <div class="fb-actions">${speakBtn(q.rev ? `${q.c.t} – ${q.c.a}` : `${q.c.q} ${q.correct}`)}<button class="primary" data-action="next">Dalej →</button></div>
    </div>`;
  }
  return `
  ${topbar(s.idx, s.items.length)}
  <div class="prompt"><small>${esc(q.label)}</small><b class="${q.rev ? 'long' : ''}">${esc(q.prompt)}</b>${speakBtn(q.prompt)}</div>
  <div class="options">${options}</div>
  ${fb}`;
}

function testSummary() {
  const s = session;
  const total = s.base;
  const pct = total ? Math.round((s.score / total) * 100) : 0;
  const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
  const grade = pct >= 96 ? 6 : pct >= 86 ? 5 : pct >= 71 ? 4 : pct >= 51 ? 3 : pct >= 31 ? 2 : 1;
  const retried = s.items.length > s.base;
  return `
  <div class="summary">
    <div class="stars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('')}</div>
    ${s.opts.exam ? `<p class="sub">Wynik próbnego sprawdzianu · ${pct}% · na oko ocena <b>${grade}</b></p>` : ''}
    <h1>${s.score} / ${total}</h1>
    <p class="sub">${retried ? 'za pierwszym razem · ' : ''}${pct >= 90 ? 'Rewelacja!' : pct >= 70 ? 'Bardzo dobrze!' : pct >= 40 ? 'Nieźle, ćwicz dalej!' : 'Spróbuj jeszcze raz, dasz radę!'}</p>
    ${s.mistakes.length ? `<ul class="mistakes">${s.mistakes.map(m =>
      `<li><span>${esc(m.q.rev ? m.q.c.a : m.q.c.q)}</span><b>${esc(m.q.correct)}</b></li>`).join('')}</ul>
    <button class="primary wide" data-action="repeatMistakes">Powtórz błędy (${s.mistakes.length})</button>` : ''}
    <button class="ghost wide" data-action="again">Jeszcze raz</button>
    <button class="ghost wide" data-action="home">Wróć</button>
  </div>`;
}

const VIEWS = { home: viewHome, sheet: viewSheet, settings: viewSettings, cards: viewCards, test: viewTest };
const TABS = [['home', '📚', 'Nauka'], ['sheet', '📖', 'Ściąga'], ['settings', '⚙️', 'Ustawienia']];

function render() {
  document.getElementById('app').innerHTML = VIEWS[view]();
  const tabs = document.getElementById('tabs');
  const tabbed = TABS.some(([v]) => v === view);
  tabs.hidden = !tabbed;
  tabs.innerHTML = tabbed ? TABS.map(([v, ico, label]) =>
    `<button class="${view === v ? 'on' : ''}" data-action="${v}"><span>${ico}</span>${label}</button>`).join('') : '';
}

function go(v) {
  clearTimeout(advanceTimer);
  view = v;
  render();
  window.scrollTo(0, 0);
}

// ---------- akcje ----------

function startCards(cards) {
  if (!cards.length) return;
  session = { queue: shuffle(cards), idx: 0, flipped: false, known: [], unknown: [] };
  go('cards');
  autoSpeak(session.queue[0].q);
}

function rateCard(knew) {
  const c = session.queue[session.idx];
  (knew ? session.known : session.unknown).push(c);
  record(c, knew);
  session.idx++;
  session.flipped = false;
  render();
  const next = session.queue[session.idx];
  if (next) autoSpeak(next.q);
}

function startTest(cards, opts = {}) {
  if (!cards.length) return;
  const n = opts.all ? cards.length : state.settings.count || cards.length;
  const chosen = shuffle(cards).slice(0, Math.min(n, cards.length));
  session = {
    items: chosen.map(c => buildQuestion(c, opts)), base: chosen.length, idx: 0, score: 0, mistakes: [],
    feedback: null, cards, opts,
  };
  go('test');
  autoSpeak(session.items[0].prompt);
}

function answer(given) {
  const s = session;
  const q = s.items[s.idx];
  const ok = given === q.correct;
  record(q.c, ok);
  if (!q.retry) {
    if (ok) s.score++;
    else s.mistakes.push({ q, given });
  }
  // Błędne pytanie wraca 3 pytania później, aż padnie dobra odpowiedź (poza próbnym sprawdzianem).
  let requeued = false;
  if (!ok && !s.opts.exam) {
    s.items.splice(Math.min(s.idx + 4, s.items.length), 0, { ...buildQuestion(q.c, { noReverse: !q.rev }), retry: true });
    requeued = true;
  }
  const title = ok ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : 'Ups, nie tym razem';
  s.feedback = { ok, given, title, requeued };
  render();
  if (ok && !q.c.more && !q.rev) advanceTimer = setTimeout(nextQuestion, 1200);
}

function nextQuestion() {
  clearTimeout(advanceTimer);
  if (view !== 'test' || !session.feedback) return;
  session.idx++;
  session.feedback = null;
  render();
  window.scrollTo(0, 0);
  const q = session.items[session.idx];
  if (q) autoSpeak(q.prompt);
}

const actions = {
  home: () => go('home'),
  sheet: () => go('sheet'),
  settings: () => go('settings'),
  toggleSection(el) {
    const id = el.dataset.id;
    state.selected = state.selected.includes(id) ? state.selected.filter(x => x !== id) : [...state.selected, id];
    save();
    render();
  },
  toggleChapter(el) {
    const ids = SECTIONS.filter(s => s.id.startsWith(el.dataset.id + '.')).map(s => s.id);
    const allOn = ids.every(id => state.selected.includes(id));
    state.selected = allOn ? state.selected.filter(x => !ids.includes(x)) : [...new Set([...state.selected, ...ids])];
    save();
    render();
  },
  startCards: () => startCards(selectedCards()),
  startTest: () => startTest(selectedCards()),
  startHard: () => startTest(hardCards(), { all: true }),
  startExam: () => startTest(CARDS, { all: true, exam: true }),
  again: () => startTest(session.cards, session.opts),
  flip() {
    session.flipped = !session.flipped;
    document.getElementById('stage').classList.toggle('flipped', session.flipped);
    const c = session.queue[session.idx];
    document.querySelector('.card-tools').innerHTML = speakBtn(session.flipped ? c.a : c.q);
    if (session.flipped) autoSpeak(c.a);
  },
  cardYes: () => rateCard(true),
  cardNo: () => rateCard(false),
  repeatCards: () => startCards(session.unknown),
  startTestFromCards: () => startTest(session.queue, { all: true }),
  speak: el => speak(el.dataset.text),
  choose(el) {
    const q = session.items[session.idx];
    answer(q.options[Number(el.dataset.i)]);
  },
  next: () => nextQuestion(),
  repeatMistakes: () => startTest(session.mistakes.map(m => m.q.c), { all: true }),
  set(el) {
    state.settings[el.dataset.key] = Number(el.dataset.val);
    save();
    render();
  },
  resetStats() {
    if (!confirm('Wyzerować postępy (umiane pytania, trudne pytania i serię dni)?')) return;
    state.stats = {};
    state.activity = {};
    save();
    render();
  },
};

function init() {
  state = load();
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', e => {
    const key = e.target.dataset.setting;
    if (key) { state.settings[key] = e.target.checked; save(); }
  });
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  render();
}

init();
