param([int]$Port = 8080)

# PSScriptRoot puede estar vacio si se lanza con Start-Process; usar MyCommand como fallback
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $scriptDir) { $scriptDir = Get-Location }
$filePath = Join-Path $scriptDir "fase1_proyectos.html"

# Detectar IP local activa (excluye loopback y APIPA)
$localIP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch "^127\." -and $_.IPAddress -notmatch "^169\.254\." } |
    Select-Object -First 1).IPAddress

if (-not $localIP) { $localIP = "desconocida" }

# Iniciar TcpListener en todas las interfaces (no requiere admin)
$endpoint = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, $Port)
$listener = [System.Net.Sockets.TcpListener]::new($endpoint)

try {
    $listener.Start()
} catch {
    Write-Host "ERROR: no se pudo abrir el puerto $Port - $_" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Intentar agregar regla de firewall (requiere admin; si falla se avisa)
$fwMsg = "Abre el puerto $Port TCP en el Firewall de Windows para acceso desde la red."
try {
    $existing = Get-NetFirewallRule -DisplayName "ICEMM Presupuestario" -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName "ICEMM Presupuestario" `
            -Direction Inbound -Protocol TCP -LocalPort $Port `
            -Action Allow -Profile Any -ErrorAction Stop | Out-Null
        $fwMsg = "Regla de firewall creada OK para puerto $Port."
    } else {
        $fwMsg = "Regla de firewall ya existe para puerto $Port."
    }
} catch {
    $fwMsg = "AVISO: ejecuta como Administrador para abrir el firewall, o hazlo manualmente (puerto $Port TCP)."
}

Clear-Host
Write-Host ""
Write-Host "  Control Presupuestario ICEMM" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Local  :  http://localhost:$Port" -ForegroundColor White
Write-Host "  Red    :  http://${localIP}:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "  $fwMsg" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Servidor activo - Ctrl+C para detener" -ForegroundColor DarkGray
Write-Host "  ==========================================" -ForegroundColor DarkGray

$htmlBytes    = $null
$lastModified = [datetime]::MinValue

while ($true) {
    $client = $null
    try {
        $client = $listener.AcceptTcpClient()
    } catch {
        break
    }

    # Recargar HTML si el archivo cambio en disco
    try {
        $fi = [System.IO.FileInfo]::new($filePath)
        if ($fi.LastWriteTime -gt $lastModified) {
            $htmlBytes    = [System.IO.File]::ReadAllBytes($filePath)
            $lastModified = $fi.LastWriteTime
            $kb = [math]::Round($htmlBytes.Length / 1024)
            Write-Host "  $(Get-Date -Format 'HH:mm:ss')  HTML recargado: ${kb} KB" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  AVISO: no se pudo leer el archivo HTML - $_" -ForegroundColor Yellow
        $client.Close()
        continue
    }

    $stream = $client.GetStream()

    # Drenar cabecera de la peticion HTTP
    $reqBuf = New-Object byte[] 8192
    $stream.ReadTimeout = 400
    try { [void]$stream.Read($reqBuf, 0, $reqBuf.Length) } catch {}
    $stream.ReadTimeout = -1

    # Respuesta HTTP
    $headerStr = "HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($htmlBytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerStr)

    try {
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($htmlBytes,   0, $htmlBytes.Length)
        $stream.Flush()
        $remoteIP = $client.Client.RemoteEndPoint.Address
        Write-Host "  $(Get-Date -Format 'HH:mm:ss')  $remoteIP  ->  200 OK" -ForegroundColor DarkGray
    } catch {
        Write-Host "  $(Get-Date -Format 'HH:mm:ss')  Error al enviar respuesta: $_" -ForegroundColor DarkRed
    }

    try { $stream.Close() } catch {}
    try { $client.Close()  } catch {}
}

$listener.Stop()
Write-Host ""
Write-Host "  Servidor detenido." -ForegroundColor DarkGray
