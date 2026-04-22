You are an AI coding agent tasked with building a cross-platform terminal-based productivity tool that blocks distracting applications (e.g., Microsoft Teams, Slack) for a specified period of time.

## Goal

Create a CLI application that allows users to temporarily block selected desktop applications to improve focus.

## Core Requirements

### 1. CLI Interface

* Provide a simple command-line interface.
* Example usage:

  * `focus start --apps "slack,teams" --duration 60`
  * `focus stop`
  * `focus status`
* Include helpful `--help` documentation.

### 2. App Blocking Functionality

* Allow users to specify apps by name.
* Prevent those apps from launching during the session.
* If already running, terminate or suspend them.
* Handle common apps like Slack, Microsoft Teams, Discord, browsers, etc.

### 3. Timer System

* Accept duration in minutes (default: 25 minutes).
* Display countdown in the terminal.
* Automatically unblock apps when time expires.

### 4. Cross-Platform Support

* Support macOS and linux only
* Use OS-specific methods:

  * macOS/Linux: process management, permissions, possibly modifying `/etc/hosts` or using signals.
### 5. Safety & Overrides

* Provide a force-stop override (e.g., `focus stop --force`).
* Optionally include a confirmation delay to discourage quitting early.

### 6. Persistence (Optional Enhancement)

* Store active sessions so they persist if the terminal is closed.
* Resume countdown on restart.

### 7. Configuration

* Allow users to define default apps to block in a config file (e.g., JSON or YAML).
* Example:

  ```json
  {
    "defaultApps": ["slack", "teams"]
  }
  ```

### 8. Feedback & UX

* Show clear terminal output:

  * Active session status
  * Time remaining
  * Blocked apps
* Use simple formatting (no heavy UI dependencies).

## Technical Constraints

* Prefer a language suitable for CLI tools (e.g., Go, Rust, or Node.js).
* Avoid heavy dependencies.
* Ensure proper error handling and permission checks.

## Deliverables

* Fully working CLI app
* Clear README with setup instructions
* Example usage commands
* Well-structured, maintainable code

## Stretch Goals

* Add website blocking (e.g., editing hosts file)
* Add “focus history” logs
* Add system tray integration (if extended beyond terminal)

Focus on reliability, simplicity, and a clean developer experience.
