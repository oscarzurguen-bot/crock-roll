/* =====================================================================
   Crock&Roll HQ · Nube (Firebase) y sesiones
   - Sin configuración en firebase-config.js: modo local, todo en este dispositivo.
   - Con configuración: los datos se sincronizan en Firestore y cada persona
     entra como Administrador (contraseña) o como Músico (su nombre + PIN de 4 cifras).
   Se carga DESPUÉS del script principal, así que puede usar DB, save, toast, etc.
   ===================================================================== */
window.APP_VERSION = 'v37'; // se sube a la vez que VERSION en sw.js en cada cambio
window.Nube = (() => {
  const cfg = window.FIREBASE_CONFIG || {};
  const configurada = !!(cfg.apiKey && cfg.projectId);
  const SKEY = 'crock-sesion';
  let sesion = null;
  try { sesion = JSON.parse(localStorage.getItem(SKEY)); } catch (e) {}
  let fs = null, listo = false, seguridad = null, estado = configurada ? 'conectando' : 'local';

  // cada colección de Firestore y dónde vive en DB
  const COLS = {
    bolos:      { get: () => DB.bolos,                set: v => { DB.bolos = v; } },
    bote:       { get: () => DB.bote,                 set: v => { DB.bote = v; } },
    inventario: { get: () => DB.inventario,           set: v => { DB.inventario = v; }, orden: 'nombre' },
    miembros:   { get: () => DB.miembros,             set: v => { DB.miembros = v; }, orden: 'nombre' },
    canciones:  { get: () => DB.repertorio.canciones, set: v => { DB.repertorio.canciones = v; } },
    carpetas:   { get: () => DB.repertorio.carpetas,  set: v => { DB.repertorio.carpetas = v; }, orden: 'nombre' }
  };
  const ultimo = {}, cargado = {};
  Object.keys(COLS).forEach(k => { ultimo[k] = new Map(); cargado[k] = false; });
  let ultimoAjustes = null, ajustesCargado = false;
  const limpio = o => JSON.parse(JSON.stringify(o));
  const ajustesApp = () => ({ redes: DB.redes || {}, geo: DB.geo || {} });
  const todoCargado = () => ajustesCargado && Object.values(cargado).every(Boolean);

  /* ---------- quién es quién ---------- */
  const esAdmin = () => !configurada || !!(sesion && sesion.rol === 'admin');
  const miembroId = () => configurada && sesion && sesion.rol === 'musico' ? sesion.miembroId : null;
  const puedeEscribir = () => configurada && listo && !!sesion;

  /* ---------- subir cambios (solo lo que ha cambiado desde la última vez) ---------- */
  function push() {
    if (!puedeEscribir()) return Promise.resolve();
    const ops = [];
    for (const [k, c] of Object.entries(COLS)) {
      if (!cargado[k]) continue; // nunca borrar en la nube algo que aún no hemos descargado
      const vistos = new Set();
      (c.get() || []).forEach(it => {
        if (!it || !it.id) return;
        const id = String(it.id), j = JSON.stringify(it);
        vistos.add(id);
        if (ultimo[k].get(id) !== j) { ops.push(['set', fs.collection(k).doc(id), limpio(it)]); ultimo[k].set(id, j); }
      });
      [...ultimo[k].keys()].forEach(id => { if (!vistos.has(id)) { ops.push(['del', fs.collection(k).doc(id)]); ultimo[k].delete(id); } });
    }
    if (ajustesCargado) {
      const j = JSON.stringify(ajustesApp());
      if (j !== ultimoAjustes) { ops.push(['set', fs.doc('ajustes/app'), limpio(ajustesApp())]); ultimoAjustes = j; }
    }
    if (!ops.length) return Promise.resolve();
    marcar('subiendo');
    const lotes = [];
    for (let i = 0; i < ops.length; i += 400) {
      const b = fs.batch();
      ops.slice(i, i + 400).forEach(([t, ref, data]) => t === 'set' ? b.set(ref, data) : b.delete(ref));
      lotes.push(b.commit());
    }
    return Promise.all(lotes).then(() => marcar('ok')).catch(e => {
      console.warn('Nube:', e); marcar('error'); toast('⚠️ No se pudo guardar en la nube');
    });
  }
  // cambiar un solo campo (p. ej. la respuesta de un músico) sin reescribir el bolo entero
  function campo(col, id, ruta, valor) {
    if (!puedeEscribir()) return;
    const v = valor === null || valor === undefined ? firebase.firestore.FieldValue.delete() : valor;
    fs.collection(col).doc(String(id)).update({ [ruta]: v }).catch(e => { console.warn(e); toast('⚠️ No se pudo guardar tu respuesta'); });
    const it = (COLS[col].get() || []).find(x => String(x.id) === String(id));
    if (it) ultimo[col].set(String(id), JSON.stringify(it));
  }
  // importar una copia: sustituye todo en la nube
  function reemplazarTodo(d) {
    if (!puedeEscribir() || !todoCargado()) return Promise.reject(new Error('sin conexión'));
    d.repertorio = d.repertorio || { carpetas: [], canciones: [] };
    ['bolos', 'bote', 'inventario', 'miembros', 'movimientos'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    DB = d;
    return push();
  }

  /* ---------- bajar cambios en directo ---------- */
  function escuchar() {
    Object.entries(COLS).forEach(([k, c]) => fs.collection(k).onSnapshot(snap => {
      let arr = snap.docs.map(d => d.data());
      if (c.orden) arr.sort((a, b) => String(a[c.orden] || '').localeCompare(String(b[c.orden] || ''), 'es'));
      c.set(arr);
      ultimo[k] = new Map(arr.map(x => [String(x.id), JSON.stringify(x)]));
      cargado[k] = true;
      if (k === 'miembros') { comprobarSesion(); pintarLogin(); }
      refrescar();
    }, fallo));
    fs.doc('ajustes/app').onSnapshot(d => {
      const v = d.data() || {};
      if (v.redes) DB.redes = v.redes;
      DB.geo = Object.assign({}, DB.geo || {}, v.geo || {});
      ultimoAjustes = d.exists ? JSON.stringify(ajustesApp()) : null;
      ajustesCargado = true; refrescar();
    }, fallo);
    fs.doc('ajustes/seguridad').onSnapshot(d => { seguridad = d.data() || {}; pintarLogin(); }, fallo);
  }
  let refrescoPendiente = false;
  function refrescar() {
    if (refrescoPendiente) return;
    refrescoPendiente = true;
    requestAnimationFrame(() => {
      refrescoPendiente = false;
      if (todoCargado()) marcar(estado === 'error' ? 'error' : 'ok');
      try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {}
      try {
        refreshHud();
        if (cur.sec && !$('#modal').classList.contains('show')) rerender();
        else if ($('#d-x') && window.__det) verBolo({ id: window.__det });
      } catch (e) { console.warn(e); }
    });
  }
  function fallo(e) {
    console.warn('Nube:', e); marcar('error');
    if (e && e.code === 'permission-denied') toast('⚠️ La nube no deja leer: revisa las reglas de Firestore');
  }

  /* ---------- estado en el logo ---------- */
  function marcar(e) { estado = e; pintarMarca(); }
  function pintarMarca() {
    const el = document.getElementById('brand-sub'); if (!el) return;
    if (!configurada) { el.textContent = 'Charanga · local'; return; }
    const quien = !sesion ? 'Sin sesión' : sesion.rol === 'admin' ? 'Administrador' : (sesion.nombre || 'Músico');
    const icono = { conectando: '…', subiendo: '↑', ok: '☁️', error: '⚠️' }[estado] || '';
    el.textContent = `${quien} ${icono}`;
  }

  /* ---------- sesiones ---------- */
  const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
  function guardarSesion(s) {
    sesion = s;
    try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch (e) {}
    pintarMarca(); mostrarLogin(!s);
    try { refreshHud(); if (cur.sec) rerender(); } catch (e) {}
  }
  function comprobarSesion() { // un músico borrado de La banda pierde la sesión
    if (sesion && sesion.rol === 'musico' && cargado.miembros) {
      const m = DB.miembros.find(x => x.id === sesion.miembroId);
      if (!m) { guardarSesion(null); toast('Tu usuario ya no está en La banda'); }
      else if (m.nombre !== sesion.nombre) guardarSesion({ ...sesion, nombre: m.nombre });
    }
  }
  function cerrarSesion() { guardarSesion(null); try { closeForm(); closeSection(); } catch (e) {} }

  /* ---------- pantalla de entrada ---------- */
  let pestaña = 'musico';
  function crearLogin() {
    const d = document.createElement('div');
    d.id = 'login'; d.hidden = true;
    d.innerHTML = `<form id="login-form" autocomplete="off">
      <div class="login-logo">${window.LOGO_SVG ? LOGO_SVG('login') : '🐸'}</div>
      <h1>Crock&amp;Roll HQ</h1>
      <p class="login-sub">La app de la charanga</p>
      <div class="tabs login-tabs"><button type="button" data-lt="musico">Músico</button><button type="button" data-lt="admin">Administrador</button></div>
      <div id="login-musico">
        <label>¿Quién eres?<select id="login-quien"></select></label>
        <label>PIN (4 cifras)<input id="login-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></label>
        <p class="login-tip" id="login-tip-pin"></p>
      </div>
      <div id="login-admin">
        <label>Contraseña del administrador<input id="login-pass" type="password" autocomplete="current-password"></label>
        <p class="login-tip" id="login-tip-admin"></p>
      </div>
      <p class="login-err" id="login-err"></p>
      <button class="btn primary" id="login-ok" style="width:100%">Entrar</button>
      <p class="login-tip" id="login-estado">Conectando con la nube…</p>
    </form>`;
    document.body.appendChild(d);
    d.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { pestaña = b.dataset.lt; pintarLogin(); });
    d.querySelector('#login-quien').onchange = pintarLogin;
    d.querySelector('#login-form').onsubmit = entrar;
  }
  function mostrarLogin(si) { const l = document.getElementById('login'); if (l) l.hidden = !si; if (si) pintarLogin(); }
  function pintarLogin() {
    const l = document.getElementById('login'); if (!l || l.hidden) return;
    l.querySelectorAll('[data-lt]').forEach(b => b.classList.toggle('on', b.dataset.lt === pestaña));
    l.querySelector('#login-musico').hidden = pestaña !== 'musico';
    l.querySelector('#login-admin').hidden = pestaña !== 'admin';
    const sel = l.querySelector('#login-quien'), antes = sel.value;
    sel.innerHTML = '<option value="">— Elige tu nombre —</option>' + (DB.miembros || []).map(m => `<option value="${esc(m.id)}">${esc(m.nombre)}${m.instrumento ? ' · ' + esc(m.instrumento) : ''}</option>`).join('');
    sel.value = antes;
    const pins = (seguridad && seguridad.pins) || {};
    l.querySelector('#login-tip-pin').textContent = !sel.value ? '' : pins[sel.value]
      ? 'Pon tu PIN personal.' : 'Es tu primera vez: el PIN que pongas quedará como tu PIN personal.';
    l.querySelector('#login-tip-admin').textContent = seguridad && !seguridad.adminHash
      ? 'Aún no hay contraseña: la que pongas ahora será la del administrador.' : '';
    const ok = listo && seguridad && cargado.miembros;
    l.querySelector('#login-ok').disabled = !ok;
    l.querySelector('#login-estado').textContent = !ok ? (estado === 'error' ? '⚠️ No se puede conectar con la nube.' : 'Conectando con la nube…')
      : pestaña === 'musico' && !(DB.miembros || []).length ? 'Aún no hay músicos: el administrador tiene que crear La banda primero.' : '';
  }
  async function entrar(e) {
    e.preventDefault();
    const err = document.getElementById('login-err'); err.textContent = '';
    if (!listo || !seguridad) return;
    const ref = fs.doc('ajustes/seguridad');
    try {
      if (pestaña === 'admin') {
        const pass = document.getElementById('login-pass').value;
        if (pass.length < 4) return err.textContent = 'La contraseña debe tener al menos 4 caracteres.';
        const h = await sha('crocknroll|admin|' + pass);
        if (!seguridad.adminHash) await ref.set({ adminHash: h }, { merge: true });
        else if (seguridad.adminHash !== h) return err.textContent = 'Contraseña incorrecta.';
        guardarSesion({ rol: 'admin' });
      } else {
        const id = document.getElementById('login-quien').value, pin = document.getElementById('login-pin').value;
        if (!id) return err.textContent = 'Elige tu nombre.';
        if (!/^\d{4}$/.test(pin)) return err.textContent = 'El PIN son 4 cifras.';
        const h = await sha('crocknroll|' + id + '|' + pin), pins = seguridad.pins || {};
        if (!pins[id]) await ref.set({ pins: { [id]: h } }, { merge: true });
        else if (pins[id] !== h) return err.textContent = 'PIN incorrecto. Si no lo recuerdas, pide al administrador que lo resetee.';
        guardarSesion({ rol: 'musico', miembroId: id, nombre: (DB.miembros.find(m => m.id === id) || {}).nombre });
      }
      document.getElementById('login-pin').value = ''; document.getElementById('login-pass').value = '';
      toast('👋 ¡Hola!');
    } catch (ex) { console.warn(ex); err.textContent = 'No se pudo conectar. Inténtalo de nuevo.'; }
  }

  /* ---------- apartado en Ajustes ---------- */
  function ajustesHtml() {
    if (!configurada) return `<div class="conv-box"><div class="conv-head"><b>☁️ Nube</b><span class="pill">Modo local</span></div>
      <p class="conv-tip">Los datos solo se guardan en este dispositivo. Para compartir la app con la charanga, rellena <b>firebase-config.js</b> (mira el README).</p>
      <p class="conv-tip" style="text-align:center">Versión de la app: ${window.APP_VERSION}</p></div>`;
    const admin = esAdmin();
    const txt = { conectando: 'Conectando…', subiendo: 'Guardando…', ok: 'Sincronizado', error: 'Problema de conexión' }[estado] || '';
    return `<div class="conv-box"><div class="conv-head"><b>☁️ Sesión</b><span class="pill ${estado === 'ok' ? 'ok' : estado === 'error' ? 'bad' : 'warn'}">${txt}</span></div>
      <p class="conv-tip">Has entrado como <b style="color:var(--text)">${admin ? 'Administrador' : esc(sesion && sesion.nombre || 'Músico')}</b>.${admin ? '' : ' Puedes ver todo y apuntarte a los bolos; lo demás lo gestional administrador.'}</p>
      ${!admin && sesion && sesion.miembroId ? '<button type="button" class="btn" id="nb-foto">📷 Cambiar mi foto de perfil</button>' : ''}
      <button type="button" class="btn" id="nb-salir">Cerrar sesión</button>
      <p class="conv-tip" style="text-align:center">Versión de la app: ${window.APP_VERSION}</p></div>
    ${admin ? `<div class="conv-box"><div class="conv-head"><b>🔑 Accesos</b></div>
      <label>Nueva contraseña del administrador<input id="nb-pass" type="password" autocomplete="new-password"></label>
      <button type="button" class="btn" id="nb-pass-ok">Cambiar contraseña</button>
      <label>Resetear el PIN de un músico<select id="nb-pin-quien"><option value="">— Elige —</option>${DB.miembros.map(m =>
        `<option value="${esc(m.id)}">${esc(m.nombre)}${seguridad && seguridad.pins && seguridad.pins[m.id] ? '' : ' (sin PIN)'}</option>`).join('')}</select></label>
      <button type="button" class="btn" id="nb-pin-ok">Resetear PIN</button>
      <p class="conv-tip">Al resetearlo, el próximo PIN que ponga ese músico será el nuevo.</p></div>` : ''}`;
  }
  function ajustesBind(form) {
    const q = s => form.querySelector(s);
    if (q('#nb-salir')) q('#nb-salir').onclick = cerrarSesion;
    if (q('#nb-foto')) q('#nb-foto').onclick = () => { closeForm(); elegirFoto(sesion.miembroId); };
    if (q('#nb-pass-ok')) q('#nb-pass-ok').onclick = async () => {
      const p = q('#nb-pass').value; if (p.length < 4) return toast('Mínimo 4 caracteres');
      await fs.doc('ajustes/seguridad').set({ adminHash: await sha('crocknroll|admin|' + p) }, { merge: true });
      q('#nb-pass').value = ''; toast('🔑 Contraseña cambiada');
    };
    if (q('#nb-pin-ok')) q('#nb-pin-ok').onclick = async () => {
      const id = q('#nb-pin-quien').value; if (!id) return toast('Elige un músico');
      await fs.doc('ajustes/seguridad').update({ ['pins.' + id]: firebase.firestore.FieldValue.delete() });
      toast('PIN reseteado'); abrirAjustes();
    };
  }

  /* ---------- arranque ---------- */
  async function init() {
    pintarMarca();
    if (!configurada) return;
    crearLogin(); mostrarLogin(!sesion);
    if (!window.firebase) { marcar('error'); pintarLogin(); return; } // sin conexión la primera vez
    try {
      firebase.initializeApp(cfg);
      fs = firebase.firestore();
      try { await fs.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
      await firebase.auth().signInAnonymously();
      listo = true; escuchar(); pintarLogin();
    } catch (e) {
      console.warn('Nube:', e); marcar('error'); pintarLogin();
      toast(e && e.code === 'auth/operation-not-allowed' ? '⚠️ Activa el acceso anónimo en Firebase Authentication' : '⚠️ No se pudo conectar con la nube');
    }
  }

  return { init, push, campo, reemplazarTodo, esAdmin, miembroId, ajustesHtml, ajustesBind, configurada };
})();
Nube.init();
