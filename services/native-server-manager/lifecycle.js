import { spawn } from "child_process";
import { promises as fs, existsSync } from "fs";
import path from "path";
import logger from "../../utils/logger.js";
import { stateReconciliation, IntentType } from "../state-reconciliation.js";

/**
 * Server lifecycle operations: start, stop, restart, crash detection
 */
export class ServerLifecycle {
  constructor(manager) {
    this.manager = manager;
  }

  async start(name) {
    try {
      stateReconciliation.recordIntent(name, IntentType.START, "user");

      const isCurrentlyRunning = await this.manager.isRunning(name);
      if (isCurrentlyRunning) {
        logger.info(`Server ${name} is already running. Stopping existing instance to prevent duplicates...`);
        await this.manager.stop(name);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      logger.info(`Regenerating start.bat for server ${name} with latest configuration...`);
      try {
        await this.manager.regenerateServerStartScript(name);
        logger.info(`Successfully regenerated start.bat for server ${name}`);
      } catch (regenerateError) {
        logger.warn(`Failed to regenerate start.bat for server ${name}:`, regenerateError.message);
      }

      const serverInfo = await this.manager.getClusterServerInfo(name);
      if (!serverInfo) throw new Error(`Server configuration not found: ${name}`);

      logger.info(`Server info for ${name}:`, {
        name: serverInfo.name, gamePort: serverInfo.gamePort, port: serverInfo.port,
        queryPort: serverInfo.queryPort, rconPort: serverInfo.rconPort, serverPath: serverInfo.serverPath,
      });

      if (!serverInfo.serverPath || !existsSync(serverInfo.serverPath)) {
        throw new Error(`Server path does not exist: ${serverInfo.serverPath}`);
      }

      const startBatPath = path.join(serverInfo.serverPath, "start.bat");
      if (!existsSync(startBatPath)) throw new Error(`Start.bat file not found: ${startBatPath}`);

      logger.info(`Using start.bat file: ${startBatPath}`);
      logger.info(`Working directory: ${serverInfo.serverPath}`);

      const childProcess = spawn("cmd", ["/c", "start.bat"], {
        cwd: serverInfo.serverPath, detached: false, stdio: ["ignore", "pipe", "pipe"],
      });

      logger.info(`Process spawned with PID: ${childProcess.pid}`);

      try {
        const { allowArkServerPorts } = await import("../../utils/firewall.js");
        allowArkServerPorts({
          gamePort: serverInfo.gamePort, queryPort: serverInfo.queryPort,
          rconPort: serverInfo.rconPort, serverName: name,
        }).catch((fwErr) => logger.warn(`Firewall rule creation skipped (non-admin): ${fwErr.message}`));
      } catch { /* firewall module unavailable — non-critical */ }

      if (!this.manager.processes) this.manager.processes = new Map();

      const processInfo = {
        process: childProcess, startTime: new Date(), command: "cmd /c start.bat",
        name, serverInfo, startupOutput: "", startupErrors: "", status: "starting",
      };
      this.manager.processes.set(name, processInfo);

      childProcess.stdout.on("data", (data) => {
        const output = data.toString();
        processInfo.startupOutput += output;
        logger.info(`[${name}] STDOUT: ${output.trim()}`);
      });

      childProcess.stderr.on("data", (data) => {
        const error = data.toString();
        processInfo.startupErrors += error;
        logger.error(`[${name}] STDERR: ${error.trim()}`);
      });

      childProcess.on("error", (error) => {
        logger.error(`[${name}] Process error event:`, error.message);
        processInfo.status = "error";
        processInfo.error = error.message;
        processInfo.errorTime = new Date();
      });

      childProcess.on("exit", (code, signal) => {
        logger.info(`[${name}] Process exit event - Code: ${code}, Signal: ${signal}`);
        processInfo.status = "exited";
        processInfo.exitCode = code;
        processInfo.exitSignal = signal;
        processInfo.exitTime = new Date();
      });

      childProcess.on("close", (code, signal) => {
        logger.info(`[${name}] Process close event - Code: ${code}, Signal: ${signal}`);
        processInfo.status = "closed";
        processInfo.closeCode = code;
        processInfo.closeSignal = signal;
        processInfo.closeTime = new Date();
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const startupResult = await this.monitorStartup(name, childProcess, serverInfo, processInfo);
      if (!startupResult.success) {
        this.manager.processes.delete(name);
        throw new Error(startupResult.message);
      }

      this.setupCrashDetection(name, childProcess);

      logger.info(`Server ${name} started successfully with PID: ${childProcess.pid}`);
      return {
        success: true, message: `Server ${name} started successfully`,
        pid: childProcess.pid, startupTime: Date.now() - processInfo.startTime.getTime(),
      };
    } catch (error) {
      logger.error(`Failed to start server ${name}:`, error);
      throw error;
    }
  }

  async monitorStartup(name, childProcess, serverInfo, processInfo) {
    const maxStartupTime = 30000;
    const checkInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxStartupTime) {
      if (childProcess.killed) {
        let isServerRunning = false;
        for (let retry = 0; retry < 5; retry++) {
          isServerRunning = await this.manager.isRunning(name);
          if (isServerRunning) break;
          logger.info(`[monitorStartup] ${name}: cmd exited, waiting for Ark process (retry ${retry + 1}/5)...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        if (isServerRunning) {
          processInfo.status = "running";
          processInfo.process = null;
          return { success: true, message: "Server started successfully" };
        }
        return { success: false, message: `Server process crashed during startup. Errors: ${processInfo.startupErrors || "Unknown error"}` };
      }

      if (["Fatal error", "Failed to start", "Port already in use", "Access denied"].some((e) => processInfo.startupErrors.includes(e))) {
        return { success: false, message: `Server startup failed: ${processInfo.startupErrors}` };
      }

      if (["Server started", "Listening on port", "Server is ready", "Game server started"].some((m) => processInfo.startupOutput.includes(m))) {
        processInfo.status = "running";
        return { success: true, message: "Server started successfully" };
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    const isServerRunning = await this.manager.isRunning(name);
    if (isServerRunning) {
      processInfo.status = "running";
      processInfo.process = null;
      return { success: true, message: "Server appears to be running (process active)" };
    }

    const runningProcesses = await this.manager.getRunningProcesses();
    const serverProcess = runningProcesses.find((process) => {
      const commandLine = process.commandLine || "";
      return commandLine.includes(`SessionName=${name}`) ||
        commandLine.includes(`SessionName=${name.replace(/\s+/g, "%20")}`) ||
        commandLine.includes(name);
    });

    if (serverProcess) {
      processInfo.status = "running";
      processInfo.process = null;
      return { success: true, message: "Server process detected (startup may still be in progress)" };
    }

    return { success: false, message: `Server startup timed out after ${maxStartupTime / 1000} seconds. Server may be stuck.` };
  }

  setupCrashDetection(name, childProcess) {
    childProcess.on("exit", (code, signal) => {
      logger.info(`Server ${name} wrapper process exited with code ${code} and signal ${signal}`);
      const processInfo = this.manager.processes.get(name);
      if (processInfo) processInfo.process = null;
      setTimeout(() => { this.manager.processes.delete(name); }, 60000);
    });

    childProcess.on("error", (error) => {
      logger.error(`Server ${name} process error:`, error.message);
      const processInfo = this.manager.processes.get(name);
      if (processInfo) {
        processInfo.status = "error";
        processInfo.error = error.message;
        processInfo.errorTime = new Date();
        stateReconciliation.recordServerStopped(name, { exitCode: -1, reason: `Process error: ${error.message}` });
      }
    });
  }

  async stop(name) {
    try {
      stateReconciliation.recordIntent(name, IntentType.STOP, "user");
      logger.info(`Stopping native server: ${name}`);

      const processInfo = this.manager.processes.get(name);
      if (processInfo && processInfo.process) {
        processInfo.process.kill("SIGTERM");
        setTimeout(() => {
          if (processInfo.process && !processInfo.process.killed) processInfo.process.kill("SIGKILL");
        }, 5000);
        stateReconciliation.recordServerStopped(name, { exitCode: 0, reason: "Intentional stop" });
        this.manager.processes.delete(name);
        logger.info(`Stopped server ${name}`);
        return { success: true, message: `Server ${name} stopped` };
      }

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      try {
        const wmicOut = await execAsync(
          `wmic process where "name='ArkAscendedServer.exe'" get ProcessId,CommandLine /format:csv`, { timeout: 8000 }
        );
        const lines = wmicOut.stdout.split("\n").filter(Boolean);
        let killed = false;
        for (const line of lines) {
          const parts = line.split(",");
          if (parts.length >= 3) {
            const pid = parts[1]?.trim();
            const cmd = parts.slice(2).join(",");
            if (pid && (cmd.includes(`SessionName=${name}`) || cmd.includes(name))) {
              await execAsync(`taskkill /f /pid ${pid}`, { timeout: 5000 });
              logger.info(`Stopped server ${name} by PID ${pid}`);
              killed = true;
            }
          }
        }
        if (killed) {
          stateReconciliation.recordServerStopped(name, { exitCode: 0, reason: "Intentional stop" });
          return { success: true, message: `Server ${name} stopped` };
        }
      } catch { /* WMIC quick scan failed — fall through */ }

      try {
        await execAsync(`taskkill /f /fi "IMAGENAME eq ArkAscendedServer.exe" /fi "CMDLINE ne ''"`, { timeout: 5000, maxBuffer: 1024 });
        const wmicOut2 = await execAsync(
          `wmic process where "name='ArkAscendedServer.exe'" get ProcessId,CommandLine /format:csv`, { timeout: 8000 }
        );
        const lines2 = wmicOut2.stdout.split("\n").filter(Boolean);
        let killed2 = false;
        for (const line of lines2) {
          const parts = line.split(",");
          if (parts.length >= 3) {
            const pid = parts[1]?.trim();
            const cmd = parts.slice(2).join(",");
            if (pid && (cmd.includes(`SessionName=${name}`) || cmd.includes(name))) {
              await execAsync(`taskkill /f /pid ${pid}`, { timeout: 5000 });
              killed2 = true;
            }
          }
        }
        if (killed2) {
          stateReconciliation.recordServerStopped(name, { exitCode: 0, reason: "Intentional stop" });
          return { success: true, message: `Server ${name} stopped` };
        }
        logger.warn(`No ArkAscendedServer.exe found for server ${name}`);
        stateReconciliation.recordServerStopped(name, { exitCode: 0, reason: "Server was not running" });
        return { success: false, message: `Server ${name} not running` };
      } catch {
        logger.warn(`No ArkAscendedServer.exe found for server ${name}`);
        stateReconciliation.recordServerStopped(name, { exitCode: 0, reason: "Server was not running" });
        return { success: false, message: `Server ${name} not running` };
      }
    } catch (error) {
      logger.error(`Failed to stop server ${name}:`, error);
      throw error;
    }
  }

  async restart(name) {
    try {
      stateReconciliation.recordIntent(name, IntentType.RESTART, "user");
      await this.manager.stop(name);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return await this.manager.start(name);
    } catch (error) {
      logger.error(`Failed to restart native server ${name}:`, error);
      throw error;
    }
  }

  async startCluster(clusterName) {
    const clusterServers = await this.manager.getClusterServers(clusterName);
    if (clusterServers.length === 0) throw new Error(`No servers found in cluster: ${clusterName}`);
    const results = [];
    for (const server of clusterServers) {
      try { const result = await this.manager.start(server.name); results.push({ name: server.name, success: true, result }); }
      catch (err) { results.push({ name: server.name, success: false, error: err.message }); }
    }
    return { success: true, message: `Cluster ${clusterName} start attempted.`, results };
  }

  async stopCluster(clusterName) {
    const clusterServers = await this.manager.getClusterServers(clusterName);
    if (clusterServers.length === 0) throw new Error(`No servers found in cluster: ${clusterName}`);
    const results = [];
    for (const server of clusterServers) {
      try { const result = await this.manager.stop(server.name); results.push({ name: server.name, success: true, result }); }
      catch (err) { results.push({ name: server.name, success: false, error: err.message }); }
    }
    return { success: true, message: `Cluster ${clusterName} stop attempted.`, results };
  }

  async restartCluster(clusterName) {
    const clusterServers = await this.manager.getClusterServers(clusterName);
    if (clusterServers.length === 0) throw new Error(`No servers found in cluster: ${clusterName}`);
    const results = [];
    for (const server of clusterServers) {
      try { const result = await this.manager.restart(server.name); results.push({ name: server.name, success: true, result }); }
      catch (err) { results.push({ name: server.name, success: false, error: err.message }); }
    }
    return { success: true, message: `Cluster ${clusterName} restart attempted.`, results };
  }
}
