#!/bin/bash
set -euo pipefail

# ============================================================================
# iOS Setup Script for Groot Finance Capacitor App
#
# Run this on a macOS machine with Xcode 15+ installed.
# This script automates tasks T006, T017, T029, T031, T048-T050, T054, T057.
#
# Usage:
#   chmod +x scripts/setup-ios.sh
#   ./scripts/setup-ios.sh
#
# Prerequisites:
#   - macOS with Xcode 15+ and command line tools
#   - Node.js 20.x
#   - npm packages already installed (run npm install first)
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "============================================"
echo " Groot Finance iOS Setup"
echo "============================================"
echo ""
echo "Project: $PROJECT_ROOT"
echo ""

# Check prerequisites
if ! command -v xcodebuild &> /dev/null; then
  echo "ERROR: Xcode is not installed. Install Xcode 15+ from the Mac App Store."
  exit 1
fi

XCODE_VERSION=$(xcodebuild -version | head -1)
echo "Xcode: $XCODE_VERSION"
echo ""

cd "$PROJECT_ROOT"

# ============================================================================
# T006: Add iOS platform
# ============================================================================
echo "--- T006: Adding iOS platform ---"
if [ -d "ios" ]; then
  echo "  iOS directory already exists. Syncing..."
  npx cap sync ios
else
  npx cap add ios
  npx cap sync ios
fi
echo "  Done."
echo ""

# ============================================================================
# T017: Register finanseal:// URL scheme in Info.plist
# ============================================================================
echo "--- T017: Registering finanseal:// URL scheme ---"
INFO_PLIST="ios/App/App/Info.plist"

if [ ! -f "$INFO_PLIST" ]; then
  echo "  ERROR: Info.plist not found at $INFO_PLIST"
  exit 1
fi

# Check if URL scheme already exists
if /usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes:0" "$INFO_PLIST" 2>/dev/null | grep -q "finanseal"; then
  echo "  URL scheme 'finanseal' already registered."
else
  # Add URL Types array if it doesn't exist
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$INFO_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$INFO_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.hellogroot.finanseal" "$INFO_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$INFO_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string finanseal" "$INFO_PLIST" 2>/dev/null || true
  echo "  Registered 'finanseal://' URL scheme."
fi
echo ""

# ============================================================================
# T029: Add NSCameraUsageDescription
# ============================================================================
echo "--- T029: Adding camera usage description ---"
if /usr/libexec/PlistBuddy -c "Print :NSCameraUsageDescription" "$INFO_PLIST" 2>/dev/null; then
  echo "  NSCameraUsageDescription already set."
else
  /usr/libexec/PlistBuddy -c "Add :NSCameraUsageDescription string 'Groot Finance needs camera access to capture receipt photos for expense claims.'" "$INFO_PLIST"
  echo "  Added NSCameraUsageDescription."
fi
echo ""

# ============================================================================
# T049: Add push notification description
# ============================================================================
echo "--- T049: Adding push notification description ---"
if /usr/libexec/PlistBuddy -c "Print :NSUserNotificationUsageDescription" "$INFO_PLIST" 2>/dev/null; then
  echo "  NSUserNotificationUsageDescription already set."
else
  /usr/libexec/PlistBuddy -c "Add :NSUserNotificationUsageDescription string 'Groot Finance sends push notifications for expense claim approvals and important updates.'" "$INFO_PLIST" 2>/dev/null || true
  echo "  Added NSUserNotificationUsageDescription."
fi
echo ""

# ============================================================================
# T054: Configure Associated Domains
# ============================================================================
echo "--- T054: Configuring Associated Domains ---"
ENTITLEMENTS="ios/App/App/App.entitlements"

if [ ! -f "$ENTITLEMENTS" ]; then
  # Create entitlements file
  cat > "$ENTITLEMENTS" << 'ENTITLEMENTS_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>applinks:app.finanseal.com</string>
	</array>
	<key>aps-environment</key>
	<string>development</string>
</dict>
</plist>
ENTITLEMENTS_EOF
  echo "  Created App.entitlements with Associated Domains and Push Notifications."
else
  # Check if associated domains already configured
  if grep -q "applinks:app.finanseal.com" "$ENTITLEMENTS"; then
    echo "  Associated Domains already configured."
  else
    /usr/libexec/PlistBuddy -c "Add :com.apple.developer.associated-domains array" "$ENTITLEMENTS" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :com.apple.developer.associated-domains:0 string applinks:app.finanseal.com" "$ENTITLEMENTS" 2>/dev/null || true
    echo "  Added Associated Domains entitlement."
  fi

  # T048: Add push notification entitlement
  if grep -q "aps-environment" "$ENTITLEMENTS"; then
    echo "  Push Notifications entitlement already configured."
  else
    /usr/libexec/PlistBuddy -c "Add :aps-environment string development" "$ENTITLEMENTS" 2>/dev/null || true
    echo "  Added Push Notifications entitlement."
  fi
fi
echo ""

# ============================================================================
# Final sync
# ============================================================================
echo "--- Final sync ---"
npx cap sync ios
echo ""

echo "============================================"
echo " iOS Setup Complete!"
echo "============================================"
echo ""
echo "Next steps (manual in Xcode):"
echo ""
echo "  1. Open Xcode project:"
echo "     npx cap open ios"
echo ""
echo "  2. In Xcode > App target > Signing & Capabilities:"
echo "     - Set Team to your Apple Developer team"
echo "     - Set Bundle Identifier to: com.hellogroot.finanseal"
echo "     - Set Deployment Target to: iOS 16.0"
echo ""
echo "  3. Add capabilities in Xcode (if not auto-detected from entitlements):"
echo "     - Push Notifications"
echo "     - Associated Domains (applinks:app.finanseal.com)"
echo ""
echo "  4. App Icons & Splash Screen:"
echo "     - Add 1024x1024 app icon to ios/App/App/Assets.xcassets/AppIcon.appiconset/"
echo "     - Update LaunchScreen.storyboard or add splash assets"
echo ""
echo "  5. Build and run:"
echo "     npx cap run ios"
echo ""
echo "  6. For TestFlight:"
echo "     - Product > Archive in Xcode"
echo "     - Distribute to App Store Connect"
echo ""
