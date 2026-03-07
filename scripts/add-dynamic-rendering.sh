#!/bin/bash

# Add 'export const dynamic = "force-dynamic"' to all page.tsx files that don't have it
# Excludes sign-in and sign-up pages (public routes)

find src/app/\[locale\] -name "page.tsx" -type f | grep -v "sign-in\|sign-up" | while read -r file; do
  # Check if file already has 'export const dynamic'
  if grep -q "export const dynamic" "$file"; then
    echo "✓ Skipping $file (already has dynamic export)"
    continue
  fi

  # Check if it's a client component
  if head -1 "$file" | grep -q "'use client'"; then
    # Client component - add after 'use client'
    sed -i "1 a\\
\\
// Force dynamic rendering - required for authentication\\
export const dynamic = 'force-dynamic'" "$file"
    echo "✓ Added dynamic export to client component: $file"
  else
    # Server component - add at the top
    sed -i "1 i\\
// Force dynamic rendering - required for authentication\\
export const dynamic = 'force-dynamic'\\
" "$file"
    echo "✓ Added dynamic export to server component: $file"
  fi
done

echo ""
echo "✅ Done! Added dynamic rendering to all protected pages."
