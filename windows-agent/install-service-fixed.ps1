# ASA Agent Windows Service Installer (Fixed)
# Run this script as Administrator to install the ASA agent as a Windows service

param(
    [string]$ServiceName = "ASA-Agent",
    [string]$DisplayName = "ASA Management Agent",
    [string]$Description = "Manages ARK: Survival Ascended servers on Windows host",
    [string]$AgentDir = "C:\ASA-Agent",
    [int]$Port = 5000
)

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator"
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

Write-Host "Installing ASA Agent as Windows Service (Fixed)..." -ForegroundColor Green

# Create service directory
if (!(Test-Path $AgentDir)) {
    New-Item -ItemType Directory -Path $AgentDir -Force
    Write-Host "Created service directory: $AgentDir"
}

# Copy the agent script
$SourceScript = Join-Path $PSScriptRoot "asa-agent.ps1"
$DestScript = Join-Path $AgentDir "asa-agent.ps1"
if (Test-Path $SourceScript) {
    Copy-Item $SourceScript $DestScript -Force
    Write-Host "Copied agent script to: $DestScript"
} else {
    Write-Error "Source script not found: $SourceScript"
    exit 1
}

# Copy the batch file wrapper
$SourceBatch = Join-Path $PSScriptRoot "asa-agent-service.bat"
$DestBatch = Join-Path $AgentDir "asa-agent-service.bat"
if (Test-Path $SourceBatch) {
    Copy-Item $SourceBatch $DestBatch -Force
    Write-Host "Copied service wrapper to: $DestBatch"
} else {
    Write-Error "Source batch file not found: $SourceBatch"
    exit 1
}

# Create default configuration
$ConfigPath = Join-Path $AgentDir "config.json"
$DefaultConfig = @{
    basePath = "G:\ARK"
    clustersPath = "G:\ARK\clusters"
    serverExe = "G:\ARK\shared-binaries\ShooterGame\Binaries\Win64\ArkAscendedServer.exe"
    allowedIPs = @("127.0.0.1", "172.16.0.0/12", "192.168.0.0/16")
    port = $Port
    logPath = Join-Path $AgentDir "logs"
}

$DefaultConfig | ConvertTo-Json | Set-Content $ConfigPath
Write-Host "Created default configuration: $ConfigPath"

# Create logs directory
$LogsDir = Join-Path $AgentDir "logs"
if (!(Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force
    Write-Host "Created logs directory: $LogsDir"
}

# Check if service already exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Service $ServiceName already exists. Stopping and removing..." -ForegroundColor Yellow
    Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Remove-Service $ServiceName -Force
    Start-Sleep -Seconds 2
}

# Create the service using the batch file wrapper
$serviceArgs = @{
    Name = $ServiceName
    DisplayName = $DisplayName
    Description = $Description
    StartupType = "Automatic"
    BinaryPathName = "`"$DestBatch`""
}

try {
    New-Service @serviceArgs
    Write-Host "Service created successfully!" -ForegroundColor Green
    
    # Set service to run as Local System
    $service = Get-WmiObject -Class Win32_Service -Filter "Name='$ServiceName'"
    $service.Change($null, $null, $null, $null, $null, $null, $null, "LocalSystem", $null, $null, $null)
    
    Write-Host "Service configured to run as Local System" -ForegroundColor Green
    
    # Start the service
    Start-Service $ServiceName
    Write-Host "Service started successfully!" -ForegroundColor Green
    
    # Show service status
    $service = Get-Service $ServiceName
    Write-Host "Service Status: $($service.Status)" -ForegroundColor Cyan
    Write-Host "Service will start automatically on boot" -ForegroundColor Cyan
    
    Write-Host "`nInstallation completed successfully!" -ForegroundColor Green
    Write-Host "The ASA Agent is now running as a Windows service." -ForegroundColor Green
    Write-Host "Service Name: $ServiceName" -ForegroundColor Cyan
    Write-Host "HTTP Endpoint: http://localhost:$Port" -ForegroundColor Cyan
    Write-Host "Logs: $LogsDir\asa-agent.log" -ForegroundColor Cyan
    
    Write-Host "`nUseful commands:" -ForegroundColor Yellow
    Write-Host "  Get-Service $ServiceName                    # Check service status" -ForegroundColor Gray
    Write-Host "  Start-Service $ServiceName                  # Start the service" -ForegroundColor Gray
    Write-Host "  Stop-Service $ServiceName                   # Stop the service" -ForegroundColor Gray
    Write-Host "  Restart-Service $ServiceName                # Restart the service" -ForegroundColor Gray
    Write-Host "  Remove-Service $ServiceName                 # Uninstall the service" -ForegroundColor Gray
    
} catch {
    Write-Error "Failed to create service: $($_.Exception.Message)"
    exit 1
} 
