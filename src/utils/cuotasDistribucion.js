// ===========================================
// Utilidades para Distribución de Cuotas
// Replica la lógica de solicitudes-recarga
// pero para cálculos en perfil de cliente
// ===========================================

const DIAS_ANTICIPACION_RECORDATORIO = 5;
const DIAS_SIN_VENCIMIENTO = 15;

/**
 * Calcula la fecha de recordatorio para una factura.
 * Si tiene fecha_vencimiento → fecha_vencimiento - 5 días
 * Si NO tiene fecha_vencimiento → creado_en + 15 días
 */
function calcularFechaRecordatorioFactura(factura) {
  if (factura.fecha_vencimiento) {
    return restarDias(factura.fecha_vencimiento, DIAS_ANTICIPACION_RECORDATORIO);
  } else {
    return sumarDias(factura.creado_en, DIAS_SIN_VENCIMIENTO);
  }
}

/**
 * Para plan control: la fecha límite es la fecha de vencimiento
 * más próxima de todas las facturas.
 * 
 * Para facturas sin fecha_vencimiento, se usa creado_en + 15 días.
 * Se toma la fecha más próxima entre todas las facturas.
 */
function calcularFechaLimiteCuota1(facturas, periodo) {
  if (!facturas || facturas.length === 0) {
    return periodo;
  }

  // Calcular fecha recordatorio para cada factura
  const fechasRecordatorio = facturas.map(f => ({
    factura: f,
    fechaRecordatorio: calcularFechaRecordatorioFactura(f)
  }));

  // Ordenar por fecha de recordatorio (la más próxima primero)
  fechasRecordatorio.sort((a, b) => new Date(a.fechaRecordatorio) - new Date(b.fechaRecordatorio));

  // La fecha límite es 5 días después del recordatorio más próximo
  return sumarDias(fechasRecordatorio[0].fechaRecordatorio, DIAS_ANTICIPACION_RECORDATORIO);
}

/**
 * Distribuye facturas en 2 cuotas basándose en ACUMULACIÓN DE MONTO
 * pero ASIGNA GRUPO (1 o 2) según la FECHA MÁS PRÓXIMA del vencimiento.
 * 
 * NUEVA LÓGICA (v3):
 * - Calcula acumulación al 50% por monto (igual que v2)
 * - PERO: Asigna a Grupo 1 o 2 basado en fecha vencimiento más próxima
 * - Grupo 1: Fecha más próxima vence días 1-15
 * - Grupo 2: Fecha más próxima vence días 16-31
 * 
 * Para facturas sin fecha_vencimiento, se usa fecha de recordatorio (creado_en + 15 días).
 */
function distribuirFacturasEnCuotas(facturas, periodo) {
  if (!facturas || facturas.length === 0) {
    return { 
      cuota1: { facturas: [], monto: 0, fechaLimite: periodo, fechaRecordatorio: periodo }, 
      cuota2: { facturas: [], monto: 0, fechaLimite: periodo, fechaRecordatorio: periodo } 
    };
  }

  // PASO 1: Crear lista de facturas con fecha_efectiva calculada
  const facturasConFecha = facturas.map(f => ({
    factura: f,
    fecha_efectiva: f.fecha_vencimiento || calcularFechaRecordatorioFactura(f)
  }));

  // PASO 2: Ordenar por fecha_efectiva (más pronto primero)
  facturasConFecha.sort((a, b) => 
    new Date(a.fecha_efectiva) - new Date(b.fecha_efectiva)
  );

  // PASO 3: Calcular punto de corte aproximadamente al 50% por monto
  const totalMonto = facturasConFecha.reduce((sum, item) => sum + Number(item.factura.monto || 0), 0);
  const mitad = totalMonto / 2;
  
  let montoAcumulado = 0;
  let indiceCorte = 0;
  
  for (let i = 0; i < facturasConFecha.length; i++) {
    montoAcumulado += Number(facturasConFecha[i].factura.monto || 0);
    indiceCorte = i;
    if (montoAcumulado >= mitad) break;
  }

  // PASO 4: Dividir en dos grupos por acumulación
  const primerosItems = facturasConFecha.slice(0, indiceCorte + 1);
  const segundosItems = facturasConFecha.slice(indiceCorte + 1);

  // PASO 5: Determinar cuál grupo (1 o 2) basado en fecha más próxima
  // Si todos los items están vacíos, retornar vacío
  if (primerosItems.length === 0 && segundosItems.length === 0) {
    return { 
      cuota1: { facturas: [], monto: 0, fechaLimite: periodo, fechaRecordatorio: periodo }, 
      cuota2: { facturas: [], monto: 0, fechaLimite: periodo, fechaRecordatorio: periodo } 
    };
  }

  // Función auxiliar para construir cuota
  const construirCuota = (items) => {
    if (items.length === 0) {
      return { facturas: [], monto: 0, fechaLimite: periodo, fechaRecordatorio: periodo };
    }
    
    // La fecha más próxima es la primera (está ordenada)
    const fechaMasProxima = items[0].fecha_efectiva;
    // La fecha más lejana es la última
    const fechaMasLejana = items[items.length - 1].fecha_efectiva;
    
    return {
      facturas: items.map(item => item.factura),
      monto: items.reduce((sum, item) => sum + Number(item.factura.monto || 0), 0),
      fechaLimite: fechaMasLejana,
      fechaRecordatorio: restarDias(fechaMasLejana, DIAS_ANTICIPACION_RECORDATORIO),
      fechaMasProxima: fechaMasProxima  // Para determinar grupo
    };
  };

  const cuotaTemp1 = construirCuota(primerosItems);
  const cuotaTemp2 = construirCuota(segundosItems);

  // PASO 6: Asignar a Grupo 1 o 2 basado en fecha más próxima
  let cuota1, cuota2;

  // CASO A: Solo cuota1 tiene facturas
  if (cuotaTemp1.facturas.length > 0 && cuotaTemp2.facturas.length === 0) {
    const dia1 = new Date(cuotaTemp1.fechaMasProxima + "T00:00:00Z").getUTCDate();
    
    if (dia1 <= 15) {
      cuota1 = cuotaTemp1;
      cuota2 = cuotaTemp2;
    } else {
      // Fecha más próxima es días 16-31 → va a Grupo 2
      cuota1 = cuotaTemp2;
      cuota2 = cuotaTemp1;
    }
  }
  // CASO B: Solo cuota2 tiene facturas
  else if (cuotaTemp1.facturas.length === 0 && cuotaTemp2.facturas.length > 0) {
    const dia2 = new Date(cuotaTemp2.fechaMasProxima + "T00:00:00Z").getUTCDate();
    
    if (dia2 <= 15) {
      cuota1 = cuotaTemp2;
      cuota2 = cuotaTemp1;
    } else {
      cuota1 = cuotaTemp1;
      cuota2 = cuotaTemp2;
    }
  }
  // CASO C: Ambas tienen facturas
  else if (cuotaTemp1.facturas.length > 0 && cuotaTemp2.facturas.length > 0) {
    const dia1 = new Date(cuotaTemp1.fechaMasProxima + "T00:00:00Z").getUTCDate();
    const dia2 = new Date(cuotaTemp2.fechaMasProxima + "T00:00:00Z").getUTCDate();

    if (dia1 <= 15 && dia2 > 15) {
      cuota1 = cuotaTemp1;
      cuota2 = cuotaTemp2;
    } else if (dia1 > 15 && dia2 <= 15) {
      cuota1 = cuotaTemp2;
      cuota2 = cuotaTemp1;
    } else if (dia1 <= 15 && dia2 <= 15) {
      cuota1 = cuotaTemp1;
      cuota2 = cuotaTemp2;
    } else {
      cuota1 = cuotaTemp1;
      cuota2 = cuotaTemp2;
    }
  }
  // CASO D: Ambas están vacías
  else {
    cuota1 = cuotaTemp1;
    cuota2 = cuotaTemp2;
  }

  // Limpiar propiedad temporal
  if (cuota1.fechaMasProxima) delete cuota1.fechaMasProxima;
  if (cuota2.fechaMasProxima) delete cuota2.fechaMasProxima;

  return { cuota1, cuota2 };
}

/**
 * Adapta las cuotas calculadas según programacion_recargas del usuario.
 * Maneja casos donde la cantidad de recargas no coincide con el plan.
 * 
 * Retorna:
 * {
 *   grupo1: { fecha, monto, estado? },
 *   grupo2: { fecha, monto, estado? } | null
 * }
 */
function adaptarCuotasAProgamacion(cuotasCalculadas, programacion, plan) {
  if (!cuotasCalculadas || !programacion) {
    return { grupo1: null, grupo2: null };
  }

  const { cuota1, cuota2 } = cuotasCalculadas;
  const { dia_1, dia_2, cantidad_recargas } = programacion;

  // CASO 1: Usuario configurado para 1 sola fecha de recarga
  if (cantidad_recargas === 1) {
    const montoTotal = (cuota1?.monto || 0) + (cuota2?.monto || 0);
    return {
      grupo1: {
        fecha: dia_1,
        monto: montoTotal,
        estado: "activo"
      },
      grupo2: null
    };
  }

  // CASO 2: Usuario configurado para 2 fechas de recarga
  if (cantidad_recargas === 2) {
    return {
      grupo1: {
        fecha: dia_1,
        monto: cuota1?.monto || 0,
        estado: "activo"
      },
      grupo2: {
        fecha: dia_2,
        monto: cuota2?.monto || 0,
        estado: "activo"
      }
    };
  }

  // Fallback
  return { grupo1: null, grupo2: null };
}

/**
 * Funciones auxiliares de fecha
 */
function restarDias(fechaStr, dias) {
  const fecha = new Date(fechaStr + "T00:00:00Z");
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return formatFecha(fecha);
}

function sumarDias(fechaStr, dias) {
  const fecha = new Date(fechaStr + "T00:00:00Z");
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return formatFecha(fecha);
}

function formatFecha(date) {
  return date.toISOString().split("T")[0];
}

module.exports = {
  distribuirFacturasEnCuotas,
  calcularFechaRecordatorioFactura,
  calcularFechaLimiteCuota1,
  adaptarCuotasAProgamacion,
  restarDias,
  sumarDias,
  formatFecha
};
