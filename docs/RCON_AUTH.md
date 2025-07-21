# RCON Authentication Flow (Backend)

This document explains how RCON authentication is handled in the backend API for ARK: Survival Ascended server management.

## How RCON Authenticates
- The RCON protocol requires the password **once per TCP connection**.
- After authenticating, you can send multiple commands over the same connection without resending the password.
- If the connection is closed (timeout, error, or explicit disconnect), the next connection must re-authenticate with the password.

## How the Backend Handles RCON
- For each RCON command sent from the dashboard, the backend:
  1. Opens a new TCP connection to the server's RCON port
  2. Authenticates using the password from `GameUserSettings.ini`
  3. Sends the command
  4. Closes the connection
- This means the password is **not sent with every command**, but is used to authenticate the connection before any command is sent.
- This approach is standard for stateless web APIs and is secure and reliable.

## Persistent Sessions (Advanced)
- If you were to keep a persistent RCON connection, you would only need to send the password once per session, but this is more complex to manage and not necessary for most web dashboards.

## Security Note
- The password is never sent in the command itself—only as part of the initial authentication handshake for the connection.
- All password management is now handled via `GameUserSettings.ini` for security and ARK compliance.

---

*For frontend usage and API interaction, see the dashboard's API usage documentation.* 
