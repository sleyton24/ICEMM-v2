# ───────────────────────────────────────────────────────────────────────────────
# Launcher Control Presupuestario ICEMM (para compilar a .exe con ps2exe)
# Doble clic → levanta el server local (solo este equipo) y abre la app en el navegador.
# Lee fase1_proyectos.html de la MISMA carpeta donde está el ejecutable (p.ej. carpeta compartida).
# Los datos se guardan en el localStorage del navegador de ESTE equipo (usar Respaldar/Restaurar
# desde el menú de usuario para mover datos entre PCs).
# ───────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
$Port = 8080
$url  = "http://localhost:$Port"

# Carpeta del ejecutable: funciona como .exe (ps2exe) y como .ps1.
$baseDir = $PSScriptRoot
if (-not $baseDir) {
  try { $baseDir = Split-Path -Parent ([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName) } catch {}
}
if (-not $baseDir) { $baseDir = (Get-Location).Path }
$filePath = Join-Path $baseDir 'fase1_proyectos.html'

if (-not (Test-Path $filePath)) {
  Write-Host "ERROR: no se encontro 'fase1_proyectos.html' junto a este ejecutable." -ForegroundColor Red
  Write-Host "Buscado en: $filePath" -ForegroundColor Yellow
  Read-Host "Enter para salir"; exit 1
}

# ¿Ya hay una instancia escuchando en 8080? Entonces solo abrir el navegador.
$inUse = $false
try { $t = [System.Net.Sockets.TcpClient]::new(); $t.Connect('127.0.0.1', $Port); $inUse = $true; $t.Close() } catch { $inUse = $false }
if ($inUse) {
  Write-Host "La app ya esta corriendo. Abriendo el navegador..." -ForegroundColor Cyan
  Start-Process $url
  Start-Sleep -Seconds 1
  exit 0
}

# Servidor: SOLO loopback (127.0.0.1) = este equipo. No expone datos a la red.
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } catch {
  Write-Host "ERROR: no se pudo abrir el puerto $Port - $_" -ForegroundColor Red
  Start-Process $url
  Read-Host "Enter para salir"; exit 1
}

Clear-Host
Write-Host ""
Write-Host "  Control Presupuestario ICEMM" -ForegroundColor Cyan
Write-Host "  =========================================" -ForegroundColor DarkGray
Write-Host "  App abierta en:  $url" -ForegroundColor White
Write-Host ""
Write-Host "  NO cierres esta ventana mientras uses la app." -ForegroundColor Yellow
Write-Host "  (cerrar esta ventana = detener la app)" -ForegroundColor DarkGray
Write-Host "  =========================================" -ForegroundColor DarkGray

Start-Process $url

$htmlBytes    = $null
$lastModified = [datetime]::MinValue
while ($true) {
  $client = $null
  try { $client = $listener.AcceptTcpClient() } catch { break }
  try {
    $fi = [System.IO.FileInfo]::new($filePath)
    if ($fi.LastWriteTime -gt $lastModified) {
      $htmlBytes    = [System.IO.File]::ReadAllBytes($filePath)
      $lastModified = $fi.LastWriteTime
    }
  } catch { try { $client.Close() } catch {}; continue }
  $stream = $client.GetStream()
  $reqBuf = New-Object byte[] 8192
  $stream.ReadTimeout = 400
  try { [void]$stream.Read($reqBuf, 0, $reqBuf.Length) } catch {}
  $stream.ReadTimeout = -1
  $headerStr = "HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($htmlBytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerStr)
  try {
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($htmlBytes,   0, $htmlBytes.Length)
    $stream.Flush()
  } catch {}
  try { $stream.Close() } catch {}
  try { $client.Close() } catch {}
}
$listener.Stop()
