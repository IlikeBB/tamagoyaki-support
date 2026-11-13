param([switch]$RegisterDns)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Settings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'cloudflare-public.json') -Encoding UTF8 | ConvertFrom-Json
if ($Settings.tunnelId -notmatch '^[0-9a-f-]{36}$' -or $Settings.hostname -notmatch '^[a-z0-9]+([.-][a-z0-9]+)+$') { throw 'Invalid tunnel settings.' }
$LocalOrigin = "http://127.0.0.1:$($Settings.port)"
$PublicOrigin = "https://$($Settings.hostname)"
$Logs = Join-Path $Root '.run-logs'
$Entry = Join-Path $Root 'server.py'
$RuntimePath = Join-Path $Logs 'public-runtime.json'
$TunnelConfig = Join-Path $Logs 'tamagoyaki-tunnel.yml'
$CredentialFile = Join-Path $env:USERPROFILE ".cloudflared\$($Settings.tunnelId).json"
$Cloudflared = (Get-Command cloudflared.exe -ErrorAction Stop).Source
if (!(Test-Path -LiteralPath $CredentialFile)) { throw 'Tunnel credentials were not found.' }
$mutex = [Threading.Mutex]::new($false, 'Local\TamagoyakiSupport.PublicLauncher')
$locked = $false
function Test-Health([string]$Origin) {
  try { $h = Invoke-RestMethod -Uri "$Origin/api/health" -TimeoutSec 5; return $h.ok -eq $true -and $h.name -eq 'tamagoyaki_support' } catch { return $false }
}
function Wait-Health([string]$Origin, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do { if (Test-Health $Origin) { return $true }; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline)
  return $false
}
try {
  try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (!$locked) { throw 'Another launcher is already running.' }
  New-Item -ItemType Directory -Path $Logs -Force | Out-Null
  $runtime = if (Test-Path -LiteralPath $RuntimePath) { Get-Content -LiteralPath $RuntimePath -Encoding UTF8 | ConvertFrom-Json } else { $null }
  $listeners = @(Get-NetTCPConnection -LocalPort $Settings.port -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count) {
    if (!$runtime -or $runtime.root -ne $Root -or $listeners.OwningProcess -notcontains $runtime.appPid) { throw 'Port is occupied by an unmanaged process.' }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($runtime.appPid)"
    if (!$process.CommandLine.Contains($Entry) -or !(Test-Health $LocalOrigin)) { throw 'Existing application failed identity or health checks.' }
    $appProcessId = $runtime.appPid
  } else {
    $pythonOutput = & conda run -n agent python -c 'import sys; print(sys.executable)'
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the agent Conda environment.' }
    $pythonPath = ($pythonOutput | Where-Object { $_ -match 'python.exe$' } | Select-Object -Last 1).Trim()
    if (!(Test-Path -LiteralPath $pythonPath)) { throw 'Conda Python was not found.' }
    $oldOrigin = $env:TAMAGO_ORIGIN; $oldPort = $env:TAMAGO_PORT
    try {
      $env:TAMAGO_ORIGIN = $PublicOrigin; $env:TAMAGO_PORT = "$($Settings.port)"
      $appProcess = Start-Process -FilePath $pythonPath -ArgumentList "`"$Entry`"" -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Logs 'app.out.log') -RedirectStandardError (Join-Path $Logs 'app.err.log')
      $appProcessId = $appProcess.Id
    } finally { $env:TAMAGO_ORIGIN = $oldOrigin; $env:TAMAGO_PORT = $oldPort }
    if (!(Wait-Health $LocalOrigin 30)) { throw 'Application did not become healthy; see .run-logs/app.err.log.' }
  }
  @("tunnel: $($Settings.tunnelId)", "credentials-file: '$($CredentialFile.Replace('\','/'))'", 'protocol: http2', 'ingress:', "  - hostname: $($Settings.hostname)", "    service: $LocalOrigin", '  - service: http_status:404') -join "`n" | Set-Content -LiteralPath $TunnelConfig -Encoding UTF8
  & $Cloudflared tunnel --config $TunnelConfig ingress validate
  if ($LASTEXITCODE -ne 0) { throw 'Ingress validation failed.' }
  if ($RegisterDns) {
    & $Cloudflared tunnel route dns $Settings.tunnelId $Settings.hostname
    if ($LASTEXITCODE -ne 0) { throw 'DNS registration failed. Existing records were not overwritten.' }
  }
  $tunnels = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($TunnelConfig) -and $_.CommandLine.Contains($Settings.tunnelId) })
  if ($tunnels.Count -gt 1) { throw 'Duplicate owned tunnels detected.' }
  if ($tunnels.Count -eq 1) { $tunnelProcessId = $tunnels[0].ProcessId }
  else {
    $tunnelProcess = Start-Process -FilePath $Cloudflared -ArgumentList "--no-autoupdate tunnel --config `"$TunnelConfig`" run $($Settings.tunnelId)" -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Logs 'tunnel.out.log') -RedirectStandardError (Join-Path $Logs 'tunnel.err.log')
    $tunnelProcessId = $tunnelProcess.Id
  }
  @{ root=$Root; publicOrigin=$PublicOrigin; appPid=$appProcessId; tunnelPid=$tunnelProcessId; tunnelId=$Settings.tunnelId; startedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $RuntimePath -Encoding UTF8
  if (!(Wait-Health $PublicOrigin 45)) { throw 'HTTPS health check failed. Processes retained; inspect .run-logs/tunnel.err.log.' }
  Write-Output "Tamagoyaki Support is live: $PublicOrigin/"
} finally { if ($locked) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
