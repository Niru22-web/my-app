#!/bin/bash

# Deployment script for Timesheet application
# Ensures upload folders are preserved and permissions are correct

echo "🚀 Starting deployment..."

# 1. Backend Deployment
cd /home/ubuntu/timesheet-app/timesheet-backend

# Ensure uploads directory structure exists before any deletions
mkdir -p uploads/profile

# Set permissions for uploads
chmod -R 755 uploads

# Install and Build
npm install
npm run build

# Run database migrations
npx prisma migrate deploy

# Run image normalization script (optional but recommended for first time)
# node dist/scripts/sync_images.js

# Restart Backend
pm2 restart timesheet-backend

# 2. Frontend Deployment
cd /home/ubuntu/timesheet-app/timesheet-frontend

npm install
npm run build

# Copy built files to Nginx web root
echo "Copying to Nginx web root..."
sudo rm -rf /var/www/timesheet/*
sudo cp -r dist/* /var/www/timesheet/

# 3. Nginx Verification
sudo nginx -t && sudo systemctl reload nginx

echo "✨ Deployment complete! Profile images should be working."
