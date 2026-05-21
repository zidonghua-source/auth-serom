#!/bin/bash
# pm2 start start.sh --interpreter bash --name "SEROM-API"
set -e

echo "Pulling latest code..."
git pull

echo "Installing dependencies..."
npm install

echo "Starting app..."
exec npm start