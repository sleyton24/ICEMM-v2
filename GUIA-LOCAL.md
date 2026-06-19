# Guía local — App oficial, estructura y cómo levantarla

Guía rápida para saber **cuál es la app**, **qué hay en el repo** y **cómo correr la última versión
en local** para revisar cambios **antes de subir a GitHub**.

---

## 1. ¿Cuál es la app oficial?

> ✅ **La app oficial es UN solo archivo: `fase1_proyectos.html`** (la raíz del repo).
> Es el monolito productivo (React + Tailwind vía CDN, datos en el `localStorage` del navegador, montos en UF).
> Todo lo que ves/usás (Proyectos, Presupuesto, Carga de Datos, Proyecciones, Informe, Flujo de Caja,
> Check Contable, Escenarios, Dashboard, Scorecard, Control de Obras, Control de Costos) vive ahí.

**Lo que NO es la app** (no editar / no confundir):
- `fase1_proyectos.backup-*.html` → **copias viejas** (respaldos con fecha). Disponibles por si acaso, no se usan.
- `fase1_proyectos.jsx`, `files.zip` → restos antiguos del armado inicial. No se usan.
- `gestion-api/` → **el backend** (para la versión desplegada con datos compartidos). No es la app que abrís.
- `ICEMM/` → **otra app distinta** (la app full de ICEMM, gitignoreada). No es esta.

---

## 2. Estructura del repo

```
fase1_proyectos.html        ← LA APP (monolito, ~12k líneas). Editás acá.
src/lib/                    ← Biblioteca de cálculo PURA (curvas, clasificación, flujo de caja, etc.)
                              extraída del monolito, con tests Vitest (golden master).
gestion-api/                ← Backend independiente (Node/Express/Prisma/PostgreSQL) para el deploy.
deploy/                     ← Config de Nginx para servir el monolito en el VPS (nginx-gestion.conf).

Abrir App ICEMM.exe / .ps1  ← Launcher: levanta el server local y abre el navegador (Windows).
servidor.ps1                ← Server local alternativo (http://localhost:8080).
Iniciar Servidor ICEMM.bat  ← Atajo .bat para el server.

── Documentación ──
README.md                   ← Overview del repo.
GUIA-LOCAL.md               ← Este archivo.
ARQUITECTURA-DATOS.md       ← Modelo de datos (claves localStorage, qué comparte cada módulo).
CONEXION-POSTGRESQL.md      ← Diseño de la conexión a PostgreSQL.
DEPLOY-VPS.md               ← Cómo desplegar en el VPS (gestion-api + Nginx + base icemm/schema gestion).
CABLEADO-PLAN.md            ← Plan para conectar el monolito al backend (auth + datos).
PLAN-PRODUCCION.md          ← Hoja de ruta a producción por fases.

── Datos de trabajo (reales) ──
manager/                    ← Reporte Manager (.txt), Libro Mayor, Balance tributario (Excel).
ppto of central/            ← Plantilla de Oficina Central (template_OC_2026.xlsx).
curvas/                     ← Curvas S de avance por proyecto (Excel).
UF 2025.csv / UF 2026.csv   ← Valores diarios de la UF.
files/                      ← Especificación original (data-model, fases, interfaz).

── No versionado (gitignored) ──
ICEMM/                      ← Otra app (separada). node_modules/, dist/, *.exe, .env.
```

> Detalle fino del modelo de datos: ver `ARQUITECTURA-DATOS.md`.

---

## 3. Levantar la última versión en LOCAL

**Paso 1 — Traer lo último de GitHub:**
```powershell
cd "c:\Users\sleyton\BNV\Esteban Solar - INFORME GESTION"
git pull origin frente3-8-categorias
```

**Paso 2 — Abrir la app:**
- **Fácil:** doble clic en **`Abrir App ICEMM.exe`** → levanta el server y abre el navegador.
- **O por consola:** `./servidor.ps1` y luego abrir **http://localhost:8080**.

> ⚠️ **Abrila SIEMPRE por `http://localhost:8080`**, NO con doble clic en el `.html`.
> El `localStorage` (tus datos) está atado al **origen**: por `localhost:8080` ves tus datos;
> abriendo el archivo (`file://`) es otro origen y aparece **vacío**.
> Mientras la usás, NO cierres la ventanita del server (cerrarla = apagar la app).

**Datos:** viven en el `localStorage` de tu navegador (por equipo). Para mover datos entre PCs:
menú de usuario → **Respaldar** (exporta JSON) y **Restaurar** (importa).

---

## 4. Revisar cambios ANTES de subir a GitHub

**Una sola vez** (instalar dependencias de los tests):
```powershell
npm install
```

**Cada vez que cambiás algo:**
1. **Editá** `fase1_proyectos.html` (o `src/lib/...`).
2. **Probá la lógica de cálculo** (si tocaste algo de números):
   ```powershell
   npm run test:run        # corre los tests de src/lib (deben quedar TODOS en verde)
   ```
3. **Probá la app en el navegador:** refrescá **http://localhost:8080** (Ctrl+F5). Si **carga sin
   pantalla en blanco y sin errores en la consola (F12)**, el JSX transpiló bien. Hacé el smoke test
   de lo que cambiaste.
4. **Revisá el diff:**
   ```powershell
   git status
   git diff fase1_proyectos.html
   ```
5. **Commit + push:**
   ```powershell
   git add -A
   git commit -m "descripción del cambio"
   git push
   ```

> 💡 Si la app **no carga** (pantalla en blanco): abrí la consola (F12) → el error te dice la línea.
> Suele ser un error de sintaxis en el JSX. Corregilo y refrescá.

---

## 5. Notas importantes

- **Nada se sube solo:** un `commit` local NO está en GitHub hasta el `git push`.
- **No subir secretos:** `ICEMM/`, `node_modules/`, `.env` y `*.exe` están en `.gitignore` a propósito.
- **Repo privado:** contiene datos financieros reales (`manager/`, `ppto of central/`, `curvas/`). Mantenerlo **privado**.
- **El backend (`gestion-api`) y la conexión a PostgreSQL** son para la versión desplegada en el VPS;
  en local la app funciona sola con `localStorage` (no necesitás levantar el backend para revisar cambios).
- **Rama de trabajo actual:** `frente3-8-categorias`.
