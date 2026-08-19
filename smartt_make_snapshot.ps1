param(
    [string]$ProjectRoot = ".",
    [int]$MaxFileMB = 25
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Is-SecretFile([System.IO.FileInfo]$File) {
    $name = $File.Name.ToLowerInvariant()

    # Keep safe templates/examples, skip real environment/credential files.
    if ($name -in @(".env.example", ".env.sample", ".env.template")) {
        return $false
    }

    if ($name -eq ".env" -or $name.StartsWith(".env.")) {
        return $true
    }

    $secretExtensions = @(".pem", ".key", ".p12", ".pfx", ".jks", ".keystore")
    if ($secretExtensions -contains $File.Extension.ToLowerInvariant()) {
        return $true
    }

    $secretNames = @(
        "service-account.json",
        "service_account.json",
        "credentials.json",
        "secrets.json"
    )
    if ($secretNames -contains $name) {
        return $true
    }

    return $false
}

function Should-SkipDirectory([string]$Name) {
    $skipDirs = @(
        ".git", "node_modules", ".next", "dist", "build", "out",
        ".turbo", ".cache", ".vite", ".vercel", "coverage",
        "__pycache__", ".pytest_cache", ".mypy_cache",
        ".idea", ".vs"
    )
    return $skipDirs -contains $Name
}

$root = (Resolve-Path $ProjectRoot).Path
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$parent = Split-Path $root -Parent
$projectName = Split-Path $root -Leaf
$bundleName = "SmartT_project_snapshot_$timestamp"
$tempRoot = Join-Path $env:TEMP $bundleName
$sourceOut = Join-Path $tempRoot "source"
$metaOut = Join-Path $tempRoot "_inspection"
$zipPath = Join-Path $parent "$bundleName.zip"

if (Test-Path $tempRoot) {
    Remove-Item $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $sourceOut -Force | Out-Null
New-Item -ItemType Directory -Path $metaOut -Force | Out-Null

Write-Step "Project root: $root"

# ---------- Git metadata ----------
$gitAvailable = $false
try {
    git -C $root rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -eq 0) { $gitAvailable = $true }
} catch {}

$gitStatePath = Join-Path $metaOut "GIT_STATE.txt"
if ($gitAvailable) {
    Write-Step "Collecting Git state (read-only)"
    @(
        "PROJECT: $projectName"
        "ROOT: $root"
        "CAPTURED_AT: $(Get-Date -Format o)"
        ""
        "=== TOP LEVEL ==="
        (git -C $root rev-parse --show-toplevel 2>&1)
        ""
        "=== CURRENT BRANCH ==="
        (git -C $root branch --show-current 2>&1)
        ""
        "=== HEAD ==="
        (git -C $root rev-parse HEAD 2>&1)
        ""
        "=== STATUS --SHORT --BRANCH ==="
        (git -C $root status --short --branch 2>&1)
        ""
        "=== LAST 12 COMMITS ==="
        (git -C $root log -12 --oneline --decorate --graph 2>&1)
        ""
        "=== DIFF --STAT ==="
        (git -C $root diff --stat 2>&1)
        ""
        "=== STAGED DIFF --STAT ==="
        (git -C $root diff --cached --stat 2>&1)
    ) | Set-Content -Path $gitStatePath -Encoding UTF8

    git -C $root diff | Set-Content (Join-Path $metaOut "WORKTREE.diff") -Encoding UTF8
    git -C $root diff --cached | Set-Content (Join-Path $metaOut "STAGED.diff") -Encoding UTF8
    git -C $root ls-files | Set-Content (Join-Path $metaOut "TRACKED_FILES.txt") -Encoding UTF8
} else {
    "No Git repository detected at $root" | Set-Content -Path $gitStatePath -Encoding UTF8
}

# ---------- Copy source safely ----------
Write-Step "Copying project source (excluding generated folders and secrets)"
$skipped = New-Object System.Collections.Generic.List[string]
$copied = 0
$maxBytes = $MaxFileMB * 1MB

$files = Get-ChildItem -LiteralPath $root -File -Recurse -Force | Where-Object {
    $relativeParts = $_.FullName.Substring($root.Length).TrimStart('\','/').Split([IO.Path]::DirectorySeparatorChar)
    $dirParts = if ($relativeParts.Length -gt 1) { $relativeParts[0..($relativeParts.Length-2)] } else { @() }

    foreach ($part in $dirParts) {
        if (Should-SkipDirectory $part) { return $false }
    }
    return $true
}

foreach ($file in $files) {
    $relative = $file.FullName.Substring($root.Length).TrimStart('\','/')

    if (Is-SecretFile $file) {
        $skipped.Add("SECRET`t$relative")
        continue
    }

    if ($file.Length -gt $maxBytes) {
        $sizeMB = [Math]::Round($file.Length / 1MB, 2)
        $skipped.Add("LARGE_${sizeMB}MB`t$relative")
        continue
    }

    if ($file.Extension.ToLowerInvariant() -eq ".map") {
        $skipped.Add("SOURCEMAP`t$relative")
        continue
    }

    $dest = Join-Path $sourceOut $relative
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    $copied++
}

$skipped | Set-Content (Join-Path $metaOut "SKIPPED_FILES.txt") -Encoding UTF8

# ---------- Tree ----------
Write-Step "Generating project tree"
$treeLines = New-Object System.Collections.Generic.List[string]
$treeLines.Add("$projectName/")
Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object {
    $relative = $_.FullName.Substring($root.Length).TrimStart('\','/')
    if (-not $relative) { return }

    $parts = $relative.Split([IO.Path]::DirectorySeparatorChar)
    foreach ($part in $parts) {
        if (Should-SkipDirectory $part) { return }
    }

    if ($_.PSIsContainer) {
        $treeLines.Add("DIR`t$relative/")
    } else {
        $sizeKB = [Math]::Round($_.Length / 1KB, 1)
        $treeLines.Add("FILE`t$relative`t${sizeKB}KB")
    }
}
$treeLines | Set-Content (Join-Path $metaOut "TREE.txt") -Encoding UTF8

# ---------- Useful root metadata ----------
$rootFiles = @(
    "package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml",
    "package-lock.json", "yarn.lock", "bun.lockb",
    "turbo.json", "vite.config.ts", "vite.config.js",
    "tsconfig.json", "README.md"
)
$foundRoot = foreach ($name in $rootFiles) {
    $p = Join-Path $root $name
    if (Test-Path $p) { $name }
}

@"
SmartT project inspection bundle
================================
Captured: $(Get-Date -Format o)
Project: $projectName
Root on user's machine: $root

Purpose:
- Give ChatGPT an accurate view of the real project before integration.
- This script does NOT modify project files or Git state.
- node_modules/.git/build caches are excluded.
- .env/credential/private-key files are excluded.
- Individual files larger than $MaxFileMB MB are excluded and listed in SKIPPED_FILES.txt.

Copied files: $copied

Detected useful root files:
$($foundRoot -join "`r`n")

After creation:
1. Upload the generated ZIP to ChatGPT.
2. Do not delete or alter your working project yet.
3. Wait for the integration package/script built specifically for this snapshot.
"@ | Set-Content (Join-Path $metaOut "README_FIRST.txt") -Encoding UTF8

# ---------- Zip ----------
Write-Step "Creating ZIP"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}
Compress-Archive -Path (Join-Path $tempRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

$zipSizeMB = [Math]::Round((Get-Item $zipPath).Length / 1MB, 2)

Remove-Item $tempRoot -Recurse -Force

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host "Snapshot: $zipPath" -ForegroundColor Green
Write-Host "Size:     $zipSizeMB MB" -ForegroundColor Green
Write-Host ""
Write-Host "Upload that ZIP back to ChatGPT." -ForegroundColor Yellow
