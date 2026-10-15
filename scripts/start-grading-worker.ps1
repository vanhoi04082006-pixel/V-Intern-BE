$ErrorActionPreference = 'Stop'
$wslExecutable = (Get-Command wsl).Source
$marker = ((& $wslExecutable -d VIntern-Grader -u root --exec cat /opt/vintern-grading/.worker-marker) | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $marker -ne 'V-INTERN dedicated grading worker') { throw 'The dedicated VIntern-Grader environment is not installed.' }
& $wslExecutable -d VIntern-Grader -u root --exec systemctl start vintern-grader
if ($LASTEXITCODE -ne 0) { throw 'Worker service did not start.' }
& $wslExecutable -d VIntern-Grader -u root --exec systemctl is-active vintern-grader
if ($LASTEXITCODE -ne 0) { throw 'Worker service is not active.' }
Write-Host 'V-INTERN grading worker is running on localhost:8090. Keep this terminal open; Ctrl+C releases its WSL keepalive.'
& $wslExecutable -d VIntern-Grader -u root --exec /usr/bin/sleep infinity
