param(
    [string]$ProjectRoot = "",
    [Parameter(Mandatory=$true)][string]$BackupBranch,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$packageRoot = $PSScriptRoot

function Invoke-GitCode {
    param([string[]]$Arguments)
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & git -C $script:Root @Arguments 2>$null | Out-Null
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }
}

function Invoke-GitChecked {
    param([string[]]$Arguments)
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & git -C $script:Root @Arguments
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }
    if ($code -ne 0) {
        throw "Git command failed (exit $code): git $($Arguments -join ' ')"
    }
}

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
            throw "Could not detect SmartT root. Pass -ProjectRoot explicitly."
        }
    }
}

$root = (Resolve-Path $ProjectRoot).Path
$script:Root = $root

if (-not $Force) {
    Write-Host "This will discard current edits to the four laptop-integration paths only." -ForegroundColor Yellow
    Write-Host "All other SmartT working-tree changes are left untouched."
    $answer = Read-Host "Type ROLLBACK to continue"
    if ($answer -ne "ROLLBACK") {
        Write-Host "Cancelled."
        exit 0
    }
}

$branchCode = Invoke-GitCode @("show-ref", "--verify", "--quiet", "refs/heads/$BackupBranch")
if ($branchCode -ne 0) {
    throw "Backup branch was not found: $BackupBranch"
}

$paths = @(
    "apps/website/src/features/device-showcase/DeviceShowcase.tsx",
    "apps/website/src/features/device-showcase/laptop-scroll.css",
    "apps/website/public/showcase/laptop-open-scroll.webm",
    "apps/website/public/showcase/laptop-open-poster.webp"
)

foreach ($path in $paths) {
    $existsCode = Invoke-GitCode @("cat-file", "-e", "$BackupBranch`:$path")
    if ($existsCode -eq 0) {
        Invoke-GitChecked @("restore", "--source", $BackupBranch, "--worktree", "--", $path)
    }
    else {
        $full = Join-Path $root ($path.Replace('/', '\'))
        if (Test-Path $full) { Remove-Item -LiteralPath $full -Force }
    }
}

$showcaseDir = Join-Path $root "apps\website\public\showcase"
if ((Test-Path $showcaseDir) -and -not (Get-ChildItem -LiteralPath $showcaseDir -Force | Select-Object -First 1)) {
    Remove-Item -LiteralPath $showcaseDir -Force
}

Write-Host ""
Write-Host "Laptop integration rolled back from: $BackupBranch" -ForegroundColor Green
Write-Host "Other working-tree changes were not touched." -ForegroundColor Green
