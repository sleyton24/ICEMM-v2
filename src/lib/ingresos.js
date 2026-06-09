// ─────────────────────────────────────────────────────────────────────────────
// Módulo: ingresos
// Extracción VERBATIM del monolito fase1_proyectos.html (golden master).
// Reglas: lógica copiada literal — NO se corrigen bugs ni se altera redondeo,
// operadores, constantes ni orden de evaluación.
//
// Fuente:
//   - COST_CATS               (fase1_proyectos.html ~65)
//   - calcMonthlyRevenue      (fase1_proyectos.html ~363)
//   - calcMonthlyProjectCost  (fase1_proyectos.html ~380, dependencia de snapshotProjects)
//   - snapshotProjects        (fase1_proyectos.html ~410)
// ─────────────────────────────────────────────────────────────────────────────

import { projectMonthIdx } from './curvas.js';
// Fuente ÚNICA de categorías (Frente 3). Antes era una copia local de 6 categorías
// que quedaba desincronizada del catálogo — exactamente el anti-patrón que el
// monolito tenía replicado en 8 lugares. snapshotProjects itera estas 8 familias.
import { COST_CATS } from './clasificacion.js';
export { COST_CATS };

// Ingreso neto mensual de un proyecto para un mes calendario (0=Ene)
//
// DIVERGENCIA SPEC: para contratos Suma Alzada, calcMonthlyRevenue NO aplica la
// devolución de anticipo. `advancePercent` (anticipoPct) es solo informativo aquí.
// El ingreso neto SA actual es: EdP × (1 − retención/100).
// La spec (files/data-model.md:124-129) pide:
//   EdP[M]        = contratoVigente × curvaFacturacion[M]
//   devAnticipo[M]= −EdP[M] × anticipoPct / 100
//   retencion[M]  = −EdP[M] × retencionPct / 100
//   ingresoNeto[M]= EdP[M] + devAnticipo[M] + retencion[M]
// es decir, debería restar también devAnticipo. Se preserva el comportamiento ACTUAL.
export function calcMonthlyRevenue(project, year, calMonth) {
  const idx = projectMonthIdx(project, year, calMonth);
  if (idx === -1) return 0;
  if (project.contractType === 'suma_alzada') {
    const curve = (project.revenueCurve && project.revenueCurve[idx]) || 0;
    const edp = (+project.contract.originalAmount || 0) * curve / 100;
    const ret = +project.contract.retentionPercent || 0;
    return edp * (1 - ret / 100);
  } else {
    // Admin Delegada: rendición (= costo mes) + GG + fee
    const curve = (project.costCurve && project.costCurve[idx]) || 0;
    const cost = (+project.contract.totalBudgetedCost || 0) * curve / 100;
    return cost + (+project.contract.monthlyGG || 0) + (+project.contract.monthlyFee || 0);
  }
}

// Costo mensual de una categoría de un proyecto para un mes calendario
// (dependencia interna de snapshotProjects — extraída VERBATIM ~380)
export function calcMonthlyProjectCost(project, catId, year, calMonth) {
  const idx = projectMonthIdx(project, year, calMonth);
  if (idx === -1) return 0;
  const curve = (project.costCurve && project.costCurve[idx]) || 0;
  return (+project.budgetByCategory[catId] || 0) * curve / 100;
}

// Toma un snapshot completo de ingresos y costos del proyecto para el año
export function snapshotProjects(projects, year) {
  const snap = {};
  for (const p of projects) {
    const monthlyRevenue = Array.from({ length: 12 }, (_, m) => calcMonthlyRevenue(p, year, m));
    const monthlyCosts = {};
    for (const cat of COST_CATS) {
      monthlyCosts[cat.id] = Array.from({ length: 12 }, (_, m) => calcMonthlyProjectCost(p, cat.id, year, m));
    }
    snap[p.id] = { monthlyRevenue, monthlyCosts };
  }
  return snap;
}
