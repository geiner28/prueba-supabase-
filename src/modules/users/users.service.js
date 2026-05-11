// ===========================================
// Users - Service (Lógica de Negocio)
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { registrarAuditLog } = require("../../utils/auditLog");

function montoSuscripcionPorPlan(plan) {
  const planNorm = String(plan || "tranquilidad").toLowerCase();
  if (planNorm === "tranquilidad") return 10000;
  if (planNorm === "respaldo") return 20000;
  return 0;
}

function planTieneSuscripcion(plan) {
  const planNorm = String(plan || "tranquilidad").toLowerCase();
  return planNorm === "tranquilidad" || planNorm === "respaldo";
}

function esPrimerMesUsuario(creadoEn, periodo) {
  if (!creadoEn || !periodo) return true;
  const creado = new Date(creadoEn);
  if (Number.isNaN(creado.getTime())) return true;
  const periodoStr = String(periodo).slice(0, 7);
  const creadoStr = `${creado.getFullYear()}-${String(creado.getMonth() + 1).padStart(2, "0")}`;
  return creadoStr === periodoStr;
}

/**
 * Listar usuarios con paginación y búsqueda.
 */
async function listUsers(query = {}) {
  const page = parseInt(query.page, 10) || 1;
  const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;
  const search = query.search || null;
  const plan = query.plan || null;

  let dbQuery = supabase
    .from("usuarios")
    .select("*, ajustes_usuario(*)", { count: "exact" })
    .order("creado_en", { ascending: false })
    .range(offset, offset + limit - 1);

  if (plan) dbQuery = dbQuery.eq("plan", plan);
  if (search) {
    dbQuery = dbQuery.or(`nombre.ilike.%${search}%,telefono.ilike.%${search}%,correo.ilike.%${search}%`);
  }

  const { data, error, count } = await dbQuery;
  if (error) throw new Error(`Error listando usuarios: ${error.message}`);

  return success({
    usuarios: data,
    total: count,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}

/**
 * Upsert: busca por teléfono; si existe actualiza, si no crea usuario + ajustes.
 */
async function upsertUser({ telefono, nombre, apellido, correo, tipo_identificacion, numero_identificacion, ciudad, direccion }) {
  // 1. Buscar usuario existente
  const { data: existing, error: findErr } = await supabase
    .from("usuarios")
    .select("*")
    .eq("telefono", telefono)
    .single();

  if (findErr && findErr.code !== "PGRST116") {
    // PGRST116 = no rows, lo cual es esperado si no existe
    throw new Error(`Error buscando usuario: ${findErr.message}`);
  }

  if (existing) {
    // Actualizar solo campos enviados (no sobrescribir con null)
    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (apellido !== undefined) updates.apellido = apellido;
    if (correo !== undefined) updates.correo = correo;
    if (tipo_identificacion !== undefined) updates.tipo_identificacion = tipo_identificacion;
    if (numero_identificacion !== undefined) updates.numero_identificacion = numero_identificacion;
    if (ciudad !== undefined) updates.ciudad = ciudad;
    if (direccion !== undefined) updates.direccion = direccion;

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabase
        .from("usuarios")
        .update(updates)
        .eq("id", existing.id);

      if (updateErr) throw new Error(`Error actualizando usuario: ${updateErr.message}`);
    }

    return success({ usuario_id: existing.id, creado: false });
  }

  // 2. Crear usuario nuevo
  const { data: newUser, error: createErr } = await supabase
    .from("usuarios")
    .insert({
      telefono,
      nombre: nombre || telefono,
      apellido,
      correo,
      tipo_identificacion: tipo_identificacion || null,
      numero_identificacion: numero_identificacion || null,
      ciudad: ciudad || null,
      direccion: direccion || null,
      plan: "tranquilidad",
    })
    .select()
    .single();

  if (createErr) {
    if (createErr.code === "23505") {
      throw Object.assign(new Error("Ya existe un usuario con ese número de teléfono"), { statusCode: 409 });
    }
    throw new Error(`Error creando usuario: ${createErr.message}`);
  }

  // 3. Crear ajustes por defecto
  const { error: ajustesErr } = await supabase
    .from("ajustes_usuario")
    .insert({ usuario_id: newUser.id });

  if (ajustesErr) {
    console.error("[USERS] Error creando ajustes_usuario:", ajustesErr.message);
  }

  // 4. Crear programación de recargas por defecto según el plan
  const plan = newUser.plan || "tranquilidad";
  const esPlanDoble = plan === "tranquilidad" || plan === "respaldo";
  const programacionData = {
    usuario_id: newUser.id,
    cantidad_recargas: esPlanDoble ? 2 : 1,
    dia_1: 1,
    dia_2: esPlanDoble ? 15 : null,
  };

  const { error: progErr } = await supabase
    .from("programacion_recargas")
    .insert(programacionData);

  if (progErr) {
    console.error("[USERS] Error creando programacion_recargas:", progErr.message);
  }

  // 5. Crear "Obligación 0" SOLO para planes con suscripción (tranquilidad/respaldo)
  if (planTieneSuscripcion(plan)) {
    try {
      await crearSuscripcionInicial(newUser.id, plan, newUser.creado_en);
    } catch (susErr) {
      console.error("[USERS] Error creando suscripción inicial:", susErr.message);
    }
  }

  return success({ usuario_id: newUser.id, creado: true }, 201);
}

/**
 * Crear "Obligación 0" — la suscripción DeOne del usuario:
 * - Una obligación con tipo_referencia='suscripcion' (receptor='DeOne', grupo=1, monto=0)
 * - Una factura asociada (también monto 0, sin_validar / pendiente)
 *
 * Se invoca al crear el usuario Y cuando cambia de plan (para próximo mes).
 * El parámetro periodoForzado se usa cuando cambia de plan (para generar suscripción del próximo mes).
 */
async function crearSuscripcionInicial(usuarioId, plan, creadoEn = null, periodoForzado = null) {
  if (!planTieneSuscripcion(plan)) {
    return null;
  }

  const hoy = new Date();
  const periodo = periodoForzado || `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const planLabel = String(plan || "tranquilidad").toLowerCase();
  const montoPlan = montoSuscripcionPorPlan(planLabel);
  const montoSuscripcion = esPrimerMesUsuario(creadoEn, periodo) ? 0 : montoPlan;
  const facturaEstado = montoSuscripcion === 0 ? "pagada" : "pendiente";
  const obligacionEstado = montoSuscripcion === 0 ? "completada" : "activa";
  const facturasPagadas = montoSuscripcion === 0 ? 1 : 0;
  const montoPagado = montoSuscripcion === 0 ? montoSuscripcion : 0;

  const { data: oblExistente } = await supabase
    .from("obligaciones")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("tipo_referencia", "suscripcion")
    .eq("periodo", periodo)
    .limit(1);

  // Si existe obligación de suscripción para este período, actualizar su plan y monto
  // (usado cuando cambias de plan a mitad de mes)
  if (oblExistente && oblExistente.length > 0) {
    const oblId = oblExistente[0].id;
    
    // Actualizar descripción y número de referencia del plan
    await supabase
      .from("obligaciones")
      .update({
        descripcion: `Suscripción DeOne — ${planLabel}`,
        numero_referencia: planLabel,
        monto_total: montoSuscripcion,
        estado: obligacionEstado,
      })
      .eq("id", oblId);

    // Actualizar factura asociada
    await supabase
      .from("facturas")
      .update({
        monto: montoSuscripcion,
        estado: facturaEstado,
        etiqueta: planLabel,
        referencia_pago: planLabel,
      })
      .eq("obligacion_id", oblId)
      .eq("tipo_referencia", "suscripcion");

    return oblId;
  }

  const { data: nuevaObl, error: oblErr } = await supabase
    .from("obligaciones")
    .insert({
      usuario_id: usuarioId,
      descripcion: `Suscripción DeOne — ${planLabel}`,
      servicio: "Suscripción DeOne",
      tipo_referencia: "suscripcion",
      numero_referencia: planLabel,
      receptor: "DeOne",
      grupo: 1,
      periodicidad: "mensual",
      periodo,
      monto_total: montoSuscripcion,
      monto_pagado: montoPagado,
      total_facturas: 1,
      facturas_pagadas: facturasPagadas,
      estado: obligacionEstado,
      completada_en: obligacionEstado === "completada" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (oblErr) throw new Error(`Error creando obligación de suscripción: ${oblErr.message}`);

  const { error: facErr } = await supabase
    .from("facturas")
    .insert({
      usuario_id: usuarioId,
      obligacion_id: nuevaObl.id,
      servicio: "Suscripción DeOne",
      etiqueta: planLabel,
      periodo,
      monto: montoSuscripcion,
      estado: facturaEstado,
      validacion_estado: "validada",
      validada_en: new Date().toISOString(),
      origen: "auto",
      tipo_referencia: "suscripcion",
      referencia_pago: planLabel,
      grupo: 1,
    });

  if (facErr) {
    console.error("[USERS] Error creando factura suscripción:", facErr.message);
  }

  return nuevaObl.id;
}

/**
 * Actualizar el plan de un usuario
 */
async function updateUserPlan({ telefono, plan }) {
  // 1. Buscar usuario existente
  const { data: existing, error: findErr } = await supabase
    .from("usuarios")
    .select("*")
    .eq("telefono", telefono)
    .single();

  if (findErr || !existing) {
    return errors.notFound(`Usuario con teléfono ${telefono} no encontrado`);
  }

  // Si el plan no cambió, no hacer nada
  if (existing.plan === plan) {
    return success({
      usuario_id: existing.id,
      telefono: existing.telefono,
      plan_anterior: existing.plan,
      plan_nuevo: plan,
      actualizado_en: new Date().toISOString(),
      mensaje: "El usuario ya tiene este plan"
    });
  }

  // 2. Actualizar plan
  const { data: updated, error: updateErr } = await supabase
    .from("usuarios")
    .update({ plan })
    .eq("id", existing.id)
    .select()
    .single();

  if (updateErr) throw new Error(`Error actualizando plan: ${updateErr.message}`);

  // 3. Generar obligación de suscripción para el próximo mes
  // Cuando cambia de plan, se cobra inmediatamente el nuevo plan (no gratis)
  try {
    const hoy = new Date();
    const proximoMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    const periodoProximo = `${proximoMes.getFullYear()}-${String(proximoMes.getMonth() + 1).padStart(2, "0")}-01`;
    
    // Crear obligación de suscripción para el próximo mes con el nuevo plan
    // NO es gratis porque es cambio de plan, no nuevo usuario
    await crearSuscripcionInicial(updated.id, plan, updated.creado_en, periodoProximo);
    
    console.log(`[USERS] Obligación de suscripción generada para ${telefono} con nuevo plan ${plan}`);
  } catch (err) {
    console.error("[USERS] Error generando suscripción al cambiar plan:", err.message);
    // No fallar si hay error en suscripción, solo loguear
  }

  return success({
    usuario_id: updated.id,
    telefono: updated.telefono,
    plan_anterior: existing.plan,
    plan_nuevo: updated.plan,
    actualizado_en: updated.updated_at,
    suscripcion_proxima_generada: true
  });
}

/**
 * Obtener usuario por teléfono con ajustes.
 */
async function getUserByTelefono(telefono) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*, ajustes_usuario(*)")
    .eq("telefono", telefono)
    .single();

  if (error || !data) {
    return errors.notFound(`Usuario con teléfono ${telefono} no encontrado`);
  }

  return success(data);
}

/**
 * Eliminar usuario de forma definitiva (hard delete).
 * Siempre elimina el usuario y todos sus datos relacionados.
 */
async function deleteUser({ id, telefono, actor }) {
  // Resolver usuario por id o telefono
  let query = supabase.from("usuarios").select("*");
  if (id) query = query.eq("id", id);
  else if (telefono) query = query.eq("telefono", telefono);
  else return errors.badRequest("Debe indicar id o telefono");

  const { data: usuario, error: findErr } = await query.single();
  if (findErr || !usuario) return errors.notFound("Usuario no encontrado");

  // Obtener IDs relacionados para limpieza explícita
  const [{ data: obligaciones, error: oblsErr }, { data: facturas, error: facErr }, { data: recargas, error: recErr }] = await Promise.all([
    supabase.from("obligaciones").select("id").eq("usuario_id", usuario.id),
    supabase.from("facturas").select("id").eq("usuario_id", usuario.id),
    supabase.from("recargas").select("id").eq("usuario_id", usuario.id),
  ]);

  if (oblsErr) throw new Error(`Error consultando obligaciones del usuario: ${oblsErr.message}`);
  if (facErr) throw new Error(`Error consultando facturas del usuario: ${facErr.message}`);
  if (recErr) throw new Error(`Error consultando recargas del usuario: ${recErr.message}`);

  const obligacionIds = (obligaciones || []).map((o) => o.id);
  const facturaIds = (facturas || []).map((f) => f.id);
  const recargaIds = (recargas || []).map((r) => r.id);

  // 1) Eliminar notificaciones del usuario
  const { error: notiErr } = await supabase.from("notificaciones").delete().eq("usuario_id", usuario.id);
  if (notiErr) throw new Error(`Error eliminando notificaciones del usuario: ${notiErr.message}`);

  // Limpiar historial administrativo directo del usuario (si existe)
  const { error: auditErr } = await supabase
    .from("audit_log")
    .delete()
    .eq("entidad", "usuarios")
    .eq("entidad_id", usuario.id);
  if (auditErr) throw new Error(`Error eliminando audit log del usuario: ${auditErr.message}`);

  // 2) Eliminar revisiones relacionadas a facturas/recargas y por usuario
  if (facturaIds.length > 0) {
    const { error: revFactErr } = await supabase.from("revisiones_admin").delete().in("factura_id", facturaIds);
    if (revFactErr) throw new Error(`Error eliminando revisiones de facturas: ${revFactErr.message}`);
  }
  if (recargaIds.length > 0) {
    const { error: revRecErr } = await supabase.from("revisiones_admin").delete().in("recarga_id", recargaIds);
    if (revRecErr) throw new Error(`Error eliminando revisiones de recargas: ${revRecErr.message}`);
  }
  const { error: revUserErr } = await supabase.from("revisiones_admin").delete().eq("usuario_id", usuario.id);
  if (revUserErr) throw new Error(`Error eliminando revisiones del usuario: ${revUserErr.message}`);

  // 3) Eliminar solicitudes de recarga relacionadas
  if (obligacionIds.length > 0) {
    const { error: solOblErr } = await supabase.from("solicitudes_recarga").delete().in("obligacion_id", obligacionIds);
    if (solOblErr) throw new Error(`Error eliminando solicitudes por obligación: ${solOblErr.message}`);
  }
  const { error: solUserErr } = await supabase.from("solicitudes_recarga").delete().eq("usuario_id", usuario.id);
  if (solUserErr) throw new Error(`Error eliminando solicitudes del usuario: ${solUserErr.message}`);

  // 4) Eliminar PAGOS PRIMERO (antes de facturas, porque factura_id tiene ON DELETE RESTRICT)
  const { error: pagosErr } = await supabase.from("pagos").delete().eq("usuario_id", usuario.id);
  if (pagosErr) throw new Error(`Error eliminando pagos del usuario: ${pagosErr.message}`);

  // 5) Eliminar facturas y recargas (después de pagos, por la FK)
  const { error: delFactErr } = await supabase.from("facturas").delete().eq("usuario_id", usuario.id);
  if (delFactErr) throw new Error(`Error eliminando facturas del usuario: ${delFactErr.message}`);

  const { error: delRecErr } = await supabase.from("recargas").delete().eq("usuario_id", usuario.id);
  if (delRecErr) throw new Error(`Error eliminando recargas del usuario: ${delRecErr.message}`);

  // 6) Eliminar obligaciones
  const { error: delOblErr } = await supabase.from("obligaciones").delete().eq("usuario_id", usuario.id);
  if (delOblErr) throw new Error(`Error eliminando obligaciones del usuario: ${delOblErr.message}`);

  // 7) Eliminar configuración/ajustes
  const { error: delProgErr } = await supabase.from("programacion_recargas").delete().eq("usuario_id", usuario.id);
  if (delProgErr) throw new Error(`Error eliminando programación de recargas: ${delProgErr.message}`);

  const { error: delAjustesErr } = await supabase.from("ajustes_usuario").delete().eq("usuario_id", usuario.id);
  if (delAjustesErr) throw new Error(`Error eliminando ajustes del usuario: ${delAjustesErr.message}`);

  // 8) Eliminar usuario (PostgreSQL ejecutará cascada ON DELETE CASCADE para pagos con usuario_id)
  const { error: delUserErr } = await supabase.from("usuarios").delete().eq("id", usuario.id);
  if (delUserErr) throw new Error(`Error eliminando usuario: ${delUserErr.message}`);

  await registrarAuditLog({
    actor_tipo: actor || "admin",
    accion: "hard_delete_usuario",
    entidad: "usuarios",
    entidad_id: usuario.id,
    antes: usuario,
  });

  return success({
    usuario_id: usuario.id,
    telefono: usuario.telefono,
    modo: "hard",
    eliminado: true,
    cascada: true,
  });
}

module.exports = { listUsers, upsertUser, updateUserPlan, getUserByTelefono, deleteUser, crearSuscripcionInicial };
