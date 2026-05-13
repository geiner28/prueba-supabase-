// ===========================================
// Disponibilidad - Service
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");

/**
 * Calcula disponible = recargas aprobadas - pagos pagados para un usuario.
 * El periodo se acepta por compatibilidad, pero el saldo es global y no se separa por mes.
 * Incluye fallback para facturas marcadas como 'pagada' manualmente sin fila en `pagos`.
 */
async function calcularDisponible(telefono, periodo) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const periodoNorm = typeof periodo === "string" && periodo.trim() ? String(periodo).slice(0, 10) : null;

  // Total recargas aprobadas globales
  const { data: recargas, error: recErr } = await supabase
    .from("recargas")
    .select("monto")
    .eq("usuario_id", usuario.usuario_id)
    .eq("estado", "aprobada");

  if (recErr) throw new Error(`Error consultando recargas: ${recErr.message}`);

  const totalRecargas = (recargas || []).reduce((sum, r) => sum + Number(r.monto), 0);

  const [{ data: pagos, error: pagErr }, { data: facturasPagadas, error: facErr }] = await Promise.all([
    // Total pagos pagados globales (a través de facturas)
    supabase
      .from("pagos")
      .select("monto_aplicado, factura_id")
      .eq("usuario_id", usuario.usuario_id)
      .eq("estado", "pagado"),
    // Fallback legacy/manual: facturas pagadas sin registro en tabla pagos
    supabase
      .from("facturas")
      .select("id, monto")
      .eq("usuario_id", usuario.usuario_id)
      .eq("estado", "pagada"),
  ]);

  if (pagErr) throw new Error(`Error consultando pagos: ${pagErr.message}`);
  if (facErr) throw new Error(`Error consultando facturas pagadas: ${facErr.message}`);

  const totalPagosTabla = (pagos || []).reduce((sum, p) => sum + Number(p.monto_aplicado || 0), 0);
  const facturasConPago = new Set((pagos || []).map((p) => p.factura_id).filter(Boolean));
  const totalPagosLegacy = (facturasPagadas || [])
    .filter((f) => !facturasConPago.has(f.id))
    .reduce((sum, f) => sum + Number(f.monto || 0), 0);

  const totalPagos = totalPagosTabla + totalPagosLegacy;

  const disponible = totalRecargas - totalPagos;

  return success({
    usuario_id: usuario.usuario_id,
    periodo: periodoNorm,
    alcance: "global",
    total_recargas_aprobadas: totalRecargas,
    total_pagos_pagados: totalPagos,
    disponible,
  });
}

module.exports = { calcularDisponible };
