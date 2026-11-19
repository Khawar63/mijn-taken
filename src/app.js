// Mijn Taken — eenvoudige Notion-achtige takenapp. Alle data blijft in de browser (localStorage).
'use strict';

const STORE_KEY = 'mijn-taken-v1';
const THEME_KEY = 'mijn-taken-theme';
const STATUSES = [
  { id: 'todo', name: 'Te doen' },
  { id: 'doing', name: 'Bezig' },
  { id: 'done', name: 'Klaar' },
];
const PRIOS = ['Urgent', 'Hoog', 'Normaal', 'Laag'];

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Data ----------
let state = load();
let view = localStorage.getItem('mijn-taken-view') || 'list';
let openId = null;
let currentList = localStorage.getItem('mijn-taken-list') || 'all';
let calMonth = (() => { const x = new Date(); return new Date(x.getFullYear(), x.getMonth(), 1); })();
migrate();
if (currentList !== 'all' && !state.lists.some((l) => l.id === currentList)) currentList = 'all';

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && Array.isArray(d.tasks)) return d;
  } catch (_) {}
  const lists = [{ id: 'inbox', name: 'Inbox', icon: '📥' }, { id: 'werk', name: 'Werk', icon: '💼' }, { id: 'prive', name: 'Privé', icon: '🏠' }];
  return { lists, tasks: demoTasks() };
}
// Oudere data (zonder lijsten) omzetten: alles komt in "Inbox".
function migrate() {
  if (!Array.isArray(state.lists) || !state.lists.length) state.lists = [{ id: 'inbox', name: 'Inbox', icon: '📥' }];
  for (const t of state.tasks) if (!t.listId || !state.lists.some((l) => l.id === t.listId)) t.listId = state.lists[0].id;
  save();
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  if (window.onLocalSave) window.onLocalSave(); // synchronisatie (sync.js)
}
// Onthoud verwijderde taken/lijsten, zodat ze bij synchroniseren niet terugkomen.
function tombstone(id) { (state.deleted ||= {})[id] = Date.now(); }

function demoTasks() {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const now = Date.now();
  return [
    { id: uid(), title: 'Welkom! Klik op een taak om details te openen', status: 'todo', prio: 'Normaal', due: '', labels: ['uitleg'], notes: 'Hier kun je notities kwijt.\n\nTip: sleep kaarten tussen kolommen in de Bord-weergave.', subtasks: [{ id: uid(), text: 'Probeer een subtaak af te vinken', done: false }, { id: uid(), text: 'Voeg een label toe', done: true }], demo: true, created: now },
    { id: uid(), title: 'Voorbeeld: boodschappen doen', status: 'doing', prio: 'Hoog', due: d(0), labels: ['privé'], listId: 'prive', notes: '', subtasks: [], demo: true, created: now - 1000 },
    { id: uid(), title: 'Voorbeeld: verslag afronden', status: 'todo', prio: 'Urgent', due: d(-1), labels: ['werk'], listId: 'werk', notes: '', subtasks: [], demo: true, created: now - 2000 },
    { id: uid(), title: 'Voorbeeld: app uitproberen', status: 'done', prio: 'Laag', due: '', labels: [], notes: '', subtasks: [], demo: true, created: now - 3000 },
  ];
}

const getTask = (id) => state.tasks.find((t) => t.id === id);
function updateTask(id, patch) {
  const t = getTask(id);
  if (!t) return;
  Object.assign(t, patch, { updated: Date.now() });
  if (patch.status) t.completedAt = patch.status === 'done' ? Date.now() : null;
  save(); render();
}
function addTask(title, extra = {}) {
  const listId = currentList === 'all' ? state.lists[0].id : currentList;
  const t = { id: uid(), title, listId, status: 'todo', prio: 'Normaal', due: '', labels: [], notes: '', subtasks: [], created: Date.now(), ...extra };
  state.tasks.push(t); save(); render();
  return t;
}
function allLabels() { return [...new Set(state.tasks.flatMap((t) => t.labels))].sort((a, b) => a.localeCompare(b)); }

// ---------- Helpers ----------
function hue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function labelBadge(l, removable) {
  const b = el('span', { class: 'badge label', style: `--h:${hue(l)}` }, l);
  if (removable) b.append(el('button', { title: 'Verwijderen', onclick: () => {
    const t = getTask(openId); updateTask(openId, { labels: t.labels.filter((x) => x !== l) }); fillPanel();
  } }, '×'));
  return b;
}
function todayStr() { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function dueBadge(t) {
  if (!t.due) return null;
  const today = todayStr();
  let cls = 'badge due';
  if (t.status !== 'done') { if (t.due < today) cls += ' overdue'; else if (t.due === today) cls += ' today'; }
  const [y, m, dd] = t.due.split('-');
  const txt = t.due === today ? 'Vandaag' : new Date(+y, m - 1, +dd).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  return el('span', { class: cls, title: 'Deadline' }, '📅 ' + txt);
}
function metaBadges(t) {
  const subs = t.subtasks.length ? el('span', { class: 'badge', title: 'Subtaken' }, `☑ ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}`) : null;
  const notes = t.notes.trim() ? el('span', { class: 'badge', title: 'Heeft notities' }, '📝') : null;
  return [...t.labels.map((l) => labelBadge(l)), subs, notes, dueBadge(t), el('span', { class: `badge prio prio-${t.prio}` }, t.prio)];
}
const statusDot = (id) => el('span', { class: `dot dot-${id}` });

// ---------- Filteren & sorteren ----------
function filtered() {
  const q = $('#search').value.trim().toLowerCase();
  const fs = $('#fStatus').value, fp = $('#fPrio').value, fl = $('#fLabel').value;
  const hide = $('#hideDone').checked;
  let list = state.tasks.filter((t) => {
    if (currentList !== 'all' && t.listId !== currentList) return false;
    if (fs && t.status !== fs) return false;
    if (fp && t.prio !== fp) return false;
    if (fl && !t.labels.includes(fl)) return false;
    if (hide && t.status === 'done') return false;
    if (q) {
      const hay = [t.title, t.notes, ...t.labels, ...t.subtasks.map((s) => s.text)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const by = $('#sortBy').value;
  const cmp = {
    created: (a, b) => b.created - a.created,
    due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'),
    prio: (a, b) => PRIOS.indexOf(a.prio) - PRIOS.indexOf(b.prio),
    title: (a, b) => a.title.localeCompare(b.title),
  }[by];
  return list.sort(cmp);
}

// ---------- Weergaven ----------
function render() {
  document.querySelectorAll('.view-switch button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  refreshLabelFilter();
  renderSidebar();
  const cur = state.lists.find((l) => l.id === currentList);
  $('#listHeading').textContent = cur ? `${cur.icon} ${cur.name}` : '🗂 Alle taken';
  document.title = (cur ? cur.name : 'Alle taken') + ' – Mijn Taken';
  const main = $('#main');
  main.innerHTML = '';
  const list = filtered();
  if (!state.tasks.length) { main.append(el('p', { class: 'empty' }, 'Nog geen taken. Typ hierboven je eerste taak! ✨')); return; }
  if (view === 'board') renderBoard(main, list);
  else if (view === 'calendar') renderCalendar(main, list);
  else renderList(main, list);
}

function renderList(main, list) {
  if (!list.length) { main.append(el('p', { class: 'empty' }, 'Geen taken gevonden met deze filters.')); return; }
  for (const st of STATUSES) {
    const items = list.filter((t) => t.status === st.id);
    if (!items.length) continue;
    main.append(el('section', { class: 'group' },
      el('h2', {}, statusDot(st.id), st.name, el('span', { class: 'muted' }, String(items.length))),
      items.map((t) => el('div', { class: 'row' + (t.status === 'done' ? ' done' : ''), onclick: () => openPanel(t.id) },
        el('input', { type: 'checkbox', class: 'check', title: 'Afvinken', ...(t.status === 'done' ? { checked: '' } : {}),
          onclick: (e) => { e.stopPropagation(); updateTask(t.id, { status: e.target.checked ? 'done' : 'todo' }); } }),
        el('span', { class: 'title' }, t.title),
        el('span', { class: 'meta' }, metaBadges(t)),
      ))));
  }
}

function renderBoard(main, list) {
  const board = el('div', { class: 'board' });
  for (const st of STATUSES) {
    const items = list.filter((t) => t.status === st.id);
    const col = el('div', { class: 'col', 'data-status': st.id },
      el('h2', {}, statusDot(st.id), st.name, el('span', { class: 'muted' }, String(items.length))),
      items.map((t) => el('div', { class: 'card', draggable: 'true', 'data-id': t.id, onclick: () => openPanel(t.id),
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', t.id); e.currentTarget.classList.add('dragging'); },
        ondragend: (e) => e.currentTarget.classList.remove('dragging') },
        el('div', { class: 'title' }, t.title),
        el('div', { class: 'meta' }, metaBadges(t)))),
      el('button', { class: 'add-in-col', onclick: () => { const title = prompt('Nieuwe taak in "' + st.name + '":'); if (title && title.trim()) addTask(title.trim(), { status: st.id }); } }, '+ Nieuw'));
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (e) => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      if (id && getTask(id).status !== st.id) updateTask(id, { status: st.id });
    });
    board.append(col);
  }
  main.append(board);
}

// ---------- Kalender ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function chip(t) {
  return el('div', { class: `chip p-${t.prio}` + (t.status === 'done' ? ' done' : ''), draggable: 'true', title: t.title,
    onclick: (e) => { e.stopPropagation(); openPanel(t.id); },
    ondragstart: (e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', t.id); } }, t.title);
}
function renderCalendar(main, list) {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const shift = (n) => { calMonth = new Date(y, m + n, 1); render(); };
  main.append(el('div', { class: 'cal-head' },
    el('h2', {}, calMonth.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })),
    el('button', { title: 'Vorige maand', onclick: () => shift(-1) }, '‹'),
    el('button', { onclick: () => { const x = new Date(); calMonth = new Date(x.getFullYear(), x.getMonth(), 1); render(); } }, 'Vandaag'),
    el('button', { title: 'Volgende maand', onclick: () => shift(1) }, '›')));
  const byDay = {};
  for (const t of list) if (t.due) (byDay[t.due] ||= []).push(t);
  const grid = el('div', { class: 'cal' }, ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d) => el('div', { class: 'dow' }, d)));
  const start = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7)); // maandag
  const today = todayStr();
  const weeks = Math.ceil(((new Date(y, m, 1).getDay() + 6) % 7 + new Date(y, m + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymd(d);
    const items = byDay[key] || [];
    const cell = el('div', { class: 'day' + (d.getMonth() !== m ? ' other' : '') + (key === today ? ' today' : ''),
      title: 'Klik om een taak op deze dag toe te voegen',
      onclick: () => { const title = prompt('Nieuwe taak op ' + d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) + ':'); if (title && title.trim()) addTask(title.trim(), { due: key }); } },
      el('span', { class: 'num' }, String(d.getDate())), items.map(chip));
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('over'));
    cell.addEventListener('drop', (e) => { e.preventDefault(); cell.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id && getTask(id)) updateTask(id, { due: key }); });
    grid.append(cell);
  }
  main.append(grid);
  const noDue = list.filter((t) => !t.due && t.status !== 'done');
  if (noDue.length) main.append(el('div', { class: 'no-due' }, el('h3', {}, `Zonder deadline (${noDue.length}) – sleep naar een dag`), noDue.map(chip)));
}

// ---------- Lijsten (zijbalk) ----------
function setList(id) {
  currentList = id; localStorage.setItem('mijn-taken-list', id);
  $('#sidebar').classList.remove('open'); $('#sideBackdrop').hidden = true;
  render();
}
function renderSidebar() {
  const nav = $('#listNav'); nav.innerHTML = '';
  const open = (t) => t.status !== 'done';
  const item = (id, icon, name, count, acts) => {
    const li = el('li', { class: currentList === id ? 'active' : '', onclick: () => setList(id) },
      el('span', {}, icon), el('span', { class: 'name' }, name), acts, el('span', { class: 'count' }, String(count)));
    if (id !== 'all') { // taken naar een lijst slepen
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drop-over'); });
      li.addEventListener('dragleave', () => li.classList.remove('drop-over'));
      li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('drop-over'); const tid = e.dataTransfer.getData('text/plain'); if (tid && getTask(tid)) updateTask(tid, { listId: id }); });
    }
    return li;
  };
  nav.append(item('all', '🗂', 'Alle taken', state.tasks.filter(open).length));
  nav.append(el('li', { class: 'sep' }));
  for (const l of state.lists) {
    const acts = el('span', { class: 'acts' },
      el('button', { title: 'Naam wijzigen', onclick: (e) => { e.stopPropagation(); renameList(l); } }, '✎'),
      state.lists.length > 1 ? el('button', { title: 'Lijst verwijderen', onclick: (e) => { e.stopPropagation(); deleteList(l); } }, '🗑') : null);
    nav.append(item(l.id, l.icon, l.name, state.tasks.filter((t) => t.listId === l.id && open(t)).length, acts));
  }
  const sel = $('#pList'); const cur = sel.value; sel.innerHTML = '';
  for (const l of state.lists) sel.append(el('option', { value: l.id }, `${l.icon} ${l.name}`));
  sel.value = cur;
}
function splitIcon(input, fallback) {
  const m = input.trim().match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u);
  return m ? { icon: m[1], name: m[2] || 'Nieuwe lijst' } : { icon: fallback, name: input.trim() };
}
function addList() {
  const v = prompt('Naam van de nieuwe lijst (je mag beginnen met een emoji, bijv. "🎓 Studie"):');
  if (!v || !v.trim()) return;
  const l = { id: uid(), ...splitIcon(v, '📄') };
  state.lists.push(l); save(); setList(l.id);
}
function renameList(l) {
  const v = prompt('Nieuwe naam:', `${l.icon} ${l.name}`);
  if (!v || !v.trim()) return;
  Object.assign(l, splitIcon(v, l.icon), { updated: Date.now() }); save(); render();
}
function deleteList(l) {
  const n = state.tasks.filter((t) => t.listId === l.id).length;
  const target = state.lists.find((x) => x.id !== l.id);
  if (!confirm(`Lijst "${l.name}" verwijderen?` + (n ? ` De ${n} taken gaan naar "${target.name}".` : ''))) return;
  state.tasks.forEach((t) => { if (t.listId === l.id) t.listId = target.id; });
  state.tasks.forEach((t) => { if (t.listId === target.id) t.updated = Date.now(); });
  tombstone(l.id);
  state.lists = state.lists.filter((x) => x.id !== l.id);
  if (currentList === l.id) currentList = 'all';
  save(); render();
}

function refreshLabelFilter() {
  const sel = $('#fLabel'), cur = sel.value;
  sel.innerHTML = '<option value="">Alle labels</option>';
  for (const l of allLabels()) sel.append(el('option', { value: l }, l));
  sel.value = allLabels().includes(cur) ? cur : '';
  const dl = $('#labelList'); dl.innerHTML = '';
  for (const l of allLabels()) dl.append(el('option', { value: l }));
}

// ---------- Detailpaneel ----------
function openPanel(id) {
  openId = id;
  $('#panel').hidden = false; $('#backdrop').hidden = false;
  fillPanel();
  if (getTask(id).title === '') $('#pTitle').focus();
}
function closePanel() { openId = null; $('#panel').hidden = true; $('#backdrop').hidden = true; }

function fillPanel() {
  const t = getTask(openId);
  if (!t) return closePanel();
  $('#pTitle').value = t.title;
  $('#pStatus').value = t.status;
  $('#pList').value = t.listId;
  $('#pPrio').value = t.prio;
  $('#pDue').value = t.due;
  $('#pNotes').value = t.notes;
  const lab = $('#pLabels'); lab.innerHTML = '';
  t.labels.forEach((l) => lab.append(labelBadge(l, true)));
  renderSubs(t);
  const fmt = (ms) => new Date(ms).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
  $('#pMeta').textContent = `Aangemaakt ${fmt(t.created)}` + (t.updated ? ` · Bewerkt ${fmt(t.updated)}` : '');
}

function renderSubs(t) {
  const ul = $('#pSubs'); ul.innerHTML = '';
  const done = t.subtasks.filter((s) => s.done).length;
  $('#subCount').textContent = t.subtasks.length ? `${done}/${t.subtasks.length}` : '';
  $('#subBar').style.width = t.subtasks.length ? (100 * done / t.subtasks.length) + '%' : '0';
  for (const s of t.subtasks) {
    ul.append(el('li', { class: s.done ? 'done' : '' },
      el('input', { type: 'checkbox', class: 'check', ...(s.done ? { checked: '' } : {}), onchange: (e) => { s.done = e.target.checked; updateTask(t.id, {}); renderSubs(t); } }),
      el('input', { type: 'text', value: s.text, onchange: (e) => { s.text = e.target.value; updateTask(t.id, {}); } }),
      el('button', { title: 'Subtaak verwijderen', onclick: () => { t.subtasks = t.subtasks.filter((x) => x !== s); updateTask(t.id, {}); renderSubs(t); } }, '✕')));
  }
}

// ---------- Agenda-export (.ics) ----------
// Alle open taken met een deadline als hele-dag-afspraken. Vaste UID per taak,
// zodat opnieuw importeren in Google Agenda bestaande afspraken bijwerkt.
function icsEscape(v) { return String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsFold(line) { // regels max. 75 bytes (iCalendar-regel)
  const enc = new TextEncoder(); let out = '', cur = '', n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > 73) { out += cur + '\r\n '; cur = ''; n = 1; }
    cur += ch; n += b;
  }
  return out + cur;
}
function exportIcs() {
  const tasks = state.tasks.filter((t) => t.due && t.status !== 'done');
  if (!tasks.length) { alert('Er zijn geen open taken met een deadline om naar je agenda te sturen.'); return; }
  const d8 = (s) => s.replace(/-/g, '');
  const next = (s) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + 1)); };
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const listName = (id) => { const l = state.lists.find((x) => x.id === id); return l ? l.name : ''; };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mijn Taken//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mijn Taken'];
  for (const t of tasks) {
    const info = [`Prioriteit: ${t.prio}`, `Lijst: ${listName(t.listId)}`];
    if (t.labels.length) info.push('Labels: ' + t.labels.join(', '));
    if (t.subtasks.length) info.push('Subtaken:\n' + t.subtasks.map((s) => (s.done ? '☑ ' : '☐ ') + s.text).join('\n'));
    if (t.notes.trim()) info.push('\n' + t.notes.trim());
    info.push('\n' + location.origin + location.pathname);
    lines.push('BEGIN:VEVENT', `UID:${t.id}@mijn-taken`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${d8(t.due)}`, `DTEND;VALUE=DATE:${d8(next(t.due))}`,
      'SUMMARY:' + icsEscape((t.prio === 'Urgent' ? '❗ ' : '') + t.title),
      'DESCRIPTION:' + icsEscape(info.join('\n')), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.map(icsFold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'mijn-taken.ics' });
  document.body.append(a); a.click(); a.remove();
}

// ---------- Thema ----------
function applyTheme(th) {
  document.documentElement.dataset.theme = th;
  $('#themeBtn').textContent = th === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, th);
}

// ---------- Events ----------
function init() {
  for (const s of STATUSES) { $('#fStatus').append(el('option', { value: s.id }, s.name)); $('#pStatus').append(el('option', { value: s.id }, s.name)); }
  for (const p of PRIOS) { $('#fPrio').append(el('option', { value: p }, p)); $('#pPrio').append(el('option', { value: p }, p)); }

  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

  document.querySelectorAll('.view-switch button').forEach((b) => b.onclick = () => { view = b.dataset.view; localStorage.setItem('mijn-taken-view', view); render(); });

  $('#quickAdd').onsubmit = (e) => { e.preventDefault(); const v = $('#quickTitle').value.trim(); if (v) { addTask(v); $('#quickTitle').value = ''; } };
  ['#search', '#fStatus', '#fPrio', '#fLabel', '#sortBy', '#hideDone'].forEach((s) => $(s).addEventListener('input', render));

  $('#addList').onclick = addList;
  $('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#sideBackdrop').hidden = false; };
  $('#sideBackdrop').onclick = () => { $('#sidebar').classList.remove('open'); $('#sideBackdrop').hidden = true; };
  $('#closePanel').onclick = closePanel;
  $('#backdrop').onclick = closePanel;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) closePanel(); });
  $('#deleteTask').onclick = () => { if (confirm('Deze taak verwijderen?')) { tombstone(openId); state.tasks = state.tasks.filter((t) => t.id !== openId); save(); closePanel(); render(); } };

  $('#pTitle').addEventListener('input', (e) => updateTask(openId, { title: e.target.value }));
  $('#pList').addEventListener('change', (e) => updateTask(openId, { listId: e.target.value }));
  $('#pStatus').addEventListener('change', (e) => updateTask(openId, { status: e.target.value }));
  $('#pPrio').addEventListener('change', (e) => updateTask(openId, { prio: e.target.value }));
  $('#pDue').addEventListener('change', (e) => updateTask(openId, { due: e.target.value }));
  let notesTimer;
  $('#pNotes').addEventListener('input', (e) => { clearTimeout(notesTimer); const id = openId, v = e.target.value; notesTimer = setTimeout(() => updateTask(id, { notes: v }), 300); });
  $('#pLabelInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.target.value.trim(); const t = getTask(openId);
    if (v && !t.labels.includes(v)) { updateTask(openId, { labels: [...t.labels, v] }); fillPanel(); }
    e.target.value = '';
  });
  $('#subAdd').onsubmit = (e) => {
    e.preventDefault(); const v = $('#subInput').value.trim(); if (!v) return;
    const t = getTask(openId); t.subtasks.push({ id: uid(), text: v, done: false }); updateTask(openId, {}); renderSubs(t); $('#subInput').value = '';
  };

  $('#icsBtn').onclick = exportIcs;
  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `taken-backup-${todayStr()}.json` });
    document.body.append(a); a.click(); a.remove();
  };
  $('#importInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.tasks)) throw new Error('geen takenlijst');
      if (confirm(`${d.tasks.length} taken importeren? Dit vervangt je huidige taken.`)) { state = d; migrate(); currentList = 'all'; render(); }
    } catch (err) { alert('Kon bestand niet lezen: ' + err.message); }
    e.target.value = '';
  };

  render();
}
init();
