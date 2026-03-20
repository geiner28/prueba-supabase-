/**
 * ==============================================================
 *  LIMPIEZA DE BASE DE DATOS - DeOne
 *  Elimina TODOS los datos EXCEPTO los relacionados a:
 *  ANNE, CAMILO, TOMÁS, DANIELA, MARICELA
 * ==============================================================
 *
 *  USO:
 *    node limpiar-db.js --dry-run    (solo muestra qué se borraría)
 *    node limpiar-db.js --execute    (ejecuta la limpieza real)
 *
 *  Requiere el .env con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * ==============================================================
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// ── Config ──────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERROR: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Nombres protegidos (comparación case-insensitive)
const NOMBRES_PROTEGIDOS = ["ANNE", "CAMILO", "TOMÁS", "TOMAS", "DANIELA", "MARICELA"];

// Orden correcto de eliminación respetando Foreign Keys
// (tablas hijas primero, tablas padres después)
const TABLAS_CON_USUARIO_ID = [
  "revisiones_admin",       // → facturas, recargas, usuarios
  "pagos",                  // → facturas, recargas, usuarios
  "solicitudes_recarga",    // → obligaciones, usuarios
  "facturas",               // → obligaciones, usuarios
  "recargas",               // → usuarios
  "obligaciones",           // → usuarios
  "notificaciones",         // → usuarios (nullable)
  "programacion_recargas",  // → usuarios
  "ajustes_usuario",        // → usuarios
];

// ── Helpers ─────────────────────────────────────────────────────

async function obtenerUsuariosProtegidos() {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, apellido, telefono");

  if (error) throw new Error(`Error al consultar usuarios: ${error.message}`);

  const protegidos = data.filter((u) =>
    NOMBRES_PROTEGIDOS.includes(u.nombre.toUpperCase())
  );

  return { todos: data, protegidos };
}

async function contarRegistros(tabla) {
  const { count, error } = await supabase
    .from(tabla)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`Error al contar ${tabla}: ${error.message}`);
  return count || 0;
}

async function contarRegistrosProtegidos(tabla, idsProtegidos, campo = "usuario_id") {
  if (idsProtegidos.length === 0) return 0;
  const { count, error } = await supabase
    .from(tabla)
    .select("*", { count: "exact", head: true })
    .in(campo, idsProtegidos);
  if (error) return 0; // campo puede no existir
  return count || 0;
}

async function contarABorrar(tabla, idsProtegidos, campo = "usuario_id") {
  const total = await contarRegistros(tabla);
  const protegidos = await contarRegistrosProtegidos(tabla, idsProtegidos, campo);
  return { total, protegidos, aBorrar: total - protegidos };
}

async function eliminarNoProtegidos(tabla, idsProtegidos, campo = "usuario_id") {
  // Para tablas donde el campo puede ser NULL (notificaciones),
  // primero eliminar los NULL y luego los no protegidos
  if (campo === "usuario_id") {
    // Eliminar filas con usuario_id NULL (no pertenecen a nadie)
    const { error: errNull } = await supabase
      .from(tabla)
      .delete()
      .is(campo, null);
    if (errNull && !errNull.message.includes("0 rows")) {
      // Ignorar si la columna no es nullable
    }
  }

  if (idsProtegidos.length === 0) {
    // No hay usuarios protegidos - borrar todo
    const { error } = await supabase.from(tabla).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(`Error al limpiar ${tabla}: ${error.message}`);
    return;
  }

  // Supabase JS: .not('campo', 'in', '(uuid1,uuid2,...)')
  const inList = `(${idsProtegidos.join(",")})`;
  const { error } = await supabase
    .from(tabla)
    .delete()
    .not(campo, "in", inList);

  if (error) throw new Error(`Error al limpiar ${tabla}: ${error.message}`);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2];

  if (!mode || (mode !== "--dry-run" && mode !== "--execute")) {
    console.log("Uso:");
    console.log("  node limpiar-db.js --dry-run    (vista previa, no borra nada)");
    console.log("  node limpiar-db.js --execute    (ejecuta la limpieza)");
    process.exit(0);
  }

  const isDryRun = mode === "--dry-run";

  console.log("=".repeat(60));
  console.log(isDryRun ? "  MODO: DRY-RUN (solo vista previa)" : "  MODO: EJECUCIÓN REAL");
  console.log("=".repeat(60));
  console.log();

  // ── Paso 1: Identificar usuarios protegidos ──
  console.log("🔍 Buscando usuarios protegidos...\n");
  const { todos, protegidos } = await obtenerUsuariosProtegidos();

  console.log(`  Total usuarios en BD: ${todos.length}`);
  console.log(`  Usuarios protegidos:  ${protegidos.length}`);
  console.log(`  Usuarios a eliminar:  ${todos.length - protegidos.length}\n`);

  if (protegidos.length === 0) {
    console.error("⚠️  ADVERTENCIA: No se encontró NINGUNO de los usuarios protegidos.");
    console.error("   Nombres buscados:", NOMBRES_PROTEGIDOS.join(", "));
    console.error("   Abortando para evitar borrar todo.");
    process.exit(1);
  }

  console.log("  Usuarios que se CONSERVAN:");
  for (const u of protegidos) {
    console.log(`    ✅ ${u.nombre} ${u.apellido || ""} (tel: ${u.telefono}, id: ${u.id})`);
  }
  console.log();

  const aBorrar = todos.filter((u) => !protegidos.find((p) => p.id === u.id));
  if (aBorrar.length > 0) {
    console.log("  Usuarios que se ELIMINARÁN:");
    for (const u of aBorrar) {
      console.log(`    ❌ ${u.nombre} ${u.apellido || ""} (tel: ${u.telefono}, id: ${u.id})`);
    }
    console.log();
  }

  const idsProtegidos = protegidos.map((u) => u.id);

  // ── Paso 2: Resumen de lo que se borraría ──
  console.log("📊 Resumen por tabla:\n");
  console.log("  Tabla                     | Total | Conservar | Borrar");
  console.log("  " + "-".repeat(56));

  const resumen = [];

  for (const tabla of TABLAS_CON_USUARIO_ID) {
    const info = await contarABorrar(tabla, idsProtegidos);
    resumen.push({ tabla, ...info });
    console.log(
      `  ${tabla.padEnd(27)}| ${String(info.total).padStart(5)} | ${String(info.protegidos).padStart(9)} | ${String(info.aBorrar).padStart(6)}`
    );
  }

  // audit_log (usa actor_id, no usuario_id, y puede no tener FK)
  const auditInfo = await contarABorrar("audit_log", idsProtegidos, "actor_id");
  resumen.push({ tabla: "audit_log", ...auditInfo });
  console.log(
    `  ${"audit_log".padEnd(27)}| ${String(auditInfo.total).padStart(5)} | ${String(auditInfo.protegidos).padStart(9)} | ${String(auditInfo.aBorrar).padStart(6)}`
  );

  // usuarios
  const usrInfo = {
    total: todos.length,
    protegidos: protegidos.length,
    aBorrar: todos.length - protegidos.length,
  };
  resumen.push({ tabla: "usuarios", ...usrInfo });
  console.log(
    `  ${"usuarios".padEnd(27)}| ${String(usrInfo.total).padStart(5)} | ${String(usrInfo.protegidos).padStart(9)} | ${String(usrInfo.aBorrar).padStart(6)}`
  );

  console.log("  " + "-".repeat(56));
  const totalBorrar = resumen.reduce((acc, r) => acc + r.aBorrar, 0);
  const totalConservar = resumen.reduce((acc, r) => acc + r.protegidos, 0);
  console.log(
    `  ${"TOTAL".padEnd(27)}|       | ${String(totalConservar).padStart(9)} | ${String(totalBorrar).padStart(6)}`
  );
  console.log();

  if (isDryRun) {
    console.log("✅ Dry-run completo. Ningún dato fue modificado.");
    console.log("   Para ejecutar la limpieza real, usa: node limpiar-db.js --execute");
    process.exit(0);
  }

  // ── Paso 3: Confirmación y ejecución ──
  console.log("⚠️  EJECUTANDO LIMPIEZA REAL...\n");

  // Eliminar tablas hijas primero (orden FK)
  for (const tabla of TABLAS_CON_USUARIO_ID) {
    process.stdout.write(`  Limpiando ${tabla}...`);
    try {
      await eliminarNoProtegidos(tabla, idsProtegidos);
      const restantes = await contarRegistros(tabla);
      console.log(` ✅ (${restantes} registros conservados)`);
    } catch (err) {
      console.log(` ❌ ERROR: ${err.message}`);
    }
  }

  // audit_log
  process.stdout.write("  Limpiando audit_log...");
  try {
    await eliminarNoProtegidos("audit_log", idsProtegidos, "actor_id");
    const restantes = await contarRegistros("audit_log");
    console.log(` ✅ (${restantes} registros conservados)`);
  } catch (err) {
    console.log(` ❌ ERROR: ${err.message}`);
  }

  // Finalmente, eliminar usuarios no protegidos
  process.stdout.write("  Limpiando usuarios...");
  try {
    if (idsProtegidos.length > 0) {
      const inList = `(${idsProtegidos.join(",")})`;
      const { error } = await supabase
        .from("usuarios")
        .delete()
        .not("id", "in", inList);
      if (error) throw new Error(error.message);
    }
    const restantes = await contarRegistros("usuarios");
    console.log(` ✅ (${restantes} usuarios conservados)`);
  } catch (err) {
    console.log(` ❌ ERROR: ${err.message}`);
  }

  // ── Paso 4: Verificación final ──
  console.log("\n📋 Verificación final:\n");

  const { data: usuariosFinales } = await supabase
    .from("usuarios")
    .select("nombre, apellido, telefono");

  console.log("  Usuarios restantes en la BD:");
  for (const u of (usuariosFinales || [])) {
    console.log(`    ✅ ${u.nombre} ${u.apellido || ""} (tel: ${u.telefono})`);
  }

  console.log("\n  Registros restantes por tabla:");
  for (const tabla of [...TABLAS_CON_USUARIO_ID, "audit_log"]) {
    const c = await contarRegistros(tabla);
    console.log(`    ${tabla}: ${c}`);
  }

  console.log("\n✅ Limpieza completada exitosamente.");
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err.message);
  process.exit(1);
});
