$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Runtime = Get-Content -LiteralPath (Join-Path $Root '.run-logs/public-runtime.json') -Encoding UTF8 | ConvertFrom-Json
if ($Runtime.root -ne $Root) { throw 'Runtime identity mismatch.' }
foreach ($item in @(@{id=$Runtime.tunnelPid;name='cloudflared.exe';fragments=@((Join-Path $Root '.run-logs/tamagoyaki-tunnel.yml'))},@{id=$Runtime.appPid;name='python.exe';fragments=@((Join-Path $Root 'backend\server.py'),(Join-Path $Root 'server.py'))})) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($item.id)" -ErrorAction SilentlyContinue
  if ($process) {
    $matchesEntry = @($item.fragments | Where-Object { $process.CommandLine.Contains($_) }).Count -gt 0
    if ($process.Name -ne $item.name -or !$matchesEntry) { throw 'Process identity mismatch; nothing was stopped.' }
    Stop-Process -Id $process.ProcessId -ErrorAction Stop
  }
}
Write-Output 'Tamagoyaki Support processes stopped. DNS records and stored data are retained.'
