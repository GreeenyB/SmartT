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

# Run Git without letting harmless stderr warnings become PowerShell exceptions.
function Invoke-GitSafe {
    param(
        [Parameter(Mandatory=$true)][string]$WorkingDirectory,
        [Parameter(Mandatory=$true)][string[]]$Arguments
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "git"
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    foreach ($arg in $Arguments) {
        [void]$psi.ArgumentList.Add($arg)
    }

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi

    try {
        [void]$proc.Start()
        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()

        [PSCustomObject]@{
            ExitCode = $proc.ExitCode
            StdOut   = $stdout.TrimEnd()
            StdErr   = $stderr.TrimEnd()
        }
    }
    finally {
        if ($proc) { $proc.Dispose() }
    }
}

# Windows PowerShell 5.1 does not expose ProcessStartInfo.ArgumentList.
# Provide a fallback runner using cmd.exe quoting.
function Invoke-GitSafeCompat {
    param(
        [Parameter(Mandatory=$true)][string]$WorkingDirectory,
        [Parameter(Mandatory=$true)][string[]]$Arguments
    )

    $supportsArgumentList = $false
    try {
        $testPsi = New-Object System.Diagnostics.ProcessStartInfo
        $supportsArgumentList = ($null -ne $testPsi.ArgumentList)
    } catch {}

    if ($supportsArgumentList) {
        return Invoke-GitSafe -WorkingDirectory $WorkingDirectory -Arguments $Arguments
    }

    function Quote-CmdArg([string]$s) {
        if ($s -match '[\s"&|<>^]') {
            return '"' + ($s -replace '"','\"') + '"'
        }
        return $s
    }

    $joined = ($Arguments | ForEach-Object { Quote-CmdArg $_ }) -join ' '

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.Arguments = "/d /s /c `"git $joined`""

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi

    try {
        [void]$proc.Start()
        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()

        [PSCustomObject]@{
            ExitCode = $proc.ExitCode
            StdOut   = $stdout.TrimEnd()
            StdErr   = $stderr.TrimEnd()
        }
    }
    finally {
        if ($proc) { $proc.Dispose() }
    }
}

function Git-Text {
    param(
        [string]$WorkingDirectory,
        [string[]]$Arguments,
        [switch]$IncludeWarnings
    )

    $r = Invoke-GitSafeCompat -WorkingDirectory $WorkingDirectory -Arguments $Arguments
    $parts = New-Object System.Collections.Generic.List[string]

    if ($r.StdOut) { $parts.Add($r.StdOut) }
    if ($IncludeWarnings -and $r.StdErr) {
        $parts.Add("")
        $parts.Add("[git stderr / warnings]")
        $parts.Add($r.StdErr)
    }

    if ($r.ExitCode -ne 0) {
        if (-not $IncludeWarnings -and $r.StdErr) {
            $parts.Add("")
            $parts.Add("[git stderr]")
            $parts.Add($r.StdErr)
        }
        $parts.Add("")
        $parts.Add("[git exit code: $($r.ExitCode)]")
    }

    return ($parts -join "`r`n")
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
    $probe = Invoke-GitSafeCompat -WorkingDirectory $root -Arguments @("rev-parse", "--is-inside-work-tree")
    if ($probe.ExitCode -eq 0 -and $probe.StdOut -match "true") {
        $gitAvailable = $true
    }
} catch {
    $gitAvailable = $false
}

$gitStatePath = Join-Path $metaOut "GIT_STATE.txt"

if ($gitAvailable) {
    Write-Step "Collecting Git state (read-only; warnings are non-fatal)"

    $gitSections = New-Object System.Collections.Generic.List[string]
    $gitSections.Add("PROJECT: $projectName")
    $gitSections.Add("ROOT: $root")
    $gitSections.Add("CAPTURED_AT: $(Get-Date -Format o)")
    $gitSections.Add("")

    $sections = @(
        @{ Title = "TOP LEVEL";              Args = @("rev-parse", "--show-toplevel") },
        @{ Title = "CURRENT BRANCH";         Args = @("branch", "--show-current") },
        @{ Title = "HEAD";                   Args = @("rev-parse", "HEAD") },
        @{ Title = "STATUS --SHORT --BRANCH";Args = @("status", "--short", "--branch") },
        @{ Title = "LAST 12 COMMITS";        Args = @("log", "-12", "--oneline", "--decorate", "--graph") },
        @{ Title = "DIFF --STAT";            Args = @("diff", "--stat") },
        @{ Title = "STAGED DIFF --STAT";     Args = @("diff", "--cached", "--stat") }
    )

    foreach ($section in $sections) {
        $gitSections.Add("=== $($section.Title) ===")
        $gitSections.Add((Git-Text -WorkingDirectory $root -Arguments $section.Args -IncludeWarnings))
        $gitSections.Add("")
    }

    $gitSections | Set-Content -Path $gitStatePath -Encoding UTF8

    (Git-Text -WorkingDirectory $root -Arguments @("diff") -IncludeWarnings) |
        Set-Content (Join-Path $metaOut "WORKTREE.diff") -Encoding UTF8

    (Git-Text -WorkingDirectory $root -Arguments @("diff", "--cached") -IncludeWarnings) |
        Set-Content (Join-Path $metaOut "STAGED.diff") -Encoding UTF8

    (Git-Text -WorkingDirectory $root -Arguments @("ls-files") -IncludeWarnings) |
        Set-Content (Join-Path $metaOut "TRACKED_FILES.txt") -Encoding UTF8
} else {
    "No Git repository detected at $root" | Set-Content -Path $gitStatePath -Encoding UTF8
}

# ---------- Copy source safely ----------
Write-Step "Copying project source (excluding generated folders and secrets)"

$skipped = New-Object System.Collections.Generic.List[string]
$copied = 0
$maxBytes = $MaxFileMB * 1MB

$files = Get-ChildItem -LiteralPath $root -File -Recurse -Force | Where-Object {
    $relative = $_.FullName.Substring($root.Length).TrimStart('\','/')
    $parts = $relative.Split([IO.Path]::DirectorySeparatorChar)

    if ($parts.Length -gt 1) {
        foreach ($part in $parts[0..($parts.Length-2)]) {
            if (Should-SkipDirectory $part) { return $false }
        }
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
- Git LF/CRLF and similar stderr warnings are recorded but do NOT stop the snapshot.

Copied files: $copied

Detected useful root files:
$($foundRoot -join "`r`n")

After creation:
1. Upload the generated ZIP to ChatGPT.
2. Do not alter the working project yet.
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
