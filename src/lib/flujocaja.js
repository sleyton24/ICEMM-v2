// flujocaja.js — Fórmulas puras del Flujo de Caja extraídas del monolito ICEMM
// (fase1_proyectos.html, componente CashFlowModule, useMemo `cfRows`, ~líneas 8315-8388).
//
// GOLDEN MASTER: estas funciones replican VERBATIM los signos, constantes, redondeos
// y orden de evaluación del monolito. NO "arreglan" nada. Montos en UF.
//
// Notas de origen:
//   - cfData.pctIVACostos default 0.77 (% costos de obra con IVA recuperable, 77%)
//   - cfData.pctIVAOC     default 0.05 (% Oficina Central con IVA recuperable, 5%)
//   - cfData.saldoIVADicAnterior default 0 (seed de proyectos: -84; negativo=crédito, positivo=deuda)
//   - El arrastre del IVA es SECUENCIAL: saldoIVAPrev del mes = saldoContador del mes anterior.

// ── IVA Débito ────────────────────────────────────────────────────────────────
// Línea 9 del CF: 19% sobre los ingresos operacionales COMPLETOS (incluye anticipos).
// Monolito: const ivaDebito = totalIngresosOp * 0.19;
export function ivaDebito(totalIngresosOp) {
  return totalIngresosOp * 0.19;
}

// ── IVA Crédito ─────────────────────────────────────────────────────────────────
// Egreso real de caja (IVA pagado a proveedores). Porcentajes configurables por el usuario.
// Monolito:
//   const ivaCredito = -(pCostos * 0.19 * Math.abs(row.totalCostos) + pOC * 0.19 * Math.abs(row.oc));
// donde pCostos = +(cfData.pctIVACostos ?? 0.77) y pOC = +(cfData.pctIVAOC ?? 0.05).
// totalCostos y oc llegan con signo negativo (egresos) → se usa Math.abs para la base.
export function ivaCredito(totalCostos, oc, pCostos = 0.77, pOC = 0.05) {
  return -(pCostos * 0.19 * Math.abs(totalCostos) + pOC * 0.19 * Math.abs(oc));
}

// ── IVA Crédito Acumulado ─────────────────────────────────────────────────────
// Si el saldo anterior > 0 (ya pagado al SII), reinicia con el crédito del mes;
// si ≤ 0, arrastra el excedente sumando el crédito del mes.
// Monolito: const ivaCredAcum = saldoIVAPrev > 0 ? ivaCredito : saldoIVAPrev + ivaCredito;
export function ivaCredAcum(saldoIVAPrev, ivaCredito) {
  return saldoIVAPrev > 0 ? ivaCredito : saldoIVAPrev + ivaCredito;
}

// ── Saldo Contador ──────────────────────────────────────────────────────────────
// Saldo neto IVA del mes que se arrastra al mes siguiente como saldoIVAPrev.
// Monolito: const saldoContador = ivaCredAcum + row.ivaDebito;
export function saldoContador(ivaCredAcum, ivaDebito) {
  return ivaCredAcum + ivaDebito;
}

// ── IVA Neto del Mes (pago al SII) ──────────────────────────────────────────────
// Pago IVA este mes = saldo positivo del mes anterior (declarado y pagado con 1 mes de rezago).
// Monolito: const ivaNeto = Math.max(0, saldoIVAPrev);
//
// DIVERGENCIA SPEC: data-model.md L145 y phases.md L330 dicen
//   ivaPagar[M] = max(0, ivaDebito[M-1] − ivaCredito[M-1])
// es decir, una resta por mes entre débito y crédito del mes anterior. El monolito en cambio
// toma max(0, saldoIVAPrev), donde saldoIVAPrev es el saldoContador acumulado del mes anterior
// (con arrastre del excedente de crédito cuando el saldo es ≤ 0). El comportamiento real ACUMULA
// y no es una simple resta mes a mes. Ver test 'divergencias con spec (a corregir en Frente 3)'.
export function ivaNetoMes(saldoIVAPrev) {
  return Math.max(0, saldoIVAPrev);
}

// ── PPM ───────────────────────────────────────────────────────────────────────
// 1% del total de ingresos operacionales del MES ANTERIOR (base bruta, incluye anticipos).
// Monolito: const ppm = prev ? prev.totalIngresosOp * 0.01 : 0;
// Acá la función pura recibe directamente el totalIngresosOp del mes anterior;
// el caller es responsable de pasar 0 cuando no hay mes previo (m === 1).
export function ppm(prevTotalIngresosOp) {
  return prevTotalIngresosOp * 0.01;
}

// ── FC del Mes ──────────────────────────────────────────────────────────────────
// Suma de los 6 componentes. ivaCredito es egreso real de caja (IVA pagado a proveedores).
// Monolito:
//   const fcMes = row.totalIngresos + row.totalEgresos + ivaCredito + totalTributos + totalCxPCxC + totalInv;
//
// DIVERGENCIA SPEC: data-model.md L147 dice
//   fcMes = ingresos + egresos + tributos + cxpCxc + inversionistas   (5 términos)
// El monolito suma 6 términos: incluye ivaCredito como término EXPLÍCITO y separado
// (no plegado dentro de egresos/tributos). Ver test de divergencias.
export function fcMes(totalIngresos, totalEgresos, ivaCredito, totalTributos, totalCxPCxC, totalInv) {
  return totalIngresos + totalEgresos + ivaCredito + totalTributos + totalCxPCxC + totalInv;
}

// ── Caja Final ──────────────────────────────────────────────────────────────────
// Monolito: const cajaFinal = cajaInicial + rows[m].fcMes;
// El cajaInicial de un mes = cajaFinal del mes anterior (enero parte de cajaInicialEfectiva).
export function cajaFinal(cajaInicial, fcMes) {
  return cajaInicial + fcMes;
}

// ── Arrastre del saldo IVA entre años ─────────────────────────────────────────────
// Convención de signo (igual que cfData.saldoIVADicAnterior en el monolito):
//   negativo = crédito a favor (excedente que se arrastra), positivo = deuda al SII.
//
// En el monolito, `saldoIVAPrev` se inicializa con `saldoIVADicAnterior` y, mes a mes,
// se reasigna al `saldoContador` del mes:
//   let saldoIVAPrev = +(cfData.saldoIVADicAnterior || 0);
//   for (m = 1..12) { ...; const saldoContador = ivaCredAcum + ivaDebito; saldoIVAPrev = saldoContador; }
// Por lo tanto, tras diciembre, `saldoIVAPrev` == saldoContador de diciembre. Ese valor es el
// "saldo IVA dic final" que debe arrastrarse como saldo inicial del año siguiente.

// Computa el saldo neto IVA de diciembre dada la secuencia mensual de saldoContador.
// `saldosContadorPorMes` es un objeto/array indexado por mes (1..12) con el saldoContador
// de cada mes (tal como queda en cfRows[m].saldoContador en el monolito). Si diciembre no
// existe (año incompleto), retorna 0 (default backward-compatible).
// Monolito equivalente: el effect persiste `saldoIVADicFinal = cfRows[12]?.saldoContador || 0`.
export function saldoIVADicFinal(saldosContadorPorMes) {
  if (saldosContadorPorMes == null) return 0;
  const dic = saldosContadorPorMes[12];
  return dic == null ? 0 : +dic;
}

// Propaga el saldo IVA de diciembre como saldo IVA inicial del año siguiente.
// Monolito: createNextYear hace `saldoIVADicAnterior = cfCurrent.saldoIVADicFinal || 0`.
// Campo opcional → default 0 (backward-compatible con cashflows previos sin el campo).
export function arrastrarSaldoIVA(saldoIVADicFinalAnioActual) {
  return saldoIVADicFinalAnioActual || 0;
}

// ── MATRIZ DE FLUJO DE CAJA (port VERBATIM de cfRows) ─────────────────────────────
// Port de la función `cfRows` del monolito (fase1_proyectos.html, componente
// CashFlowModule, useMemo `cfRows`, ~L8435-8511). Replica EXACTAMENTE el cálculo en
// 3 pasadas, los signos, constantes (0.19, 0.01), redondeos (ninguno: aritmética IEEE
// directa) y el orden de evaluación. Montos en UF.
//
// DESACOPLE de React/storage: el monolito resuelve, dentro del useMemo, los valores
// por proyecto/mes vía getters que leen state/storage (getAnticipoProy, getCostoProy,
// getIngresoProy, getOtrosIngProy, getOCProy). Acá esos valores YA vienen resueltos en
// objetos planos de entrada; la función pura solo orquesta las 3 pasadas. Así fija el
// comportamiento financiero (IVA acumulado, tributos, CxC default, caja acumulada) sin
// arrastrar la capa de datos.
//
// ENTRADA (objeto `input`):
//   - activeProjects: [{ id, contractType }]  (contractType 'admin_delegada' marca AD)
//   - getAnticipo(projectId, m): anticipo recibido + devolución del mes (con signo del monolito)
//   - getCosto(projectId, m):    costo del proyecto en el mes (POSITIVO; la matriz lo niega)
//   - getIngreso(projectId, m):  EdP neto del mes (POSITIVO)
//   - getOtrosIng(m):            asesorías/otros ingresos del mes (POSITIVO)
//   - getOC(m):                  costo Oficina Central del mes (POSITIVO; la matriz lo niega)
//   - controlMonth:              mes de corte (los meses > controlMonth llevan CxC default)
//   - cajaInicialEfectiva:       caja inicial de enero (manual / Balance / año anterior)
//   - cfData: {
//       pctIVACostos (?? 0.77), pctIVAOC (?? 0.05),
//       saldoIVADicAnterior (?? 0),   // negativo=crédito a favor, positivo=deuda al SII
//       impuestoRenta (?? 0),         // se aplica en abril (m===4), siempre como egreso
//       cxp:{m}, cxc:{m},             // overrides; cxc cae a cxcDefault si null/undefined/0
//       aportes:{m}, devoluciones:{m}
//     }
//
// SALIDA: objeto `rows` indexado por mes 1..12, cada fila con los MISMOS campos que el
// monolito (anticipos, edp, costos, totalAnticipos, totalEdp, otrosIng, totalIngresosOp,
// ivaDebito, totalIngresos, totalCostos, oc, totalEgresos, ivaCredito, ivaNeto, ppm,
// impRenta, totalTributos, cxp, cxc, cxcDefault, aportes, devoluciones, totalCxPCxC,
// totalInv, fcMes, saldoContador, cajaInicial, cajaFinal).
export function cfRowsMatrix(input) {
  const {
    activeProjects = [],
    getAnticipo = () => 0,
    getCosto = () => 0,
    getIngreso = () => 0,
    getOtrosIng = () => 0,
    getOC = () => 0,
    controlMonth = 0,
    cajaInicialEfectiva = 0,
    cfData = {},
  } = input || {};

  const rows = {};

  // Pass 1: base rows (ingresos/egresos por mes).
  // Monolito: secuencial 1..12; usa `prev` solo conceptualmente acá (no en pasada 1).
  for (let m = 1; m <= 12; m++) {
    const anticipos = {};
    const edp = {};
    const costos = {};
    activeProjects.forEach(p => {
      anticipos[p.id] = getAnticipo(p.id, m);
      costos[p.id]    = -getCosto(p.id, m);
      edp[p.id]       = getIngreso(p.id, m);
    });
    const totalAnticipos  = Object.values(anticipos).reduce((s, v) => s + v, 0);
    const totalEdp        = Object.values(edp).reduce((s, v) => s + v, 0);
    const otrosIng        = getOtrosIng(m);
    const totalIngresosOp = totalAnticipos + totalEdp + otrosIng;   // Línea 8
    const ivaDeb          = ivaDebito(totalIngresosOp);             // Línea 9 (incl. anticipos)
    const totalIngresos   = totalIngresosOp + ivaDeb;
    const totalCostos     = Object.values(costos).reduce((s, v) => s + v, 0);
    const oc              = -getOC(m);
    const totalEgresos    = totalCostos + oc;
    rows[m] = {
      anticipos, edp, costos, totalAnticipos, totalEdp, otrosIng, totalIngresosOp,
      ivaDebito: ivaDeb, totalIngresos, totalCostos, oc, totalEgresos,
    };
  }

  // Pass 2: tributos con IVA acumulado correcto, CxC default (secuencial).
  const adProjs = activeProjects.filter(p => p.contractType === 'admin_delegada');
  const pCostos = +(cfData.pctIVACostos ?? 0.77);
  const pOC     = +(cfData.pctIVAOC     ?? 0.05);
  let saldoIVAPrev = +(cfData.saldoIVADicAnterior || 0);
  for (let m = 1; m <= 12; m++) {
    const row  = rows[m];
    const prev = m > 1 ? rows[m - 1] : null;
    const ivaCred       = ivaCredito(row.totalCostos, row.oc, pCostos, pOC);
    const ivaCredAc     = ivaCredAcum(saldoIVAPrev, ivaCred);
    const saldoCont     = saldoContador(ivaCredAc, row.ivaDebito);
    const ivaNeto       = ivaNetoMes(saldoIVAPrev);
    const ppmMes        = prev ? ppm(prev.totalIngresosOp) : 0;
    const impRenta      = m === 4 ? Math.abs(+(cfData.impuestoRenta || 0)) : 0;
    const totalTributos = -(ivaNeto + ppmMes + impRenta);
    // CxC default para meses de proyección: desfase de 1 mes en cobro (excluye AD).
    let cxcDefault = 0;
    if (m > controlMonth && prev) {
      const adPrev = adProjs.reduce((s, p) => s + (prev.edp[p.id] || 0) + (prev.anticipos[p.id] || 0), 0);
      const adCur  = adProjs.reduce((s, p) => s + (row.edp[p.id]  || 0) + (row.anticipos[p.id]  || 0), 0);
      cxcDefault = (prev.totalIngresosOp - adPrev - (row.totalIngresosOp - adCur)) * 1.19;
    }
    const cxp = +(cfData.cxp?.[m] || 0);
    const cxcRaw = cfData.cxc?.[m];
    const cxc = (cxcRaw !== null && cxcRaw !== undefined && +cxcRaw !== 0) ? +cxcRaw : cxcDefault;
    const aportes      = +(cfData.aportes?.[m] || 0);
    const devoluciones = -(Math.abs(+(cfData.devoluciones?.[m] || 0)));
    const totalCxPCxC  = cxp + cxc;
    const totalInv     = aportes + devoluciones;
    const fc = fcMes(row.totalIngresos, row.totalEgresos, ivaCred, totalTributos, totalCxPCxC, totalInv);
    rows[m] = {
      ...row,
      ivaCredito: ivaCred, ivaNeto, ppm: ppmMes, impRenta, totalTributos,
      cxp, cxc, cxcDefault, aportes, devoluciones, totalCxPCxC, totalInv,
      fcMes: fc, saldoContador: saldoCont,
    };
    saldoIVAPrev = saldoCont;
  }

  // Pass 3: caja acumulada (parte desde la caja inicial efectiva).
  let cajaAnt = cajaInicialEfectiva;
  for (let m = 1; m <= 12; m++) {
    const cajaInicial = cajaAnt;
    const cajaFinalM  = cajaFinal(cajaInicial, rows[m].fcMes);
    rows[m] = { ...rows[m], cajaInicial, cajaFinal: cajaFinalM };
    cajaAnt = cajaFinalM;
  }

  return rows;
}
