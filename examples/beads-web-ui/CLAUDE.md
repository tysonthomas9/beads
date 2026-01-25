# CLAUDE.md

This file provides guidance to Claude Code when working with the beads-web-ui project.

## Project Overview

**beads-web-ui** is a React + Go web interface for the beads issue tracker. It provides a browser-based UI for viewing and managing issues.

## Architecture

- **Backend**: Go HTTP server with embedded frontend assets
- **Frontend**: React + TypeScript + Vite
- **Communication**: REST API + WebSocket for real-time updates
- **Daemon Integration**: Connects to beads daemon via RPC connection pool

## Testing

### Running Go Tests

The Go tests require a frontend build because of `//go:embed all:frontend/dist` in `embed.go`.

**Full test suite (requires frontend build):**
```bash
cd frontend && npm install && npm run build && cd ..
go test ./...
```

**Handler tests only (no frontend build needed):**
```bash
mkdir -p frontend/dist && touch frontend/dist/.gitkeep
go test -run "TestHandle|TestValidate|TestTo|TestHealth|TestStats|TestReady" ./...
```

The `TestFrontendHandler` tests will fail without a real frontend build - this is expected behavior.

### Running Frontend Tests

```bash
cd frontend
npm install
npm test           # Unit tests (vitest)
npm run test:e2e   # E2E tests (playwright)
```

### Manual Browser Testing

**Always verify UI changes in Chrome before marking tasks complete.** Automated tests are not sufficient for frontend work - you must visually confirm the UI renders correctly.

Use the browser automation tools (`mcp__claude-in-chrome__*`) to:
1. Take a screenshot of the running app at `http://localhost:8080`
2. Verify the component renders as designed
3. Check responsive behavior if applicable

```bash
# Start the server first
bd daemon start
go run . -port 8080
```

Then use `mcp__claude-in-chrome__computer` with `action: screenshot` to capture and verify.

### Visual Testing Guidelines

When performing UI verification, don't just check that elements exist or operations succeed:

1. **Verify content renders, not just containers** - Confirm that actual content (text, badges, icons) is visible, not just empty placeholder boxes or skeleton states
2. **Check all aspects of real-time updates** - When testing WebSocket/live updates, verify both structural changes (item counts, column moves) AND content changes (titles, field values)
3. **Compare expected vs actual visual output** - If a card should show a title, priority badge, and type icon, explicitly verify each is visible
4. **Flag rendering anomalies immediately** - Empty boxes, missing text, or skeleton states that persist after data loads indicate bugs worth reporting
5. **Don't assume partial success means full success** - A count updating correctly doesn't mean the underlying cards are rendering properly

## Key Files

- `routes.go` - HTTP route definitions
- `handlers.go` - API endpoint handlers
- `embed.go` - Frontend asset embedding
- `websocket.go` - WebSocket handler for real-time updates
- `daemon/` - Connection pool for beads daemon RPC

## API Endpoints

- `GET /health` - Basic health check
- `GET /api/health` - Detailed health with daemon status
- `GET /api/issues` - List issues with filters
- `GET /api/issues/{id}` - Get single issue
- `POST /api/issues` - Create new issue
- `GET /api/ready` - Get issues ready to work on
- `GET /api/stats` - Project statistics
- `/ws` - WebSocket for real-time mutation events

## Merge Conflicts

If `package-lock.json` has merge conflicts, don't resolve them manually. Instead, regenerate it:

```bash
cd frontend
git checkout --theirs package-lock.json  # or --ours, doesn't matter
npm install                               # regenerates from package.json
```

## Development

```bash
# Start daemon (required for API to work)
bd daemon start

# Run backend (development)
go run . -port 8080

# Run frontend (development with hot reload)
cd frontend && npm run dev
```
