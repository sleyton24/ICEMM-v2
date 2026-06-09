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
