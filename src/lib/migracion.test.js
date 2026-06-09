import { describe, it, expect } from 'vitest';
import { reclasificarActuals, migrarProjectBudget } from './migracion.js';

describe('reclasificarActuals (migración v2 — 8 categorías)', () => {
  it('600-649 pasa de "otros" a "edificaciones_comerciales"', () => {
    const data = { year: 2026, month: 3, rows: [
      { unCode: '02', concepto: '620', clasificacion: 'otros', total: 15.26 },
    ]};
    const { data: out, reclasificadas } = reclasificarActuals(data);
    expect(out.rows[0].clasificacion).toBe('edificaciones_comerciales');
    expect(reclasificadas).toBe(1);
  });

  it('700-749 pasa de "no_clasificado" a "post_venta" (costo recuperado al EBITDA)', () => {
    const data = { rows: [{ unCode: '02', concepto: '710', clasificacion: 'no_clasificado', total: 50 }]};
    const { data: out, reclasificadas } = reclasificarActuals(data);
    expect(out.rows[0].clasificacion).toBe('post_venta');
    expect(reclasificadas).toBe(1);
  });

  it('800-899 pasa de "no_clasificado" a "otros"', () => {
    const data = { rows: [{ unCode: '02', concepto: '850', clasificacion: 'no_clasificado', total: 10 }]};
    const { data: out } = reclasificarActuals(data);
    expect(out.rows[0].clasificacion).toBe('otros');
  });

  it('filas ya correctas no cambian (materiales 120)', () => {
    const data = { rows: [{ concepto: '120', clasificacion: 'materiales', total: 5 }]};
    const { reclasificadas } = reclasificarActuals(data);
    expect(reclasificadas).toBe(0);
  });

  it('fila SIN código (concepto vacío/null) NO se toca', () => {
    const data = { rows: [
      { concepto: '', clasificacion: 'no_clasificado', total: 1 },
      { concepto: null, clasificacion: 'materiales', total: 2 },
    ]};
    const { data: out, reclasificadas } = reclasificarActuals(data);
    expect(reclasificadas).toBe(0);
    expect(out.rows[0].clasificacion).toBe('no_clasificado');
    expect(out.rows[1].clasificacion).toBe('materiales');
  });

  it('huecos reales (550-599, 650-699, 750-799) siguen en no_clasificado', () => {
    const data = { rows: [
      { concepto: '575', clasificacion: 'no_clasificado', total: 1 },
      { concepto: '675', clasificacion: 'no_clasificado', total: 1 },
      { concepto: '775', clasificacion: 'no_clasificado', total: 1 },
    ]};
    const { reclasificadas } = reclasificarActuals(data);
    expect(reclasificadas).toBe(0);
  });

  it('es IDEMPOTENTE: una segunda corrida no cambia nada', () => {
    const data = { rows: [
      { concepto: '620', clasificacion: 'otros', total: 1 },
      { concepto: '710', clasificacion: 'no_clasificado', total: 1 },
    ]};
    const r1 = reclasificarActuals(data);
    expect(r1.reclasificadas).toBe(2);
    const r2 = reclasificarActuals(r1.data);
    expect(r2.reclasificadas).toBe(0);
  });

  it('data sin rows o nula se devuelve intacta', () => {
    expect(reclasificarActuals(null).reclasificadas).toBe(0);
    expect(reclasificarActuals({}).reclasificadas).toBe(0);
  });

  it('NO cambia el total UF de costo elegible al EBITDA (solo redistribuye familias)', () => {
    // 600-649 estaba en 'otros' (en EBITDA) y pasa a 'edificaciones' (también en EBITDA).
    const data = { rows: [
      { concepto: '120', clasificacion: 'materiales', total: 100 },
      { concepto: '620', clasificacion: 'otros', total: 15 },
    ]};
    const sumElegible = rows => rows.filter(r => r.clasificacion !== 'oficina_central' && r.clasificacion !== 'no_clasificado').reduce((s, r) => s + r.total, 0);
    const antes = sumElegible(data.rows);
    const { data: out } = reclasificarActuals(data);
    expect(sumElegible(out.rows)).toBe(antes); // 115 antes y después
  });
});

describe('migrarProjectBudget (completa las 8 familias)', () => {
  it('agrega edificaciones_comerciales y post_venta en 0 si faltan', () => {
    const p = { id: 'proj-002', budgetByCategory: { materiales: 50000, otros: 500 } };
    const out = migrarProjectBudget(p);
    expect(out.budgetByCategory.edificaciones_comerciales).toBe(0);
    expect(out.budgetByCategory.post_venta).toBe(0);
    expect(out.budgetByCategory.materiales).toBe(50000); // no toca lo existente
    expect(out.budgetByCategory.otros).toBe(500);
  });

  it('no pisa valores ya presentes', () => {
    const p = { id: 'x', budgetByCategory: { edificaciones_comerciales: 999, post_venta: 7 } };
    const out = migrarProjectBudget(p);
    expect(out.budgetByCategory.edificaciones_comerciales).toBe(999);
    expect(out.budgetByCategory.post_venta).toBe(7);
  });

  it('proyecto sin budgetByCategory se devuelve intacto', () => {
    const p = { id: 'x' };
    expect(migrarProjectBudget(p)).toEqual(p);
  });
});
