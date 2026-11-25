$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$env:ANDROID_USER_HOME = Join-Path $workspace 'work\mobile-tools\android-user'
$adb = Join-Path $workspace 'work\mobile-tools\sdk\platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw 'Faltan las herramientas Android platform-tools.' }
$devices = & $adb devices
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar ADB.' }
$ready = @($devices | Where-Object { $_ -match '\sdevice$' })
if ($ready.Count -ne 1) {
    Write-Output 'Conecta exactamente un Android, activa depuración USB y acepta la autorización en el teléfono.'
    Write-Output 'No se cambiará ninguna configuración ni se instalará nada con esta comprobación.'
    exit 1
}
Write-Output ('Modelo: ' + (& $adb shell getprop ro.product.model))
Write-Output ('Android: ' + (& $adb shell getprop ro.build.version.release))
Write-Output ('API: ' + (& $adb shell getprop ro.build.version.sdk))
Write-Output 'Conexión USB autorizada. Esta comprobación no instala una VPN.'
