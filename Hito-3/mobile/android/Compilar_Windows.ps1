param([switch]$Offline, [switch]$Release)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$taskTools = Join-Path $workspace 'work\mobile-tools'
$jdk = Get-ChildItem -LiteralPath (Join-Path $taskTools 'jdk') -Directory | Select-Object -First 1
if (-not $jdk) { throw 'Falta Java portable. Ejecuta mobile/tools/provision-windows.py con Python.' }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_SDK_ROOT = Join-Path $taskTools 'sdk'
$env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
$env:ANDROID_USER_HOME = Join-Path $taskTools 'android-user'
$env:GRADLE_USER_HOME = Join-Path $taskTools 'gradle-user'
$env:JAVA_TOOL_OPTIONS = '-Duser.home="' + (Join-Path $taskTools 'user-home') + '"'
$gradle = Join-Path $taskTools 'gradle-8.13\bin\gradle.bat'
if (-not (Test-Path -LiteralPath $gradle)) { throw 'Falta Gradle portable.' }
Push-Location $PSScriptRoot
try {
    $options = @('--no-daemon', '--console=plain')
    if ($Offline) { $options += '--offline' }
    $variant = if ($Release) { 'Release' } else { 'Debug' }
    & $gradle @options :detection:test ":protection:test${variant}UnitTest" ":app:assemble${variant}" ":app:lint${variant}"
    if ($LASTEXITCODE -ne 0) { throw 'La compilación no terminó. Lee el error anterior.' }
    if ($Release) {
        Write-Output ('APK sin firmar: ' + (Join-Path $PSScriptRoot 'app\build\outputs\apk\release\app-release-unsigned.apk'))
    } else {
        Write-Output ('APK de pruebas: ' + (Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk'))
    }
    Write-Output 'Aquila Guard Android: revisión local y vigilancia DNS experimental.'
} finally { Pop-Location }
