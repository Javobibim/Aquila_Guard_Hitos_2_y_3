@echo off
setlocal
cd /d "%~dp0" || goto error
if not exist "start-local.mjs" goto extract
if not exist "node_modules\express\package.json" goto deps
set "NODE=node.exe"
if exist "C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe" set "NODE=C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe"
if exist "runtime\node.exe" set "NODE=%CD%\runtime\node.exe"
if exist "node_modules\typescript\bin\tsc" (
  "%NODE%" node_modules\typescript\bin\tsc -p tsconfig.build.json
  if errorlevel 1 goto error
)
if not exist "build\index.js" goto deps
"%NODE%" start-local.mjs
if errorlevel 1 goto error
pause
exit /b 0
:extract
echo Faltan los archivos del servidor. Si abriste este archivo desde el ZIP,
echo vuelve al Explorador, pulsa Extraer todo y abre la carpeta extraida.
goto error
:deps
echo Esta carpeta es una copia de codigo fuente. Ejecuta npm ci y npm run build
echo dentro de backend-hito2, o usa la copia de trabajo ya preparada en tu PC.
goto error
:error
echo La prueba se detuvo. Conserva el mensaje anterior.
pause
exit /b 1
