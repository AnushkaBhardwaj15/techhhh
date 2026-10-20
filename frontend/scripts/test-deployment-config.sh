#!/usr/bin/env bash
set -euo pipefail

assert_invalid_build() {
  local env_name=$1
  local env_value=$2
  local expected=$3
  local output

  if output=$(env "$env_name=$env_value" bun run build 2>&1); then
    printf 'Expected build failure for %s=%s\n%s\n' "$env_name" "$env_value" "$output" >&2
    exit 1
  fi
  if ! printf '%s\n' "$output" | grep -Fq "$expected"; then
    printf 'Build for %s=%s failed without the expected validation message: %s\n%s\n' "$env_name" "$env_value" "$expected" "$output" >&2
    exit 1
  fi
}

assert_invalid_build VITE_WS_BASE_URL ftp://socket.example.test 'WebSocket base URL must use http, https, ws, or wss'
assert_invalid_build VITE_API_BASE_URL ftp://api.example.test 'VITE_API_BASE_URL must use http or https'
assert_invalid_build VITE_WS_BASE_URL 'wss://socket.example.test/api' 'VITE_WS_BASE_URL must be an origin without credentials, path, query, or fragment'
