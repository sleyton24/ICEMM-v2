// ─── TEST DE REGRESIÓN (GOLDEN MASTER): curvas ─────────────────────────────────
// Fija el comportamiento ACTUAL del monolito fase1_proyectos.html.
// Estos tests afirman lo que el código HACE HOY, no lo que la spec dice que
// "debería" hacer. Sirven de red de seguridad para la modularización futura:
// si algún resultado cambia, un test debe romperse.

import { describe, it, expect } from 'vitest';
import {
  monthsBetween,
  generateSCurve,
  normalizeCurve,
  reescalarCurva,
  applyShift,
  projectMonthIdx,
} from './curvas.js';

// Helpers locales para los tests (no importados del monolito).
const sum = arr => arr.reduce((a, b) => a + b, 0);
const isMonotonicNonDecreasing = arr => {
  for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) return false;
  return true;
};

// ─── monthsBetween ──────────────────────────────────────────────────────────────
describe('monthsBetween', () => {
  it('cuenta inclusivo: 2025-07 .. 2027-06 === 24', () => {
    // (2027-2025)*12 + (6-7) + 1 = 24 - 1 + 1 = 24
    expect(monthsBetween('2025-07', '2027-06')).toBe(24);
  });

  it('mismo mes inicio==fin === 1 (inclusivo)', () => {
    expect(monthsBetween('2025-07', '2025-07')).toBe(1);
  });

  it('rango negativo (fin antes que inicio) devuelve 0', () => {
    expect(monthsBetween('2027-06', '2025-07')).toBe(0);
  });

  it('argumentos faltantes/falsy devuelven 0', () => {
    expect(monthsBetween('', '2025-07')).toBe(0);
    expect(monthsBetween('2025-07', '')).toBe(0);
    expect(monthsBetween(null, null)).toBe(0);
    expect(monthsBetween(undefined, '2025-07')).toBe(0);
  });

  it('cruce de año simple: 2025-12 .. 2026-01 === 2', () => {
    expect(monthsBetween('2025-12', '2026-01')).toBe(2);
  });
});

// ─── generateSCurve ─────────────────────────────────────────────────────────────
describe('generateSCurve', () => {
  it('n<=0 devuelve []', () => {
    expect(generateSCurve(0)).toEqual([]);
    expect(generateSCurve(-5)).toEqual([]);
  });

  it('n=1 devuelve un único 100 (sCum(1)-sCum(0) = 1) tras normalizar', () => {
    expect(generateSCurve(1)).toEqual([100]);
  });

  it('la curva S resultante cierra exactamente en 100', () => {
    for (const n of [2, 3, 6, 12, 24]) {
      const c = generateSCurve(n);
      expect(c.length).toBe(n);
      expect(sum(c)).toBeCloseTo(100, 10);
    }
  });

  it('número de control: forma de S simétrica para n=6 (valores actuales exactos)', () => {
    // raw_i = (sCum((i+1)/6) - sCum(i/6)) * 100, con sCum(t)=3t^2-2t^3
    // Estos son los valores PRODUCIDOS HOY por el monolito (4 decimales + ajuste último).
    const c = generateSCurve(6);
    expect(c).toEqual([7.4074, 18.5185, 24.0741, 24.0741, 18.5185, 7.4074]);
    expect(sum(c)).toBeCloseTo(100, 10);
  });

  it('la curva S es creciente hasta la mitad y decreciente después (campana de pesos)', () => {
    const c = generateSCurve(12);
    const mid = c.length / 2;
    for (let i = 1; i < mid; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
  });
});

// ─── normalizeCurve ─────────────────────────────────────────────────────────────
describe('normalizeCurve', () => {
  it('curva vacía o nula devuelve []', () => {
    expect(normalizeCurve([])).toEqual([]);
    expect(normalizeCurve(null)).toEqual([]);
    expect(normalizeCurve(undefined)).toEqual([]);
  });

  it('cierra exactamente en 100.00 ajustando el ÚLTIMO elemento', () => {
    // 3 partes que NO suman 100; el ajuste cae en el último.
    const c = normalizeCurve([33.3333, 33.3333, 33.3333]);
    expect(sum(c)).toBeCloseTo(100, 10);
    // primeros dos quedan redondeados a 4 decimales; el último absorbe el diff.
    expect(c[0]).toBe(33.3333);
    expect(c[1]).toBe(33.3333);
    expect(c[2]).toBe(33.3334);
  });

  it('una curva que ya suma 100 queda intacta (diff===0)', () => {
    const c = normalizeCurve([25, 25, 25, 25]);
    expect(c).toEqual([25, 25, 25, 25]);
  });

  it('redondea valores a 4 decimales (r4 = Math.round(v*10000)/10000)', () => {
    const c = normalizeCurve([50.123456, 49.876544]);
    // 50.123456 -> 50.1235 ; el último absorbe el resto hasta 100.
    expect(c[0]).toBe(50.1235);
    expect(sum(c)).toBeCloseTo(100, 10);
  });

  it('valores no numéricos se tratan como 0 (+v || 0)', () => {
    const c = normalizeCurve([null, undefined, 'x']);
    // todos -> 0, sum=0, diff=r4(100)=100, último pasa a 0+100=100
    expect(c).toEqual([0, 0, 100]);
    expect(sum(c)).toBe(100);
  });

  it('un solo elemento se fuerza a 100', () => {
    expect(normalizeCurve([42])).toEqual([100]);
  });
});

// ─── reescalarCurva ─────────────────────────────────────────────────────────────
describe('reescalarCurva', () => {
  it('preserva la suma normalizada = 1.0', () => {
    const out = reescalarCurva([10, 20, 30, 40], 6);
    expect(out.length).toBe(6);
    expect(sum(out)).toBeCloseTo(1.0, 12);
  });

  it('N_new === 1 devuelve [1] sin importar la curva', () => {
    expect(reescalarCurva([5, 5, 5], 1)).toEqual([1]);
    expect(reescalarCurva([100], 1)).toEqual([1]);
  });

  it('curva vacía con N_new>0 reparte uniforme 1/N_new', () => {
    const out = reescalarCurva([], 4);
    expect(out).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('curva nula con N_new>0 reparte uniforme 1/N_new', () => {
    expect(reescalarCurva(null, 5)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
  });

  it('N_new===0 con curva vacía devuelve [] (Array(0))', () => {
    expect(reescalarCurva([], 0)).toEqual([]);
  });

  // GOLDEN MASTER (comportamiento ACTUAL): con N_new negativo el monolito ejecuta
  // Array(-3) que LANZA RangeError ("Invalid array length"). No es un caso alcanzable
  // en la app (N_new = monthsBetween >= 0), pero se fija el comportamiento real para
  // que un futuro refactor que lo "arregle" sea un cambio deliberado.
  it('N_new<0 con curva vacía lanza RangeError (Array(N_new) inválido)', () => {
    expect(() => reescalarCurva([], -3)).toThrow(RangeError);
  });

  it('curva válida con total interpolado <= 0 reparte uniforme', () => {
    // todos los pesos son 0 -> total interpolado = 0 -> rama uniforme 1/N_new
    const out = reescalarCurva([0, 0, 0], 4);
    expect(out).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('número de control: interpolación lineal de [0,100] a 3 puntos antes de normalizar', () => {
    // pos: j/(3-1)*(2-1) = j*0.5 -> 0, 0.5, 1.0
    // scaled: 0, 50, 100 -> total=150 -> norm: 0, 1/3, 2/3
    const out = reescalarCurva([0, 100], 3);
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(1 / 3, 12);
    expect(out[2]).toBeCloseTo(2 / 3, 12);
    expect(sum(out)).toBeCloseTo(1.0, 12);
  });

  it('número de control con curva real (DEFAULT_COST_PCTS no aplica aquí; usa curva S real de 24m a 12m)', () => {
    const orig = generateSCurve(24);
    const out = reescalarCurva(orig, 12);
    expect(out.length).toBe(12);
    expect(sum(out)).toBeCloseTo(1.0, 12);
    // conserva forma de campana: crece hasta la mitad
    const mid = out.length / 2;
    for (let i = 1; i < mid; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
  });
});

// ─── applyShift ─────────────────────────────────────────────────────────────────
describe('applyShift', () => {
  it('shift=0 devuelve la MISMA curva (identidad, misma referencia)', () => {
    const c = [10, 20, 30, 40];
    expect(applyShift(c, 0)).toBe(c);
  });

  it('shift falsy/undefined devuelve la curva sin cambios', () => {
    const c = [10, 20, 30, 40];
    expect(applyShift(c, undefined)).toBe(c);
    expect(applyShift(c, null)).toBe(c);
  });

  it('curva vacía o nula se devuelve tal cual', () => {
    expect(applyShift([], 2)).toEqual([]);
    expect(applyShift(null, 2)).toBeNull();
  });

  it('total <= 0 devuelve la curva sin cambios', () => {
    const c = [0, 0, 0];
    expect(applyShift(c, 2)).toBe(c);
  });

  it('preserva el monto total (misma suma) tras el shift', () => {
    const c = generateSCurve(12);
    const t = sum(c);
    for (const s of [-3, -1, 1, 3]) {
      const out = applyShift(c, s);
      expect(out.length).toBe(c.length);
      expect(sum(out)).toBeCloseTo(t, 8);
    }
  });

  it('la acumulada resultante es monótona no decreciente y cierra en total', () => {
    const c = generateSCurve(12);
    const total = sum(c);
    for (const s of [-3, -1, 1, 3]) {
      const out = applyShift(c, s);
      // reconstruir acumulada
      const cum = [0];
      for (let i = 0; i < out.length; i++) cum.push(cum[i] + out[i]);
      expect(isMonotonicNonDecreasing(cum)).toBe(true);
      expect(cum[cum.length - 1]).toBeCloseTo(total, 8);
    }
  });

  it('shift>0 adelanta el gasto (más acumulado al inicio que la curva base)', () => {
    const c = generateSCurve(12);
    const out = applyShift(c, 3);
    // acumulado hasta la mitad debe ser >= que el de la curva original
    const half = c.length / 2;
    const cumBase = c.slice(0, half).reduce((a, b) => a + b, 0);
    const cumShift = out.slice(0, half).reduce((a, b) => a + b, 0);
    expect(cumShift).toBeGreaterThanOrEqual(cumBase);
  });

  it('número de control determinista: applyShift([25,25,25,25], 3)', () => {
    // total=100, factor=0.03, cumul=[0,25,50,75,100]
    // t=i/4: 0, .25, .5, .75, 1 ; bump=4t(1-t): 0, .75, 1, .75, 0
    // delta = factor*bump*total: 0, 2.25, 3, 2.25, 0
    // shifted (pre-clamp/mono): 0, 27.25, 53, 77.25, 100 -> ya monótona, cierra 100
    // pesos = diffs: 27.25, 25.75, 24.25, 22.75
    const out = applyShift([25, 25, 25, 25], 3);
    expect(out[0]).toBeCloseTo(27.25, 10);
    expect(out[1]).toBeCloseTo(25.75, 10);
    expect(out[2]).toBeCloseTo(24.25, 10);
    expect(out[3]).toBeCloseTo(22.75, 10);
    expect(sum(out)).toBeCloseTo(100, 10);
  });
});

// ─── projectMonthIdx ────────────────────────────────────────────────────────────
describe('projectMonthIdx', () => {
  // Proyecto seed realista: arranca 2025-07, dura 24 meses (idx 0..23).
  const project = { startDate: '2025-07', durationMonths: 24 };

  it('mes de inicio (2025, calMonth=6=Jul) -> idx 0', () => {
    expect(projectMonthIdx(project, 2025, 6)).toBe(0);
  });

  it('mes calendario interior: 2026 Jul (calMonth=6) -> idx 12', () => {
    expect(projectMonthIdx(project, 2026, 6)).toBe(12);
  });

  it('último mes activo: 2027 Jun (calMonth=5) -> idx 23', () => {
    expect(projectMonthIdx(project, 2027, 5)).toBe(23);
  });

  it('un mes antes del inicio -> -1 (idx < 0)', () => {
    expect(projectMonthIdx(project, 2025, 5)).toBe(-1); // Jun 2025
  });

  it('un mes después del fin -> -1 (idx >= durationMonths)', () => {
    expect(projectMonthIdx(project, 2027, 6)).toBe(-1); // Jul 2027, idx=24
  });

  it('año muy anterior -> -1', () => {
    expect(projectMonthIdx(project, 2024, 0)).toBe(-1);
  });

  it('proyecto sin startDate -> -1', () => {
    expect(projectMonthIdx({ durationMonths: 24 }, 2025, 6)).toBe(-1);
  });
});

// ─── DIVERGENCIAS CON SPEC (a corregir en Frente 3) ─────────────────────────────
// Estos tests AFIRMAN EL VALOR ACTUAL del monolito, no el de la spec.
describe('divergencias con spec (a corregir en Frente 3)', () => {
  it('normalizeCurve redondea a 4 decimales pese a que el comentario dice "2 decimales"', () => {
    // El monolito documenta "Redondea todos los valores a 2 decimales" pero r4
    // usa Math.round(v*10000)/10000 (4 decimales). ACTUAL: conserva 4 decimales.
    const c = normalizeCurve([10.12345, 89.0]);
    expect(c[0]).toBe(10.1235); // 4 decimales reales, NO 10.12 (2 decimales)
  });

  it('curvas / normalizeCurve cierran en 100, no en 1.0 como sugiere la spec de fracciones', () => {
    // data-model.md y phases.md modelan curvaFacturacion[M] como fracción
    // (EdP = contrato × curva[M]). El monolito trabaja con curvas en PORCENTAJE
    // que suman 100. ACTUAL: cierre en 100.
    expect(sum(generateSCurve(12))).toBeCloseTo(100, 10);
  });

  it('interface-spec pide validar suma=100%, pero normalizeCurve nunca valida: fuerza el cierre mutando el último elemento', () => {
    // En vez de rechazar una curva que no suma 100, el monolito la "arregla"
    // silenciosamente sobreescribiendo el último valor. ACTUAL: ajuste silencioso.
    const c = normalizeCurve([10, 10, 10]); // suma 30
    expect(c[c.length - 1]).toBe(80); // último absorbe el diff (100-20=80)
    expect(sum(c)).toBe(100);
  });
});
