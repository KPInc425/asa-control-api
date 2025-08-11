# Logging Improvements

## Overview
The backend logging system has been significantly improved to reduce noise, improve readability, and manage log file sizes sustainably.

## Key Improvements

### 1. **Reduced Logging Level**
- **Default level**: Changed from `info` to `warn` to reduce noise
- **Debug mode**: Enable detailed logging only when needed
- **Environment variable**: `LOG_LEVEL=warn` (default)

### 2. **Log Rotation & Size Management**
- **Daily rotation**: Log files are rotated daily with date stamps
- **Size limits**: 10MB max file size (configurable via `LOG_MAX_FILE_SIZE`)
- **File retention**: Keep 5 files max (configurable via `LOG_MAX_FILES`)
- **Compression**: Old log files are automatically compressed

### 3. **Noise Filtering**
- **RCON operations**: Successful RCON commands no longer logged at info level
- **Chat polling**: Empty chat responses filtered out
- **Connection events**: Routine connection events moved to debug level
- **Custom filters**: Winston format filters to reduce repetitive logs

### 4. **Performance Monitoring**
- **Reduced frequency**: Chat polling empty response logging reduced from every 50 to every 200 responses
- **Conditional logging**: Only log when there's actual content or errors
- **Debug mode**: Detailed logging available when troubleshooting

## Configuration

### Environment Variables
```bash
# Logging level (warn, info, debug)
LOG_LEVEL=warn

# Enable debug logging for troubleshooting
LOG_ENABLE_DEBUG=true

# Log file size limit (default: 10m)
LOG_MAX_FILE_SIZE=10m

# Number of log files to keep (default: 5)
LOG_MAX_FILES=5
```

### Log Files
- `combined-YYYY-MM-DD.log` - All logs (warn and above)
- `error-YYYY-MM-DD.log` - Error logs only
- `node-out-YYYY-MM-DD.log` - Standard output logs
- `node-err-YYYY-MM-DD.log` - Standard error logs

## Usage

### Normal Operation
```bash
npm start
# Uses LOG_LEVEL=warn by default
```

### Debug Mode (for troubleshooting)
```bash
npm run logs:debug
# Enables detailed logging for debugging
```

### Info Level (moderate detail)
```bash
npm run logs:info
# Shows info level and above
```

### Log Cleanup
```bash
npm run cleanup-logs
# Cleans up old logs and compresses large files
```

## What's No Longer Logged

### RCON Operations
- ✅ Successful RCON commands (moved to debug)
- ✅ RCON response content (moved to debug)
- ✅ Connection end events (moved to debug)
- ✅ Authentication success (moved to debug)
- ❌ RCON errors (still logged)
- ❌ RCON failures (still logged)

### Chat Polling
- ✅ Empty GetChat responses (filtered out)
- ✅ Routine polling cycles (moved to debug)
- ❌ Actual chat messages (still logged)
- ❌ Chat polling errors (still logged)

### General Operations
- ✅ Routine server status checks (moved to debug)
- ✅ Successful file operations (moved to debug)
- ❌ Errors and warnings (still logged)
- ❌ Important system events (still logged)

## Expected Log Volume

### Before Improvements
- **35,000+ lines in 2 hours** (unsustainable)
- **Excessive RCON logging** (every 2 seconds per server)
- **Chat polling noise** (every 2 seconds per server)
- **No log rotation** (unlimited file growth)

### After Improvements
- **~100-500 lines per day** (sustainable)
- **Only errors and warnings** by default
- **Debug mode available** when needed
- **Automatic log rotation** and compression

## Troubleshooting

### Enable Debug Logging
```bash
# Set environment variables
export LOG_LEVEL=debug
export LOG_ENABLE_DEBUG=true

# Or use the npm script
npm run logs:debug
```

### View Recent Logs
```bash
# View today's combined logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# View error logs
tail -f logs/error-$(date +%Y-%m-%d).log
```

### Clean Up Large Log Files
```bash
# Run cleanup script
npm run cleanup-logs

# This will:
# - Truncate files larger than 50MB
# - Delete files older than 7 days
# - Compress old log files
```

## Monitoring

### Log File Sizes
Monitor log file sizes in the `logs/` directory:
```bash
ls -lh logs/
```

### Cleanup Summary
Check cleanup results:
```bash
cat logs/cleanup-summary.json
```

### Disk Usage
Monitor overall disk usage:
```bash
du -sh logs/
```

## Best Practices

1. **Use warn level for production** - Reduces noise while keeping important events
2. **Enable debug only when troubleshooting** - Detailed logging impacts performance
3. **Run cleanup regularly** - Prevents log files from growing too large
4. **Monitor log file sizes** - Ensure rotation is working properly
5. **Archive important logs** - Backup logs before cleanup if needed

## Migration Notes

### Existing Logs
- Old log files will be automatically rotated on next startup
- Large existing files can be cleaned up with `npm run cleanup-logs`
- Backup important logs before cleanup if needed

### Configuration Changes
- Default logging level changed from `info` to `warn`
- New environment variables available for fine-tuning
- Log rotation now uses daily files with date stamps

---

**Result**: Logging is now sustainable, readable, and manageable while still providing necessary information for monitoring and debugging.
