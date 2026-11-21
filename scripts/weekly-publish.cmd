@echo off
rem Publication hebdomadaire : les 50 prochaines cartes approuvees absentes de la base.
rem Lancee par le Planificateur de taches Windows (« HistoryDex - publication hebdo », lundi 9h).
rem Sans --allow-untranslated : une carte incomplete (traductions, invariants) fait echouer
rem le push au lieu de partir a moitie traduite. Journal : reports\weekly-publish-<date>.log
cd /d "%~dp0.."
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set D=%%d
set LOG=reports\weekly-publish-%D%.log
echo === %DATE% %TIME% === > "%LOG%"
call npm run backup:data >> "%LOG%" 2>&1
call npm run push:db -- --next 50 >> "%LOG%" 2>&1
echo exit %ERRORLEVEL% >> "%LOG%"
