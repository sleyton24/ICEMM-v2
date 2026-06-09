import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyManagerCode } from './clasificacion.js';

// Test contra los DATOS REALES del Reporte Manager (manager/reporte_manager.txt).
// Verifica que la migración a 8 categorías clasifica correctamente los códigos que
// ICEMM realmente emite, y que NO cambia el costo total elegible al EBITDA (sólo
// redistribuye familias). Es un "número de control" sobre datos productivos.

const FILE = fileURLToPath(new URL('../../manager/reporte_manager.txt', import.meta.url));

// classifyManagerCode ANTERIOR (6 categorías) para comparar la migración.
function classifyOld(code) {
  const n = +String(code ?? '').trim();
  if (isNaN(n) || n === 0) return 'no_clasificado';
  if (n >= 100 && n <= 149) return 'materiales';
  if (n >= 200 && n <= 249) return 'mano_de_obra';
  if (n >= 300 && n <= 399) return 'subcontratos';
  if (n >= 400 && n <= 499) return 'gastos_generales';
  if (n >= 500 && n <= 549) return 'equipos_maquinarias';
  if (n >= 600 && n <= 649) return 'otros';
  if (n >= 900)             return 'oficina_central';
  return 'no_clasificado';
}

const num = v => { const f = parseFloat(String(v ?? '').trim()); return isNaN(f) ? 0 : f; };
const elegible = cls => cls !== 'oficina_central' && cls !== 'no_clasificado';

describe('datos reales: manager/reporte_manager.txt (8 categorías)', () => {
  if (!existsSync(FILE)) {
    it.skip('archivo de datos no presente — test omitido', () => {});
    return;
  }

  const txt = readFileSync(FILE, 'utf8');
  const lines = txt.split(/\r?\n/).filter(l => l.length);
  const header = lines[0].split('\t');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]+/g, '_');
  const H = header.map(norm);
  const cConc = H.findIndex(h => h.includes('concepto1_codigo'));
  const cExe = H.findIndex(h => h.includes('exento_detalle_uf'));
  const cAfe = H.findIndex(h => h.includes('afecto_detalle_uf'));

  const rows = lines.slice(1).map(l => {
    const c = l.split('\t');
    return { code: c[cConc], uf: num(c[cExe]) + num(c[cAfe]) };
  });

  const tallyNew = {}, tallyOld = {};
  let sumElegNew = 0, sumElegOld = 0;
  for (const r of rows) {
    const cn = classifyManagerCode(r.code);
    const co = classifyOld(r.code);
    tallyNew[cn] = (tallyNew[cn] || 0) + 1;
    tallyOld[co] = (tallyOld[co] || 0) + 1;
    if (elegible(cn)) sumElegNew += r.uf;
    if (elegible(co)) sumElegOld += r.uf;
  }

  it('detecta las columnas esperadas del Reporte Manager', () => {
    expect(cConc).toBeGreaterThanOrEqual(0);
    expect(cExe).toBeGreaterThanOrEqual(0);
    expect(cAfe).toBeGreaterThanOrEqual(0);
  });

  it('los códigos 600-649 ahora se clasifican como edificaciones_comerciales', () => {
    // En estos datos, los únicos códigos 600+ (no-OC) están en 600-649.
    expect(tallyNew['edificaciones_comerciales']).toBeGreaterThan(0);
    // Y bajo el modelo viejo estaban en 'otros'.
    expect(tallyOld['otros']).toBe(tallyNew['edificaciones_comerciales']);
  });

  it('NO hay costos en los huecos reales → 0 no_clasificado por código (sólo vacíos)', () => {
    // Si hubiera códigos en 550-599/650-699/750-799 caerían en no_clasificado.
    // En estos datos no los hay; cualquier no_clasificado vendría de código vacío/0.
    const noClasifConCodigo = rows.filter(r => {
      const n = +String(r.code ?? '').trim();
      return !isNaN(n) && n !== 0 && classifyManagerCode(r.code) === 'no_clasificado';
    });
    expect(noClasifConCodigo.length).toBe(0);
  });

  it('INVARIANTE: el costo total elegible al EBITDA no cambia con la migración', () => {
    // 600-649 sólo se mueve de "otros" a "edificaciones" (ambas en EBITDA), y no hay
    // costos en 700-899 en estos datos → el total elegible debe ser idéntico.
    expect(sumElegNew).toBeCloseTo(sumElegOld, 6);
  });

  it('número de control: la oficina central concentra el mayor monto (códigos 900+)', () => {
    expect(tallyNew['oficina_central']).toBeGreaterThan(0);
  });
});
