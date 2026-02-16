// ===========================================
// DeOne Admin Panel - Frontend v2
// Obligaciones → Facturas → Pagos flow
// ===========================================

const API_BASE = '/api';
const BOT_KEY   = 'TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3'; // Token único simplificado
const ADMIN_KEY = 'TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3'; // Mismo token para ambos

// ─── API helper ───
async function api(method, path, body = null, useBot = false) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      [useBot ? 'x-bot-api-key' : 'x-admin-api-key']: useBot ? BOT_KEY : ADMIN_KEY,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || `Error ${res.status}`);
  return json;
}

// ─── UI helpers ───
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function openModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function setContent(html) {
  document.getElementById('content').innerHTML = html;
}

function setTitle(t) {
  document.getElementById('pageTitle').textContent = t;
}

function loading() {
  setContent('<div class="loading">Cargando</div>');
}

function emptyState(icon, msg) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`;
}

function badgeEstado(estado) {
  const map = {
    activa: 'badge-info', en_progreso: 'badge-warning', completada: 'badge-success',
    cancelada: 'badge-danger', extraida: 'badge-info', en_revision: 'badge-warning',
    validada: 'badge-purple', pagada: 'badge-success', rechazada: 'badge-danger',
    en_proceso: 'badge-warning', pagado: 'badge-success', fallido: 'badge-danger',
    pendiente: 'badge-warning', aprobada: 'badge-success', reportada: 'badge-info',
    resuelta: 'badge-success', descartada: 'badge-gray',
  };
  return `<span class="badge ${map[estado] || 'badge-gray'}">${estado}</span>`;
}

function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function shortId(id) {
  return id ? id.substring(0, 8) : '—';
}

function progressBar(pct) {
  const color = pct >= 100 ? 'var(--success)' : pct > 0 ? 'var(--warning)' : 'var(--gray-300)';
  return `
    <div style="background:var(--gray-200);border-radius:999px;height:8px;width:100%;overflow:hidden;margin-top:4px;">
      <div style="background:${color};height:100%;width:${Math.min(pct, 100)}%;border-radius:999px;transition:width .3s;"></div>
    </div>
    <div class="text-sm text-muted" style="margin-top:2px;">${pct}% completado</div>
  `;
}

// ─── Navigation ───
let currentModule = 'dashboard';
function navigate(mod) {
  currentModule = mod;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.module === mod);
  });
  setTitle({ dashboard:'Dashboard', usuarios:'Usuarios', obligaciones:'Obligaciones', recargas:'Recargas', revisiones:'Revisiones', disponibilidad:'Disponibilidad' }[mod] || mod);
  modules[mod]?.();
}

// ─── Health check ───
async function checkHealth() {
  const dot = document.querySelector('.status-dot');
  const label = document.getElementById('serverStatus');
  try {
    await fetch(`${API_BASE}/health`);
    dot.className = 'status-dot online';
    label.innerHTML = '<span class="status-dot online"></span> Servidor online';
  } catch {
    dot.className = 'status-dot offline';
    label.innerHTML = '<span class="status-dot offline"></span> Sin conexión';
  }
}

// ===========================================
//  DASHBOARD
// ===========================================
async function moduleDashboard() {
  loading();
  try {
    const revisiones = await api('GET', '/revisiones?estado=pendiente');
    const pending = revisiones.data?.length || 0;

    setContent(`
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon purple">📋</div>
          <div class="stat-info"><h4>Obligaciones</h4><p>Gestión de periodos de pago</p></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow">🔍</div>
          <div class="stat-info"><h4>${pending}</h4><p>Revisiones pendientes</p></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">💰</div>
          <div class="stat-info"><h4>Recargas</h4><p>Gestión de fondos</p></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">⚡</div>
          <div class="stat-info"><h4>DeOne v2</h4><p>Panel de administración</p></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>🚀 Flujo DeOne v2</h3></div>
        <div class="card-body">
          <p style="margin-bottom:12px;">El flujo principal del sistema es:</p>
          <ol style="padding-left:20px;line-height:2;">
            <li><strong>Crear Usuario</strong> — registrar al cliente con su teléfono</li>
            <li><strong>Crear Obligación</strong> — compromiso de pago del periodo (ej: "Pagos Febrero 2026")</li>
            <li><strong>Agregar Facturas</strong> — servicios individuales (Energía, Agua, Gas…)</li>
            <li><strong>Reportar Recarga</strong> — el usuario envía comprobante de recarga de saldo</li>
            <li><strong>Aprobar Recarga</strong> — admin verifica y aprueba la recarga</li>
            <li><strong>Crear y Confirmar Pagos</strong> — pagar cada factura validada</li>
            <li><strong>Auto-completar</strong> — cuando todas las facturas están pagadas, la obligación se completa automáticamente ✅</li>
          </ol>
        </div>
      </div>
    `);
  } catch (err) {
    setContent(`<div class="card"><div class="card-body">${emptyState('⚠️', err.message)}</div></div>`);
  }
}

// ===========================================
//  USUARIOS
// ===========================================
async function moduleUsuarios() {
  setContent(`
    <div class="card mb-4">
      <div class="card-header"><h3>Buscar / Crear Usuario</h3></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group" style="flex:1;">
            <label>Teléfono</label>
            <input type="text" class="form-control" id="userTelefono" placeholder="573001234567">
          </div>
          <button class="btn btn-primary" onclick="buscarUsuario()">🔍 Buscar</button>
          <button class="btn btn-success" onclick="abrirCrearUsuario()">➕ Crear</button>
        </div>
      </div>
    </div>
    <div id="userResult"></div>
  `);
}

async function buscarUsuario() {
  const tel = document.getElementById('userTelefono').value.trim();
  if (!tel) return toast('Ingresa un teléfono', 'error');
  const container = document.getElementById('userResult');
  container.innerHTML = '<div class="loading">Buscando</div>';
  try {
    const res = await api('GET', `/users/by-telefono/${tel}`);
    const u = res.data;
    container.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>👤 ${u.nombre || ''} ${u.apellido || ''}</h3></div>
        <div class="card-body">
          <dl class="detail-grid">
            <dt>ID</dt><dd>${shortId(u.usuario_id)}</dd>
            <dt>Teléfono</dt><dd>${u.telefono}</dd>
            <dt>Email</dt><dd>${u.email || '—'}</dd>
            <dt>Tipo doc</dt><dd>${u.tipo_documento || '—'}</dd>
            <dt>Documento</dt><dd>${u.numero_documento || '—'}</dd>
            <dt>Registrado</dt><dd>${fmtDateTime(u.creado_en)}</dd>
          </dl>
          <div class="mt-4">
            <button class="btn btn-primary btn-sm" onclick="navigate('obligaciones'); setTimeout(()=>document.getElementById('oblTelefono')&&(document.getElementById('oblTelefono').value='${u.telefono}'),100)">
              📋 Ver Obligaciones
            </button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body">${emptyState('🔍', err.message)}</div></div>`;
  }
}

function abrirCrearUsuario() {
  const tel = document.getElementById('userTelefono').value.trim();
  openModal('Crear Usuario', `
    <div class="form-group"><label>Teléfono *</label><input class="form-control" id="nuTelefono" value="${tel}"></div>
    <div class="form-row">
      <div class="form-group"><label>Nombre *</label><input class="form-control" id="nuNombre"></div>
      <div class="form-group"><label>Apellido</label><input class="form-control" id="nuApellido"></div>
    </div>
    <div class="form-group"><label>Email</label><input class="form-control" id="nuEmail" type="email"></div>
    <div class="form-row">
      <div class="form-group"><label>Tipo Doc</label>
        <select class="form-control" id="nuTipoDoc">
          <option value="">—</option><option value="CC">CC</option><option value="CE">CE</option><option value="NIT">NIT</option><option value="PP">PP</option>
        </select>
      </div>
      <div class="form-group"><label>Número Doc</label><input class="form-control" id="nuNumDoc"></div>
    </div>
  `, `<button class="btn btn-success" onclick="crearUsuario()">✅ Crear</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function crearUsuario() {
  try {
    const body = {
      telefono: document.getElementById('nuTelefono').value.trim(),
      nombre: document.getElementById('nuNombre').value.trim(),
      apellido: document.getElementById('nuApellido').value.trim() || undefined,
      email: document.getElementById('nuEmail').value.trim() || undefined,
      tipo_documento: document.getElementById('nuTipoDoc').value || undefined,
      numero_documento: document.getElementById('nuNumDoc').value.trim() || undefined,
    };
    if (!body.telefono || !body.nombre) return toast('Teléfono y nombre son requeridos', 'error');
    await api('POST', '/users/upsert', body);
    toast('Usuario creado ✅', 'success');
    closeModal();
    document.getElementById('userTelefono').value = body.telefono;
    buscarUsuario();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ===========================================
//  OBLIGACIONES
// ===========================================
async function moduleObligaciones() {
  setContent(`
    <div class="card mb-4">
      <div class="card-header">
        <h3>Obligaciones del Usuario</h3>
        <button class="btn btn-success btn-sm" onclick="abrirCrearObligacion()">➕ Nueva Obligación</button>
      </div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group" style="flex:1;">
            <label>Teléfono del usuario</label>
            <input type="text" class="form-control" id="oblTelefono" placeholder="573001234567">
          </div>
          <div class="form-group">
            <label>Estado</label>
            <select class="form-control" id="oblEstado">
              <option value="">Todos</option>
              <option value="activa">Activa</option>
              <option value="en_progreso">En Progreso</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="buscarObligaciones()">🔍 Buscar</button>
        </div>
      </div>
    </div>
    <div id="oblResults"></div>
  `);
}

async function buscarObligaciones() {
  const tel = document.getElementById('oblTelefono').value.trim();
  if (!tel) return toast('Ingresa un teléfono', 'error');
  const estado = document.getElementById('oblEstado').value;
  const container = document.getElementById('oblResults');
  container.innerHTML = '<div class="loading">Buscando</div>';
  try {
    let url = `/obligaciones?telefono=${tel}`;
    if (estado) url += `&estado=${estado}`;
    const res = await api('GET', url);
    const obls = res.data || [];
    if (obls.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">${emptyState('📋', 'No se encontraron obligaciones')}</div></div>`;
      return;
    }
    container.innerHTML = obls.map(o => `
      <div class="card mb-4" style="cursor:pointer;" onclick="verObligacion('${o.id}')">
        <div class="card-header">
          <h3>${o.descripcion || 'Obligación'}</h3>
          <div class="flex items-center gap-2">
            ${badgeEstado(o.estado)}
            <span class="text-sm text-muted">${o.periodo || ''}</span>
          </div>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:12px;">
            <div>
              <div class="text-sm text-muted">Facturas</div>
              <div style="font-size:1.1rem;font-weight:600;">${o.facturas_pagadas || 0} / ${o.total_facturas || 0}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Monto Total</div>
              <div style="font-size:1.1rem;font-weight:600;">${fmtMoney(o.monto_total)}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Monto Pagado</div>
              <div style="font-size:1.1rem;font-weight:600;">${fmtMoney(o.monto_pagado)}</div>
            </div>
          </div>
          ${progressBar(o.progreso || 0)}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body">${emptyState('⚠️', err.message)}</div></div>`;
  }
}

function abrirCrearObligacion() {
  const tel = document.getElementById('oblTelefono')?.value?.trim() || '';
  const now = new Date();
  const defPeriodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const mesNombre = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  openModal('Nueva Obligación', `
    <div class="form-group"><label>Teléfono del usuario *</label><input class="form-control" id="noTelefono" value="${tel}"></div>
    <div class="form-group"><label>Descripción *</label><input class="form-control" id="noDescripcion" value="Pagos de ${mesNombre}" placeholder="Pagos de Febrero 2026"></div>
    <div class="form-group"><label>Periodo *</label><input class="form-control" id="noPeriodo" value="${defPeriodo}" placeholder="YYYY-MM-DD"></div>
    <p class="text-sm text-muted mt-2">La obligación agrupa las facturas (servicios) que el usuario debe pagar en este periodo.</p>
  `, `<button class="btn btn-success" onclick="crearObligacion()">✅ Crear</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function crearObligacion() {
  try {
    const body = {
      telefono: document.getElementById('noTelefono').value.trim(),
      descripcion: document.getElementById('noDescripcion').value.trim(),
      periodo: document.getElementById('noPeriodo').value.trim(),
    };
    if (!body.telefono || !body.descripcion || !body.periodo) return toast('Todos los campos son requeridos', 'error');
    const res = await api('POST', '/obligaciones', body);
    toast('Obligación creada ✅', 'success');
    closeModal();
    document.getElementById('oblTelefono').value = body.telefono;
    buscarObligaciones();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Detalle de Obligación ───
async function verObligacion(id) {
  loading();
  try {
    const res = await api('GET', `/obligaciones/${id}`);
    const o = res.data;
    const usuario = o.usuarios || {};
    const facturas = o.facturas || [];

    let facturasHtml = '';
    if (facturas.length === 0) {
      facturasHtml = emptyState('📄', 'No hay facturas aún. Agrega servicios a esta obligación.');
    } else {
      facturasHtml = `
        <div class="table-container">
          <table>
            <thead><tr>
              <th>Servicio</th><th>Monto</th><th>Estado</th><th>Vencimiento</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${facturas.map(f => `
                <tr>
                  <td><strong>${f.servicio || '—'}</strong></td>
                  <td>${fmtMoney(f.monto)}</td>
                  <td>${badgeEstado(f.estado)}</td>
                  <td>${fmtDate(f.fecha_vencimiento)}</td>
                  <td>
                    <div class="btn-group">
                      ${f.estado === 'extraida' || f.estado === 'en_revision' ? `
                        <button class="btn btn-success btn-sm" onclick="abrirValidarFactura('${f.id}', ${f.monto})">✅ Validar</button>
                        <button class="btn btn-danger btn-sm" onclick="abrirRechazarFactura('${f.id}')">❌ Rechazar</button>
                      ` : ''}
                      ${f.estado === 'validada' ? `
                        <button class="btn btn-primary btn-sm" onclick="abrirCrearPago('${f.id}', '${(f.servicio||'').replace(/'/g, "\\'")}', ${f.monto}, '${o.id}', '${usuario.telefono || ''}')">💳 Pagar</button>
                      ` : ''}
                      ${f.estado === 'pagada' ? '<span class="text-sm text-muted">✅ Pagada</span>' : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    setContent(`
      <div style="margin-bottom:16px;">
        <button class="btn btn-outline btn-sm" onclick="navigate('obligaciones'); setTimeout(()=>{document.getElementById('oblTelefono').value='${usuario.telefono || ''}'; buscarObligaciones();},100)">← Volver a obligaciones</button>
      </div>

      <div class="card mb-4">
        <div class="card-header">
          <h3>${o.descripcion || 'Obligación'}</h3>
          ${badgeEstado(o.estado)}
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px;margin-bottom:16px;">
            <div>
              <div class="text-sm text-muted">Usuario</div>
              <div style="font-weight:600;">${usuario.nombre || ''} ${usuario.apellido || ''}</div>
              <div class="text-sm text-muted">${usuario.telefono || ''}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Periodo</div>
              <div style="font-weight:600;">${o.periodo || '—'}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Facturas</div>
              <div style="font-weight:600;font-size:1.2rem;">${o.facturas_pagadas || 0} / ${o.total_facturas || 0}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Monto</div>
              <div style="font-weight:600;">${fmtMoney(o.monto_pagado)} / ${fmtMoney(o.monto_total)}</div>
            </div>
          </div>
          ${progressBar(o.progreso || 0)}
          ${o.estado === 'completada' ? `<div class="mt-2" style="color:var(--success);font-weight:600;">✅ Obligación completada${o.completada_en ? ' el ' + fmtDateTime(o.completada_en) : ''}</div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>📄 Facturas (Servicios)</h3>
          ${o.estado !== 'completada' && o.estado !== 'cancelada' ? `<button class="btn btn-success btn-sm" onclick="abrirAgregarFactura('${o.id}', '${usuario.telefono || ''}')">➕ Agregar Servicio</button>` : ''}
        </div>
        <div class="card-body">
          ${facturasHtml}
        </div>
      </div>
    `);
  } catch (err) {
    setContent(`<div class="card"><div class="card-body">${emptyState('⚠️', err.message)}</div></div>`);
  }
}

// ─── Agregar Factura (servicio) a obligación ───
function abrirAgregarFactura(obligacionId, telefono) {
  openModal('Agregar Servicio', `
    <p class="text-sm text-muted mb-4">Registrar una factura/servicio dentro de esta obligación.</p>
    <input type="hidden" id="afObligacionId" value="${obligacionId}">
    <input type="hidden" id="afTelefono" value="${telefono}">
    <div class="form-group">
      <label>Servicio *</label>
      <select class="form-control" id="afServicio" onchange="if(this.value==='otro')document.getElementById('afServicioCustom').style.display='block'">
        <option value="EPM Energía">EPM Energía</option>
        <option value="Agua">Agua</option>
        <option value="Gas Natural">Gas Natural</option>
        <option value="Internet/TV">Internet/TV</option>
        <option value="Telefonía">Telefonía</option>
        <option value="Predial">Predial</option>
        <option value="Administración">Administración</option>
        <option value="otro">Otro…</option>
      </select>
      <input class="form-control mt-2" id="afServicioCustom" placeholder="Nombre del servicio" style="display:none;">
    </div>
    <div class="form-group"><label>Monto * ($)</label><input type="number" class="form-control" id="afMonto" placeholder="150000"></div>
    <div class="form-row">
      <div class="form-group"><label>Fecha Vencimiento</label><input type="date" class="form-control" id="afVencimiento"></div>
      <div class="form-group"><label>Fecha Emisión</label><input type="date" class="form-control" id="afEmision"></div>
    </div>
  `, `<button class="btn btn-success" onclick="agregarFactura()">✅ Agregar</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function agregarFactura() {
  try {
    let servicio = document.getElementById('afServicio').value;
    if (servicio === 'otro') {
      servicio = document.getElementById('afServicioCustom').value.trim();
      if (!servicio) return toast('Ingresa el nombre del servicio', 'error');
    }
    const monto = parseFloat(document.getElementById('afMonto').value);
    if (!monto || monto <= 0) return toast('Monto debe ser positivo', 'error');

    const body = {
      telefono: document.getElementById('afTelefono').value,
      obligacion_id: document.getElementById('afObligacionId').value,
      servicio,
      monto,
      extraccion_estado: 'ok',
    };
    const venc = document.getElementById('afVencimiento').value;
    const emi = document.getElementById('afEmision').value;
    if (venc) body.fecha_vencimiento = venc;
    if (emi) body.fecha_emision = emi;

    await api('POST', '/facturas/captura', body);
    toast(`Factura "${servicio}" agregada ✅`, 'success');
    closeModal();
    verObligacion(body.obligacion_id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Validar Factura ───
function abrirValidarFactura(facturaId, montoActual) {
  openModal('Validar Factura', `
    <p class="text-sm text-muted mb-4">Confirmar que los datos de la factura son correctos.</p>
    <input type="hidden" id="vfId" value="${facturaId}">
    <div class="form-group"><label>Monto confirmado * ($)</label><input type="number" class="form-control" id="vfMonto" value="${montoActual}"></div>
    <div class="form-row">
      <div class="form-group"><label>Fecha Vencimiento</label><input type="date" class="form-control" id="vfVencimiento"></div>
      <div class="form-group"><label>Fecha Emisión</label><input type="date" class="form-control" id="vfEmision"></div>
    </div>
    <div class="form-group"><label>Observaciones</label><input class="form-control" id="vfObs" placeholder="Opcional"></div>
  `, `<button class="btn btn-success" onclick="validarFactura()">✅ Validar</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function validarFactura() {
  try {
    const id = document.getElementById('vfId').value;
    const body = {
      monto: parseFloat(document.getElementById('vfMonto').value),
    };
    const venc = document.getElementById('vfVencimiento').value;
    const emi = document.getElementById('vfEmision').value;
    const obs = document.getElementById('vfObs').value.trim();
    if (venc) body.fecha_vencimiento = venc;
    if (emi) body.fecha_emision = emi;
    if (obs) body.observaciones_admin = obs;
    if (!body.monto || body.monto <= 0) return toast('Monto requerido', 'error');

    await api('PUT', `/facturas/${id}/validar`, body);
    toast('Factura validada ✅', 'success');
    closeModal();
    // Reload current view
    const backBtn = document.querySelector('[onclick*="verObligacion"]');
    const oblMatch = document.querySelector('[onclick*="buscarObligaciones"]');
    // Try to re-render the current obligacion detail
    setTimeout(() => location.reload(), 300);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Rechazar Factura ───
function abrirRechazarFactura(facturaId) {
  openModal('Rechazar Factura', `
    <input type="hidden" id="rfId" value="${facturaId}">
    <div class="form-group"><label>Motivo de rechazo *</label><textarea class="form-control" id="rfMotivo" rows="3" placeholder="Explica por qué se rechaza..."></textarea></div>
  `, `<button class="btn btn-danger" onclick="rechazarFactura()">❌ Rechazar</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function rechazarFactura() {
  try {
    const id = document.getElementById('rfId').value;
    const motivo = document.getElementById('rfMotivo').value.trim();
    if (!motivo) return toast('Motivo requerido', 'error');
    await api('PUT', `/facturas/${id}/rechazar`, { motivo_rechazo: motivo });
    toast('Factura rechazada', 'info');
    closeModal();
    setTimeout(() => location.reload(), 300);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Crear Pago ───
function abrirCrearPago(facturaId, servicio, monto, obligacionId, telefono) {
  openModal('Crear Pago', `
    <p class="mb-4">Crear pago para <strong>${servicio}</strong> — <strong>${fmtMoney(monto)}</strong></p>
    <input type="hidden" id="cpFacturaId" value="${facturaId}">
    <input type="hidden" id="cpObligacionId" value="${obligacionId}">
    <input type="hidden" id="cpTelefono" value="${telefono}">
    <p class="text-sm text-muted">Se verificará saldo disponible del usuario para el periodo.</p>
  `, `<button class="btn btn-primary" onclick="crearPago()">💳 Crear Pago</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function crearPago() {
  try {
    const body = {
      telefono: document.getElementById('cpTelefono').value,
      factura_id: document.getElementById('cpFacturaId').value,
    };
    const res = await api('POST', '/pagos/crear', body);
    const pago = res.data;
    toast(`Pago creado (${pago.pago_id?.substring(0,8)}) — confirma para completar`, 'success');
    closeModal();

    // Offer to confirm immediately
    abrirConfirmarPago(pago.pago_id, pago.servicio || '', pago.monto, document.getElementById('cpObligacionId').value);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function abrirConfirmarPago(pagoId, servicio, monto, obligacionId) {
  openModal('Confirmar Pago', `
    <p class="mb-4">Confirmar pago de <strong>${servicio || 'servicio'}</strong> — <strong>${fmtMoney(monto)}</strong></p>
    <input type="hidden" id="cfpPagoId" value="${pagoId}">
    <input type="hidden" id="cfpObligacionId" value="${obligacionId}">
    <div class="form-group"><label>Proveedor de pago</label><input class="form-control" id="cfpProveedor" placeholder="Ej: PSE, Nequi, Bancolombia"></div>
    <div class="form-group"><label>Referencia</label><input class="form-control" id="cfpReferencia" placeholder="Número de referencia"></div>
    <div class="form-group"><label>URL Comprobante</label><input class="form-control" id="cfpComprobante" placeholder="https://..."></div>
  `, `<button class="btn btn-success" onclick="confirmarPago()">✅ Confirmar Pago</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function confirmarPago() {
  try {
    const pagoId = document.getElementById('cfpPagoId').value;
    const obligacionId = document.getElementById('cfpObligacionId').value;
    const body = {};
    const p = document.getElementById('cfpProveedor').value.trim();
    const r = document.getElementById('cfpReferencia').value.trim();
    const c = document.getElementById('cfpComprobante').value.trim();
    if (p) body.proveedor_pago = p;
    if (r) body.referencia_pago = r;
    if (c) body.comprobante_pago_url = c;

    const res = await api('PUT', `/pagos/${pagoId}/confirmar`, body);
    const data = res.data;

    if (data.obligacion_completada) {
      toast('🎉 ¡OBLIGACIÓN COMPLETADA! Todas las facturas pagadas', 'success');
    } else {
      toast('Pago confirmado ✅', 'success');
    }
    closeModal();
    if (obligacionId) {
      verObligacion(obligacionId);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ===========================================
//  RECARGAS
// ===========================================
async function moduleRecargas() {
  setContent(`
    <div class="card mb-4">
      <div class="card-header"><h3>Gestión de Recargas</h3><button class="btn btn-success btn-sm" onclick="abrirReportarRecarga()">➕ Reportar Recarga</button></div>
      <div class="card-body">
        <p class="text-sm text-muted">Las recargas son depósitos de saldo del usuario. Simula el bot reportando una recarga y luego apruébala como admin.</p>
      </div>
    </div>
    <div id="recargasList"></div>
  `);
}

function abrirReportarRecarga() {
  const now = new Date();
  const defPeriodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  openModal('Reportar Recarga (Simular Bot)', `
    <div class="form-group"><label>Teléfono *</label><input class="form-control" id="rrTelefono" placeholder="573001234567"></div>
    <div class="form-group"><label>Periodo *</label><input class="form-control" id="rrPeriodo" value="${defPeriodo}" placeholder="YYYY-MM-DD"></div>
    <div class="form-group"><label>Monto * ($)</label><input type="number" class="form-control" id="rrMonto" placeholder="500000"></div>
    <div class="form-group"><label>Comprobante URL *</label><input class="form-control" id="rrComprobante" value="https://ejemplo.com/comprobante.jpg" placeholder="URL del comprobante"></div>
    <div class="form-group"><label>Referencia Tx</label><input class="form-control" id="rrReferencia" placeholder="Opcional"></div>
  `, `<button class="btn btn-success" onclick="reportarRecarga()">📤 Reportar</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function reportarRecarga() {
  try {
    const body = {
      telefono: document.getElementById('rrTelefono').value.trim(),
      periodo: document.getElementById('rrPeriodo').value.trim(),
      monto: parseFloat(document.getElementById('rrMonto').value),
      comprobante_url: document.getElementById('rrComprobante').value.trim(),
    };
    const ref = document.getElementById('rrReferencia').value.trim();
    if (ref) body.referencia_tx = ref;
    if (!body.telefono || !body.periodo || !body.monto || !body.comprobante_url) return toast('Todos los campos requeridos', 'error');

    const res = await api('POST', '/recargas/reportar', body, true); // Use bot key
    toast('Recarga reportada ✅ — Ahora apruébala como admin', 'success');
    closeModal();
    // Show the recarga for approval
    mostrarRecargaParaAprobar(res.data);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function mostrarRecargaParaAprobar(recarga) {
  const container = document.getElementById('recargasList');
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Recarga Pendiente</h3>${badgeEstado(recarga.estado || 'reportada')}</div>
      <div class="card-body">
        <dl class="detail-grid">
          <dt>ID</dt><dd>${shortId(recarga.recarga_id || recarga.id)}</dd>
          <dt>Monto</dt><dd>${fmtMoney(recarga.monto)}</dd>
          <dt>Estado</dt><dd>${badgeEstado(recarga.estado || 'reportada')}</dd>
        </dl>
        <div class="mt-4 btn-group">
          <button class="btn btn-success" onclick="aprobarRecarga('${recarga.recarga_id || recarga.id}')">✅ Aprobar</button>
          <button class="btn btn-danger" onclick="abrirRechazarRecarga('${recarga.recarga_id || recarga.id}')">❌ Rechazar</button>
        </div>
      </div>
    </div>
  `;
}

async function aprobarRecarga(id) {
  try {
    await api('PUT', `/recargas/${id}/aprobar`, { observaciones_admin: 'Aprobada desde panel admin' });
    toast('Recarga aprobada ✅ — Saldo disponible actualizado', 'success');
    document.getElementById('recargasList').innerHTML = `
      <div class="card"><div class="card-body">${emptyState('✅', 'Recarga aprobada exitosamente. El saldo del usuario fue actualizado.')}</div></div>
    `;
  } catch (err) {
    toast(err.message, 'error');
  }
}

function abrirRechazarRecarga(id) {
  openModal('Rechazar Recarga', `
    <input type="hidden" id="rrcId" value="${id}">
    <div class="form-group"><label>Motivo *</label><textarea class="form-control" id="rrcMotivo" rows="3"></textarea></div>
  `, `<button class="btn btn-danger" onclick="rechazarRecargaConfirm()">❌ Rechazar</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function rechazarRecargaConfirm() {
  try {
    const id = document.getElementById('rrcId').value;
    const motivo = document.getElementById('rrcMotivo').value.trim();
    if (!motivo) return toast('Motivo requerido', 'error');
    await api('PUT', `/recargas/${id}/rechazar`, { motivo_rechazo: motivo });
    toast('Recarga rechazada', 'info');
    closeModal();
    document.getElementById('recargasList').innerHTML = `
      <div class="card"><div class="card-body">${emptyState('❌', 'Recarga rechazada.')}</div></div>
    `;
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ===========================================
//  REVISIONES
// ===========================================
async function moduleRevisiones() {
  loading();
  try {
    const res = await api('GET', '/revisiones?estado=pendiente');
    const revs = res.data || [];

    let html = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Estado</label>
          <select class="form-control" id="revEstado" onchange="filtrarRevisiones()">
            <option value="pendiente" selected>Pendientes</option>
            <option value="en_proceso">En Proceso</option>
            <option value="resuelta">Resueltas</option>
            <option value="descartada">Descartadas</option>
            <option value="">Todas</option>
          </select>
        </div>
      </div>
    `;

    if (revs.length === 0) {
      html += `<div class="card"><div class="card-body">${emptyState('✅', 'No hay revisiones pendientes')}</div></div>`;
    } else {
      html += `
        <div class="card">
          <div class="card-body">
            <div class="table-container">
              <table>
                <thead><tr>
                  <th>Tipo</th><th>Razón</th><th>Prioridad</th><th>Estado</th><th>Creada</th><th>Acciones</th>
                </tr></thead>
                <tbody>
                  ${revs.map(r => `
                    <tr>
                      <td>${r.tipo}</td>
                      <td class="text-sm">${r.razon || '—'}</td>
                      <td>${r.prioridad === 1 ? '<span class="badge badge-danger">Alta</span>' : '<span class="badge badge-warning">Media</span>'}</td>
                      <td>${badgeEstado(r.estado)}</td>
                      <td class="text-sm">${fmtDateTime(r.creado_en)}</td>
                      <td>
                        <div class="btn-group">
                          ${r.estado === 'pendiente' ? `<button class="btn btn-primary btn-sm" onclick="tomarRevision('${r.id}')">📋 Tomar</button>` : ''}
                          ${r.estado !== 'descartada' && r.estado !== 'resuelta' ? `<button class="btn btn-outline btn-sm" onclick="abrirDescartarRevision('${r.id}')">🗑 Descartar</button>` : ''}
                          ${r.factura_id ? `<button class="btn btn-outline btn-sm" onclick="irAFacturaDesdeRevision('${r.factura_id}')">👁 Ver Factura</button>` : ''}
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    setContent(html);
  } catch (err) {
    setContent(`<div class="card"><div class="card-body">${emptyState('⚠️', err.message)}</div></div>`);
  }
}

async function filtrarRevisiones() {
  const estado = document.getElementById('revEstado').value;
  try {
    let url = '/revisiones';
    if (estado) url += `?estado=${estado}`;
    const res = await api('GET', url);
    const revs = res.data || [];
    moduleRevisiones(); // Re-render
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function tomarRevision(id) {
  try {
    await api('PUT', `/revisiones/${id}/tomar`);
    toast('Revisión tomada ✅', 'success');
    moduleRevisiones();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function abrirDescartarRevision(id) {
  openModal('Descartar Revisión', `
    <input type="hidden" id="drId" value="${id}">
    <div class="form-group"><label>Motivo *</label><textarea class="form-control" id="drMotivo" rows="3"></textarea></div>
  `, `<button class="btn btn-danger" onclick="descartarRevision()">🗑 Descartar</button><button class="btn btn-outline" onclick="closeModal()">Cancelar</button>`);
}

async function descartarRevision() {
  try {
    const id = document.getElementById('drId').value;
    const motivo = document.getElementById('drMotivo').value.trim();
    if (!motivo) return toast('Motivo requerido', 'error');
    await api('PUT', `/revisiones/${id}/descartar`, { motivo });
    toast('Revisión descartada', 'info');
    closeModal();
    moduleRevisiones();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function irAFacturaDesdeRevision(facturaId) {
  // Try to find the obligacion that owns this factura
  toast('Buscando factura...', 'info');
}

// ===========================================
//  DISPONIBILIDAD
// ===========================================
async function moduleDisponibilidad() {
  const now = new Date();
  const defPeriodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  setContent(`
    <div class="card mb-4">
      <div class="card-header"><h3>Consultar Saldo Disponible</h3></div>
      <div class="card-body">
        <div class="form-inline">
          <div class="form-group" style="flex:1;">
            <label>Teléfono</label>
            <input type="text" class="form-control" id="dispTelefono" placeholder="573001234567">
          </div>
          <div class="form-group">
            <label>Periodo</label>
            <input class="form-control" id="dispPeriodo" value="${defPeriodo}" placeholder="YYYY-MM-DD">
          </div>
          <button class="btn btn-primary" onclick="consultarDisponibilidad()">📈 Consultar</button>
        </div>
      </div>
    </div>
    <div id="dispResult"></div>
  `);
}

async function consultarDisponibilidad() {
  const tel = document.getElementById('dispTelefono').value.trim();
  const per = document.getElementById('dispPeriodo').value.trim();
  if (!tel || !per) return toast('Teléfono y periodo requeridos', 'error');
  const container = document.getElementById('dispResult');
  container.innerHTML = '<div class="loading">Consultando</div>';
  try {
    const res = await api('GET', `/disponible?telefono=${tel}&periodo=${per}`);
    const d = res.data;
    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon green">💰</div>
          <div class="stat-info"><h4>${fmtMoney(d.total_recargas)}</h4><p>Total Recargas</p></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red">💸</div>
          <div class="stat-info"><h4>${fmtMoney(d.total_pagos)}</h4><p>Total Pagos</p></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">📊</div>
          <div class="stat-info"><h4>${fmtMoney(d.disponible)}</h4><p>Saldo Disponible</p></div>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <dl class="detail-grid">
            <dt>Periodo</dt><dd>${d.periodo}</dd>
            <dt>Usuario</dt><dd>${d.nombre || ''} ${d.apellido || ''}</dd>
          </dl>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body">${emptyState('⚠️', err.message)}</div></div>`;
  }
}

// ===========================================
//  Module Registry & Init
// ===========================================
const modules = {
  dashboard: moduleDashboard,
  usuarios: moduleUsuarios,
  obligaciones: moduleObligaciones,
  recargas: moduleRecargas,
  revisiones: moduleRevisiones,
  disponibilidad: moduleDisponibilidad,
};

// Init
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setInterval(checkHealth, 30000);
  navigate('dashboard');
});
