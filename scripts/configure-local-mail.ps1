param([switch]$EnableWorkers)
$ErrorActionPreference = 'Stop'
$g3BackendRoot = Split-Path $PSScriptRoot -Parent
$g3EnvPath = Join-Path $g3BackendRoot '.env'
if (-not (Test-Path -LiteralPath $g3EnvPath)) { throw 'Create the private backend .env first.' }
$g3Environment = [IO.File]::ReadAllText($g3EnvPath)
function Set-G3Value([string]$Key, [string]$Value) {
  $g3Pattern = '(?m)^' + [regex]::Escape($Key) + '=.*$'
  $g3Line = $Key + '=' + $Value
  if ([regex]::IsMatch($script:g3Environment, $g3Pattern)) { $script:g3Environment = [regex]::Replace($script:g3Environment, $g3Pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $g3Line }) }
  else { $script:g3Environment = $script:g3Environment.TrimEnd() + [Environment]::NewLine + $g3Line + [Environment]::NewLine }
}
if (-not [regex]::IsMatch($g3Environment, '(?m)^MAIL_ENCRYPTION_KEY=\S+')) {
  $g3KeyBytes = New-Object byte[] 32
  $g3Generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $g3Generator.GetBytes($g3KeyBytes) } finally { $g3Generator.Dispose() }
  Set-G3Value 'MAIL_ENCRYPTION_KEY' ([Convert]::ToBase64String($g3KeyBytes))
}
Set-G3Value 'PUBLIC_WEB_ORIGIN' 'http://localhost:3001'
Set-G3Value 'SMTP_HOST' '127.0.0.1'
Set-G3Value 'SMTP_PORT' '2525'
Set-G3Value 'SMTP_FROM' 'V-Intern <noreply@vintern.local>'
Set-G3Value 'SMTP_SECURE' 'false'
Set-G3Value 'SMTP_DEV_ALLOW_PLAIN' 'true'
Set-G3Value 'SMTP_USER' ''
Set-G3Value 'SMTP_PASSWORD' ''
Set-G3Value 'MAIL_DELIVERY_MODE' 'local'
if ($EnableWorkers) { Set-G3Value 'MAIL_WORKER_ENABLED' 'true'; Set-G3Value 'APPLICATION_WORKER_ENABLED' 'true' }
[IO.File]::WriteAllText($g3EnvPath, $g3Environment, [Text.UTF8Encoding]::new($false))
Write-Host 'Configured local-only SMTP in the private .env; encryption key preserved/generated without printing. Start local-smtp-sink.cjs and restart the backend after migrations.'
