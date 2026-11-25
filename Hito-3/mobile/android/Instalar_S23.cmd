@echo off
setlocal
title Aquila Guard - Instalar preparacion Android
set "ANDROID_USER_HOME=%~dp0..\..\..\mobile-tools\android-user"
set "ADB=%~dp0..\..\..\mobile-tools\sdk\platform-tools\adb.exe"
set "APK=%~dp0app\build\outputs\apk\debug\app-debug.apk"
if not exist "%ADB%" goto missing
if not exist "%APK%" goto missing
echo Conecta un solo Android por USB y acepta la autorizacion en el telefono.
"%ADB%" get-state >nul 2>nul
if errorlevel 1 goto device
echo Modelo:
"%ADB%" shell getprop ro.product.model
echo Android:
"%ADB%" shell getprop ro.build.version.release
"%ADB%" install -r "%APK%"
if errorlevel 1 goto failed
echo.
echo Instalacion terminada. Abre Aquila Guard - Preparacion en el telefono.
echo Este paquete todavia no observa la navegacion ni crea una VPN.
pause
exit /b 0
:device
echo No hay exactamente un telefono autorizado. Revisa el USB y su pantalla.
pause
exit /b 1
:missing
echo Faltan las herramientas o la APK. Consulta mobile/README.md.
pause
exit /b 1
:failed
echo No se pudo instalar. Revisa el mensaje anterior y los permisos del telefono.
pause
exit /b 1
