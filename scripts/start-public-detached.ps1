param([switch]$RegisterDns)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Logs=Join-Path $Root '.run-logs'
New-Item -ItemType Directory -Path $Logs -Force | Out-Null
$Entry=Join-Path $Logs 'public-launch.ps1'
@'
param([switch]$RegisterDns)
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
& (Join-Path $Root 'scripts\start-public.ps1') -RegisterDns:$RegisterDns *> (Join-Path $PSScriptRoot 'launcher.log')
'@ | Set-Content -LiteralPath $Entry -Encoding UTF8
# WMI starts the hidden launcher outside the calling terminal's process job,
# so closing the Codex shell does not terminate the application or tunnel.
$PowerShell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$CommandLine='"'+$PowerShell+'" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$Entry+'"'
if($RegisterDns){$CommandLine+=' -RegisterDns'}
$Startup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[UInt16]0}
$Created=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$CommandLine;CurrentDirectory=$Root;ProcessStartupInformation=$Startup}
if($Created.ReturnValue -ne 0){throw "Detached launcher failed: $($Created.ReturnValue)"}
Write-Output "Public launcher started (PID $($Created.ProcessId)). Status: $Logs\launcher.log"
