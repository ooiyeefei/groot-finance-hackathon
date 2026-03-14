# Quickstart: Improve AI Action Center

## Prerequisites
- Convex dev running (`npx convex dev`)
- Next.js dev server (`npm run dev`)

## Development Flow

1. **Modify backend detection logic**: Edit `convex/functions/actionCenterJobs.ts`
2. **Modify dedup/migration**: Edit `convex/functions/actionCenterInsights.ts`
3. **Modify frontend**: Edit `src/domains/analytics/components/action-center/InsightCard.tsx`
4. **Build check**: `npm run build`
5. **Deploy Convex prod**: `npx convex deploy --yes`

## Testing

### Verify detection pipeline locally
```bash
npx convex run functions/actionCenterJobs:runProactiveAnalysis
```

### Verify no raw category IDs
```bash
npx convex run functions/actionCenterInsights:debugListAll | grep -i "other_"
# Should return no matches
```

### Run migration (prod, after deploy)
```bash
npx convex run functions/actionCenterInsights:migrateAllBusinesses --prod
```

## Key Files
| File | Purpose |
|------|---------|
| `convex/functions/actionCenterJobs.ts` | All detection algorithms, LLM prompts, business summary |
| `convex/functions/actionCenterInsights.ts` | CRUD, dedup, migration |
| `src/domains/analytics/components/action-center/InsightCard.tsx` | Ask AI UX, suggestion chips |
