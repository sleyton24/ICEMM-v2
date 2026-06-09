// ─────────────────────────────────────────────────────────────────────────────
// Módulo: controlCostos
// Port VERBATIM de la lógica de control ppto-vs-real de ICEMM/informe_lq.py:294-318
// (calcular_variaciones). Pensado para la futura vista ControlCostosModule del
// monolito (Estrategia A de integración del módulo Control de Costos).
// NO conecta a PRESTO ni convierte UF: opera sobre montos en UF que el monolito YA
// tiene (presupuesto por categoría + real acumulado vía getReal). Mismas etiquetas
// de estado que el informe original.
// ─────────────────────────────────────────────────────────────────────────────

// Variación de una partida/categoría. variacionPct es null si el presupuesto es 0
// (mismo criterio que informe_lq.py: ppto_original != 0 else None).
export function variacionPartida(pptoUf, realUf) {
  const ppto = +pptoUf || 0;
  const real = +realUf || 0;
  const variacionUf = real - ppto;
  const variacionPct = ppto !== 0 ? (variacionUf / ppto) * 100 : null;
  return { variacionUf, variacionPct };
}

// Estado de control. Orden de evaluación IDÉNTICO a informe_lq.py:302-315:
//   real == 0           → 'SIN EJECUCION'
//   ppto == 0 (pct null)→ 'SOLO REAL'
//   pct > 15            → 'CRITICO'
//   pct > 5             → 'ALERTA'
//   pct >= -5           → 'EN CONTROL'
//   else                → 'FAVORABLE'
export function estadoControl(pptoUf, realUf) {
  const real = +realUf || 0;
  if (real === 0) return 'SIN EJECUCION';
  const { variacionPct } = variacionPartida(pptoUf, realUf);
  if (variacionPct === null) return 'SOLO REAL';
  if (variacionPct > 15) return 'CRITICO';
  if (variacionPct > 5) return 'ALERTA';
  if (variacionPct >= -5) return 'EN CONTROL';
  return 'FAVORABLE';
}

// Fila de control completa por partida/categoría.
export function controlPartida(pptoUf, realUf) {
  const { variacionUf, variacionPct } = variacionPartida(pptoUf, realUf);
  return {
    ppto: +pptoUf || 0,
    real: +realUf || 0,
    variacionUf,
    variacionPct,
    estado: estadoControl(pptoUf, realUf),
  };
}

// KPIs globales sobre un conjunto de partidas [{ ppto, real }]
// (espeja informe_lq.py:324-328: totales, variación y % de ejecución).
export function kpisControl(partidas) {
  const list = partidas || [];
  const pptoTotal = list.reduce((s, p) => s + (+p.ppto || 0), 0);
  const realTotal = list.reduce((s, p) => s + (+p.real || 0), 0);
  const variacionUf = realTotal - pptoTotal;
  const variacionPct = pptoTotal !== 0 ? (variacionUf / pptoTotal) * 100 : null;
  const pctEjecucion = pptoTotal !== 0 ? (realTotal / pptoTotal) * 100 : null;
  return { pptoTotal, realTotal, variacionUf, variacionPct, pctEjecucion };
}
