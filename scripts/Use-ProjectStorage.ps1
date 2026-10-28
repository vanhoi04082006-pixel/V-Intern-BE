$taskProjectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskRuntimeRoot = Join-Path $taskProjectRoot '.runtime'
$taskStoragePaths = @{TEMP='tmp';TMP='tmp';TMPDIR='tmp';NPM_CONFIG_CACHE='npm-cache';NODE_COMPILE_CACHE='node-cache';PLAYWRIGHT_BROWSERS_PATH='browsers';PUPPETEER_CACHE_DIR='puppeteer';PIP_CACHE_DIR='pip-cache';DB_FILES_ROOT='sql'}
foreach ($taskStorageEntry in $taskStoragePaths.GetEnumerator()) {
  $taskStorageTarget = Join-Path $taskRuntimeRoot $taskStorageEntry.Value
  New-Item -ItemType Directory -Path $taskStorageTarget -Force | Out-Null
  [Environment]::SetEnvironmentVariable($taskStorageEntry.Key,$taskStorageTarget,'Process')
}
