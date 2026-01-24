# Beads Web UI

A web-based interface for the Beads issue tracking system. This example demonstrates how to build a Go server with an embedded React frontend.

## Prerequisites

- **Go** 1.24 or later
- **Node.js** 20.0 or later
- **npm** (comes with Node.js)

## Quick Start

```bash
# Build and run
make run

# Open http://localhost:8080 in your browser
```

## Development

For frontend development with hot reload:

```bash
# Terminal 1: Start the Go server (for API proxy)
make server
./webui

# Terminal 2: Start the Vite dev server
make dev
# Open http://localhost:3000
```

API requests from the frontend dev server are proxied to the Go backend.

## Project Structure

```
beads-web-ui/
├── frontend/           # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── api/        # API client
│   │   ├── components/ # React components
│   │   ├── styles/     # CSS files
│   │   ├── types/      # TypeScript types
│   │   ├── App.tsx     # Root component
│   │   └── main.tsx    # Entry point
│   ├── dist/           # Built assets (generated)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── embed.go            # Go embed for frontend assets
├── main.go             # Server entry point
├── routes.go           # HTTP route handlers
├── go.mod
├── Makefile
└── README.md
```

## Building

```bash
# Build everything (frontend + server)
make build

# Build only frontend
make frontend

# Build only server (requires frontend/dist)
make server
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BEADS_WEBUI_PORT`  | 8080    | HTTP server port |

Command-line flags:

```bash
./webui -port 3000           # Custom port
./webui -socket /path/to.sock # Daemon socket path
```

## Makefile Targets

| Target    | Description |
|-----------|-------------|
| `build`   | Build frontend and Go server for production |
| `dev`     | Start frontend dev server with hot reload |
| `frontend`| Build only the frontend |
| `server`  | Build only the Go server |
| `run`     | Build and run the server |
| `clean`   | Remove build artifacts |
| `test`    | Run Go tests |
| `help`    | Show help message |
