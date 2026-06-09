// ─────────────────────────────────────────────────────────────────────────────
// Módulo: migracion (v2 — 8 categorías)
// Lógica PURA que espeja la migración migrateSchema() del monolito
// (fase1_proyectos.html). Se testea acá porque toca datos reales del usuario.
// ─────────────────────────────────────────────────────────────────────────────
import { classifyManagerCode, COST_CATS } from './clasificacion.js';

// Reclasifica las filas de un objeto actuals ({ rows: [{ concepto, clasificacion, ... }] })
// re-ejecutando classifyManagerCode sobre el código (concepto) YA almacenado.
// - No toca filas sin código (concepto null/'').
// - Idempotente: una segunda corrida no cambia nada.
// Devuelve { data, reclasificadas }.
export function reclasificarActuals(data) {
  if (!data || !Array.isArray(data.rows)) return { data, reclasificadas: 0 };
  let reclasificadas = 0;
  const rows = data.rows.map(r => {
    if (r == null || r.concepto == null || r.concepto === '') return r;
    const nc = classifyManagerCode(r.concepto);
    if (r.clasificacion !== nc) { reclasificadas++; return { ...r, clasificacion: nc }; }
    return r;
  });
  return { data: { ...data, rows }, reclasificadas };
}

// Completa budgetByCategory de un proyecto con las familias faltantes en 0
// (las 2 nuevas: edificaciones_comerciales, post_venta). Espeja migrateSchema().
export function migrarProjectBudget(project) {
  if (!project || !project.budgetByCategory) return project;
  const bbc = { ...project.budgetByCategory };
  for (const c of COST_CATS) {
    if (bbc[c.id] == null) bbc[c.id] = 0;
  }
  return { ...project, budgetByCategory: bbc };
}
