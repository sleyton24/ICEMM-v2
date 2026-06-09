import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { knownUNs, detectarUNsDesconocidas, detectarSinClasificar, mesesYaCargados } from './validacionCarga.js';
import { classifyManagerCode } from './clasificacion.js';

const projects = [{ unCode: '02' }, { unCode: '03' }, { unCode: '04' }];

describe('knownUNs', () => {
  it('incluye proyectos + Oficina Central 01', () => {
    const k = knownUNs(projects);
    expect(k.has('01')).toBe(true);
    expect(k.has('02')).toBe(true);
    expect(k.has('99')).toBe(false);
  });
  it('sin proyectos, igual incluye 01', () => {
    expect([...knownUNs(null)]).toEqual(['01']);
  });
});

describe('detectarUNsDesconocidas', () => {
  const known = knownUNs(projects);
  it('marca una UN que no es proyecto ni OC y agrega su UF', () => {
    const rows = [
      { unCode: '02', total: 100 },
      { unCode: '07', unDesc: 'OBRA FANTASMA', total: 30 },
      { unCode: '07', unDesc: 'OBRA FANTASMA', total: 20 },
    ];
    const out = detectarUNsDesconocidas(rows, known);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ unCode: '07', unDesc: 'OBRA FANTASMA', uf: 50 });
  });
  it('no marca 01 (OC) ni proyectos conocidos', () => {
    const rows = [{ unCode: '01', total: 10 }, { unCode: '03', total: 5 }];
    expect(detectarUNsDesconocidas(rows, known)).toHaveLength(0);
  });
  it('rows vacío/nulo → []', () => {
    expect(detectarUNsDesconocidas(null, known)).toEqual([]);
  });
});

describe('detectarSinClasificar', () => {
  it('marca códigos no_clasificado con concepto, agrega count y uf', () => {
    const rows = [
      { concepto: '575', clasificacion: 'no_clasificado', total: 12 },
      { concepto: '575', clasificacion: 'no_clasificado', total: 8 },
      { concepto: '120', clasificacion: 'materiales', total: 100 },
    ];
    const out = detectarSinClasificar(rows);
    expect(out).toEqual([{ concepto: '575', count: 2, uf: 20 }]);
  });
  it('NO marca no_clasificado por código vacío/0 (sin código real)', () => {
    const rows = [
      { concepto: '', clasificacion: 'no_clasificado', total: 5 },
      { concepto: '0', clasificacion: 'no_clasificado', total: 5 },
    ];
    expect(detectarSinClasificar(rows)).toHaveLength(0);
  });
});

describe('mesesYaCargados', () => {
  it('devuelve etiquetas MM/YYYY de los meses ya existentes', () => {
    const staged = [{ year: 2026, month: 1 }, { year: 2026, month: 3 }];
    const exists = (y, m) => y === 2026 && m === 1; // solo enero existe
    expect(mesesYaCargados(staged, exists)).toEqual(['01/2026']);
  });
  it('ninguno existente → []', () => {
    expect(mesesYaCargados([{ year: 2026, month: 5 }], () => false)).toEqual([]);
  });
});

// ── Validación contra datos reales ───────────────────────────────────────────
const FILE = fileURLToPath(new URL('../../manager/reporte_manager.txt', import.meta.url));
describe('datos reales: validación de carga (8 categorías)', () => {
  if (!existsSync(FILE)) { it.skip('archivo no presente', () => {}); return; }
  const txt = readFileSync(FILE, 'utf8');
  const lines = txt.split(/\r?\n/).filter(l => l.length);
  const H = lines[0].split('\t').map(s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]+/g, '_'));
  const cConc = H.findIndex(h => h.includes('concepto1_codigo'));
  const cUn = H.findIndex(h => h.includes('codigo_unidad'));
  const cExe = H.findIndex(h => h.includes('exento_detalle_uf'));
  const cAfe = H.findIndex(h => h.includes('afecto_detalle_uf'));
  const num = v => { const f = parseFloat(String(v ?? '').trim()); return isNaN(f) ? 0 : f; };
  const rows = lines.slice(1).map(l => {
    const c = l.split('\t');
    const concepto = String(c[cConc] ?? '').trim();
    return { unCode: String(c[cUn] ?? '').trim(), concepto, clasificacion: classifyManagerCode(concepto), total: num(c[cExe]) + num(c[cAfe]) };
  });

  it('bajo el modelo de 8 categorías NO hay códigos sin clasificar en datos reales', () => {
    expect(detectarSinClasificar(rows)).toHaveLength(0);
  });
});
