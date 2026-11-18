// Synchronisatie tussen apparaten via Supabase (gratis). Werkt zonder extra bibliotheken.
// Vul hieronder je eigen Project URL en anon/publishable key in. Leeg = synchronisatie uit.
'use strict';

const SUPABASE_URL = '';
const SUPABASE_KEY = '';

(() => {
  const btn = document.getElementById('syncBtn');
  if (!SUPABASE_URL || !SUPABASE_KEY) { btn.hidden = true; return; }

  const AUTH_KEY = 'mijn-taken-auth';
  let session = null;   // { access_token, refresh_token, expires_at, email, user_id }
  let busy = false, again = false, timer = null, lastSync = null, lastError = '';

  // ---------- Inloggen ----------
  const api = (path, opts = {}) => fetch(SUPABASE_URL.replace(/\/$/, '') + path, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  function jwtPayload(tok) {
    try { return JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (_) { return {}; }
  }
  function setSession(tokens) {
    const p = jwtPayload(tokens.access_token);
    session = {
      access_token: tokens.access_token, refresh_token: tokens.refresh_token,
      expires_at: p.exp ? p.exp * 1000 : Date.now() + 3600e3, email: p.email || '', user_id: p.sub,
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  }
  function logout() {
    session = null; localStorage.removeItem(AUTH_KEY); updateButton();
  }
  async function token() {
    if (!session) return null;
    if (Date.now() < session.expires_at - 60e3) return session.access_token;
    const r = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!r.ok) { logout(); throw new Error('Je bent uitgelogd. Log opnieuw in.'); }
    setSession(await r.json());
    return session.access_token;
  }
  async function sendLink(email) {
    const redirect = location.origin + location.pathname;
    const r = await api('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), {
      method: 'POST', body: JSON.stringify({ email, create_user: true }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).msg || 'Versturen mislukt (' + r.status + ')');
  }
  // Na klikken op de inloglink staan de tokens in het adres (#access_token=...).
  function readLinkFromUrl() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('error_description')) alert('Inloggen mislukt: ' + h.get('error_description'));
    if (h.get('access_token')) setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') });
    if (h.get('access_token') || h.get('error')) history.replaceState(null, '', location.pathname + location.search);
  }

  // ---------- Samenvoegen ----------
  const stamp = (x) => x.updated || x.created || 0;
  function merge(a, b) {
    const deleted = { ...(a.deleted || {}), ...(b.deleted || {}) };
    const pick = (xs, ys) => {
      const m = new Map();
      for (const x of [...xs, ...ys]) {
        if (deleted[x.id]) continue;
        const cur = m.get(x.id);
        if (!cur || stamp(x) > stamp(cur)) m.set(x.id, x);
      }
      return [...m.values()];
    };
    const lists = pick(a.lists || [], b.lists || []);
    const tasks = pick(a.tasks || [], b.tasks || []);
    if (!lists.length) lists.push({ id: 'inbox', name: 'Inbox', icon: '📥' });
    for (const t of tasks) if (!lists.some((l) => l.id === t.listId)) t.listId = lists[0].id;
    return { lists, tasks, deleted };
  }
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const byId = (xs) => [...(xs || [])].sort((p, q) => (p.id < q.id ? -1 : 1));
  const canon = (d) => JSON.stringify([byId(d.lists), byId(d.tasks), Object.keys(d.deleted || {}).sort()]);

  // ---------- Synchroniseren ----------
  async function sync() {
    if (!session) return;
    if (busy) { again = true; return; }
    busy = true; setStatus('⏳');
    try {
      const tok = await token();
      const auth = { Authorization: 'Bearer ' + tok };
      const r = await api('/rest/v1/takendata?select=data', { headers: auth });
      if (!r.ok) throw new Error('Ophalen mislukt (' + r.status + ')');
      const rows = await r.json();
      const remote = rows[0] ? rows[0].data : null;
      // Onaangeraakte voorbeeldtaken van dit apparaat niet meenemen naar een bestaand account.
      const local = remote ? { ...state, tasks: state.tasks.filter((t) => !(t.demo && !t.updated)) } : state;
      const merged = merge(local, remote || { tasks: [], lists: [] });
      if (!same(merged.tasks, state.tasks) || !same(merged.lists, state.lists) || !same(merged.deleted, state.deleted)) {
        Object.assign(state, merged);
        localStorage.setItem(STORE_KEY, JSON.stringify(state)); // niet via save(), anders lus
        if (typeof currentList !== 'undefined' && currentList !== 'all' && !state.lists.some((l) => l.id === currentList)) currentList = 'all';
        render();
        if (openId) fillPanel();
      }
      if (!remote || canon(merged) !== canon(remote)) {
        const w = await api('/rest/v1/takendata?on_conflict=user_id', {
          method: 'POST', headers: { ...auth, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ user_id: session.user_id, data: merged, updated_at: new Date().toISOString() }),
        });
        if (!w.ok) throw new Error('Opslaan mislukt (' + w.status + ')');
      }
      lastSync = new Date(); lastError = '';
    } catch (e) {
      lastError = navigator.onLine ? e.message : 'Geen internet. Wijzigingen worden later gesynchroniseerd.';
    } finally {
      busy = false; updateButton();
      if (again) { again = false; sync(); }
    }
  }
  window.onLocalSave = () => { if (!session) return; clearTimeout(timer); timer = setTimeout(sync, 1500); setStatus('…'); };

  // ---------- Knop & venster ----------
  function setStatus(s) { btn.textContent = '☁ ' + s; }
  function updateButton() {
    if (!session) { btn.textContent = '☁ Inloggen'; btn.title = 'Inloggen om je taken op al je apparaten te zien'; return; }
    if (lastError) { btn.textContent = '☁ ⚠️'; btn.title = lastError; return; }
    btn.textContent = '☁ ✓';
    btn.title = `Ingelogd als ${session.email}` + (lastSync ? ` · gesynchroniseerd om ${lastSync.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : '');
  }
  btn.onclick = async () => {
    if (session) {
      const msg = `Ingelogd als ${session.email}.\n` + (lastError ? `Probleem: ${lastError}\n` : lastSync ? `Laatst gesynchroniseerd: ${lastSync.toLocaleTimeString('nl-NL')}\n` : '') + '\nOK = nu synchroniseren, Annuleren = niets doen.\n(Typ "uitloggen" in het volgende venster om uit te loggen.)';
      if (confirm(msg)) sync();
      else if ((prompt('Typ "uitloggen" om uit te loggen:') || '').trim().toLowerCase() === 'uitloggen') logout();
      return;
    }
    const email = (prompt('Vul je e-mailadres in. Je krijgt een inloglink (geen wachtwoord nodig):') || '').trim();
    if (!email) return;
    try { await sendLink(email); alert('Kijk in je mail (ook bij spam) en klik op de inloglink. Open de link op elk apparaat waarop je je taken wilt zien.'); }
    catch (e) { alert('Dat lukte niet: ' + e.message); }
  };

  // ---------- Start ----------
  try { session = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (_) {}
  readLinkFromUrl();
  updateButton();
  sync();
  setInterval(sync, 60e3);
  window.addEventListener('focus', sync);
  window.addEventListener('online', sync);
  window.addEventListener('hashchange', () => { readLinkFromUrl(); updateButton(); sync(); });
})();
