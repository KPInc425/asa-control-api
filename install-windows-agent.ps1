# ASA Windows Agent Installer
# This script installs the ASA Windows Agent from the project directory

param(
    [string]$ServiceName = "ASA-Agent",
    [int]$Port = 5000
)

Write-Host "ASA Windows Agent Installer" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator"
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if we're in the right directory
$agentScript = Join-Path $PSScriptRoot "windows-agent\asa-agent.ps1"
$installerScript = Join-Path $PSScriptRoot "windows-agent\install-service.ps1"

if (!(Test-Path $agentScript)) {
    Write-Error "Agent script not found: $agentScript"
    Write-Host "Please run this script from the asa-docker-control-api directory" -ForegroundColor Yellow
    exit 1
}

if (!(Test-Path $installerScript)) {
    Write-Error "Installer script not found: $installerScript"
    Write-Host "Please run this script from the asa-docker-control-api directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found agent files, proceeding with installation..." -ForegroundColor Green

# Run the installer script
try {
    & $installerScript -ServiceName $ServiceName -Port $Port
    Write-Host "`nInstallation completed successfully!" -ForegroundColor Green
    Write-Host "The ASA Windows Agent is now running as a service." -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "1. Restart your Docker containers to enable Windows Agent integration" -ForegroundColor Cyan
    Write-Host "2. Test the agent: curl http://localhost:$Port/health" -ForegroundColor Cyan
    Write-Host "3. Check the dashboard - servers should now start automatically!" -ForegroundColor Cyan
} catch {
    Write-Error "Installation failed: $($_.Exception.Message)"
    exit 1
} 
