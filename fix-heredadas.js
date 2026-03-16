#!/usr/bin/env node
require('dotenv').config();
const supabase = require('./src/config/supabase');

(async () => {
  console.log('🔧 Actualizando facturas heredadas de abril...\n');

  // Actualizar facturas de abril para que tengan origen='auto'
  const { data, error } = await supabase
    .from('facturas')
    .update({ origen: 'auto' })
    .eq('periodo', '2026-04-01')
    .select('id, servicio, monto, estado, origen, etiqueta');
  
  if (error) {
    console.log('❌ Error:', error.message);
    process.exit(1);
  } else {
    console.log('✅ Actualizado', data?.length || 0, 'facturas de abril');
    console.log('\n📋 Facturas actualizadas:');
    data?.forEach(f => {
      console.log(`   • ${f.servicio} - $${f.monto} (origen: ${f.origen}, estado: ${f.estado})`);
    });
    console.log('\n✅ Listo. Ahora deberían aparecer con estado "Heredada (Sin validar)"\n');
  }
})();
