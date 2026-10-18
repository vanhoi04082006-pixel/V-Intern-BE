$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $repositoryRoot '.env'
Push-Location -LiteralPath $repositoryRoot
try {
    git check-ignore --quiet -- .env
    if ($LASTEXITCODE -ne 0) { throw '.env must be ignored by Git before storing credentials.' }
    $text = if (Test-Path -LiteralPath $environmentFile) { [IO.File]::ReadAllText($environmentFile) } else { '' }
    $clientId = (Read-Host 'GitHub OAuth App Client ID').Trim()
    if ($clientId -notmatch '^[A-Za-z0-9._-]{8,100}$') { throw 'Invalid Client ID.' }
    $callback = (Read-Host 'Callback URL (Enter = http://localhost:8080/api/v1/github/callback)').Trim()
    if (!$callback) { $callback = 'http://localhost:8080/api/v1/github/callback' }
    $callbackUri = [Uri]$callback
    if (!$callbackUri.IsAbsoluteUri -or ($callbackUri.Scheme -ne 'https' -and
        !($callbackUri.Scheme -eq 'http' -and $callbackUri.Host -in @('localhost', '127.0.0.1'))) -or
        $callbackUri.UserInfo -or $callbackUri.Query -or $callbackUri.Fragment) { throw 'Use HTTPS (localhost HTTP is allowed).' }
    $secureSecret = Read-Host 'GitHub OAuth App Client Secret (stored locally; not printed)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
    try { $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($clientSecret -notmatch '^[A-Za-z0-9_-]{20,200}$') { throw 'Invalid Client Secret format.' }
    $values = [ordered]@{ GITHUB_CLIENT_ID = $clientId; GITHUB_CLIENT_SECRET = $clientSecret; GITHUB_CALLBACK_URL = $callback }
    $existingKey = [regex]::Match($text, '(?m)^GITHUB_TOKEN_ENCRYPTION_KEY=(.*)\r?$')
    if (!$existingKey.Success -or !$existingKey.Groups[1].Value.Trim()) {
        $bytes = New-Object byte[] 32
        $random = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $random.GetBytes($bytes) } finally { $random.Dispose() }
        $values['GITHUB_TOKEN_ENCRYPTION_KEY'] = [Convert]::ToBase64String($bytes)
    }
    foreach ($key in $values.Keys) {
        $pattern = '(?m)^' + [regex]::Escape($key) + '=.*\r?$'
        $line = $key + '=' + $values[$key]
        if ([regex]::IsMatch($text, $pattern)) { $text = [regex]::Replace($text, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $line }) }
        else { $text = $text.TrimEnd() + "`r`n" + $line + "`r`n" }
    }
    [IO.File]::WriteAllText($environmentFile, $text, (New-Object Text.UTF8Encoding $false))
    Write-Host 'GitHub configuration saved to ignored .env. Restart the API, then link each instructor/student in the application.'
    Write-Host 'Keep the existing encryption key when deploying again; replacing it breaks previously linked tokens.'
} finally {
    $clientSecret = $null
    $text = $null
    Pop-Location
}
