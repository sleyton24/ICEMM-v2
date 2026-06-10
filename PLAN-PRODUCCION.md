# Plan de Producción — ICEMM / EMM Control Presupuestario

> Generado a partir de la auditoría multiagente (2026-06-10, veredicto **NO-GO**) + plan
> módulo-por-módulo. Documento vivo: marcar tareas a medida que se completan.
> Veredicto actual: **NO-GO** hasta cerrar las fases P0/P1.

## Estado al 2026-06-10 (avance de código)

Trabajo de código en rama `frente3-8-categorias` (verificado: Babel OK + 266 tests `src/lib`; navegación
probada en navegador por el usuario). **NADA aplicado al VPS todavía** (por decisión: el VPS se toca al final).

- ✅ **Fase 1** — monolito: arrastre de saldo IVA entre años, validación de `unCode`/fechas/montos, anticipos
  demo 2026 removidos, fix TDZ de Control de Costos. ICEMM endurecido **preparado sin commitear** (repo público).
- 🔴 **Fase 2** — BLOQUEADA por Acta 1 (mapeo 600/700/800). Respaldo automático pre-migración ya implementado.
- ✅ **Fase 3** — COMPLETA (P0+P1): snapshots reales de Dashboard/Escenarios/Check/Scorecard, bloqueo de edición
  de Control de Obras en meses cerrados, vista de período cerrado completa en Proyecciones, frescura de caja.
- ✅ **Fase 4** — persistencia robusta (sin pérdida silenciosa, corrupción visible, import seguro, respaldo
  automático+periódico). Falta `dataStore` async (prereq de Fase 5).
- 🔴 **Fase 5** — depende de todo + seguridad + Acta 1.
- 🟡 **Fase 6** — `cfRows` portado a `src/lib` con tests. Falta build Vite.

**El código seguro y no bloqueado está esencialmente agotado.** El camino crítico ahora es del usuario:
**(A)** incidente de seguridad y **(B)** las 2 actas contables (ver sección de tareas humanas más abajo / chat).

## Visión general

El monolito `fase1_proyectos.html` funciona hoy como **prototipo monousuario sobre localStorage**
(sin backend de datos), con cinco problemas estructurales:

1. **Secreto expuesto** — la clave SQL del ERP PRESTO está publicada en GitHub público.
2. **Clasificación invertida** — las familias 600/700/800 están mapeadas al revés del ERP; el
   total/EBITDA son correctos pero **el desglose por familia está cruzado** (ya horneado en 10 años
   de actuals vía `migrateSchema` v2).
3. **Sin backend de datos** — todo en localStorage; borrar caché = perder todo; multiusuario ilusorio.
4. **Snapshots fantasma** — Dashboard/Escenarios/Check/Scorecard muestran datos **vivos** bajo banner
   "cerrado/solo lectura".
5. **Descuadre de IVA** entre años (`createNextYear` no arrastra el saldo de diciembre).

**Destino:** Estrategia **B → D**. Las fases P0/P1 dejan la app en producción confiable; las P2
(build Vite, drill-down) van después.

## Estrategia arquitectónica: B0 → B → D

| Paso | Qué | Cuándo |
|------|-----|--------|
| **B0** (honesto) | Sigue en localStorage pero endurecido: respaldo automático, `storage.set` fiable, detección de corrupción, login declarado cosmético, `servidor.ps1` solo loopback. | Fases 1–4 |
| **B** (estructural) | El monolito consume la **API REST de ICEMM**: `CargaERP` reemplaza la carga manual del Reporte Manager, `PlanCuentas` es la **autoridad única de clasificación** (resuelve la inversión de raíz), `Project` de Postgres es el catálogo, e Informe persiste snapshots server-side. | Fase 5 |
| **D** (post-prod) | Build **Vite** que **importe `src/lib`** (elimina la duplicación a mano), luego TypeScript + descomposición de `App()`. | Fase 6 |

**Clave de correspondencia confirmada:** `unCode` (monolito, string `'02'`) **==** `unidadNegocioCodigo`
(ICEMM, Int `2`), **ambos en UF sin conversión**. Requiere normalizar tipo/formato como contrato de join.
Para habilitar B sin reescribir ~100 call sites se introduce una **capa de persistencia abstracta
(`dataStore` async)** que hoy envuelve localStorage y mañana apunta a la API.

> ⚠️ **Orden crítico:** B requiere el backend ICEMM endurecido (TLS, `BETA_MODE=false`, CORS) y la clave
> ERP rotada **antes** de apuntar el monolito a la API. El fix de clasificación + `SCHEMA_VERSION` 3 +
> tests deben estar **dentro** de `frente3-8-categorias` **antes** de mergearla.

---

## FASE 0 — Emergencia de seguridad + decisiones de negocio
**Objetivo:** cortar la fuga de credencial y obtener las dos actas de contabilidad que destraban todo.
**Esfuerzo:** ~1 semana (mayormente coordinación con TI/SQL y contabilidad).

| ✓ | Tarea | Archivos | Pri |
|---|-------|----------|-----|
| ☐ | **Rotar** la clave SQL `sleyton` en BNVSOFSQL; crear login solo-lectura (`db_datareader`). Tratar `20 Lyt 25$` como comprometida. Revisar logs del ERP. | SQL Server (fuera de repo) | P0 |
| ☐ | Hacer **privado/eliminar** `github.com/sleyton24/ICEMM` y **purgar historial** (BFG/filter-repo sobre `a486311`) + force-push. | `ICEMM/.git` | P0 |
| ☐ | Mover credenciales a **variables de entorno** (`.env` no commiteado) en los 3 scripts Python; usar la clave nueva. | `informe_lq.py:13-18`, `exportar_detalle.py:15-24`, `exportar_movimientos.py:17-26` | P0 |
| ☐ | Eliminar el directorio fantasma `ICEMM/icemm~/` y el `.git` anidado. | `ICEMM/icemm~/`, `ICEMM/.git` | P0 |
| ☐ | Crear **remote privado** para el monolito y pushear commits + rama (hoy viven solo en este disco). | raíz + `.gitignore` | P0 |
| ☐ | **ACTA CONTABLE 1:** confirmar que manda el ERP (600=Otros, 700=Edificaciones Comerciales, 800=Post Venta) y dónde va la cuenta 604. | `informe_lq.py:124-141`, `files/data-model.md:151-162` | P0 |
| ☐ | **ACTA CONTABLE 2:** mecánica de devolución de anticipo (¿solo en caja, no en EERR?) y doble conteo. | `fase1:8383-8400` (getAnticipoProy) | P0 |

**Salida:** clave rotada, repo privado+purgado, `icemm~/` eliminado, monolito con remote privado, `.env`
funcionando. **Dos actas firmadas.** Sin actas, las Fases 2 y 3 no arrancan.

---

## FASE 1 — Quick wins de correctitud + endurecer backend ICEMM
**Objetivo:** arreglar defectos que no dependen de las actas y dejar el backend listo para Estrategia B.
**Esfuerzo:** ~1–1.5 semanas (paralelizable).

| ✓ | Tarea | Archivos | Pri |
|---|-------|----------|-----|
| ✅ | **Control de Costos — bug TDZ:** mover `useEffect` de auto-tab debajo de `controlMonth`. *(YA CORREGIDO en esta sesión + Babel OK).* | `fase1:11557-11569` | P0 |
| ☐ | **FlujoCaja — arrastrar saldo IVA dic:** persistir `saldoIVADic` y que `createNextYear` lea `saldoIVADicAnterior`. | `fase1:11888-11895`, `:8481-8493` | P0 |
| ☐ | Confirmar semántica del arrastre IVA (signo) + test de borde del cruce de año en `src/lib`. | `fase1:8434-8466` + tests | P0 |
| ☐ | Eliminar siembra hardcodeada de anticipos demo 2026 (LQ/OC/AP). | `fase1:4256-4273`, `:8099-8114` | P1 |
| ☐ | **ICEMM:** `BETA_MODE=false` por defecto; exigir `JWT_SECRET` fuerte (abortar si placeholder); crear admin real antes de cerrar beta. | `first-deploy.sh:78,82`, `auth.ts:27-34` | P0 |
| ☐ | **ICEMM:** habilitar TLS (certbot + dominio), server 443 + redirect 80→443 + HSTS, versionado en el `.conf`. | `nginx-icemm.conf:4-6` | P0 |
| ☐ | **ICEMM:** acotar `CORS_ORIGIN` a orígenes explícitos (no `*`). | `first-deploy.sh:77`, `index.ts:19-22` | P1 |
| ☐ | **ICEMM:** `prisma migrate deploy` (no `db push --accept-data-loss`); backup diario de Postgres probado. | `release.sh:25-26`, `first-deploy.sh:59-62` | P1 |

**Salida:** Control de Costos renderiza con datos reales; IVA arrastra entre años (con test); backend
responde 401 sin token, sirve por HTTPS, CORS restringido, backup diario probado.

---

## FASE 2 — Corregir clasificación invertida (#2) + migración v3 + MERGE
**Objetivo:** alinear la clasificación con el ERP, re-derivar el histórico con respaldo, y SOLO ENTONCES
mergear `frente3-8-categorias`. **Depende del acta contable de la Fase 0.**
**Esfuerzo:** ~1.5–2 semanas. **Es el corazón de la correctitud de datos.**

| ✓ | Tarea | Archivos | Pri |
|---|-------|----------|-----|
| ☐ | **PRE-REQUISITO:** respaldo automático ANTES de `migrateSchema` (volcar `budget-control:*` a backup + JSON). Si el backup falla, **abortar** la migración. | `fase1:2278`, `:206-226` | P0 |
| ☐ | Corregir `classifyManagerCode` en **LAS DOS copias** (monolito + `src/lib`): 600→otros, 700→edificaciones_comerciales, 800→post_venta. Resolver dónde va 604. | `fase1:2261-2263` + `src/lib/clasificacion.js:102-104` | P0 |
| ☐ | Subir `SCHEMA_VERSION` a **3** + migración v3 que **re-derive `r.clasificacion` desde `r.concepto`** sobre todos los actuals; idempotente, con log de filas cambiadas. | `fase1:2276-2311`, `src/lib/migracion.js` | P0 |
| ☐ | Actualizar tests golden-master (hoy fijan el bug) a la verdad del ERP + test de migración v2→v3. Suite verde (240+). | `clasificacion.test.js`, `migracion.test.js` | P0 |
| ☐ | Completar `makeSampleProjects` con las 8 categorías. | `fase1:431-474` | P1 |
| ☐ | **Unificar el EBITDA:** misma regla de `no_clasificado` en Informe vs Dashboard/Scorecard/Control de Costos (hoy hay dos EBITDA distintos). | `fase1:7222-7223` vs `8320/9304/9743` | P1 |
| ☐ | Bloqueo opcional de carga si hay UF sin clasificar sobre umbral. | `fase1:2256-2265`, `:2579-2588` | P1 |
| ☐ | **Validación E2E:** cuadrar el desglose por familia de un período conocido contra `informe_lq.py` **a nivel de FILA** (el total no cambia → el error es invisible en KPIs). | pipeline de carga + ref ERP | P1 |
| ☐ | **MERGE de `frente3-8-categorias` a main** — solo tras las P0 anteriores dentro de la rama y la validación E2E. | rama | P0 |

**Salida:** `classifyManagerCode` idéntico en ambas copias y alineado al ERP; `SCHEMA_VERSION`=3 ejecutada
tras respaldo; suite verde fijando el mapeo **correcto**; validación E2E cuadra a nivel de fila; rama mergeada.

---

## FASE 3 — Integridad de informes cerrados (snapshots fantasma, #6)
**Objetivo:** que un informe "cerrado" sea **inmutable y reproducible**. Hoy 4 módulos muestran datos
vivos bajo banner de cierre. **Esfuerzo:** ~2–2.5 semanas. **← Candidato a producción monousuario/loopback (H3).**

| ✓ | Tarea | Archivos | Pri |
|---|-------|----------|-----|
| ☐ | **Escribir en el cierre** las 4 claves hoy fantasma (`{dashboard,scenarios,check,scorecard}-snapshot:{year}`), serializando lo renderizado (incl. `controlMonth` congelado). | `fase1:7247-7307`, `:4102-4118` | P0 |
| ☐ | **Dashboard:** gatear todo por `periodoVistoDB`; leer del snapshot si !=='actual'. | `fase1:9519-9683` | P0 |
| ☐ | **Escenarios:** period-aware; leer snapshot, congelar portafolio activo + `controlMonth`. | `fase1:9803-9897` | P0 |
| ☐ | **Check Contable:** leer `check-snapshot`; corregir asimetría de Costos de Venta; robustecer CLP→UF con UF de fecha de cierre. | `fase1:9917-9972`, `:2513-2520` | P0 |
| ☐ | **Scorecard:** que Económico y Plazo respeten `periodoVistoSC` desde el snapshot. | `fase1:10300-10822` | P0 |
| ☐ | **Control de Obras:** bloquear edición de meses ya cerrados. | `fase1:11323-11483` | P0 |
| ☐ | **Proyecciones:** completar la vista de período cerrado (renderizar todo lo congelado, no solo ingresos). | `fase1:6699-6743` | P1 |
| ☐ | **Dashboard:** indicador de frescura de la Caja Proyectada (detectar `cajaMensual` stale). | `fase1:9388-9392` | P1 |

**Salida:** al cerrar un mes se escriben las 4 claves; navegar a un mes cerrado muestra datos congelados que
no cambian al cargar nuevos actuals; Control de Obras no edita meses cerrados; el banner "🔒 datos fijados"
deja de ser falso.

---

## FASE 4 — Persistencia robusta + capa de datos abstracta (paso 0 de B)
**Objetivo:** cerrar pérdidas silenciosas y construir el `dataStore` async que habilitará la API.
**Esfuerzo:** ~2–3 semanas. **← Producción local endurecida (H4).**

| ✓ | Tarea | Archivos | Pri |
|---|-------|----------|-----|
| ☐ | `storage.set` fiable: devolver `false` si ninguna escritura tuvo éxito; auditar callers críticos para que frenen el flujo (no pérdida silenciosa por cuota). | `fase1:180-186` + callers | P0 |
| ☐ | Detección de corrupción en `storage.get`: distinguir ausente de JSON inválido; preservar `.corrupt`, avisar, NO caer a sample/empty. | `fase1:172-179`, `:11874-11876` | P0 |
| ☐ | Endurecer import: validar `_meta.schemaVersion`, respaldar antes de sobrescribir, todo-o-nada. | `fase1:229-261` | P1 |
| ☐ | Respaldo automático periódico (al cierre + 1×/día); marca de "último respaldo"; medir cuota. | `fase1:7283-7288`, `:206-226` | P1 |
| ☐ | **Capa `dataStore` async** (getAsync/setAsync) que envuelve localStorage; migrar ~100 call sites. *Prerequisito de Fase 5.* | `fase1:169-187` + call sites | P1 |
| ☐ | **Proyectos:** validar unicidad de `unCode` (normalizado), coherencia de fechas, montos negativos/NaN. | `fase1:996-1015`, `:1349-1356` | P0 |
| ☐ | **Decisión de login del monolito:** declararlo "control visual" + loopback, o delegar a auth de ICEMM. Mientras sea client-side, **no exponer a la red.** | `fase1:10465-11906`, `servidor.ps1` | P1 |

**Salida:** un fallo de cuota frena con error visible; un JSON corrupto se detecta y preserva; import valida
y respalda; `dataStore` async en su lugar; no se puede crear `unCode` duplicado; política de login documentada.

---

## FASE 5 — Estrategia B: el monolito consume la API de ICEMM
**Objetivo:** resolver de raíz #2 (clasificación) y #4 (sin backend) apuntando `dataStore` a la API.
**Depende de TODO lo anterior.** **Esfuerzo:** ~3–4 semanas. **← Producción multiusuario plena (H5, objetivo de salida).**

| ✓ | Tarea | Archivos | Pri |
|---|-------|----------|-----|
| ☐ | Adaptador `dataStore`→API: catálogo `/api/projects`, clasificación `/api/plan-cuentas` (autoridad única), snapshots `/api/informes`, gasto real `/api/projects/:id/erp`. localStorage = caché offline + cola de sync. Estrategia de concurrencia para cierres. | adaptador + routes ICEMM | P1 |
| ☐ | Adaptador catálogo: normalizar `unCode`(str '02') ↔ `unidadNegocioCodigo`(Int 2); migrar `actuals.unCode` al formato canónico. | `fase1:11869-11876`, `schema.prisma:62-66` | P1 |
| ☐ | **CargaDatos:** fetch a `CargaERP.agregadoPorCcostoPorMes` → shape de actuals (ambos UF, sin conversión); `.txt` manual como fallback; `PlanCuentas` como autoridad. | DataLoader + `projects.ts:135-186` | P1 |
| ☐ | **Control de Costos / Check:** toggle "fuente: local \| ICEMM"; el real sale de `CargaERP`; Check usa `totalUF`. | `fase1:11570-11592`, `:9946-9957` | P1 |
| ☐ | **Control de Obras / Scorecard:** migrar indicadores manuales + curvas S a la API (requiere **endpoint nuevo** en el backend). | `fase1:10766-11362` + backend nuevo | P1 |
| ☐ | **Proyecciones:** reemplazar `getReal`/`getMayorRealUF` por `CargaERP`; persistir overrides server-side (con debounce). | `fase1:4288-4324`, `:6620` | P1 |

**Salida:** borrar caché NO pierde datos; dos usuarios ven lo mismo; carga desde `CargaERP` sin `.txt`;
clasificación desde `PlanCuentas`; snapshots en `/api/informes`; fallback offline + concurrencia definida.

---

## FASE 6 — Mejoras P2 post-producción (no bloquean)
**Objetivo:** madurez técnica final. **Esfuerzo:** ~4–6 semanas, incremental, desplegable por partes.

| ✓ | Tarea | Archivos | Pri |
|---|-------|----------|-----|
| ☐ | Des-versionar ruido (backups HTML, `.jsx` stale); pin de deps CDN; Tailwind compilado local. | `.gitignore`, `fase1:10-14` | P2 |
| ☐ | **Build Vite** (clonar toolchain de `ICEMM/frontend`): extraer `<script>` a `src/app.jsx`, **importar `src/lib`** borrando la copia inline (elimina el drift). Tests + diff visual tras cada paso. | `fase1:60-11940` → `src/app.jsx` | P2 |
| ☐ | Reemplazar if-ranges por lookup contra `plan-cuentas.json`; cerrar OC 908. | `src/lib/clasificacion.js` | P2 |
| ☐ | Drill-down por proveedor (`transaccionesPorCcosto`) en sobrecostos y Check. | `fase1:11730-11743`, `:10035-10114` | P2 |
| ☐ | Scorecard: vista cartera multi-proyecto, cobertura del score, trazabilidad. | `fase1:10302-10381` | P2 |
| ☐ | Portar la matriz de flujo (`cfRows`) a `src/lib` con tests. | `fase1:8403-8478` → `src/lib` | P2 |
| ☐ | (Largo plazo) TypeScript + ESLint + descomposición de `App()`. | `src/app.jsx` | P2 |

---

## Hitos de producción

- **H0** (fin F0): cero secretos expuestos; dos actas de contabilidad firmadas.
- **H1** (fin F1): Control de Costos renderiza; IVA arrastra; backend ICEMM con TLS/BETA_MODE=false/CORS/backup.
- **H2** (fin F2): clasificación alineada al ERP y verificada E2E; `SCHEMA_VERSION` 3; rama mergeada.
- **H3** (fin F3): informes cerrados inmutables. **← Candidato a producción monousuario/loopback.**
- **H4** (fin F4): pérdidas silenciosas cerradas; catálogo validado; `dataStore` listo. **← Producción local endurecida.**
- **H5** (fin F5): backend de datos real, multiusuario. **← Producción multiusuario plena (objetivo de salida).**
- **H6** (F6): build Vite sin duplicación, drill-down, CI/TS — madurez final.

## Criterios de "listo" (Definition of Done)

1. Ningún secreto en repos ni historial; clave ERP rotada con login solo-lectura; backend ICEMM solo por
   HTTPS, autenticado, CORS restringido, `JWT_SECRET` fuerte.
2. Las dos decisiones de negocio firmadas y reflejadas en código + tests.
3. El desglose por familia de un período histórico coincide con `informe_lq.py` **a nivel de fila**; v3
   ejecutada con respaldo verificado.
4. Un mes cerrado es inmutable en todos los módulos; no se edita Control de Obras cerrado.
5. Ningún guardado falla en silencio; corrupción visible y no destructiva; respaldo automático con fecha.
6. Los datos sobreviven a borrar la caché y son los mismos para todos los usuarios; fallback offline + concurrencia.
7. `createNextYear` arrastra el IVA; el Q1 cuadra; cubierto por test.
8. Suite Vitest 240+ verde fijando el comportamiento **correcto**; cero divergencia monolito vs `src/lib`.

## Riesgos globales

- **Invisibilidad del #2:** el total/EBITDA no cambian con el fix → el error es invisible en KPIs. La
  verificación **debe** ser a nivel de fila por familia, no por totales.
- **Orden de la migración:** correr `migrateSchema`/mergear sin respaldo + sin fix #2 consolida etiquetas
  invertidas de forma irreversible. La Fase 2 va como un solo cambio coordinado.
- **Secreto ya comprometido:** pudo ser scrapeado por bots; rotar es obligatorio; purgar sin rotar no sirve.
- **Duplicación monolito vs `src/lib`:** todo cambio en lógica compartida debe tocar AMBAS copias en el
  mismo commit hasta la Fase 6.
- **Dependencia de red en B:** no apuntar a la API antes de cerrar TLS/BETA/CORS (Fase 1); sin fallback +
  concurrencia, dos usuarios corrompen un cierre.
- **Banner engañoso hoy:** hasta H3, el directorio puede decidir sobre cifras que luego mutan.
- **Lockout operativo:** crear admin real ANTES de `BETA_MODE=false`; coordinar ventana al rotar la clave SQL.
- **Auth client-side:** ningún hardening la vuelve confiable; la decisión de Fase 4 es estructural, no opcional.
