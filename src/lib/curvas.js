// ─── MÓDULO: curvas ───────────────────────────────────────────────────────────
// Funciones puras extraídas VERBATIM del monolito fase1_proyectos.html
// (líneas ~264-360). No se corrige ningún comportamiento, bug ni redondeo:
// este módulo es un golden master del comportamiento ACTUAL del monolito.
//
// Funciones exportadas:
//   - monthsBetween   (monolito ~264)
//   - generateSCurve  (monolito ~281)
//   - normalizeCurve  (monolito ~291)
//   - reescalarCurva  (monolito ~303)
//   - applyShift      (monolito ~325)
//   - projectMonthIdx (monolito ~354)
//
// NOTA: getMonthLabels, emptyBudget, fUF y demás funciones del monolito NO
// pertenecen a este módulo y se extraen en otros frentes.

// ─── monthsBetween (monolito ~264) ─────────────────────────────────────────────
export function monthsBetween(start, end) {
  if (!start || !end) return 0;
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const n = (ey - sy) * 12 + (em - sm) + 1;
  return n > 0 ? n : 0;
}

// ─── generateSCurve (monolito ~281) ─────────────────────────────────────────────
export function generateSCurve(n) {
  if (n <= 0) return [];
  const sCum = t => 3 * t * t - 2 * t * t * t;
  const raw = Array.from({ length: n }, (_, i) =>
    (sCum((i + 1) / n) - sCum(i / n)) * 100
  );
  return normalizeCurve(raw);
}

// ─── normalizeCurve (monolito ~291) ─────────────────────────────────────────────
// Redondea todos los valores a 2 decimales y ajusta el último para que sumen 100.00
// DIVERGENCIA SPEC: el comentario del monolito dice "Redondea todos los valores a 2
// decimales", pero el redondeo real usa r4 = Math.round(v * 10000) / 10000, es decir
// 4 decimales, no 2. El cierre objetivo es 100 (no 1.0). Se preserva tal cual.
export function normalizeCurve(curve) {
  if (!curve || curve.length === 0) return [];
  const r4 = v => Math.round((+v || 0) * 10000) / 10000;
  const rounded = curve.map(r4);
  const sum = rounded.reduce((a, b) => a + b, 0);
  const diff = r4(100 - sum);
  if (diff !== 0) rounded[rounded.length - 1] = r4(rounded[rounded.length - 1] + diff);
  return rounded;
}

// ─── reescalarCurva (monolito ~303) ─────────────────────────────────────────────
// Re-escala una curva de costos a un nuevo número de meses conservando su forma mediante interpolación lineal.
// Retorna array de pesos normalizados (suma = 1.0) de longitud N_new.
export function reescalarCurva(curve, N_new) {
  if (!curve || curve.length === 0 || N_new <= 0) {
    return Array(N_new).fill(N_new > 0 ? 1 / N_new : 0);
  }
  if (N_new === 1) return [1];
  const N_orig = curve.length;
  const scaled = [];
  for (let j = 0; j < N_new; j++) {
    const pos = j / (N_new - 1) * (N_orig - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, N_orig - 1);
    const frac = pos - lo;
    scaled.push((+curve[lo] || 0) * (1 - frac) + (+curve[hi] || 0) * frac);
  }
  const total = scaled.reduce((s, v) => s + v, 0);
  return total > 0 ? scaled.map(v => v / total) : Array(N_new).fill(1 / N_new);
}

// ─── applyShift (monolito ~325) ─────────────────────────────────────────────────
// Aplica un desplazamiento porcentual a la curva (shift ∈ [-3,3]).
// shift > 0: acelera (más ingresos/costos al inicio), shift < 0: frena (más al final).
// Conserva plazo total (mismo N) y monto total (misma suma).
// Fórmula: ajuste de campana sobre la curva acumulada: ΔC(t) = factor × 4t(1-t) × total
export function applyShift(curve, shift) {
  if (!shift || shift === 0 || !curve || curve.length === 0) return curve;
  const N = curve.length;
  const total = curve.reduce((s, w) => s + w, 0);
  if (total <= 0) return curve;
  // Curva acumulada: N+1 puntos, de 0 a total
  const cumul = [0];
  for (let i = 0; i < N; i++) cumul.push(cumul[i] + curve[i]);
  // Desplazamiento tipo campana (máximo en t=0.5, cero en t=0 y t=1)
  const factor = shift / 100;
  const shifted = cumul.map((c, i) => {
    const t = i / N;
    return Math.max(0, Math.min(total, c + factor * 4 * t * (1 - t) * total));
  });
  // Garantizar monotonicidad y cierre exacto en total
  for (let i = 1; i <= N; i++) shifted[i] = Math.max(shifted[i], shifted[i - 1]);
  shifted[N] = total;
  // Derivar pesos mensuales
  return Array.from({ length: N }, (_, i) => shifted[i + 1] - shifted[i]);
}

// ─── projectMonthIdx (monolito ~354) ────────────────────────────────────────────
// Retorna el índice del mes del proyecto para un mes calendario dado.
// Retorna -1 si el proyecto no está activo ese mes.
export function projectMonthIdx(project, year, calMonth) {
  if (!project.startDate) return -1;
  const [sy, sm] = project.startDate.split('-').map(Number);
  const idx = (year - sy) * 12 + calMonth - (sm - 1);
  if (idx < 0 || idx >= project.durationMonths) return -1;
  return idx;
}
