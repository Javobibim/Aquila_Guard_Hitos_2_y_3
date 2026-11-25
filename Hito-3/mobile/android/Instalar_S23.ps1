$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Verificar_S23.ps1')
if ($LASTEXITCODE -ne 0) { exit 1 }
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$env:ANDROID_USER_HOME = Join-Path $workspace 'work\mobile-tools\android-user'
$adb = Join-Path $workspace 'work\mobile-tools\sdk\platform-tools\adb.exe'
$apk = Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw 'Primero ejecuta Compilar_Windows.ps1.' }
$aapt = Join-Path $workspace 'work\mobile-tools\sdk\build-tools\35.0.0\aapt.exe'
$metadata = & $aapt dump badging $apk
if ($LASTEXITCODE -ne 0 -or $metadata[0] -notmatch "versionName='0.3.20'") {
    throw 'Este APK no corresponde a la versión 0.3.20. Compila antes de instalar.'
}
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'El teléfono no permitió instalar la APK. Revisa su pantalla; no se eluden sus controles.' }
Write-Output 'Instalada Aquila Guard 0.3.20. Para probar la conexión, abre Ver detalles y pruebas.'
