param(
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
    Write-Host $Text -ForegroundColor Green
}

function Write-WarnText([string]$Text) {
    Write-Host $Text -ForegroundColor Yellow
}

function Get-NormalizedSha256([string]$Path) {
    $text = [System.IO.File]::ReadAllText($Path)
    $text = $text.Replace("`r`n", "`n").Replace("`r", "`n")
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Get-RelativePathCompat([string]$BasePath, [string]$ChildPath) {
    $baseFull = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\') + '\'
    $childFull = [System.IO.Path]::GetFullPath($ChildPath)
    if (-not $childFull.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    return $childFull.Substring($baseFull.Length).Replace('\', '/')
}

# Git helper: capture stdout, keep harmless stderr warnings non-fatal, and fail on non-zero exit code.
function Invoke-Git {
    param(
        [Parameter(Mandatory=$true)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    $stderrFile = [System.IO.Path]::GetTempFileName()
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & git -C $script:Root @Arguments 2> $stderrFile
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }

    $stderr = ""
    if (Test-Path $stderrFile) {
        $stderr = [System.IO.File]::ReadAllText($stderrFile).Trim()
        Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue
    }

    if ($stderr) {
        if ($script:LogDir) {
            Add-Content -Path (Join-Path $script:LogDir "git-warnings.log") -Value $stderr -Encoding UTF8
        }
        foreach ($line in ($stderr -split "`r?`n")) {
            if ($line.Trim()) { Write-Host "[git] $line" -ForegroundColor DarkYellow }
        }
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Git command failed (exit $exitCode): git $($Arguments -join ' ')"
    }

    return [PSCustomObject]@{
        ExitCode = $exitCode
        Output = @($output)
        Stderr = $stderr
    }
}

function Git-Text([string[]]$Arguments) {
    $r = Invoke-Git -Arguments $Arguments
    return (($r.Output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Restore-TouchedFiles {
    param(
        [string]$BackupDir,
        [hashtable]$OriginalExists
    )

    Write-WarnText "Restoring the files touched by this installer..."

    $devicePath = Join-Path $script:Root "apps\website\src\features\device-showcase\DeviceShowcase.tsx"
    $deviceBackup = Join-Path $BackupDir "DeviceShowcase.tsx"
    if (Test-Path $deviceBackup) {
        Copy-Item -LiteralPath $deviceBackup -Destination $devicePath -Force
    }

    $addedPaths = @(
        "apps\website\src\features\device-showcase\laptop-scroll.css",
        "apps\website\public\showcase\laptop-open-scroll.webm",
        "apps\website\public\showcase\laptop-open-poster.webp"
    )

    foreach ($relative in $addedPaths) {
        $full = Join-Path $script:Root $relative
        if ($OriginalExists[$relative]) {
            $backupFile = Join-Path $BackupDir (($relative -replace '[\\/:*?"<>|]', '_'))
            if (Test-Path $backupFile) {
                Copy-Item -LiteralPath $backupFile -Destination $full -Force
            }
        }
        elseif (Test-Path $full) {
            Remove-Item -LiteralPath $full -Force
        }
    }
}

# ---------------- Resolve root ----------------
$packageRoot = $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    if (Test-Path (Join-Path $packageRoot "apps\website")) {
        $ProjectRoot = $packageRoot
    }
    else {
        $candidate = Split-Path $packageRoot -Parent
        if (Test-Path (Join-Path $candidate "apps\website")) {
            $ProjectRoot = $candidate
        }
        else {
            throw "Could not detect the SmartT project root. Put this integration folder inside SmartT, or pass -ProjectRoot explicitly."
        }
    }
}

$script:Root = (Resolve-Path $ProjectRoot).Path
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$parent = Split-Path $script:Root -Parent
$script:LogDir = Join-Path $parent "SmartT_laptop_integration_$timestamp"
New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null

Write-Step "SmartT laptop integration"
Write-Host "Project: $script:Root"
Write-Host "Package: $packageRoot"
Write-Host "Log/backup: $script:LogDir"

# ---------------- Prerequisites ----------------
Write-Step "Checking prerequisites"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git was not found in PATH."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found in PATH."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue) -and -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found in PATH."
}

$inside = Git-Text @("rev-parse", "--is-inside-work-tree")
if ($inside -ne "true") {
    throw "The detected project root is not a Git working tree."
}

$gitTop = (Git-Text @("rev-parse", "--show-toplevel")).Replace('/', '\')
if (-not ([System.IO.Path]::GetFullPath($gitTop).TrimEnd('\') -ieq [System.IO.Path]::GetFullPath($script:Root).TrimEnd('\'))) {
    throw "Git top-level does not match the detected SmartT root: $gitTop"
}

$targetDevice = Join-Path $script:Root "apps\website\src\features\device-showcase\DeviceShowcase.tsx"
$targetCss = Join-Path $script:Root "apps\website\src\features\device-showcase\laptop-scroll.css"
$showcaseDir = Join-Path $script:Root "apps\website\public\showcase"
$targetVideo = Join-Path $showcaseDir "laptop-open-scroll.webm"
$targetPoster = Join-Path $showcaseDir "laptop-open-poster.webp"

foreach ($required in @(
    $targetDevice,
    (Join-Path $script:Root "apps\website\src\features\device-showcase\device-showcase.css"),
    (Join-Path $script:Root "apps\website\package.json"),
    (Join-Path $script:Root "apps\website\package-lock.json")
)) {
    if (-not (Test-Path $required)) {
        throw "Expected project file is missing: $required"
    }
}

# Snapshot-specific guard. Normalize line endings so LF/CRLF does not cause a false mismatch.
$expectedBeforeHash = "c7c8f82d8efa16a84aab3d2b92bab911f0a2ca076d9cd7e0b93fdc5f4a84a21b"
$expectedAfterHash = "bb50e0ff5b3115369041aab9f86749fa556593a6c23f5a4db2554169f0366a6b"
$currentHash = Get-NormalizedSha256 $targetDevice

if ($currentHash -eq $expectedAfterHash -and (Test-Path $targetCss) -and (Test-Path $targetVideo)) {
    Write-Ok "This SmartT laptop integration is already installed. Nothing changed."
    exit 0
}

if ($currentHash -ne $expectedBeforeHash) {
    throw @"
DeviceShowcase.tsx no longer matches the snapshot audited for this installer.
Expected normalized SHA-256: $expectedBeforeHash
Current normalized SHA-256:  $currentHash

Nothing was changed. Create/send a fresh project snapshot before applying this package.
"@
}

Write-Ok "Snapshot guard passed."

# ---------------- Record pre-state ----------------
Write-Step "Recording the exact pre-integration state"

$head = Git-Text @("rev-parse", "HEAD")
$branch = Git-Text @("branch", "--show-current")
$statusBefore = Git-Text @("status", "--short", "--branch")
$statusBefore | Set-Content -Path (Join-Path $script:LogDir "git-status-before.txt") -Encoding UTF8
@(
    "HEAD=$head",
    "BRANCH=$branch",
    "CAPTURED_AT=$(Get-Date -Format o)"
) | Set-Content -Path (Join-Path $script:LogDir "state.txt") -Encoding UTF8

Copy-Item -LiteralPath $targetDevice -Destination (Join-Path $script:LogDir "DeviceShowcase.tsx") -Force

$originalExists = @{}
foreach ($relative in @(
    "apps\website\src\features\device-showcase\laptop-scroll.css",
    "apps\website\public\showcase\laptop-open-scroll.webm",
    "apps\website\public\showcase\laptop-open-poster.webp"
)) {
    $full = Join-Path $script:Root $relative
    $originalExists[$relative] = Test-Path $full
    if ($originalExists[$relative]) {
        $backupName = $relative -replace '[\\/:*?"<>|]', '_'
        Copy-Item -LiteralPath $full -Destination (Join-Path $script:LogDir $backupName) -Force
    }
}

# ---------------- Git backup commit with temporary index ----------------
Write-Step "Creating a Git safety checkpoint without touching your current index/worktree"

$backupBranch = "backup/pre-laptop-scroll-$timestamp"
$tempIndex = Join-Path $env:TEMP "smartt-laptop-index-$timestamp"
if (Test-Path $tempIndex) { Remove-Item $tempIndex -Force }

$oldIndex = $env:GIT_INDEX_FILE
$oldAuthorName = $env:GIT_AUTHOR_NAME
$oldAuthorEmail = $env:GIT_AUTHOR_EMAIL
$oldCommitterName = $env:GIT_COMMITTER_NAME
$oldCommitterEmail = $env:GIT_COMMITTER_EMAIL

try {
    $env:GIT_INDEX_FILE = $tempIndex
    $env:GIT_AUTHOR_NAME = "SmartT Safety Backup"
    $env:GIT_AUTHOR_EMAIL = "smartt-backup@local"
    $env:GIT_COMMITTER_NAME = "SmartT Safety Backup"
    $env:GIT_COMMITTER_EMAIL = "smartt-backup@local"

    [void](Invoke-Git -Arguments @("read-tree", $head))
    [void](Invoke-Git -Arguments @("add", "-u", "--", "."))

    $tree = Git-Text @("write-tree")
    $backupCommit = Git-Text @("commit-tree", $tree, "-p", $head, "-m", "SmartT safety checkpoint before laptop scroll integration ($timestamp)")
}
finally {
    if ($null -eq $oldIndex) { Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue } else { $env:GIT_INDEX_FILE = $oldIndex }
    if ($null -eq $oldAuthorName) { Remove-Item Env:GIT_AUTHOR_NAME -ErrorAction SilentlyContinue } else { $env:GIT_AUTHOR_NAME = $oldAuthorName }
    if ($null -eq $oldAuthorEmail) { Remove-Item Env:GIT_AUTHOR_EMAIL -ErrorAction SilentlyContinue } else { $env:GIT_AUTHOR_EMAIL = $oldAuthorEmail }
    if ($null -eq $oldCommitterName) { Remove-Item Env:GIT_COMMITTER_NAME -ErrorAction SilentlyContinue } else { $env:GIT_COMMITTER_NAME = $oldCommitterName }
    if ($null -eq $oldCommitterEmail) { Remove-Item Env:GIT_COMMITTER_EMAIL -ErrorAction SilentlyContinue } else { $env:GIT_COMMITTER_EMAIL = $oldCommitterEmail }
    Remove-Item $tempIndex -Force -ErrorAction SilentlyContinue
}

[void](Invoke-Git -Arguments @("branch", $backupBranch, $backupCommit))

@(
    "BACKUP_BRANCH=$backupBranch",
    "BACKUP_COMMIT=$backupCommit",
    "BASE_HEAD=$head"
) | Add-Content -Path (Join-Path $script:LogDir "state.txt") -Encoding UTF8

Write-Ok "Git safety checkpoint created: $backupBranch"
Write-Host "It captures all current TRACKED modifications/deletions. Untracked files are deliberately left untouched and are not added to Git."

# ---------------- Apply integration ----------------
Write-Step "Applying the laptop reveal only to apps/website"

try {
    New-Item -ItemType Directory -Path $showcaseDir -Force | Out-Null

    Copy-Item -LiteralPath (Join-Path $packageRoot "patch\DeviceShowcase.tsx") -Destination $targetDevice -Force
    Copy-Item -LiteralPath (Join-Path $packageRoot "patch\laptop-scroll.css") -Destination $targetCss -Force
    Copy-Item -LiteralPath (Join-Path $packageRoot "assets\laptop-open-scroll.webm") -Destination $targetVideo -Force
    Copy-Item -LiteralPath (Join-Path $packageRoot "assets\laptop-open-poster.webp") -Destination $targetPoster -Force

    $afterHash = Get-NormalizedSha256 $targetDevice
    if ($afterHash -ne $expectedAfterHash) {
        throw "Post-copy hash check failed for DeviceShowcase.tsx."
    }

    Write-Ok "Files installed. No dashboard, firmware, backend, phone workflow, or other website sections were modified."

    # ---------------- Build ----------------
    Write-Step "Building the website"
    $websiteDir = Join-Path $script:Root "apps\website"
    Push-Location $websiteDir
    try {
        $npmCommand = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }

        if (-not (Test-Path (Join-Path $websiteDir "node_modules"))) {
            Write-Host "node_modules is missing; running npm ci..."
            $ciLog = Join-Path $script:LogDir "npm-ci.log"
            $ciCommand = "$npmCommand ci --no-audit --no-fund > `"$ciLog`" 2>&1"
            & cmd.exe /d /s /c $ciCommand
            $ciExit = $LASTEXITCODE
            if (Test-Path $ciLog) { Get-Content $ciLog | Write-Host }
            if ($ciExit -ne 0) {
                throw "npm ci failed with exit code $ciExit."
            }
        }

        $buildLog = Join-Path $script:LogDir "website-build.log"
        $buildCommand = "$npmCommand run build > `"$buildLog`" 2>&1"
        & cmd.exe /d /s /c $buildCommand
        $buildExit = $LASTEXITCODE
        if (Test-Path $buildLog) { Get-Content $buildLog | Write-Host }
        if ($buildExit -ne 0) {
            throw "Website build failed with exit code $buildExit."
        }
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host ""
    Write-Host "INTEGRATION FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Restore-TouchedFiles -BackupDir $script:LogDir -OriginalExists $originalExists
    Write-WarnText "The integration files were restored to their pre-run state."
    Write-WarnText "The safety branch remains available: $backupBranch"
    throw
}

# ---------------- Final report ----------------
Write-Step "Final Git report"
$statusAfter = Git-Text @("status", "--short", "--branch")
$statusAfter | Set-Content -Path (Join-Path $script:LogDir "git-status-after.txt") -Encoding UTF8

$diffStat = Git-Text @(
    "diff", "--stat", "--",
    "apps/website/src/features/device-showcase/DeviceShowcase.tsx",
    "apps/website/src/features/device-showcase/laptop-scroll.css",
    "apps/website/public/showcase/laptop-open-scroll.webm",
    "apps/website/public/showcase/laptop-open-poster.webp"
)
$diffStat | Set-Content -Path (Join-Path $script:LogDir "integration-diff-stat.txt") -Encoding UTF8

@"
SmartT laptop integration completed successfully.

Backup branch:
$backupBranch

Backup commit:
$backupCommit

Only these production paths are part of the integration:
- apps/website/src/features/device-showcase/DeviceShowcase.tsx
- apps/website/src/features/device-showcase/laptop-scroll.css
- apps/website/public/showcase/laptop-open-scroll.webm
- apps/website/public/showcase/laptop-open-poster.webp

No existing laptop/dashboard assets were deleted. They are retained as a static compatibility fallback.

Review the site with the existing launcher:
RUN SmartT Web.bat

Rollback only this integration with:
powershell -ExecutionPolicy Bypass -File "$packageRoot\rollback-smartt-laptop.ps1" -ProjectRoot "$script:Root" -BackupBranch "$backupBranch"
"@ | Set-Content -Path (Join-Path $script:LogDir "RESULT.txt") -Encoding UTF8

Write-Host ""
Write-Ok "DONE"
Write-Host "Backup branch: $backupBranch" -ForegroundColor Green
Write-Host "Log/backup:    $script:LogDir" -ForegroundColor Green
Write-Host ""
Write-Host "Now run: RUN SmartT Web.bat" -ForegroundColor Yellow
Write-Host "Review Desktop Console -> laptop opening -> Mobile Application, then scroll back up." -ForegroundColor Yellow
Write-Host "Do not commit yet unless you are happy with the result." -ForegroundColor Yellow
