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

## Development

```bash
# Start daemon (required for API to work)
bd daemon start

# Run backend (development)
go run . -port 8080

# Run frontend (development with hot reload)
cd frontend && npm run dev
```
