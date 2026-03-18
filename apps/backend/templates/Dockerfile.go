# ============================================================
# Stage 1: Build the Go binary
# ============================================================
FROM public.ecr.aws/docker/library/golang:1.23-alpine AS builder

# Target app directory (. for standalone, subdir for monorepo)
ARG APP_DIR=.

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Disable Go workspaces — go.work files in monorepos can break
# isolated builds by trying to resolve all workspace modules
ENV GOWORK=off

WORKDIR /build

# Copy entire repo (needed for monorepo replace directives)
COPY . .

# ============================================================
# Dependency installation with vendor detection
# ============================================================
# If vendor/ exists, skip network fetch and use vendored deps.
# Otherwise, download modules.
# ============================================================
RUN set -e && \
    cd "$APP_DIR" && \
    echo "=== Installing Go dependencies ===" && \
    if [ -d "vendor" ]; then \
        echo "vendor/ detected — using vendored dependencies"; \
    else \
        echo "Downloading modules..." && \
        go mod download; \
    fi && \
    echo "=== Dependencies ready ==="

# ============================================================
# Build static binary
# ============================================================
# - CGO_ENABLED=0: fully static binary (no libc dependency)
# - -trimpath: removes local filesystem paths from binary
# - -ldflags="-s -w": strips symbol table and debug info
#
# Entry point detection order:
#   1. cmd/server/    (most common for web services)
#   2. cmd/api/       (API-focused projects)
#   3. cmd/app/       (generic application)
#   4. cmd/web/       (web-focused projects)
#   5. cmd/main.go    (single cmd entrypoint)
#   6. Single cmd/ subdirectory (auto-discover)
#   7. Root main.go   (simple projects, fallback)
# ============================================================
RUN set -e && \
    cd "$APP_DIR" && \
    echo "=== Building Go binary from $APP_DIR ===" && \
    export CGO_ENABLED=0 && \
    export GOOS=linux && \
    MOD_FLAG="" && \
    if [ -d "vendor" ]; then \
        MOD_FLAG="-mod=vendor"; \
    fi && \
    if [ -f "cmd/server/main.go" ]; then \
        echo "Entry point: cmd/server/main.go" && \
        go build -trimpath -ldflags="-s -w" $MOD_FLAG -o /server ./cmd/server; \
    elif [ -f "cmd/api/main.go" ]; then \
        echo "Entry point: cmd/api/main.go" && \
        go build -trimpath -ldflags="-s -w" $MOD_FLAG -o /server ./cmd/api; \
    elif [ -f "cmd/app/main.go" ]; then \
        echo "Entry point: cmd/app/main.go" && \
        go build -trimpath -ldflags="-s -w" $MOD_FLAG -o /server ./cmd/app; \
    elif [ -f "cmd/web/main.go" ]; then \
        echo "Entry point: cmd/web/main.go" && \
        go build -trimpath -ldflags="-s -w" $MOD_FLAG -o /server ./cmd/web; \
    elif [ -f "cmd/main.go" ]; then \
        echo "Entry point: cmd/main.go" && \
        go build -trimpath -ldflags="-s -w" $MOD_FLAG -o /server ./cmd; \
    elif [ -d "cmd" ]; then \
        SUBDIRS=$(find cmd -mindepth 1 -maxdepth 1 -type d 2>/dev/null) && \
        COUNT=$(echo "$SUBDIRS" | grep -c . 2>/dev/null || echo "0") && \
        if [ "$COUNT" = "1" ]; then \
            ENTRY=$(echo "$SUBDIRS" | head -1) && \
            echo "Entry point: $ENTRY (auto-discovered single cmd/ subdirectory)" && \
            go build -trimpath -ldflags="-s -w" $MOD_FLAG -o /server ./"$ENTRY"; \
        else \
            echo "Multiple cmd/ subdirectories found, building from root" && \
            go build -trimpath -ldflags="-s -w" $MOD_FLAG -o /server .; \
        fi; \
    else \
        echo "Entry point: . (root)" && \
        go build -trimpath -ldflags="-s -w" $MOD_FLAG -o /server .; \
    fi && \
    echo "=== Build complete ==="

# ============================================================
# Prepare runtime assets
# ============================================================
# Go 1.16+ supports //go:embed to bake files into the binary,
# but many projects still load files from disk at runtime.
# Collect common asset directories into /runtime-assets so they
# can be copied in a single COPY instruction in the final stage.
# ============================================================
RUN set -e && \
    mkdir -p /runtime-assets && \
    cd "/build/$APP_DIR" && \
    for dir in static templates public web assets configs config migrations; do \
        if [ -d "$dir" ]; then \
            echo "Copying runtime assets: $dir/" && \
            cp -r "$dir" /runtime-assets/; \
        fi; \
    done && \
    touch /runtime-assets/.marker && \
    echo "=== Runtime assets collected ==="

# ============================================================
# Stage 2: Minimal runtime image
# ============================================================
FROM public.ecr.aws/docker/library/alpine:3.20

# Add Lambda Web Adapter
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

# User environment variables (injected at deploy time)
{{USER_ARGS}}

# Runtime essentials: TLS certificates and timezone data
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /server /app/server

# Copy runtime assets (if any were found)
COPY --from=builder /runtime-assets/ /app/
RUN rm -f /app/.marker

# Default port (Lambda Web Adapter expects 8080)
ENV PORT=8080
ENV AWS_LWA_INVOKE_MODE=response_stream

CMD ["./server"]
