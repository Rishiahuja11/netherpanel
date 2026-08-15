@echo off
setlocal EnableDelayedExpansion
rem ============================================================
rem  NetherPanel CLI (Windows)
rem  Manage your NetherPanel servers from the command line.
rem
rem  First-time setup:
rem    netherpanel.bat --api https://panel.example.com
rem    netherpanel.bat login
rem
rem  Options:
rem    --api <url>        Save the default API endpoint and exit
rem    --token <token>    Save an API token and exit
rem    -h, --help         Show this help
rem
rem  Commands:
rem    servers                          List all servers
rem    status [id|name]                 Live status of one or all servers
rem    start  <id|name>                 Start a server
rem    stop   <id|name>                 Stop a server
rem    restart <id|name>                Restart a server
rem    kill   <id|name>                 Force-kill a server
rem    send   <id|name> <command>       Send a console command
rem    console <id|name> [lines]        Show recent console output
rem    logs   <id|name> [lines]         Show recent server log lines
rem    backups <id|name>                List backups
rem    backup <id|name> [name]          Create a backup
rem    plugins <id|name>                List installed plugins/mods
rem    plugins search <id|name> <query> Search plugins/mods
rem    plugins install <id|name> <mod_id> [version_id]
rem ============================================================

set "CONF=%USERPROFILE%\.netherpanel.conf"

set "API_URL="
set "TOKEN="

if exist "%CONF%" (
  for /f "usebackq delims=" %%L in ("%CONF%") do (
    set "LINE=%%L"
    if "!LINE:~0,8!"=="API_URL=" set "API_URL=!LINE:~8!"
    if "!LINE:~0,6!"=="TOKEN=" set "TOKEN=!LINE:~6!"
  )
)

if "%~1"=="" goto :usage
if /i "%~1"=="-h" goto :usage
if /i "%~1"=="--help" goto :usage

if /i "%~1"=="--api" (
  set "API_URL=%~2"
  call :save_conf
  echo API endpoint set to: !API_URL!
  exit /b 0
)
if /i "%~1"=="--token" (
  set "TOKEN=%~2"
  call :save_conf
  echo API token stored.
  exit /b 0
)

if "%API_URL%"=="" (
  echo No API endpoint set. Run: %~nx0 --api https://your-panel.example.com
  exit /b 1
)

set "CMD=%~1"
shift /1

if /i "%CMD%"=="login"    goto :cmd_login
if /i "%CMD%"=="servers"  goto :cmd_servers
if /i "%CMD%"=="ls"       goto :cmd_servers
if /i "%CMD%"=="status"   goto :cmd_status
if /i "%CMD%"=="start"    goto :cmd_start
if /i "%CMD%"=="stop"     goto :cmd_stop
if /i "%CMD%"=="restart"  goto :cmd_restart
if /i "%CMD%"=="kill"     goto :cmd_kill
if /i "%CMD%"=="send"     goto :cmd_send
if /i "%CMD%"=="console"  goto :cmd_console
if /i "%CMD%"=="logs"     goto :cmd_logs
if /i "%CMD%"=="backups"  goto :cmd_backups
if /i "%CMD%"=="backup"   goto :cmd_backup
if /i "%CMD%"=="plugins"  goto :cmd_plugins

echo Unknown command: %CMD%
echo Run "%~nx0 --help" for usage.
exit /b 1

:save_conf
> "%CONF%" (
  if not "%API_URL%"=="" echo API_URL=%API_URL%
  if not "%TOKEN%"=="" echo TOKEN=%TOKEN%
)
exit /b 0

rem ============================================================
rem  helpers
rem ============================================================

rem api_call <METHOD> <path> <outfile> [json_body]
rem   On HTTP >= 400 prints the "error" field and sets ERRORLEVEL 1.
:api_call
set "METH=%~1"
set "PATHARG=%~2"
set "OUTFILE=%~3"
set "BODY=%~4"
set "ARGS=-sS -X !METH! "%API_URL%%PATHARG%" -o "!OUTFILE!" -w "%%{http_code}""
if not "%TOKEN%"=="" set "ARGS=!ARGS! -H "Authorization: Bearer %TOKEN%""
if not "%BODY%"=="" set "ARGS=!ARGS! -H "Content-Type: application/json" --data "%BODY%""
set "CODE="
for /f "delims=" %%c in ('curl !ARGS! 2^>nul') do set "CODE=%%c"
if "%CODE%"=="" (
  echo Error: cannot reach %API_URL%
  exit /b 1
)
if %CODE% GEQ 400 (
  call :show_error "!OUTFILE!"
  exit /b 1
)
exit /b 0

rem show_error <jsonfile>
:show_error
set "ERRMSG="
for /f "delims=" %%e in ('powershell -NoProfile -Command "$j=Get-Content -Raw '%~f1' -ErrorAction SilentlyContinue|ConvertFrom-Json; if($j.error){[Console]::Write($j.error)}elseif($j.Error){[Console]::Write($j.Error)}else{[Console]::Write('HTTP request failed')}" 2^>nul') do set "ERRMSG=%%e"
echo Error: !ERRMSG!
exit /b 0

rem json_get <jsonfile> <dotted.path> <outvar>
:json_get
set "JG="
for /f "delims=" %%v in ('powershell -NoProfile -Command "$j=Get-Content -Raw '%~f1' -ErrorAction SilentlyContinue|ConvertFrom-Json; $c=$j; foreach($p in '%~2'.Split('.')){if($null -eq $c){break};$c=$c.$p}; if($null -ne $c){[Console]::Write($c)}" 2^>nul') do set "JG=%%v"
set "%~3=%JG%"
exit /b 0

rem server_id <id|name> <outvar>  - resolves to a numeric id
:server_id
set "SID=%~1"
set "SIDNUM="
for /f "tokens=* delims=0123456789" %%d in ("%SID%") do set "SIDNUM=%%d"
if not defined SIDNUM ( set "%~2=%SID%" & exit /b 0 )
set "SRVFILE=%TEMP%\np_servers.json"
call :api_call GET /api/client/servers "%SRVFILE%"
if errorlevel 1 ( set "%~2=" & exit /b 1 )
set "FOUND="
for /f "delims=" %%f in ('powershell -NoProfile -Command "$j=Get-Content -Raw '%SRVFILE%'|ConvertFrom-Json; foreach($s in $j){if([string]$s.id -eq '%~1' -or $s.name -eq '%~1' -or $s.slug -eq '%~1'){[Console]::Write($s.id);break}}" 2^>nul') do set "FOUND=%%f"
del "%SRVFILE%" 2>nul
if "%FOUND%"=="" (
  echo Error: server '%~1' not found.
  set "%~2="
  exit /b 1
)
set "%~2=%FOUND%"
exit /b 0

rem ============================================================
rem  commands
rem ============================================================

:cmd_login
set /p "NP_USER=Username: "
set /p "NP_PASS=Password: "
set "LOGIN=%TEMP%\np_login.json"
set "ARGS=-sS -X POST "%API_URL%/api/auth/login" -o "%LOGIN%" -w "%%{http_code}" -H "Content-Type: application/json" --data "{\"username\":\"%NP_USER%\",\"password\":\"%NP_PASS%\"}""
set "CODE="
for /f "delims=" %%c in ('curl !ARGS! 2^>nul') do set "CODE=%%c"
if not "%CODE%"=="200" (
  call :show_error "%LOGIN%"
  exit /b 1
)
set "TOKEN="
call :json_get "%LOGIN%" token TOKEN
if "%TOKEN%"=="" ( echo Login failed. & exit /b 1 )
call :save_conf
del "%LOGIN%" 2>nul
echo Logged in as %NP_USER%. Token stored in %CONF%
exit /b 0

:cmd_servers
set "SRVFILE=%TEMP%\np_servers.json"
call :api_call GET /api/client/servers "%SRVFILE%"
if errorlevel 1 exit /b 1
call :render_table "%SRVFILE%" "$j=Get-Content -Raw $args[0]|ConvertFrom-Json; if(@($j).Count -eq 0){Write-Host 'No servers.';exit}; Write-Host ('{0,-4} {1,-24} {2,-10} {3,-10} {4}' -f 'ID','NAME','STATUS','TYPE','ADDRESS'); foreach($s in $j){$a=$s.subdomain; if(-not $a){$a='localhost:'+$s.port}; Write-Host ('{0,-4} {1,-24} {2,-10} {3,-10} {4}' -f $s.id,$s.name,$s.status,$s.server_type,$a)}"
exit /b 0

:cmd_status
if "%~1"=="" (
  set "SRVFILE=%TEMP%\np_servers.json"
  call :api_call GET /api/client/servers "%SRVFILE%"
  if errorlevel 1 exit /b 1
  call :render_table "%SRVFILE%" "$j=Get-Content -Raw $args[0]|ConvertFrom-Json; foreach($s in $j){Write-Host ('Server #{0} {1}: {2}' -f $s.id,$s.name,$s.status)}"
  exit /b 0
)
call :server_id "%~1" NP_ID
if errorlevel 1 exit /b 1
set "SF=%TEMP%\np_server.json"
set "RF=%TEMP%\np_res.json"
call :api_call GET /api/servers/%NP_ID% "%SF%"
if errorlevel 1 exit /b 1
call :api_call GET /api/servers/%NP_ID%/resources "%RF%"
set "NM=" & set "ST=" & set "TY=" & set "ADDR=" & set "PID=" & set "MEM=" & set "CPU=" & set "UP="
call :json_get "%SF%" name NM
call :json_get "%SF%" status ST
call :json_get "%SF%" server_type TY
call :json_get "%SF%" subdomain ADDR
call :json_get "%RF%" pid PID
call :json_get "%RF%" memory MEM
call :json_get "%RF%" cpu CPU
call :json_get "%RF%" uptime UP
if "%ADDR%"=="" (
  set "PRT="
  call :json_get "%SF%" port PRT
  set "ADDR=localhost:!PRT!"
)
echo Server #%NP_ID%  %NM%
echo   Status   : %ST%
echo   Type     : %TY%
echo   Address  : %ADDR%
echo   PID      : %PID%
if not "%MEM%"=="" echo   Memory   : %MEM% bytes
if not "%CPU%"=="" echo   CPU      : %CPU% %%
if not "%UP%"==""  echo   Uptime   : %UP%
del "%SF%" "%RF%" 2>nul
exit /b 0

:cmd_start
call :server_id "%~1" NP_ID || exit /b 1
call :api_call POST /api/servers/%NP_ID%/start "%TEMP%\np_out.json" || exit /b 1
echo Server %~1 started.
exit /b 0

:cmd_stop
call :server_id "%~1" NP_ID || exit /b 1
call :api_call POST /api/servers/%NP_ID%/stop "%TEMP%\np_out.json" || exit /b 1
echo Server %~1 stopped.
exit /b 0

:cmd_restart
call :server_id "%~1" NP_ID || exit /b 1
call :api_call POST /api/servers/%NP_ID%/restart "%TEMP%\np_out.json" || exit /b 1
echo Server %~1 restarted.
exit /b 0

:cmd_kill
call :server_id "%~1" NP_ID || exit /b 1
call :api_call POST /api/servers/%NP_ID%/kill "%TEMP%\np_out.json" || exit /b 1
echo Server %~1 killed.
exit /b 0

:cmd_send
if "%~2"=="" ( echo Usage: %~nx0 send ^<server^> ^<command^> & exit /b 1 )
call :server_id "%~1" NP_ID || exit /b 1
call :api_call POST /api/servers/%NP_ID%/command "%TEMP%\np_out.json" "{\"command\":\"%~2\"}" || exit /b 1
echo Command sent to server %~1.
exit /b 0

:cmd_console
call :server_id "%~1" NP_ID || exit /b 1
set "LINES=%~2"
if "%LINES%"=="" set "LINES=40"
set "CF=%TEMP%\np_console.json"
call :api_call GET /api/servers/%NP_ID%/console "%CF%" || exit /b 1
call :render_table "%CF%" "$j=Get-Content -Raw $args[0]|ConvertFrom-Json; $n=%LINES%; $all=@($j); if($all.Count -gt $n){$all=@($all[($all.Count-$n)..($all.Count-1)])}; foreach($e in $all){if($e.line){Write-Host $e.line}else{Write-Host $e}}"
exit /b 0

:cmd_logs
call :server_id "%~1" NP_ID || exit /b 1
set "LINES=%~2"
if "%LINES%"=="" set "LINES=200"
set "LF=%TEMP%\np_logs.json"
call :api_call GET "/api/servers/%NP_ID%/logs?lines=%LINES%" "%LF%" || exit /b 1
set "CONTENT="
call :json_get "%LF%" content CONTENT
echo %CONTENT%
del "%LF%" 2>nul
exit /b 0

:cmd_backups
call :server_id "%~1" NP_ID || exit /b 1
set "BF=%TEMP%\np_backups.json"
call :api_call GET /api/servers/%NP_ID%/backups "%BF%" || exit /b 1
call :render_table "%BF%" "$j=Get-Content -Raw $args[0]|ConvertFrom-Json; if(@($j).Count -eq 0){Write-Host 'No backups.';exit}; Write-Host ('{0,-4} {1,-28} {2,10}  {3}' -f 'ID','NAME','SIZE','CREATED'); foreach($b in $j){$sz=$b.size; if($sz -gt 1048576){$s=[string][Math]::Round($sz/1048576,1)+' MB'}else{$s=[string][Math]::Round($sz/1024,0)+' KB'}; Write-Host ('{0,-4} {1,-28} {2,10}  {3}' -f $b.id,$b.name,$s,$b.created_at)}"
exit /b 0

:cmd_backup
call :server_id "%~1" NP_ID || exit /b 1
set "BNAME=%~2"
if "%BNAME%"=="" set "BNAME=backup-%date:~10,4%%date:~4,2%%date:~7,2%-%time:~0,2%%time:~3,2%%time:~6,2%"
set "BNAME=%BNAME: =0%"
call :api_call POST /api/servers/%NP_ID%/backups "%TEMP%\np_out.json" "{\"name\":\"%BNAME%\"}" || exit /b 1
echo Backup created: %BNAME%
exit /b 0

:cmd_plugins
if /i "%~1"=="search" shift /1 & goto :cmd_plugins_search
if /i "%~1"=="install" shift /1 & goto :cmd_plugins_install
call :server_id "%~1" NP_ID || exit /b 1
set "MF=%TEMP%\np_mods.json"
call :api_call GET /api/servers/%NP_ID%/mods "%MF%" || exit /b 1
call :render_table "%MF%" "$j=Get-Content -Raw $args[0]|ConvertFrom-Json; if(@($j).Count -eq 0){Write-Host 'No plugins/mods installed.';exit}; Write-Host ('{0,-8} {1,-30} {2}' -f 'MOD ID','NAME','FILE'); foreach($m in $j){Write-Host ('{0,-8} {1,-30} {2}' -f $m.id,$m.name,$m.filename)}"
exit /b 0

:cmd_plugins_search
if "%~2"=="" ( echo Usage: %~nx0 plugins search ^<server^> ^<query^> & exit /b 1 )
call :server_id "%~1" NP_ID || exit /b 1
set "SRCH=%TEMP%\np_search.json"
call :api_call GET "/api/servers/%NP_ID%/mods/search?q=%~2" "%SRCH%" || exit /b 1
call :render_table "%SRCH%" "$j=Get-Content -Raw $args[0]|ConvertFrom-Json; $hits=@($j.hits); if($hits.Count -eq 0){Write-Host 'No results.';exit}; Write-Host ('{0,-14} {1,-34} {2,-10} {3}' -f 'MOD ID','NAME','LOADER','DESCRIPTION'); foreach($h in $hits){$d=$h.description; if($d -and $d.Length -gt 50){$d=$d.Substring(0,50)}; Write-Host ('{0,-14} {1,-34} {2,-10} {3}' -f $h.id,$h.title,$h.loader,$d)}"
exit /b 0

:cmd_plugins_install
if "%~2"=="" ( echo Usage: %~nx0 plugins install ^<server^> ^<mod_id^> [version_id] & exit /b 1 )
call :server_id "%~1" NP_ID || exit /b 1
set "BODY={\"mod_id\":\"%~2\"}"
if not "%~3"=="" set "BODY={\"mod_id\":\"%~2\",\"version_id\":\"%~3\"}"
call :api_call POST /api/servers/%NP_ID%/mods/install "%TEMP%\np_out.json" "%BODY%" || exit /b 1
set "MNAME="
call :json_get "%TEMP%\np_out.json" name MNAME
echo Installed: %MNAME%
exit /b 0

rem render_table <jsonfile> <pscode>  - runs powershell passing the file as $args[0]
:render_table
if not exist "%~1" exit /b 0
for /f "delims=" %%r in ('powershell -NoProfile -Command "%~2" "%~f1" 2^>nul') do echo %%r
exit /b 0

:usage
for /f "usebackq delims=" %%L in ("%~f0") do (
  set "L=%%L"
  if "!L:~0,5!"=="rem  " echo !L:~5!
)
exit /b 0
