# Control Presupuestario ICEMM / EMM

Aplicación de **control presupuestario para una constructora** (Ingeniería y Construcción EMM SPA), con montos en **UF**. Compara presupuesto vs proyección vs real, por proyecto y por categoría de costo, con flujo de caja, informe de gestión (EERR), scorecard y control de obras.

> ⚠️ Repositorio **privado** — contiene datos financieros reales de la empresa (carpetas `manager/`, `ppto of central/`, `curvas/`). No hacer público sin antes excluir esos datos y revisar el historial.

## Cómo abrir la app

**Opción simple (Windows):** doble clic en **`Abrir App ICEMM.exe`** → levanta un servidor local y abre la app en el navegador en `http://localhost:8080`. No cierres esa ventanita mientras la usás (es el servidor).

**Opción manual:**
```powershell
.\servidor.ps1            # sirve en http://localhost:8080 (solo este equipo)
.\servidor.ps1 -Expose    # además en la red local (sin TLS; usar solo en red de confianza)
```
Luego abrir **http://localhost:8080** (NO abrir el `.html` con doble clic: el `localStorage` es por origen y verías datos vacíos).

> El `.exe` se regenera desde `Abrir App ICEMM.ps1` con [ps2exe](https://github.com/MScholtes/PS2EXE):
> `Invoke-ps2exe -inputFile "Abrir App ICEMM.ps1" -outputFile "Abrir App ICEMM.exe"`

## Estructura

| Ruta | Qué es |
|------|--------|
| `fase1_proyectos.html` | **La app**: monolito React (vía CDN + Babel in-browser), ~12k líneas. Toda la persistencia es `localStorage` (`budget-control:*`). |
| `src/lib/` | Biblioteca de cálculo **pura** extraída del monolito (curvas, clasificación, ingresos, flujo de caja, etc.), con tests Vitest (golden master). |
| `servidor.ps1` / `Abrir App ICEMM.ps1` | Servidor local / launcher. |
| `files/` | Especificación original (data-model, fases, interfaz). |
| `manager/`, `ppto of central/`, `curvas/`, `UF *.csv` | Datos de trabajo reales (Reporte Manager, libro mayor, balance, presupuesto OC, curvas, valores UF). |
| `ARQUITECTURA-DATOS.md` | Modelo de datos completo: catálogo de claves `budget-control:*`, grafo de datos compartidos entre módulos. |
| `CONEXION-POSTGRESQL.md` | Diseño para conectar la app a PostgreSQL (esquema + capa de datos + plan). |
| `PLAN-PRODUCCION.md` | Hoja de ruta a producción por fases (estado, bloqueantes, decisiones pendientes). |
| `ICEMM/` | **NO incluido en este repo** (gitignored): app separada full-stack (Python/Presto + backend Node/Prisma/PostgreSQL + frontend Vite). |

## Tests

```bash
npm install
npm run test:run      # ~248 tests de la biblioteca pura (src/lib)
```

## Datos

- Los datos del usuario viven en el **`localStorage` del navegador** (por equipo y origen). Para mover datos entre PCs: menú de usuario → **Respaldar** (exporta JSON) y **Restaurar** (importa).
- El **Real** se carga desde el *Reporte Manager* (`manager/`) y el *Libro Mayor*; el **Presupuesto** se arma desde los proyectos + la plantilla de Oficina Central (`ppto of central/`).

## Estado

Ver **`PLAN-PRODUCCION.md`**. La rama de trabajo `frente3-8-categorias` está pendiente de merge a `main` (hay una decisión contable abierta sobre el mapeo del plan de cuentas 600/700/800). La biblioteca `src/lib` se mantiene en sync con el monolito hasta migrar a un build Vite.

## Seguridad (importante)

- El **login del monolito es control visual, no seguridad real** (hash no criptográfico, credencial por defecto en el fuente). No protege los datos; sirve para separar vistas. Para confidencialidad real, servir tras un proxy con autenticación o usar el backend de `ICEMM/`.
- El módulo `ICEMM/` (con credenciales y backend) está **fuera de este repo** a propósito.
