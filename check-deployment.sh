#!/bin/bash

echo "Checking production deployment status..."
echo ""

# Get current bundle hash
CURRENT_BUNDLE=$(curl -s https://qc.wolthers.com 2>&1 | grep -o '922-[a-f0-9]*\.js' | head -1)
OLD_BUNDLE="922-14a49b51b723f233.js"

echo "Current production bundle: $CURRENT_BUNDLE"
echo "Old (broken) bundle:       $OLD_BUNDLE"
echo ""

if [ "$CURRENT_BUNDLE" != "$OLD_BUNDLE" ]; then
    echo "✅ DEPLOYMENT COMPLETE - New code is live!"
    echo ""
    echo "Next steps:"
    echo "1. Clear browser cache (Cmd+Shift+Delete)"
    echo "2. Hard refresh qc.wolthers.com (Cmd+Shift+R)"
    echo "3. Test auth flow in Chrome/Atlas"
    echo ""
else
    echo "⏳ DEPLOYMENT PENDING - Still serving old code"
    echo ""
    echo "Waiting for Vercel auto-deployment..."
    echo "This typically takes 2-5 minutes after push."
    echo ""
    echo "Run this script again in 1-2 minutes:"
    echo "  bash check-deployment.sh"
    echo ""
fi
