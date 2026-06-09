// ─────────────────────────────────────────────────────────────────────────────
// Módulo: validacionCarga
// Lógica PURA de validación del Reporte Manager. Espeja la validación inline de
// processManagerRows / confirmManagerLoad del monolito (fase1_proyectos.html).
// Antes el monolito declaraba warnSet/unCodes pero NUNCA los usaba: una UN
// desconocida se persistía en silencio y se perdía aguas abajo.
// ─────────────────────────────────────────────────────────────────────────────

// UNs conocidas: proyectos registrados + Oficina Central ('01').
export function knownUNs(projects) {
  return new Set([...(projects || []).map(p => p.unCode), '01']);
}

// UNs desconocidas en las filas (ni proyecto ni OC). Sus costos NO se imputan a
// ningún proyecto aguas abajo. Devuelve [{ unCode, unDesc, uf }] agregado.
export function detectarUNsDesconocidas(rows, known) {
  const acc = {};
  for (const r of rows || []) {
    if (!r) continue;
    if (!known.has(r.unCode)) {
      if (!acc[r.unCode]) acc[r.unCode] = { unCode: r.unCode, unDesc: r.unDesc || '', uf: 0 };
      acc[r.unCode].uf += (+r.total || 0);
    }
  }
  return Object.values(acc);
}

// Códigos sin clasificación (clasificacion === 'no_clasificado' con concepto no vacío
// ni 0). Quedan en "Sin Clasificar", fuera del costo de obra. Devuelve [{ concepto, count, uf }].
export function detectarSinClasificar(rows) {
  const acc = {};
  for (const r of rows || []) {
    if (!r) continue;
    if (r.clasificacion === 'no_clasificado' && r.concepto && +r.concepto !== 0) {
      if (!acc[r.concepto]) acc[r.concepto] = { concepto: r.concepto, count: 0, uf: 0 };
      acc[r.concepto].count++;
      acc[r.concepto].uf += (+r.total || 0);
    }
  }
  return Object.values(acc);
}

// De una lista de meses staged ({ year, month }), los que YA existen según existsFn(year, month).
// Devuelve etiquetas "MM/YYYY". Evita la sobre-escritura silenciosa.
export function mesesYaCargados(staged, existsFn) {
  return (staged || [])
    .filter(({ year, month }) => existsFn(year, month))
    .map(({ year, month }) => `${String(month).padStart(2, '0')}/${year}`);
}
