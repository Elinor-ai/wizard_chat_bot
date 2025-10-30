#!/usr/bin/env bash
set -euo pipefail

# Convenience script to bootstrap + start core services.

echo "Installing dependencies..."
npm run bootstrap

echo "Starting API gateway and web app..."
concurrently "npm run dev:api" "npm run dev:web"
