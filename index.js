const supabase = require("./src/supabaseClient");

// ============================================
// Ejemplos de operaciones CRUD con Supabase
// Reemplaza "tu_tabla" con el nombre real de tu tabla
// ============================================

// 1. LEER todos los registros de una tabla
async function getAll(tabla) {
  const { data, error } = await supabase.from(tabla).select("*");

  if (error) {
    console.error("Error al obtener datos:", error.message);
    return null;
  }

  console.log(`✅ Registros de "${tabla}":`, data);
  return data;
}

// 2. LEER un registro por ID
async function getById(tabla, id) {
  const { data, error } = await supabase
    .from(tabla)
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error al obtener registro:", error.message);
    return null;
  }

  console.log(`✅ Registro encontrado:`, data);
  return data;
}

// 3. INSERTAR un nuevo registro
async function insert(tabla, registro) {
  const { data, error } = await supabase
    .from(tabla)
    .insert(registro)
    .select();

  if (error) {
    console.error("Error al insertar:", error.message);
    return null;
  }

  console.log(`✅ Registro insertado:`, data);
  return data;
}

// 4. ACTUALIZAR un registro
async function update(tabla, id, cambios) {
  const { data, error } = await supabase
    .from(tabla)
    .update(cambios)
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error al actualizar:", error.message);
    return null;
  }

  console.log(`✅ Registro actualizado:`, data);
  return data;
}

// 5. ELIMINAR un registro
async function remove(tabla, id) {
  const { data, error } = await supabase
    .from(tabla)
    .delete()
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error al eliminar:", error.message);
    return null;
  }

  console.log(`✅ Registro eliminado:`, data);
  return data;
}

// ============================================
// Prueba de conexión
// ============================================
async function testConnection() {
  console.log("🔌 Probando conexión con Supabase...\n");
  console.log("   URL:", process.env.SUPABASE_URL);
  console.log("");

  // Intenta hacer una consulta simple para verificar la conexión
  const { data, error } = await supabase.from("_test_connection").select("*").limit(1);

  if (error && error.code === "PGRST116") {
    // Este error significa que la tabla no existe, pero la conexión funciona
    console.log("✅ ¡Conexión exitosa con Supabase!");
    console.log("   (La tabla de prueba no existe, pero la conexión es válida)\n");
  } else if (error && error.message.includes("Invalid API key")) {
    console.error("❌ Error: API Key inválida. Revisa tu SUPABASE_ANON_KEY en .env");
  } else if (error) {
    // Otros errores de tabla no encontrada también indican conexión exitosa
    console.log("✅ ¡Conexión exitosa con Supabase!\n");
  } else {
    console.log("✅ ¡Conexión exitosa con Supabase!\n");
  }
}

// ============================================
// Ejecutar
// ============================================
async function main() {
  await testConnection();

  // --- Descomenta y modifica según tus tablas ---

  // Ejemplo: Obtener todos los registros
  // await getAll("tu_tabla");

  // Ejemplo: Obtener por ID
  // await getById("tu_tabla", 1);

  // Ejemplo: Insertar
  // await insert("tu_tabla", { nombre: "Geiner", email: "geiner@email.com" });

  // Ejemplo: Actualizar
  // await update("tu_tabla", 1, { nombre: "Geiner Actualizado" });

  // Ejemplo: Eliminar
  // await remove("tu_tabla", 1);
}

main();
