# ASA API Firewall Configuration Script
# This script configures Windows Firewall to allow external connections to the ASA API

Write-Host "=== ASA API Firewall Configuration ===" -ForegroundColor Green
Write-Host ""

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Red
    exit 1
}

Write-Host "✓ Running as Administrator" -ForegroundColor Green

# Configuration
$API_PORT = 4000
$SERVICE_NAME = "ASA-API"
$SERVICE_DESCRIPTION = "ASA Management API Service"
$PROGRAM_PATH = "C:\ASA-API\server.js"
$NODE_PATH = "C:\Program Files\nodejs\node.exe"

Write-Host "Configuring firewall for:" -ForegroundColor Yellow
Write-Host "  Port: $API_PORT" -ForegroundColor White
Write-Host "  Service: $SERVICE_NAME" -ForegroundColor White
Write-Host "  Program: $PROGRAM_PATH" -ForegroundColor White
Write-Host ""

# Function to create firewall rules
function Create-FirewallRule {
    param(
        [string]$Name,
        [string]$Description,
        [string]$Direction,
        [string]$Protocol,
        [string]$LocalPort,
        [string]$Program,
        [string]$Action = "Allow"
    )
    
    try {
        # Remove existing rule if it exists
        Write-Host "Removing existing rule '$Name' if it exists..." -ForegroundColor Yellow
        netsh advfirewall firewall delete rule name="$Name" 2>$null
        
        # Create new rule
        Write-Host "Creating firewall rule: $Name" -ForegroundColor Yellow
        
        if ($Program) {
            # Rule for specific program
            netsh advfirewall firewall add rule name="$Name" dir=$Direction action=$Action program="$Program" description="$Description" enable=yes
        } elseif ($LocalPort) {
            # Rule for specific port
            netsh advfirewall firewall add rule name="$Name" dir=$Direction action=$Action protocol=$Protocol localport=$LocalPort description="$Description" enable=yes
        } else {
            # General rule
            netsh advfirewall firewall add rule name="$Name" dir=$Direction action=$Action description="$Description" enable=yes
        }
        
        Write-Host "✓ Created firewall rule: $Name" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "✗ Failed to create firewall rule '$Name': $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Create firewall rules
Write-Host "Creating firewall rules..." -ForegroundColor Yellow
Write-Host ""

# 1. Allow ASA API port (most important)
$success1 = Create-FirewallRule -Name "$SERVICE_NAME-Port" -Description "$SERVICE_DESCRIPTION - Allow port $API_PORT" -Direction "In" -Protocol "TCP" -LocalPort $API_PORT

# 2. Allow Node.js program
$success2 = Create-FirewallRule -Name "$SERVICE_NAME-Program" -Description "$SERVICE_DESCRIPTION - Allow Node.js program" -Direction "In" -Program $NODE_PATH

Write-Host ""
Write-Host "=== Firewall Configuration Summary ===" -ForegroundColor Green

if ($success1 -and $success2) {
    Write-Host "✓ All firewall rules created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Firewall rules created:" -ForegroundColor Yellow
    Write-Host "  - $SERVICE_NAME-Port: Allows TCP port $API_PORT" -ForegroundColor White
    Write-Host "  - $SERVICE_NAME-Program: Allows Node.js program" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart the ASA API service" -ForegroundColor White
    Write-Host "2. Test connection from frontend server" -ForegroundColor White
    Write-Host "3. Check if the 504 Gateway Timeout error is resolved" -ForegroundColor White
} else {
    Write-Host "✗ Some firewall rules failed to create" -ForegroundColor Red
    Write-Host "Please check the error messages above and try again." -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Testing Connection ===" -ForegroundColor Green

# Test if the port is now accessible
Write-Host "Testing if port $API_PORT is accessible..." -ForegroundColor Yellow
try {
    $testConnection = Test-NetConnection -ComputerName "localhost" -Port $API_PORT -InformationLevel Quiet
    if ($testConnection) {
        Write-Host "✓ Port $API_PORT is accessible locally" -ForegroundColor Green
    } else {
        Write-Host "✗ Port $API_PORT is not accessible locally" -ForegroundColor Red
        Write-Host "  The ASA API service might not be running" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Could not test port $API_PORT : $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Manual Verification ===" -ForegroundColor Green
Write-Host "To verify the firewall rules were created, run:" -ForegroundColor Yellow
Write-Host "  netsh advfirewall firewall show rule name='$SERVICE_NAME*'" -ForegroundColor White
Write-Host ""
Write-Host "To test from another machine, run:" -ForegroundColor Yellow
Write-Host "  Test-NetConnection -ComputerName 'BACKEND-SERVER-IP' -Port $API_PORT" -ForegroundColor White
Write-Host ""
Write-Host "Firewall configuration complete!" -ForegroundColor Green 
