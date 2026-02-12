// ===========================================
// Normalizador de Periodo (siempre YYYY-MM-01)
// ===========================================

/**
 * Normaliza una fecha a primer día del mes (YYYY-MM-01).
 * Acepta: "2026-02-10", "2026-02-01", Date object
 */
function normalizarPeriodo(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

module.exports = { normalizarPeriodo };
