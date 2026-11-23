[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [ValidateSet('Usb','Pinky','Ish')]
    [string[]]$Features = @('Usb','Pinky','Ish'),
    [switch]$SkipUsb
)

$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$stateBase = if ($env:IPHONE_USE_HOME) { $env:IPHONE_USE_HOME } else { Join-Path $env:LOCALAPPDATA 'IphoneUseCodex' }
if (-not [IO.Path]::IsPathRooted($stateBase)) { throw 'Use an absolute IPHONE_USE_HOME path.' }
$stateDir = $stateBase
$pluginId = 'iphone-use-standalone'
$marketName = 'iphone-use-local'
$edition = (Get-Content -LiteralPath (Join-Path $projectDir 'package.json') -Raw | ConvertFrom-Json).iphoneUseFeature
if ($null -ne $edition) {
    if ($edition -notin @('pinky','ish','usb')) { throw 'Unknown download package.' }
    if ($PSBoundParameters.ContainsKey('Features') -and ($Features.Count -ne 1 -or $Features[0] -ne $edition)) {
        throw "This download contains only $edition."
    }
    $Features = @($edition)
    $stateDir = Join-Path $stateBase "packages/$edition"
    $pluginId = "iphone-use-$edition"
    $marketName = "$pluginId-local"
}
$marketDir = Join-Path $stateDir 'marketplace'
$pluginDir = Join-Path $marketDir "plugins/$pluginId"
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$null = Get-Command codex -ErrorAction Stop
function Write-JsonFile($Path, $Value) {
    $parent = Split-Path -Parent $Path
    $null = [IO.Directory]::CreateDirectory($parent)
    $json = ConvertTo-Json -InputObject $Value -Depth 10
    [IO.File]::WriteAllText($Path, $json, (New-Object Text.UTF8Encoding($false)))
}
Push-Location -LiteralPath $projectDir
try {
    & $nodeExe -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(Number(a<22 || a===22 && b<16))"
    if ($LASTEXITCODE -ne 0) { throw 'Install Node.js 22.16 or later.' }
    & npm.cmd ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Node dependency installation failed.' }
    if (-not $SkipUsb -and ($Features -contains 'Usb' -or $Features -contains 'Ish')) {
        $python = Join-Path $stateDir 'venv/Scripts/python.exe'
        if (-not (Test-Path -LiteralPath $python)) {
            & py.exe -3 -m venv (Join-Path $stateDir 'venv')
            if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed.' }
        }
        if ($Features -contains 'Usb') {
            & $python -I -m pip install --disable-pip-version-check -r requirements.txt
            if ($LASTEXITCODE -ne 0) { throw 'USB dependency installation failed.' }
            & $python -I -B -c "import runpy; runpy.run_path('scripts/iphone-usb-ui.py')"
            if ($LASTEXITCODE -ne 0) { throw 'USB backend import failed.' }
        }
    }
    $manifestDir = Join-Path $pluginDir '.codex-plugin'
    $null = [IO.Directory]::CreateDirectory($manifestDir)
    Copy-Item -LiteralPath 'plugin/.codex-plugin/plugin.json' -Destination (Join-Path $manifestDir 'plugin.json') -Force
    $launch = @{command=$nodeExe; args=@((Join-Path $projectDir 'server.mjs')); env=@{IPHONE_USE_HOME=$stateBase}}
    Write-JsonFile (Join-Path $pluginDir '.mcp.json') @{mcpServers=@{$pluginId=$launch}}
    $entry = @{name=$pluginId;source=@{source='local';path="./plugins/$pluginId"};category='Productivity';policy=@{installation='AVAILABLE';authentication='ON_INSTALL'}}
    Write-JsonFile (Join-Path $marketDir '.agents/plugins/marketplace.json') @{name=$marketName;interface=@{displayName='iPhone Use Local'};plugins=@($entry)}
    & codex plugin marketplace add $marketDir
    if ($LASTEXITCODE -ne 0) { throw 'Codex could not register the local marketplace.' }
    & codex plugin add "$pluginId@$marketName"
    if ($LASTEXITCODE -ne 0) { throw 'Codex could not install the plugin.' }
    $featurePath = Join-Path $stateDir 'features.json'
    $staged = "$featurePath.$([Guid]::NewGuid()).tmp"
    try {
        Write-JsonFile $staged @($Features | ForEach-Object { $_.ToLowerInvariant() } | Select-Object -Unique)
        if ([IO.File]::Exists($featurePath)) { [IO.File]::Replace($staged, $featurePath, [NullString]::Value) }
        else { [IO.File]::Move($staged, $featurePath) }
    } finally { [IO.File]::Delete($staged) }
    Write-Output "Installed $pluginId ($($Features -join ', ')). Open a new Codex session. Device access is configured separately."
} finally { Pop-Location }
