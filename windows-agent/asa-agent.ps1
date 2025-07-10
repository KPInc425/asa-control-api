# ASA Management Agent for Windows
# This script runs as a Windows service to manage ASA servers

param(
    [string]$ConfigPath = "C:\ASA-Agent\config.json",
    [int]$Port = 5000,
    [string]$LogPath = "C:\ASA-Agent\logs"
)

# Create directories if they don't exist
$AgentDir = Split-Path $ConfigPath -Parent
$LogDir = Split-Path $LogPath -Parent
if (!(Test-Path $AgentDir)) { New-Item -ItemType Directory -Path $AgentDir -Force }
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force }

# Logging function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path "$LogPath\asa-agent.log" -Value $logMessage
}

# Load configuration
function Load-Config {
    if (Test-Path $ConfigPath) {
        try {
            $config = Get-Content $ConfigPath | ConvertFrom-Json
            Write-Log "Configuration loaded from $ConfigPath"
            return $config
        }
        catch {
            Write-Log "Failed to load config, using defaults" "ERROR"
            return Get-DefaultConfig
        }
    } else {
        Write-Log "No config found, creating default" "WARN"
        $defaultConfig = Get-DefaultConfig
        $defaultConfig | ConvertTo-Json | Set-Content $ConfigPath
        return $defaultConfig
    }
}

function Get-DefaultConfig {
    return @{
        basePath = "G:\ARK"
        clustersPath = "G:\ARK\clusters"
        serverExe = "G:\ARK\shared-binaries\ShooterGame\Binaries\Win64\ArkAscendedServer.exe"
        allowedIPs = @("127.0.0.1", "172.16.0.0/12", "192.168.0.0/16")
        port = $Port
        logPath = $LogPath
    }
}

# Get running ASA processes
function Get-ASAProcesses {
    try {
        $processes = Get-Process -Name "ArkAscendedServer" -ErrorAction SilentlyContinue
        $shooterProcesses = Get-Process -Name "ShooterGameServer" -ErrorAction SilentlyContinue
        return @($processes) + @($shooterProcesses)
    }
    catch {
        Write-Log "Error getting ASA processes: $($_.Exception.Message)" "ERROR"
        return @()
    }
}

# Start a server by name
function Start-ASAServer {
    param([string]$ServerName)
    
    Write-Log "Starting server: $ServerName"
    
    try {
        # Check if it's a cluster server
        $clusterConfigs = Get-ChildItem -Path $config.clustersPath -Filter "cluster.json" -Recurse
        
        foreach ($clusterConfig in $clusterConfigs) {
            $clusterData = Get-Content $clusterConfig.FullName | ConvertFrom-Json
            $server = $clusterData.servers | Where-Object { $_.name -eq $ServerName }
            
            if ($server) {
                $serverDir = Split-Path $clusterConfig.DirectoryName -Parent
                $startBatPath = Join-Path $serverDir $ServerName "start.bat"
                
                if (Test-Path $startBatPath) {
                    Write-Log "Found start.bat: $startBatPath"
                    
                    # Start the batch file
                    $process = Start-Process -FilePath $startBatPath -WorkingDirectory (Split-Path $startBatPath -Parent) -WindowStyle Normal -PassThru
                    
                    if ($process) {
                        Write-Log "Server $ServerName started with PID: $($process.Id)"
                        return @{
                            success = $true
                            message = "Server $ServerName started successfully"
                            processId = $process.Id
                            startTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                        }
                    } else {
                        throw "Failed to start process"
                    }
                } else {
                    throw "Start.bat not found: $startBatPath"
                }
            }
        }
        
        throw "Server $ServerName not found in any cluster configuration"
    }
    catch {
        Write-Log "Failed to start server $ServerName : $($_.Exception.Message)" "ERROR"
        return @{
            success = $false
            message = "Failed to start server: $($_.Exception.Message)"
        }
    }
}

# Stop a server by name
function Stop-ASAServer {
    param([string]$ServerName)
    
    Write-Log "Stopping server: $ServerName"
    
    try {
        # Find the process by checking command line arguments
        $processes = Get-ASAProcesses
        
        foreach ($process in $processes) {
            try {
                $cmdLine = (Get-WmiObject -Class Win32_Process -Filter "ProcessId = $($process.Id)").CommandLine
                if ($cmdLine -and $cmdLine.Contains($ServerName)) {
                    Write-Log "Found process for $ServerName with PID: $($process.Id)"
                    Stop-Process -Id $process.Id -Force
                    Write-Log "Stopped process $($process.Id)"
                    return @{
                        success = $true
                        message = "Server $ServerName stopped successfully"
                        processId = $process.Id
                    }
                }
            }
            catch {
                Write-Log "Error checking process $($process.Id): $($_.Exception.Message)" "WARN"
            }
        }
        
        return @{
            success = $false
            message = "No running process found for server $ServerName"
        }
    }
    catch {
        Write-Log "Failed to stop server $ServerName : $($_.Exception.Message)" "ERROR"
        return @{
            success = $false
            message = "Failed to stop server: $($_.Exception.Message)"
        }
    }
}

# Get server status
function Get-ServerStatus {
    param([string]$ServerName)
    
    try {
        $processes = Get-ASAProcesses
        
        foreach ($process in $processes) {
            try {
                $cmdLine = (Get-WmiObject -Class Win32_Process -Filter "ProcessId = $($process.Id)").CommandLine
                if ($cmdLine -and $cmdLine.Contains($ServerName)) {
                    $startTime = $process.StartTime
                    $uptime = (Get-Date) - $startTime
                    $memoryMB = [math]::Round($process.WorkingSet64 / 1MB, 2)
                    
                    return @{
                        success = $true
                        status = "running"
                        processId = $process.Id
                        startTime = $startTime.ToString("yyyy-MM-dd HH:mm:ss")
                        uptime = [math]::Round($uptime.TotalSeconds)
                        memoryMB = $memoryMB
                        cpu = 0 # Would need more complex monitoring for CPU
                    }
                }
            }
            catch {
                Write-Log "Error checking process $($process.Id): $($_.Exception.Message)" "WARN"
            }
        }
        
        return @{
            success = $true
            status = "stopped"
            processId = $null
            startTime = $null
            uptime = 0
            memoryMB = 0
            cpu = 0
        }
    }
    catch {
        Write-Log "Failed to get status for $ServerName : $($_.Exception.Message)" "ERROR"
        return @{
            success = $false
            message = "Failed to get status: $($_.Exception.Message)"
        }
    }
}

# HTTP server functions
function Start-HTTPServer {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://+:$Port/")
    
    try {
        $listener.Start()
        Write-Log "HTTP server started on port $Port"
        
        while ($listener.IsListening) {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            # Check if request is from allowed IP
            $clientIP = $context.Request.RemoteEndPoint.Address.ToString()
            $allowed = $false
            foreach ($allowedIP in $config.allowedIPs) {
                if ($clientIP -eq $allowedIP -or $allowedIP -like "*/*") {
                    $allowed = $true
                    break
                }
            }
            
            if (-not $allowed) {
                Write-Log "Access denied from IP: $clientIP" "WARN"
                $response.StatusCode = 403
                $response.Close()
                continue
            }
            
            try {
                $path = $request.Url.LocalPath
                $method = $request.HttpMethod
                
                Write-Log "Request: $method $path from $clientIP"
                
                switch ($path) {
                    "/health" {
                        $response.StatusCode = 200
                        $response.ContentType = "application/json"
                        $responseBody = @{
                            status = "healthy"
                            timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                            version = "1.0.0"
                        } | ConvertTo-Json
                    }
                    
                    "/api/servers" {
                        $response.StatusCode = 200
                        $response.ContentType = "application/json"
                        $processes = Get-ASAProcesses
                        $responseBody = @{
                            success = $true
                            servers = $processes | ForEach-Object {
                                @{
                                    id = $_.Id
                                    name = $_.ProcessName
                                    startTime = $_.StartTime.ToString("yyyy-MM-dd HH:mm:ss")
                                    memoryMB = [math]::Round($_.WorkingSet64 / 1MB, 2)
                                }
                            }
                        } | ConvertTo-Json
                    }
                    
                    { $path -match "^/api/servers/(.+)/start$" } {
                        $serverName = $matches[1]
                        $result = Start-ASAServer $serverName
                        $response.StatusCode = if ($result.success) { 200 } else { 500 }
                        $response.ContentType = "application/json"
                        $responseBody = $result | ConvertTo-Json
                    }
                    
                    { $path -match "^/api/servers/(.+)/stop$" } {
                        $serverName = $matches[1]
                        $result = Stop-ASAServer $serverName
                        $response.StatusCode = if ($result.success) { 200 } else { 500 }
                        $response.ContentType = "application/json"
                        $responseBody = $result | ConvertTo-Json
                    }
                    
                    { $path -match "^/api/servers/(.+)/status$" } {
                        $serverName = $matches[1]
                        $result = Get-ServerStatus $serverName
                        $response.StatusCode = if ($result.success) { 200 } else { 500 }
                        $response.ContentType = "application/json"
                        $responseBody = $result | ConvertTo-Json
                    }
                    
                    default {
                        $response.StatusCode = 404
                        $responseBody = @{
                            error = "Not found"
                            path = $path
                        } | ConvertTo-Json
                    }
                }
                
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseBody)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.Close()
            }
            catch {
                Write-Log "Error handling request: $($_.Exception.Message)" "ERROR"
                $response.StatusCode = 500
                $responseBody = @{
                    error = "Internal server error"
                    message = $_.Exception.Message
                } | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseBody)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.Close()
            }
        }
    }
    catch {
        Write-Log "HTTP server error: $($_.Exception.Message)" "ERROR"
    }
    finally {
        $listener.Stop()
        Write-Log "HTTP server stopped"
    }
}

# Main execution
Write-Log "ASA Agent starting..."
$config = Load-Config
Write-Log "Configuration: $($config | ConvertTo-Json)"

# Start the HTTP server
Start-HTTPServer 
