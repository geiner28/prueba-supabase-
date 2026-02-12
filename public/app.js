// ===========================================
// DeOne Admin Panel - Frontend App
// ===========================================

const API_BASE = '/api';
const ADMIN_KEY = 'admin-secret-key-cambiar-en-produccion';
const BOT_KEY = 'bot-secret-key-cambiar-en-produccion';

// ===========================================
// API Client
// ===========================================
async function api(method, path, body = null, useBot = false) {
  const headers = { 'Content-Type': 'application/json' };
  headers[useBot ? 'x-bot-api-key' : 'x-admin-api-key'] = useBot ? BOT_KEY : ADMIN_KEY;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    const json = await res.json();
    return json;
  } catch (e) {
    return { ok: false, data: null, error: { code: 'NETWORK_ERROR', message: e.message } };
  }
}

// ===========================================
// UI Helpers
// ===========================================
function $(id) { return document.getElementById(id); }

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(title, bodyHtml, footerHtml = '') {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modalFooter').innerHTML = footerHtml;
  $('modalOverlay').classList.add('active');
}

function closeModal() {
  $('modalOverlay').classList.remove('active');
}

function toggleSidebar() {
  $('sidebar').classList.toggle('open');
}

function badgeClass(estado) {
  const map = {
    activa: 'success', aprobada: 'success', validada: 'success', pagado: 'success', pagada: 'success', resuelta: 'success',
    pendiente: 'warning', en_validacion: 'warning', en_proceso: 'warning', capturada: 'warning', extraida: 'info',
    en_revision: 'purple', reportada: 'info',
    rechazada: 'danger', fallido: 'danger', inactiva: 'gray', descartada: 'gray', cancelado: 'gray',
  };
  return map[estado] || 'gray';
}

function badge(estado) {
  return `<span class="badge badge-${badgeClass(estado)}">${estado}</span>`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function shortId(uuid) {
  return uuid ? uuid.substring(0, 8) : '—';
}

function setContent(html) {
  $('content').innerHTML = html;
}

function setLoading() {
  setContent('<div class="loading">Cargando</div>');
}

// ===========================================
// Navigation
// ===========================================
let currentModule = 'dashboard';

function navigate(mod) {
  currentModule = mod;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.module === mod);
  });
  $('sidebar').classList.remove('open');

  const titles = {
    dashboard: 'Dashboard',
    usuarios: 'Usuarios',
    obligaciones: 'Obligaciones',
    facturas: 'Facturas',
    recargas: 'Recargas',
    revisiones: 'Revisiones Admin',
    pagos: 'Pagos',
    disponibilidad: 'Disponibilidad',
  };
  $('pageTitle').textContent = titles[mod] || mod;

  const renders = { dashboard: renderDashboard, usuarios: renderUsuarios, obligaciones: renderObligaciones, facturas: renderFacturas, recargas: renderRecargas, revisiones: renderRevisiones, pagos: renderPagos, disponibilidad: renderDisponibilidad };
  if (renders[mod]) renders[mod]();
}

// ===========================================
// Dashboard
// ===========================================
async function renderDashboard() {
  setLoading();
  const [rev, health] = await Promise.all([
    api('GET', '/revisiones'),
    api('GET', '/health'),
  ]);

  const pendientes = rev.ok ? rev.data.filter(r => r.estado === 'pendiente').length : 0;
  const enProceso = rev.ok ? rev.data.filter(r => r.estado === 'en_proceso').length : 0;
  const totalRev = rev.ok ? rev.data.length : 0;

  setContent(`
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon yellow">🔍</div>
        <div class="stat-info"><h4>${pendientes}</h4><p>Revisiones Pendientes</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">⏳</div>
        <div class="stat-info"><h4>${enProceso}</h4><p>En Proceso</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple">📋</div>
        <div class="stat-info"><h4>${totalRev}</h4><p>Total Revisiones</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✅</div>
        <div class="stat-info"><h4>${health.ok ? 'Online' : 'Offline'}</h4><p>Estado del Servidor</p></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>🔍 Revisiones Pendientes</h3>
        <button class="btn btn-outline btn-sm" onclick="navigate('revisiones')">Ver todas</button>
      </div>
      <div class="card-body table-container">
        ${rev.ok && rev.data.filter(r => r.estado === 'pendiente').length > 0 ? `
        <table>
          <thead><tr><th>Tipo</th><th>Usuario</th><th>Razón</th><th>Prioridad</th><th>Creada</th><th>Acciones</th></tr></thead>
          <tbody>
            ${rev.data.filter(r => r.estado === 'pendiente').slice(0, 10).map(r => `
              <tr>
                <td>${badge(r.tipo)}</td>
                <td>${r.usuarios?.nombre || '—'}<br><span class="text-muted text-sm">${r.usuarios?.telefono || ''}</span></td>
                <td>${r.razon}</td>
                <td>${r.prioridad === 1 ? '<span class="badge badge-danger">Alta</span>' : r.prioridad === 2 ? '<span class="badge badge-warning">Media</span>' : '<span class="badge badge-gray">Baja</span>'}</td>
                <td class="text-sm">${formatDateTime(r.creado_en)}</td>
                <td><button class="btn btn-primary btn-sm" onclick="tomarRevision('${r.id}')">Tomar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : '<div class="empty-state"><div class="empty-icon">🎉</div><p>No hay revisiones pendientes</p></div>'}
      </div>
    </div>
  `);
}

// ===========================================
// Usuarios
// ===========================================
async function renderUsuarios() {
  setContent(`
    <div class="card mb-4">
      <div class="card-header"><h3>Buscar / Crear Usuario</h3></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group" style="flex:1">
            <label>Teléfono</label>
            <input type="text" id="userTelefono" class="form-control" placeholder="+573001234567">
          </div>
          <button class="btn btn-primary" onclick="buscarUsuario()">🔍 Buscar</button>
          <button class="btn btn-success" onclick="mostrarCrearUsuario()">➕ Crear / Upsert</button>
        </div>
      </div>
    </div>
    <div id="userResult"></div>
  `);
}

async function buscarUsuario() {
  const tel = $('userTelefono').value.trim();
  if (!tel) return toast('Ingresa un teléfono', 'error');
  $('userResult').innerHTML = '<div class="loading">Buscando</div>';

  const res = await api('GET', `/users/by-telefono/${encodeURIComponent(tel)}`);
  if (!res.ok) {
    $('userResult').innerHTML = `<div class="card"><div class="card-body empty-state"><div class="empty-icon">😕</div><p>No se encontró usuario: ${res.error.message}</p></div></div>`;
    return;
  }

  const u = res.data;
  const aj = u.ajustes_usuario;
  $('userResult').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>👤 ${u.nombre} ${u.apellido || ''}</h3>${badge(u.activo ? 'activa' : 'inactiva')}</div>
      <div class="card-body">
        <dl class="detail-grid">
          <dt>ID</dt><dd><code>${u.id}</code></dd>
          <dt>Teléfono</dt><dd>${u.telefono}</dd>
          <dt>Correo</dt><dd>${u.correo || '—'}</dd>
          <dt>Plan</dt><dd>${badge(u.plan)}</dd>
          <dt>Dirección</dt><dd>${u.direccion || '—'}</dd>
          <dt>Creado</dt><dd>${formatDateTime(u.creado_en)}</dd>
        </dl>
        ${aj ? `
        <h4 class="mt-4 mb-4" style="font-size:0.9rem;color:var(--gray-600)">⚙️ Ajustes</h4>
        <dl class="detail-grid">
          <dt>Recordatorios</dt><dd>${aj.recordatorios_activos ? '✅ Sí' : '❌ No'}</dd>
          <dt>Días anticipación</dt><dd>${aj.dias_anticipacion_recordatorio}</dd>
          <dt>Notificación</dt><dd>${aj.tipo_notificacion}</dd>
          <dt>Umbral monto alto</dt><dd>${formatMoney(aj.umbral_monto_alto)}</dd>
        </dl>` : ''}
        <div class="mt-4 btn-group">
          <button class="btn btn-outline btn-sm" onclick="navigate('obligaciones');setTimeout(()=>{if($('oblTelefono'))$('oblTelefono').value='${u.telefono}';buscarObligaciones()},100)">📋 Ver Obligaciones</button>
        </div>
      </div>
    </div>`;
}

function mostrarCrearUsuario() {
  openModal('Crear / Actualizar Usuario', `
    <div class="form-group"><label>Teléfono *</label><input type="text" id="mUserTel" class="form-control" placeholder="+573001234567" value="${$('userTelefono')?.value || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label>Nombre</label><input type="text" id="mUserNombre" class="form-control"></div>
      <div class="form-group"><label>Apellido</label><input type="text" id="mUserApellido" class="form-control"></div>
    </div>
    <div class="form-group"><label>Correo</label><input type="email" id="mUserCorreo" class="form-control"></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="crearUsuario()">Guardar</button>`);
}

async function crearUsuario() {
  const body = { telefono: $('mUserTel').value.trim() };
  if ($('mUserNombre').value.trim()) body.nombre = $('mUserNombre').value.trim();
  if ($('mUserApellido').value.trim()) body.apellido = $('mUserApellido').value.trim();
  if ($('mUserCorreo').value.trim()) body.correo = $('mUserCorreo').value.trim();

  if (!body.telefono) return toast('Teléfono es requerido', 'error');

  const res = await api('POST', '/users/upsert', body, true);
  closeModal();
  if (res.ok) {
    toast(res.data.creado ? 'Usuario creado' : 'Usuario actualizado');
    $('userTelefono').value = body.telefono;
    buscarUsuario();
  } else {
    toast(res.error.message, 'error');
  }
}

// ===========================================
// Obligaciones
// ===========================================
async function renderObligaciones() {
  setContent(`
    <div class="card mb-4">
      <div class="card-header"><h3>Obligaciones por Usuario</h3><button class="btn btn-success btn-sm" onclick="mostrarCrearObligacion()">➕ Nueva</button></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group" style="flex:1"><label>Teléfono</label><input type="text" id="oblTelefono" class="form-control" placeholder="+573001234567"></div>
          <button class="btn btn-primary" onclick="buscarObligaciones()">🔍 Buscar</button>
        </div>
      </div>
    </div>
    <div id="oblResult"></div>
  `);
}

async function buscarObligaciones() {
  const tel = $('oblTelefono').value.trim();
  if (!tel) return toast('Ingresa un teléfono', 'error');
  $('oblResult').innerHTML = '<div class="loading">Buscando</div>';
  const res = await api('GET', `/obligaciones?telefono=${encodeURIComponent(tel)}`, null, true);
  if (!res.ok) { $('oblResult').innerHTML = `<div class="card"><div class="card-body text-center text-muted">${res.error.message}</div></div>`; return; }
  if (res.data.length === 0) { $('oblResult').innerHTML = '<div class="card"><div class="card-body empty-state"><div class="empty-icon">📋</div><p>No tiene obligaciones registradas</p></div></div>'; return; }

  $('oblResult').innerHTML = `<div class="card"><div class="card-body table-container"><table>
    <thead><tr><th>Servicio</th><th>Referencia</th><th>Periodicidad</th><th>Estado</th><th>ID</th></tr></thead>
    <tbody>${res.data.map(o => `<tr>
      <td><strong>${o.servicio}</strong>${o.pagina_pago ? `<br><span class="text-sm text-muted">${o.pagina_pago}</span>` : ''}</td>
      <td>${o.tipo_referencia}: <code>${o.numero_referencia}</code></td>
      <td>${badge(o.periodicidad)}</td>
      <td>${badge(o.estado)}</td>
      <td class="text-sm text-muted"><code>${shortId(o.id)}</code></td>
    </tr>`).join('')}</tbody></table></div></div>`;
}

function mostrarCrearObligacion() {
  openModal('Nueva Obligación', `
    <div class="form-group"><label>Teléfono del usuario *</label><input type="text" id="mOblTel" class="form-control" value="${$('oblTelefono')?.value || ''}"></div>
    <div class="form-group"><label>Servicio *</label><input type="text" id="mOblServicio" class="form-control" placeholder="EPM Energia"></div>
    <div class="form-group"><label>Página de pago</label><input type="text" id="mOblPagina" class="form-control" placeholder="https://..."></div>
    <div class="form-row">
      <div class="form-group"><label>Tipo referencia *</label><input type="text" id="mOblTipoRef" class="form-control" placeholder="contrato"></div>
      <div class="form-group"><label>N° referencia *</label><input type="text" id="mOblNumRef" class="form-control" placeholder="REF-001"></div>
    </div>
    <div class="form-group"><label>Periodicidad</label><select id="mOblPeriod" class="form-control"><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option></select></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="crearObligacion()">Crear</button>`);
}

async function crearObligacion() {
  const body = {
    telefono: $('mOblTel').value.trim(),
    servicio: $('mOblServicio').value.trim(),
    tipo_referencia: $('mOblTipoRef').value.trim(),
    numero_referencia: $('mOblNumRef').value.trim(),
    periodicidad: $('mOblPeriod').value,
  };
  if ($('mOblPagina').value.trim()) body.pagina_pago = $('mOblPagina').value.trim();
  if (!body.telefono || !body.servicio || !body.tipo_referencia || !body.numero_referencia) return toast('Completa los campos requeridos', 'error');

  const res = await api('POST', '/obligaciones', body, true);
  closeModal();
  if (res.ok) { toast('Obligación creada'); buscarObligaciones(); }
  else toast(res.error.message, 'error');
}

// ===========================================
// Facturas
// ===========================================
async function renderFacturas() {
  setContent(`
    <div class="card mb-4">
      <div class="card-header"><h3>Capturar Factura (simular bot)</h3></div>
      <div class="card-body">
        <button class="btn btn-success" onclick="mostrarCapturarFactura()">🧾 Nueva Captura</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Buscar Factura por ID</h3></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group" style="flex:1"><label>ID Factura (UUID)</label><input type="text" id="facturaIdInput" class="form-control" placeholder="uuid..."></div>
          <button class="btn btn-primary" onclick="buscarFacturaPorId()">🔍 Buscar</button>
        </div>
      </div>
    </div>
    <div id="facturaResult" class="mt-4"></div>
  `);
}

function mostrarCapturarFactura() {
  openModal('Capturar Factura', `
    <div class="form-group"><label>Teléfono *</label><input type="text" id="mFactTel" class="form-control" placeholder="+573001234567"></div>
    <div class="form-group"><label>Obligación ID *</label><input type="text" id="mFactOblId" class="form-control" placeholder="uuid de la obligación"></div>
    <div class="form-row">
      <div class="form-group"><label>Periodo *</label><input type="date" id="mFactPeriodo" class="form-control"></div>
      <div class="form-group"><label>Monto</label><input type="number" id="mFactMonto" class="form-control" placeholder="150000"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Fecha emisión</label><input type="date" id="mFactEmision" class="form-control"></div>
      <div class="form-group"><label>Fecha vencimiento</label><input type="date" id="mFactVenc" class="form-control"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Origen</label><select id="mFactOrigen" class="form-control"><option>imagen</option><option>pdf</option><option>audio</option><option>texto</option></select></div>
      <div class="form-group"><label>Extracción estado</label><select id="mFactExtEst" class="form-control"><option value="ok">OK</option><option value="dudosa">Dudosa</option><option value="fallida">Fallida</option></select></div>
    </div>
    <div class="form-group"><label>Confianza (0-1)</label><input type="number" id="mFactConf" class="form-control" step="0.01" min="0" max="1" placeholder="0.95"></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="capturarFactura()">Capturar</button>`);
}

async function capturarFactura() {
  const body = {
    telefono: $('mFactTel').value.trim(),
    obligacion_id: $('mFactOblId').value.trim(),
    periodo: $('mFactPeriodo').value,
    origen: $('mFactOrigen').value,
    extraccion_estado: $('mFactExtEst').value,
  };
  if ($('mFactMonto').value) body.monto = Number($('mFactMonto').value);
  if ($('mFactEmision').value) body.fecha_emision = $('mFactEmision').value;
  if ($('mFactVenc').value) body.fecha_vencimiento = $('mFactVenc').value;
  if ($('mFactConf').value) body.extraccion_confianza = Number($('mFactConf').value);

  if (!body.telefono || !body.obligacion_id || !body.periodo) return toast('Completa los campos requeridos', 'error');

  const res = await api('POST', '/facturas/captura', body, true);
  closeModal();
  if (res.ok) {
    toast(`Factura ${res.data.factura_id.substring(0,8)}... — Estado: ${res.data.estado}${res.data.requiere_revision ? ' ⚠️ Requiere revisión' : ''}`);
    $('facturaIdInput').value = res.data.factura_id;
  } else toast(res.error.message, 'error');
}

async function buscarFacturaPorId() {
  const id = $('facturaIdInput').value.trim();
  if (!id) return toast('Ingresa un ID de factura', 'error');
  // We don't have a direct get-by-id endpoint, so we'll show what we can
  $('facturaResult').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Factura <code>${shortId(id)}</code></h3>
        <div class="btn-group">
          <button class="btn btn-success btn-sm" onclick="mostrarValidarFactura('${id}')">✅ Validar</button>
          <button class="btn btn-danger btn-sm" onclick="mostrarRechazarFactura('${id}')">❌ Rechazar</button>
        </div>
      </div>
      <div class="card-body"><p class="text-muted">Usa los botones para validar o rechazar esta factura.</p><p class="text-sm mt-2">ID completo: <code>${id}</code></p></div>
    </div>`;
}

function mostrarValidarFactura(id) {
  openModal('Validar Factura', `
    <p class="text-sm text-muted mb-4">ID: <code>${id}</code></p>
    <div class="form-row">
      <div class="form-group"><label>Monto *</label><input type="number" id="mValMonto" class="form-control"></div>
      <div class="form-group"><label>Fecha Vencimiento *</label><input type="date" id="mValVenc" class="form-control"></div>
    </div>
    <div class="form-group"><label>Fecha Emisión</label><input type="date" id="mValEmision" class="form-control"></div>
    <div class="form-group"><label>Observaciones</label><textarea id="mValObs" class="form-control" rows="2"></textarea></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-success" onclick="validarFactura('${id}')">✅ Validar</button>`);
}

async function validarFactura(id) {
  const body = { monto: Number($('mValMonto').value), fecha_vencimiento: $('mValVenc').value };
  if ($('mValEmision').value) body.fecha_emision = $('mValEmision').value;
  if ($('mValObs').value.trim()) body.observaciones_admin = $('mValObs').value.trim();
  if (!body.monto || !body.fecha_vencimiento) return toast('Monto y fecha vencimiento son requeridos', 'error');

  const res = await api('PUT', `/facturas/${id}/validar`, body);
  closeModal();
  if (res.ok) toast('Factura validada ✅');
  else toast(res.error.message, 'error');
}

function mostrarRechazarFactura(id) {
  openModal('Rechazar Factura', `
    <p class="text-sm text-muted mb-4">ID: <code>${id}</code></p>
    <div class="form-group"><label>Motivo de rechazo *</label><textarea id="mRechMotivo" class="form-control" rows="3"></textarea></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="rechazarFactura('${id}')">❌ Rechazar</button>`);
}

async function rechazarFactura(id) {
  const body = { motivo_rechazo: $('mRechMotivo').value.trim() };
  if (!body.motivo_rechazo) return toast('El motivo es requerido', 'error');
  const res = await api('PUT', `/facturas/${id}/rechazar`, body);
  closeModal();
  if (res.ok) toast('Factura rechazada');
  else toast(res.error.message, 'error');
}

// ===========================================
// Recargas
// ===========================================
async function renderRecargas() {
  setContent(`
    <div class="card mb-4">
      <div class="card-header"><h3>Reportar Recarga (simular bot)</h3></div>
      <div class="card-body">
        <button class="btn btn-success" onclick="mostrarReportarRecarga()">💰 Reportar Recarga</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Gestionar Recarga</h3></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group" style="flex:1"><label>ID Recarga (UUID)</label><input type="text" id="recargaIdInput" class="form-control"></div>
          <button class="btn btn-success btn-sm" onclick="aprobarRecargaRapido()">✅ Aprobar</button>
          <button class="btn btn-danger btn-sm" onclick="mostrarRechazarRecarga()">❌ Rechazar</button>
        </div>
      </div>
    </div>
    <div id="recargaResult" class="mt-4"></div>
  `);
}

function mostrarReportarRecarga() {
  openModal('Reportar Recarga', `
    <div class="form-group"><label>Teléfono *</label><input type="text" id="mRecTel" class="form-control" placeholder="+573001234567"></div>
    <div class="form-row">
      <div class="form-group"><label>Periodo *</label><input type="date" id="mRecPeriodo" class="form-control"></div>
      <div class="form-group"><label>Monto *</label><input type="number" id="mRecMonto" class="form-control" placeholder="200000"></div>
    </div>
    <div class="form-group"><label>Comprobante URL *</label><input type="text" id="mRecComp" class="form-control" placeholder="comprobantes_recarga/..."></div>
    <div class="form-group"><label>Referencia TX (idempotencia)</label><input type="text" id="mRecRef" class="form-control" placeholder="TX-123"></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="reportarRecarga()">Reportar</button>`);
}

async function reportarRecarga() {
  const body = {
    telefono: $('mRecTel').value.trim(),
    periodo: $('mRecPeriodo').value,
    monto: Number($('mRecMonto').value),
    comprobante_url: $('mRecComp').value.trim(),
  };
  if ($('mRecRef').value.trim()) body.referencia_tx = $('mRecRef').value.trim();
  if (!body.telefono || !body.periodo || !body.monto || !body.comprobante_url) return toast('Completa todos los campos requeridos', 'error');

  const res = await api('POST', '/recargas/reportar', body, true);
  closeModal();
  if (res.ok) {
    toast(`Recarga ${res.data.recarga_id.substring(0,8)}... — ${res.data.estado}${res.data.mensaje ? ' (existente)' : ''}`);
    $('recargaIdInput').value = res.data.recarga_id;
  } else toast(res.error.message, 'error');
}

async function aprobarRecargaRapido() {
  const id = $('recargaIdInput').value.trim();
  if (!id) return toast('Ingresa un ID de recarga', 'error');
  const res = await api('PUT', `/recargas/${id}/aprobar`, { observaciones_admin: 'Aprobada desde panel admin' });
  if (res.ok) toast('Recarga aprobada ✅');
  else toast(res.error.message, 'error');
}

function mostrarRechazarRecarga() {
  const id = $('recargaIdInput').value.trim();
  if (!id) return toast('Ingresa un ID de recarga', 'error');
  openModal('Rechazar Recarga', `
    <p class="text-sm text-muted mb-4">ID: <code>${id}</code></p>
    <div class="form-group"><label>Motivo de rechazo *</label><textarea id="mRecRechMotivo" class="form-control" rows="3"></textarea></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="rechazarRecarga('${id}')">❌ Rechazar</button>`);
}

async function rechazarRecarga(id) {
  const body = { motivo_rechazo: $('mRecRechMotivo').value.trim() };
  if (!body.motivo_rechazo) return toast('El motivo es requerido', 'error');
  const res = await api('PUT', `/recargas/${id}/rechazar`, body);
  closeModal();
  if (res.ok) toast('Recarga rechazada');
  else toast(res.error.message, 'error');
}

// ===========================================
// Revisiones
// ===========================================
async function renderRevisiones() {
  setLoading();
  const filtroTipo = sessionStorage.getItem('rev_tipo') || '';
  const filtroEstado = sessionStorage.getItem('rev_estado') || 'pendiente';

  let qs = '';
  if (filtroTipo) qs += `tipo=${filtroTipo}&`;
  if (filtroEstado) qs += `estado=${filtroEstado}&`;
  qs = qs.replace(/&$/, '');

  const res = await api('GET', `/revisiones${qs ? '?' + qs : ''}`);

  let filterHtml = `
    <div class="filter-bar">
      <div class="form-group">
        <label>Tipo</label>
        <select id="revFiltroTipo" class="form-control" onchange="sessionStorage.setItem('rev_tipo',this.value);renderRevisiones()">
          <option value="">Todos</option>
          <option value="factura" ${filtroTipo === 'factura' ? 'selected' : ''}>Factura</option>
          <option value="recarga" ${filtroTipo === 'recarga' ? 'selected' : ''}>Recarga</option>
        </select>
      </div>
      <div class="form-group">
        <label>Estado</label>
        <select id="revFiltroEstado" class="form-control" onchange="sessionStorage.setItem('rev_estado',this.value);renderRevisiones()">
          <option value="">Todos</option>
          <option value="pendiente" ${filtroEstado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="en_proceso" ${filtroEstado === 'en_proceso' ? 'selected' : ''}>En Proceso</option>
          <option value="resuelta" ${filtroEstado === 'resuelta' ? 'selected' : ''}>Resuelta</option>
          <option value="descartada" ${filtroEstado === 'descartada' ? 'selected' : ''}>Descartada</option>
        </select>
      </div>
      <button class="btn btn-outline btn-sm" onclick="sessionStorage.removeItem('rev_tipo');sessionStorage.removeItem('rev_estado');renderRevisiones()">Limpiar filtros</button>
    </div>`;

  if (!res.ok) { setContent(filterHtml + `<div class="card"><div class="card-body text-center text-muted">${res.error.message}</div></div>`); return; }
  if (res.data.length === 0) { setContent(filterHtml + '<div class="card"><div class="card-body empty-state"><div class="empty-icon">✨</div><p>No hay revisiones con esos filtros</p></div></div>'); return; }

  setContent(filterHtml + `<div class="card"><div class="card-body table-container"><table>
    <thead><tr><th>Tipo</th><th>Estado</th><th>Usuario</th><th>Razón</th><th>Prior.</th><th>Creada</th><th>Acciones</th></tr></thead>
    <tbody>${res.data.map(r => `<tr>
      <td>${badge(r.tipo)}</td>
      <td>${badge(r.estado)}</td>
      <td>${r.usuarios?.nombre || '—'}<br><span class="text-muted text-sm">${r.usuarios?.telefono || ''}</span></td>
      <td style="max-width:250px">${r.razon}</td>
      <td>${r.prioridad === 1 ? '🔴' : r.prioridad === 2 ? '🟡' : '🟢'}</td>
      <td class="text-sm">${formatDateTime(r.creado_en)}</td>
      <td>
        <div class="btn-group">
          ${r.estado === 'pendiente' ? `<button class="btn btn-primary btn-sm" onclick="tomarRevision('${r.id}')">Tomar</button>` : ''}
          ${r.estado === 'pendiente' || r.estado === 'en_proceso' ? `<button class="btn btn-outline btn-sm" onclick="descartarRevision('${r.id}')">Descartar</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="verDetalleRevision('${r.id}','${r.tipo}','${r.factura_id || ''}','${r.recarga_id || ''}')">👁️</button>
        </div>
      </td>
    </tr>`).join('')}</tbody></table></div></div>`);
}

async function tomarRevision(id) {
  const res = await api('PUT', `/revisiones/${id}/tomar`);
  if (res.ok) { toast('Revisión tomada'); if (currentModule === 'revisiones') renderRevisiones(); else renderDashboard(); }
  else toast(res.error.message, 'error');
}

function descartarRevision(id) {
  openModal('Descartar Revisión', `
    <div class="form-group"><label>Razón (opcional)</label><textarea id="mDescRazon" class="form-control" rows="2"></textarea></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-warning" onclick="doDescartarRevision('${id}')">Descartar</button>`);
}

async function doDescartarRevision(id) {
  const body = {};
  if ($('mDescRazon')?.value.trim()) body.razon = $('mDescRazon').value.trim();
  const res = await api('PUT', `/revisiones/${id}/descartar`, body);
  closeModal();
  if (res.ok) { toast('Revisión descartada'); renderRevisiones(); }
  else toast(res.error.message, 'error');
}

function verDetalleRevision(id, tipo, facturaId, recargaId) {
  let info = `<dl class="detail-grid">
    <dt>ID Revisión</dt><dd><code>${id}</code></dd>
    <dt>Tipo</dt><dd>${badge(tipo)}</dd>`;
  if (facturaId) info += `<dt>Factura ID</dt><dd><code>${facturaId}</code></dd>`;
  if (recargaId) info += `<dt>Recarga ID</dt><dd><code>${recargaId}</code></dd>`;
  info += `</dl>`;

  let actions = '';
  if (tipo === 'factura' && facturaId) {
    actions = `<div class="mt-4 btn-group">
      <button class="btn btn-success btn-sm" onclick="closeModal();navigate('facturas');setTimeout(()=>{$('facturaIdInput').value='${facturaId}';buscarFacturaPorId()},100)">✅ Ir a Validar Factura</button>
    </div>`;
  }
  if (tipo === 'recarga' && recargaId) {
    actions = `<div class="mt-4 btn-group">
      <button class="btn btn-success btn-sm" onclick="closeModal();navigate('recargas');setTimeout(()=>{$('recargaIdInput').value='${recargaId}'},100)">💰 Ir a Gestionar Recarga</button>
    </div>`;
  }

  openModal('Detalle Revisión', info + actions);
}

// ===========================================
// Pagos
// ===========================================
async function renderPagos() {
  setContent(`
    <div class="card mb-4">
      <div class="card-header"><h3>Crear Pago</h3></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group"><label>Teléfono</label><input type="text" id="pagoTel" class="form-control" placeholder="+573001234567"></div>
          <div class="form-group" style="flex:1"><label>Factura ID (validada)</label><input type="text" id="pagoFacturaId" class="form-control"></div>
          <button class="btn btn-primary" onclick="crearPago()">💳 Crear Pago</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Gestionar Pago</h3></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group" style="flex:1"><label>ID Pago (UUID)</label><input type="text" id="pagoIdInput" class="form-control"></div>
          <button class="btn btn-success btn-sm" onclick="mostrarConfirmarPago()">✅ Confirmar</button>
          <button class="btn btn-danger btn-sm" onclick="mostrarFallarPago()">❌ Fallar</button>
        </div>
      </div>
    </div>
    <div id="pagoResult" class="mt-4"></div>
  `);
}

async function crearPago() {
  const tel = $('pagoTel').value.trim();
  const facturaId = $('pagoFacturaId').value.trim();
  if (!tel || !facturaId) return toast('Teléfono y Factura ID requeridos', 'error');

  const res = await api('POST', '/pagos/crear', { telefono: tel, factura_id: facturaId });
  if (res.ok) {
    toast(`Pago creado: ${shortId(res.data.pago_id)} — ${res.data.estado}`);
    $('pagoIdInput').value = res.data.pago_id;
  } else toast(res.error.message, 'error');
}

function mostrarConfirmarPago() {
  const id = $('pagoIdInput').value.trim();
  if (!id) return toast('Ingresa un ID de pago', 'error');
  openModal('Confirmar Pago', `
    <p class="text-sm text-muted mb-4">ID: <code>${id}</code></p>
    <div class="form-group"><label>Proveedor de pago</label><input type="text" id="mPagoProveedor" class="form-control" placeholder="PSE, Nequi..."></div>
    <div class="form-group"><label>Referencia de pago</label><input type="text" id="mPagoRef" class="form-control"></div>
    <div class="form-group"><label>Comprobante URL</label><input type="text" id="mPagoComp" class="form-control"></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-success" onclick="confirmarPago('${id}')">✅ Confirmar</button>`);
}

async function confirmarPago(id) {
  const body = {};
  if ($('mPagoProveedor').value.trim()) body.proveedor_pago = $('mPagoProveedor').value.trim();
  if ($('mPagoRef').value.trim()) body.referencia_pago = $('mPagoRef').value.trim();
  if ($('mPagoComp').value.trim()) body.comprobante_pago_url = $('mPagoComp').value.trim();

  const res = await api('PUT', `/pagos/${id}/confirmar`, body);
  closeModal();
  if (res.ok) toast('Pago confirmado ✅ — Factura marcada como pagada');
  else toast(res.error.message, 'error');
}

function mostrarFallarPago() {
  const id = $('pagoIdInput').value.trim();
  if (!id) return toast('Ingresa un ID de pago', 'error');
  openModal('Marcar Pago como Fallido', `
    <p class="text-sm text-muted mb-4">ID: <code>${id}</code></p>
    <div class="form-group"><label>Detalle del error *</label><textarea id="mPagoError" class="form-control" rows="3"></textarea></div>
  `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="fallarPago('${id}')">❌ Marcar Fallido</button>`);
}

async function fallarPago(id) {
  const body = { error_detalle: $('mPagoError').value.trim() };
  if (!body.error_detalle) return toast('El detalle del error es requerido', 'error');
  const res = await api('PUT', `/pagos/${id}/fallar`, body);
  closeModal();
  if (res.ok) toast('Pago marcado como fallido');
  else toast(res.error.message, 'error');
}

// ===========================================
// Disponibilidad
// ===========================================
async function renderDisponibilidad() {
  setContent(`
    <div class="card">
      <div class="card-header"><h3>📈 Consultar Disponibilidad por Periodo</h3></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group"><label>Teléfono</label><input type="text" id="dispTel" class="form-control" placeholder="+573001234567"></div>
          <div class="form-group"><label>Periodo</label><input type="date" id="dispPeriodo" class="form-control"></div>
          <button class="btn btn-primary" onclick="consultarDisponibilidad()">📊 Consultar</button>
        </div>
      </div>
    </div>
    <div id="dispResult" class="mt-4"></div>
  `);
}

async function consultarDisponibilidad() {
  const tel = $('dispTel').value.trim();
  const periodo = $('dispPeriodo').value;
  if (!tel || !periodo) return toast('Teléfono y periodo requeridos', 'error');

  $('dispResult').innerHTML = '<div class="loading">Calculando</div>';
  const res = await api('GET', `/disponible?telefono=${encodeURIComponent(tel)}&periodo=${periodo}`, null, true);

  if (!res.ok) { $('dispResult').innerHTML = `<div class="card"><div class="card-body text-center text-muted">${res.error.message}</div></div>`; return; }

  const d = res.data;
  const pct = d.total_recargas_aprobadas > 0 ? Math.round((d.total_pagos_pagados / d.total_recargas_aprobadas) * 100) : 0;

  $('dispResult').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon green">💰</div>
        <div class="stat-info"><h4>${formatMoney(d.total_recargas_aprobadas)}</h4><p>Recargas Aprobadas</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">💳</div>
        <div class="stat-info"><h4>${formatMoney(d.total_pagos_pagados)}</h4><p>Pagos Realizados</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${d.disponible > 0 ? 'blue' : 'red'}">📊</div>
        <div class="stat-info"><h4>${formatMoney(d.disponible)}</h4><p>Disponible</p></div>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <div style="background:var(--gray-100);border-radius:999px;height:24px;overflow:hidden;position:relative">
          <div style="background:${pct > 80 ? 'var(--danger)' : pct > 50 ? 'var(--warning)' : 'var(--success)'};height:100%;width:${pct}%;border-radius:999px;transition:width 0.5s ease"></div>
        </div>
        <p class="text-center text-sm text-muted mt-2">${pct}% del presupuesto utilizado • Periodo: ${d.periodo}</p>
      </div>
    </div>`;
}

// ===========================================
// Health Check & Init
// ===========================================
async function checkHealth() {
  const statusEl = $('serverStatus');
  try {
    const res = await api('GET', '/health');
    if (res.ok) {
      statusEl.innerHTML = '<span class="status-dot online"></span> Servidor online';
    } else {
      statusEl.innerHTML = '<span class="status-dot offline"></span> Error de servidor';
    }
  } catch {
    statusEl.innerHTML = '<span class="status-dot offline"></span> Sin conexión';
  }
}

// Init
checkHealth();
setInterval(checkHealth, 30000);
navigate('dashboard');
