# Quickstart: ROI Calculator

## Files to Create
1. `src/app/roi-calculator/page.tsx` — Server component (metadata/SEO)
2. `src/app/roi-calculator/roi-calculator-client.tsx` — Client component (all UI)
3. `src/lib/roi-calculator/calculation.ts` — Pure calculation functions
4. `src/lib/roi-calculator/partners.ts` — Partner code lookup
5. `src/lib/roi-calculator/constants.ts` — Configurable assumptions

## Files to Modify
1. `src/middleware.ts` — Add `/roi-calculator` to public routes

## How to Test
1. `npm run dev` → visit `http://localhost:3000/roi-calculator`
2. Enter sample inputs → verify results update in real-time
3. Test with `?partner=acme` → verify partner name appears
4. Copy share link → open in incognito → verify same results
5. Test on mobile viewport (320px) → verify responsive layout
6. Run `npm run build` → verify no build errors

## Key Dependencies (all existing)
- `src/components/ui/` — card, input, select, button, sheet
- `src/lib/utils/format-number.ts` — formatCurrency, formatNumber
- No new npm packages needed
