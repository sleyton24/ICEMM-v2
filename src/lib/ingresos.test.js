// ─────────────────────────────────────────────────────────────────────────────
// Test de regresión (golden master) del módulo `ingresos`.
//
// Estos tests FIJAN EL COMPORTAMIENTO ACTUAL del monolito fase1_proyectos.html.
// NO afirman lo que dice la spec (files/data-model.md), sino lo que el código HACE
// hoy, para que la modularización futura no cambie ningún resultado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  COST_CATS,
  calcMonthlyRevenue,
  calcMonthlyProjectCost,
  snapshotProjects,
} from './ingresos.js';

// ─── FIXTURES ────────────────────────────────────────────────────────────────
// Proyecto Suma Alzada modelado sobre el seed "La Quebrada" (proj-002) del
// monolito (~429): originalAmount 285390.89, advancePercent 10, retentionPercent 5,
// startDate '2025-07', durationMonths 24.
// Las curvas se fijan EXPLÍCITAS (no generadas) para que los valores golden sean
// deterministas y verificables a mano. revenueCurve y costCurve suman 100.
function makeLaQuebrada() {
  // 24 meses. Curva con la mayoría del peso en los meses 0 y 1 para facilitar el
  // número de control, y el resto repartido uniforme en los 22 meses restantes.
  const resto = Array.from({ length: 22 }, () => (100 - 10 - 8) / 22); // 82/22 c/u
  const revenueCurve = [10, 8, ...resto]; // suma = 100
  const costCurve = [10, 8, ...resto];
  return {
    id: 'proj-002', name: 'La Quebrada', unCode: '02',
    contractType: 'suma_alzada', status: 'en_ejecucion',
    startDate: '2025-07', endDate: '2027-06', durationMonths: 24,
    replacesProject: null,
    contract: {
      costDirectoGG: 219000, gastoGeneralOC: 20000, utilidadEstudiada: 36000,
      provisionPostVenta: 10390.89, originalAmount: 285390.89,
      advancePercent: 10, retentionPercent: 5, extraordinaryWorks: [],
    },
    budgetByCategory: {
      materiales: 50000, mano_de_obra: 65000, subcontratos: 90000,
      gastos_generales: 15000, equipos_maquinarias: 12000, otros: 500,
    },
    costCurve,
    revenueCurve,
  };
}

// Proyecto Admin Delegada modelado sobre el seed "Olá Costanera" (proj-003) del
// monolito (~442): monthlyGG 858.63, monthlyFee 1188.50, totalBudgetedCost 263151.63,
// startDate '2026-07', durationMonths 18. No tiene originalAmount ni retentionPercent.
function makeOlaCostanera() {
  const resto = Array.from({ length: 16 }, () => (100 - 20 - 5) / 16); // 75/16 c/u
  const costCurve = [20, 5, ...resto]; // suma = 100
  const revenueCurve = [20, 5, ...resto];
  return {
    id: 'proj-003', name: 'Olá Costanera', unCode: '03',
    contractType: 'admin_delegada', status: 'presupuestado',
    startDate: '2026-07', endDate: '2027-12', durationMonths: 18,
    replacesProject: null,
    contract: {
      cashAdvance: 1500, monthlyGG: 858.63, monthlyFee: 1188.50,
      totalBudgetedCost: 263151.63,
    },
    budgetByCategory: {
      materiales: 60000, mano_de_obra: 70000, subcontratos: 95000,
      gastos_generales: 20000, equipos_maquinarias: 15000, otros: 1151.63,
    },
    costCurve,
    revenueCurve,
  };
}

// ─── calcMonthlyRevenue: Suma Alzada ─────────────────────────────────────────
describe('calcMonthlyRevenue — Suma Alzada (La Quebrada)', () => {
  it('mes fuera del proyecto (antes del inicio) → 0', () => {
    const p = makeLaQuebrada();
    // startDate 2025-07 → mes índice 6. Junio 2025 (calMonth 5) está fuera.
    expect(calcMonthlyRevenue(p, 2025, 5)).toBe(0);
  });

  it('mes fuera del proyecto (después del fin) → 0', () => {
    const p = makeLaQuebrada();
    // durationMonths 24 desde jul-2025 → último mes jun-2027 (idx 23).
    // jul-2027 (idx 24) está fuera.
    expect(calcMonthlyRevenue(p, 2027, 6)).toBe(0);
  });

  it('número de control: primer mes (jul-2025, idx 0, curva 10%)', () => {
    const p = makeLaQuebrada();
    // edp = 285390.89 * 10 / 100 = 28539.089
    // neto = edp * (1 - 5/100) = 28539.089 * 0.95 = 27112.13455
    const edp = 285390.89 * 10 / 100;
    const expected = edp * (1 - 5 / 100);
    expect(calcMonthlyRevenue(p, 2025, 6)).toBe(expected);
    expect(calcMonthlyRevenue(p, 2025, 6)).toBeCloseTo(27112.13455, 5);
  });

  it('número de control: segundo mes (ago-2025, idx 1, curva 8%)', () => {
    const p = makeLaQuebrada();
    const edp = 285390.89 * 8 / 100;
    const expected = edp * (1 - 5 / 100);
    expect(calcMonthlyRevenue(p, 2025, 7)).toBe(expected);
  });

  it('retención 0 → ingreso neto == EdP bruto', () => {
    const p = makeLaQuebrada();
    p.contract.retentionPercent = 0;
    const edp = 285390.89 * 10 / 100;
    expect(calcMonthlyRevenue(p, 2025, 6)).toBe(edp);
  });

  it('curva ausente en el índice → ingreso 0 (fallback || 0)', () => {
    const p = makeLaQuebrada();
    p.revenueCurve = []; // sin pesos
    expect(calcMonthlyRevenue(p, 2025, 6)).toBe(0);
  });
});

// ─── calcMonthlyRevenue: Admin Delegada ──────────────────────────────────────
describe('calcMonthlyRevenue — Admin Delegada (Olá Costanera)', () => {
  it('mes fuera del proyecto → 0', () => {
    const p = makeOlaCostanera();
    // startDate 2026-07 → idx 6. Ene-2026 (calMonth 0) está fuera.
    expect(calcMonthlyRevenue(p, 2026, 0)).toBe(0);
  });

  it('número de control: primer mes (jul-2026, idx 0, costCurve 20%)', () => {
    const p = makeOlaCostanera();
    // cost = 263151.63 * 20 / 100 = 52630.326
    // ingreso = cost + monthlyGG + monthlyFee = 52630.326 + 858.63 + 1188.50
    const cost = 263151.63 * 20 / 100;
    const expected = cost + 858.63 + 1188.50;
    expect(calcMonthlyRevenue(p, 2026, 6)).toBe(expected);
    expect(calcMonthlyRevenue(p, 2026, 6)).toBeCloseTo(54677.456, 5);
  });

  it('usa costCurve (no revenueCurve) para la rendición', () => {
    const p = makeOlaCostanera();
    // Diferenciamos las curvas: si usara revenueCurve daría otro resultado.
    p.revenueCurve = p.revenueCurve.map(() => 0);
    const cost = 263151.63 * 20 / 100; // costCurve[0] = 20 intacta
    const expected = cost + 858.63 + 1188.50;
    expect(calcMonthlyRevenue(p, 2026, 6)).toBe(expected);
  });

  it('GG y fee se suman siempre que el mes esté dentro del proyecto', () => {
    const p = makeOlaCostanera();
    p.costCurve = []; // costo del mes = 0
    // ingreso = 0 + monthlyGG + monthlyFee
    expect(calcMonthlyRevenue(p, 2026, 6)).toBe(858.63 + 1188.50);
  });
});

// ─── calcMonthlyProjectCost ──────────────────────────────────────────────────
describe('calcMonthlyProjectCost', () => {
  it('mes fuera del proyecto → 0', () => {
    const p = makeLaQuebrada();
    expect(calcMonthlyProjectCost(p, 'materiales', 2025, 5)).toBe(0);
  });

  it('número de control: materiales primer mes (idx 0, costCurve 10%)', () => {
    const p = makeLaQuebrada();
    // 50000 * 10 / 100 = 5000
    expect(calcMonthlyProjectCost(p, 'materiales', 2025, 6)).toBe(5000);
  });

  it('categoría inexistente → 0 (fallback || 0)', () => {
    const p = makeLaQuebrada();
    expect(calcMonthlyProjectCost(p, 'inexistente', 2025, 6)).toBe(0);
  });
});

// ─── snapshotProjects ────────────────────────────────────────────────────────
describe('snapshotProjects', () => {
  it('estructura: una entrada por id con monthlyRevenue (12) y monthlyCosts por categoría', () => {
    const projects = [makeLaQuebrada(), makeOlaCostanera()];
    const snap = snapshotProjects(projects, 2025);
    expect(Object.keys(snap).sort()).toEqual(['proj-002', 'proj-003']);
    expect(snap['proj-002'].monthlyRevenue).toHaveLength(12);
    for (const cat of COST_CATS) {
      expect(snap['proj-002'].monthlyCosts[cat.id]).toHaveLength(12);
    }
  });

  it('La Quebrada 2025: ingresos solo en jul-dic (idx 0..5)', () => {
    const p = makeLaQuebrada();
    const snap = snapshotProjects([p], 2025);
    const rev = snap['proj-002'].monthlyRevenue;
    // Ene-jun 2025 (m=0..5) fuera → 0
    for (let m = 0; m < 6; m++) expect(rev[m]).toBe(0);
    // Jul 2025 (m=6, idx 0, curva 10%) → control
    const edp0 = 285390.89 * 10 / 100;
    expect(rev[6]).toBe(edp0 * 0.95);
    // Ago 2025 (m=7, idx 1, curva 8%)
    const edp1 = 285390.89 * 8 / 100;
    expect(rev[7]).toBe(edp1 * 0.95);
  });

  it('La Quebrada 2025: costos materiales coinciden con calcMonthlyProjectCost', () => {
    const p = makeLaQuebrada();
    const snap = snapshotProjects([p], 2025);
    const mat = snap['proj-002'].monthlyCosts['materiales'];
    for (let m = 0; m < 12; m++) {
      expect(mat[m]).toBe(calcMonthlyProjectCost(p, 'materiales', 2025, m));
    }
    expect(mat[6]).toBe(5000); // jul: 50000 * 10 / 100
  });

  it('Olá Costanera 2025: proyecto aún no inicia → todo 0', () => {
    const p = makeOlaCostanera(); // inicia 2026-07
    const snap = snapshotProjects([p], 2025);
    expect(snap['proj-003'].monthlyRevenue.every(v => v === 0)).toBe(true);
    for (const cat of COST_CATS) {
      expect(snap['proj-003'].monthlyCosts[cat.id].every(v => v === 0)).toBe(true);
    }
  });
});

// ─── DIVERGENCIAS CON SPEC (a corregir en Frente 3) ──────────────────────────
describe('divergencias con spec (a corregir en Frente 3)', () => {
  it('DIVERGENCIA: Suma Alzada NO descuenta la devolución de anticipo (advancePercent es informativo)', () => {
    // Spec files/data-model.md:124-129:
    //   EdP          = contratoVigente × curvaFacturacion
    //   devAnticipo  = −EdP × anticipoPct / 100
    //   retencion    = −EdP × retencionPct / 100
    //   ingresoNeto  = EdP + devAnticipo + retencion
    // El monolito calcula SOLO: ingresoNeto = EdP × (1 − retencion/100).
    // Afirmamos el valor ACTUAL (sin restar devAnticipo).
    const p = makeLaQuebrada(); // advancePercent 10, retentionPercent 5
    const edp = 285390.89 * 10 / 100; // primer mes, curva 10%

    const actual = calcMonthlyRevenue(p, 2025, 6);

    // Valor ACTUAL del monolito: edp * (1 - 5/100)
    expect(actual).toBe(edp * (1 - 5 / 100));

    // Lo que pediría la spec (NO es lo que devuelve hoy): edp - edp*10/100 - edp*5/100
    const segunSpec = edp - edp * 10 / 100 - edp * 5 / 100;
    expect(actual).not.toBe(segunSpec);
    // La diferencia es exactamente la devolución de anticipo (10% del EdP) que el
    // monolito omite hoy.
    expect(actual - segunSpec).toBeCloseTo(edp * 10 / 100, 5);
  });

  it('DIVERGENCIA: cambiar advancePercent NO altera el ingreso SA actual', () => {
    const p1 = makeLaQuebrada();
    const p2 = makeLaQuebrada();
    p2.contract.advancePercent = 50; // muy distinto
    // El ingreso debe ser idéntico porque advancePercent no entra en el cálculo.
    expect(calcMonthlyRevenue(p2, 2025, 6)).toBe(calcMonthlyRevenue(p1, 2025, 6));
  });
});
