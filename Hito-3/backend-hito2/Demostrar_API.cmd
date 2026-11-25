@echo off
setlocal
cd /d "%~dp0" || goto error
if not exist "run-demo.mjs" goto extract
set "NODE=node.exe"
if exist "C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe" set "NODE=C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe"
if exist "runtime\node.exe" set "NODE=%CD%\runtime\node.exe"
"%NODE%" run-demo.mjs --paso
if errorlevel 1 goto error
pause
exit /b 0
:extract
echo Faltan los archivos de la demostracion. Si abriste este archivo desde el ZIP,
echo vuelve al Explorador, pulsa Extraer todo y abre la carpeta extraida.
goto error
:error
echo La prueba se detuvo. Conserva el mensaje anterior.
pause
exit /b 1
