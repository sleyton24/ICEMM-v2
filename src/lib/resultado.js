// ============================================================================
// resultado.js — Biblioteca de cálculo PURA (golden master del monolito ICEMM)
// ----------------------------------------------------------------------------
// Extraído VERBATIM del monolito fase1_proyectos.html (módulo Resultado/Informe).
// Montos en UF. NO se "arregla" ningún bug ni se cambia ningún redondeo: estas
// funciones FIJAN el comportamiento actual para que la futura modularización no
// altere ningún resultado.
//
// Origen exacto en el monolito:
//   - subtractRows()  línea ~7097  => cells[m] = { ..., proy: a[m].proy - b[m].proy }
//   - sumRowsData()   línea ~7085  => suma real/ppto/proy de filas
//   - resultadoData   línea 7138   => subtractRows(totalIngresosData, totalCostosData)
//   - ebitdaData      línea 7146   => subtractRows(resultadoData, totalOCData)
//   - totalIngresosData línea 7130 => sumRowsData([...ingresosRowsData, otrosIngresosData])
//   - calcTotals()    línea ~7111  => agregación YTD/YTG/FY contra controlMonth
//   - kpis (línea 9316): ebitdaFY = ingFY - cosFY - ocFY
//   - resultado económico (línea 9709-9710): resFY = ingFY - cosFY; ebitdaFY = resFY - ocFY
// ============================================================================

// ── Fórmulas escalares de la cascada de resultado ───────────────────────────
// Todas operan sobre un único valor (un mes / un total ya agregado), replicando
// EXACTAMENTE la aritmética por-celda del monolito.

/**
 * Ingresos totales = ingresos operacionales de proyectos + otros ingresos.
 * Monolito: totalIngresosData = sumRowsData([...ingresosRowsData, otrosIngresosData])
 * (suma simple, sin redondeo). Verbatim: a + b.
 */
export function ingresosTotales(ingresos, otrosIngresos) {
  return ingresos + otrosIngresos;
}

/**
 * Resultado Operacional = Ingresos totales − Costos.
 * Monolito: resultadoData = subtractRows(totalIngresosData, totalCostosData)
 * => a[m].x - b[m].x. Verbatim: ingresosTotales - costos.
 */
export function resultadoOperacional(ingresosTotales, costos) {
  return ingresosTotales - costos;
}

/**
 * EBITDA = Resultado Operacional − Oficina Central.
 * Monolito: ebitdaData = subtractRows(resultadoData, totalOCData)
 * => a[m].x - b[m].x. Verbatim: resultadoOperacional - oficinaCentral.
 *
 * DIVERGENCIA SPEC: data-model.md (línea 140) llama "resultado" a esta misma
 * línea (resultadoOp − totalOficinaCentral). El monolito y phases.md (línea 274)
 * la llaman "EBITDA". El cálculo es idéntico; sólo difiere el NOMBRE en
 * data-model.md. Conservamos el nombre del monolito (ebitda).
 */
export function ebitda(resultadoOperacional, oficinaCentral) {
  return resultadoOperacional - oficinaCentral;
}

// ── Helpers de agregación temporal (YTD / YTG / FY) ─────────────────────────
// Derivados de calcTotals() (línea ~7111) y del patrón de los KPIs (línea 7115):
//   if (m <= controlMonth) -> cuenta YTD ; else -> cuenta YTG
//   fy = ytd + ytg
// `valores12` es un array indexado por POSICIÓN 0..11 que representa los meses
// 1..12 (m = índice + 1), tal como el monolito itera `for (let m=1; m<=12; m++)`.
//
// NOTA (comportamiento verbatim del monolito): controlMonth puede valer 0
// (ningún mes cargado) o 12 (año completo). Con controlMonth=0, YTD=0 y todo
// cae en YTG. Con controlMonth=12, YTG=0 y todo cae en YTD. No hay clamping.

/**
 * YTD (Year To Date): suma de los meses 1..controlMonth.
 * Verbatim: `if (m <= controlMonth)` acumula. Si controlMonth<=0 => 0.
 */
export function ytd(valores12, controlMonth) {
  let sum = 0;
  for (let m = 1; m <= 12; m++) {
    if (m <= controlMonth) sum += valores12[m - 1] || 0;
  }
  return sum;
}

/**
 * YTG (Year To Go): suma de los meses (controlMonth+1)..12.
 * Verbatim: rama `else` de calcTotals (m > controlMonth).
 */
export function ytg(valores12, controlMonth) {
  let sum = 0;
  for (let m = 1; m <= 12; m++) {
    if (!(m <= controlMonth)) sum += valores12[m - 1] || 0;
  }
  return sum;
}

/**
 * FY (Full Year): suma de los 12 meses.
 * Monolito: fyProy = ytdReal + ytgProy ; fyPpto = ytdPpto + ytgPpto.
 * Se cumple la identidad fy === ytd(.,cm) + ytg(.,cm) para cualquier cm.
 */
export function fy(valores12) {
  let sum = 0;
  for (let m = 1; m <= 12; m++) sum += valores12[m - 1] || 0;
  return sum;
}
