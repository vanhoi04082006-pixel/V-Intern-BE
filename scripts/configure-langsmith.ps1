param(
  [ValidateSet('US','EU','APAC','AWS')][string]$Region = 'US',
  [string]$WorkspaceId = '',
  [string]$Project = 'vintern-local-g1'
)
$ErrorActionPreference = 'Stop'
$taskRepo = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskEnvPath = Join-Path $taskRepo '.env'
if (-not (Test-Path -LiteralPath $taskEnvPath)) { throw 'Create the local .env from the example before configuring LangSmith.' }
$taskParsedWorkspace = [Guid]::Empty
if ($WorkspaceId -and -not [Guid]::TryParse($WorkspaceId, [ref]$taskParsedWorkspace)) { throw 'WorkspaceId must be a UUID.' }
if ($Project -notmatch '^[a-zA-Z0-9_-]{1,100}$') { throw 'Use a project name with letters, numbers, underscores or hyphens.' }
$taskEndpoints = @{US='https://api.smith.langchain.com';EU='https://eu.api.smith.langchain.com';APAC='https://apac.api.smith.langchain.com';AWS='https://aws.api.smith.langchain.com'}
$taskSecureKey = Read-Host 'LangSmith API key (hidden; never paste it into chat)' -AsSecureString
$taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecureKey)
try {
  $taskKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
  if ($taskKey -notmatch '^lsv2_[A-Za-z0-9_]+$') { throw 'Unexpected API key format.' }
  $taskText = [IO.File]::ReadAllText($taskEnvPath)
  $taskValues = [ordered]@{LANGSMITH_API_KEY=$taskKey;LANGSMITH_ENDPOINT=$taskEndpoints[$Region];LANGSMITH_PROJECT=$Project;LANGSMITH_WORKSPACE_ID=$WorkspaceId;LANGSMITH_TRACING='false';AGENT_LANGSMITH_ENABLED='true'}
  foreach ($taskName in $taskValues.Keys) {
    $taskPattern = '(?m)^' + [regex]::Escape($taskName) + '=.*\r?$'
    $taskLine = $taskName + '=' + $taskValues[$taskName]
    if ([regex]::IsMatch($taskText,$taskPattern)) { $taskText = [regex]::Replace($taskText,$taskPattern,[System.Text.RegularExpressions.MatchEvaluator]{param($taskMatch) $taskLine}) }
    else { $taskText = $taskText.TrimEnd() + "`n" + $taskLine + "`n" }
  }
  [IO.File]::WriteAllText($taskEnvPath,$taskText,[Text.UTF8Encoding]::new($false))
  Write-Output 'LangSmith settings saved only in local .env. Automatic SDK tracing stays disabled; Agent tracing uses the redaction adapter.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
  $taskKey = $null
  $taskText = $null
}
