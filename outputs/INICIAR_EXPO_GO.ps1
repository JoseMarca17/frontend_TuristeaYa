param([string]$LanIP, [int]$ApiPort = 8001, [int]$ExpoPort = 8081)
$ErrorActionPreference = 'Stop'
if (!$LanIP) {
  $LanIP = & node -e "const os=require('os'); const entries=Object.entries(os.networkInterfaces()).filter(([name])=>! /vmware|virtual|loopback/i.test(name)); entries.sort(([a],[b])=>Number(/wi-fi|wifi/i.test(b))-Number(/wi-fi|wifi/i.test(a))); console.log(entries.flatMap(([,rows])=>rows).find(row=>row.family==='IPv4'&&!row.internal)?.address||'');"
}
if (!$LanIP) { throw 'No se encontró la red local. Ejecuta el script con -LanIP y la IP Wi-Fi de tu equipo.' }
$api = Join-Path $PSScriptRoot '..\..\backend_TuristeaYa/api'
$mobile = Join-Path $PSScriptRoot 'TuristeaYa-Expo'
$python = Join-Path $api '.venv-test/Scripts/python.exe'
if (!(Test-Path $python)) { $python = Join-Path $api '.venv/Scripts/python.exe' }
if (!(Test-Path $python)) { throw 'Instala requirements.txt en un entorno virtual .venv dentro de api.' }
$backend = $null
try {
  $backend = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','main:app','--host',$LanIP,'--port',"$ApiPort") -WorkingDirectory $api -WindowStyle Hidden -PassThru
  $ready = $false
  for ($attempt=0; $attempt -lt 20; $attempt++) {
    if ($backend.HasExited) { throw 'El backend no pudo iniciar. Comprueba el puerto y la configuración .env.' }
    try { $ready = (Invoke-RestMethod "http://${LanIP}:$ApiPort/health" -TimeoutSec 2).status -eq 'ok' } catch { }
    if ($ready) { break }
    Start-Sleep -Milliseconds 500
  }
  if (!$ready) { throw 'El backend no responde en la red local.' }
  $env:EXPO_PUBLIC_API_URL = "http://${LanIP}:$ApiPort"
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $LanIP
  $env:EXPO_NO_TELEMETRY = '1'
  $env:EXPO_OFFLINE = '1'
  $env:__UNSAFE_EXPO_HOME_DIRECTORY = Join-Path $mobile '.expo/cli-home'
  Write-Host "Expo Go: exp://${LanIP}:$ExpoPort"
  Write-Host 'Conecta el teléfono a la misma red Wi-Fi y escanea el QR.'
  Push-Location $mobile
  try { & node node_modules/expo/bin/cli start --go --lan --port $ExpoPort } finally { Pop-Location }
} finally {
  if ($backend -and !$backend.HasExited) { Stop-Process -Id $backend.Id }
}
