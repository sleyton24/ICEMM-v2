// ─── formato.js ───────────────────────────────────────────────────────────────
// Funciones puras de formateo y parseo numérico extraídas VERBATIM del monolito
// fase1_proyectos.html. NO se corrige ningún comportamiento (golden master).
//
// Origen en el monolito:
//   - fUF       → línea ~259 (const arrow, sección UTILIDADES)
//   - toNumCL   → línea ~2549 (dentro de DataLoader)
//   - fN        → línea ~6695 (variante con umbral < 0.005 → '—', 2 decimales)
//
// IMPORTANTE sobre los guiones (DIVERGENCIA / inconsistencia interna del monolito):
//   - fUF devuelve EN-DASH  '–' (U+2013) para null / '' / NaN.
//   - fN  devuelve EM-DASH  '—' (U+2014) para |v| < 0.005.
//   Son caracteres distintos. Se preservan TAL CUAL están en el código actual.

// ─────────────────────────────────────────────────────────────────────────────
// fUF — formatea un valor numérico como UF en formato es-CL (miles con '.',
// 2 decimales con ','). Para null, '' o valores no numéricos devuelve EN-DASH.
//
// DIVERGENCIA SPEC: fUF usa EN-DASH '–' (U+2013) para el "guion" de valor nulo,
// mientras fN (misma biblioteca) usa EM-DASH '—' (U+2014) para su placeholder.
// Inconsistencia de glifo preservada verbatim (a corregir en Frente 3).
// (línea ~259 del monolito)
export const fUF = v =>
  v == null || v === '' || isNaN(+v)
    ? '–'
    : (+v).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// toNumCL — parsea un string en formato numérico chileno ('1.234,56') a Number.
// (línea ~2549 del monolito, dentro de DataLoader)
//
// Nota: el nombre real en el monolito es `toNumCL` (NO existe `parseNumCL`).
// Se exporta también un alias `parseNumCL` por conveniencia del Frente, pero el
// nombre canónico exacto del monolito es `toNumCL`.
//
// Comportamiento VERBATIM:
//   - number  → se devuelve si isFinite, si no 0.
//   - string  → trim + se eliminan TODOS los espacios.
//   - '' o '-' → 0.
//   - si contiene ',' → se eliminan los '.' (miles) y la ',' pasa a '.' decimal.
//   - si matchea patrón de miles con punto ('1.234' / '1.234.567') → se quitan '.'.
//   - en otro caso → parseFloat directo (interpreta '.' como decimal).
export function toNumCL(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s || s === '-') return 0;
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, '')) || 0;
  return parseFloat(s) || 0;
}

// Alias por conveniencia (el nombre canónico del monolito es toNumCL).
export const parseNumCL = toNumCL;

// ─────────────────────────────────────────────────────────────────────────────
// fN — formatea un Number en es-CL con 2 decimales, devolviendo EM-DASH '—'
// cuando el valor absoluto es menor a 0.005 (umbral de "cero efectivo").
// (línea ~6695 del monolito; variantes idénticas en ~7958 y ~9818)
//
// DIVERGENCIA SPEC: fN usa EM-DASH '—' (U+2014), distinto del EN-DASH '–'
// (U+2013) que usa fUF. Inconsistencia de glifo preservada verbatim
// (a corregir en Frente 3).
export const fN = n => {
  const v = +n || 0;
  if (Math.abs(v) < 0.005) return '—';
  return v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
