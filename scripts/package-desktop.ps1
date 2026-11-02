param(
  [Parameter(Mandatory=$true)][string]$ElectronRuntime,
  [Parameter(Mandatory=$true)][string]$NodeExe,
  [Parameter(Mandatory=$true)][string]$Destination,
  [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath($SourceRoot)
$target = [IO.Path]::GetFullPath($Destination)
$runtime = [IO.Path]::GetFullPath($ElectronRuntime)
if ($target -eq [IO.Path]::GetPathRoot($target) -or $target -eq $source -or $target -eq $runtime) { throw 'Choose a separate app installation folder.' }
if (-not (Test-Path -LiteralPath (Join-Path $runtime 'electron.exe'))) { throw 'A verified Electron runtime folder is required.' }
if (-not (Test-Path -LiteralPath $NodeExe)) { throw 'A verified Node.js executable is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $source 'dist/index.html'))) { throw 'Build OfficeX before packaging the desktop app.' }
$marker = Join-Path $target '.officex-desktop-install'
if ((Test-Path -LiteralPath $target) -and -not (Test-Path -LiteralPath $marker)) { throw 'Destination already exists and is not an OfficeX desktop installation.' }
New-Item -ItemType Directory -Path $target -Force | Out-Null
[IO.File]::WriteAllText($marker, 'OfficeX desktop runtime; company data lives elsewhere.')
# Only framework files are copied: never the other app's resources/app, tools or user data.
foreach ($file in Get-ChildItem -LiteralPath $runtime -File) {
  if ($file.Extension -in @('.dll','.pak','.bin','.dat','.json','.html') -or $file.Name -in @('LICENSE','version')) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $target $file.Name) -Force }
}
Copy-Item -LiteralPath (Join-Path $runtime 'electron.exe') -Destination (Join-Path $target 'OfficeX.exe') -Force
Copy-Item -LiteralPath (Join-Path $runtime 'locales') -Destination $target -Recurse -Force
$appFolder = Join-Path $target 'resources/app'
$nodeFolder = Join-Path $target 'runtime'
New-Item -ItemType Directory -Path $appFolder,$nodeFolder -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $source 'desktop') -File | Where-Object Name -ne 'instance.json' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $appFolder -Force }
Copy-Item -LiteralPath (Join-Path $source 'scripts/officex.ico') -Destination (Join-Path $appFolder 'officex.ico') -Force
$nodeTarget = Join-Path $nodeFolder 'node.exe'
Copy-Item -LiteralPath $NodeExe -Destination $nodeTarget -Force
if ((Get-FileHash -LiteralPath $NodeExe).Hash -ne (Get-FileHash -LiteralPath $nodeTarget).Hash) { throw 'Node.js copy verification failed.' }
if ((Get-FileHash -LiteralPath (Join-Path $runtime 'electron.exe')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $target 'OfficeX.exe')).Hash) { throw 'Electron copy verification failed.' }
$config = @{ sourceRoot = $source; serverConfig = (Join-Path $source 'server.json'); nodePath = $nodeTarget }
[IO.File]::WriteAllText((Join-Path $appFolder 'instance.json'), ($config | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Write-Output (Join-Path $target 'OfficeX.exe')
