/**
 * Convex Function Contracts: DSPy Vendor Item Matcher
 * Date: 2026-03-17
 */

// ============================================
// vendorItemMatching.ts (NEW FILE)
// ============================================

/**
 * suggestMatches — action (calls Lambda via MCP)
 * Trigger: On-demand from UI "Suggest Matches" button
 * Args: { businessId }
 * Returns: { suggestions: MatchVendorItemsResponse['suggestions'] }
 * Flow:
 *   1. Query vendor_price_history for items from 2+ vendors (internalQuery)
 *   2. Query vendor_item_matching_corrections for rejected pair keys (internalQuery)
 *   3. Query dspy_model_versions for active model S3 key (internalQuery)
 *   4. Call Lambda match_vendor_items via callMCPTool
 *   5. Return suggestions to UI
 */

/**
 * suggestMatchesForItem — action (lightweight auto-suggest trigger)
 * Trigger: After invoice processing when Tier 1 Jaccard score is 40-79%
 * Args: { businessId, vendorId, itemDescription, itemIdentifier }
 * Returns: { suggestion: single match or null }
 * Flow:
 *   1. Get existing cross-vendor group items (internalQuery, .take(20))
 *   2. Check if pair was previously rejected (internalQuery)
 *   3. Call Lambda match_vendor_items with single pair
 *   4. If confidence ≥80% → create ai-suggested group via ctx.runMutation
 */

/**
 * recordCorrection — mutation (user confirms/rejects match)
 * Args: { itemDescriptionA, itemDescriptionB, vendorIdA, vendorIdB, isMatch, originalConfidence?, originalReasoning? }
 * Flow:
 *   1. Auth + business membership check
 *   2. Generate normalizedPairKey
 *   3. Check for existing correction with same pairKey → supersede if exists
 *   4. Insert vendor_item_matching_corrections record
 *   5. If isMatch=true → update cross_vendor_item_groups matchSource to "user-confirmed"
 *   6. If isMatch=false → delete ai-suggested group if exists
 */

/**
 * getCorrections — internalQuery (for Lambda training data)
 * Args: { businessId, limit? }
 * Returns: corrections array for BootstrapFewShot
 * Note: Uses .take(limit) for bandwidth safety
 */

/**
 * getRejectedPairKeys — internalQuery (for dedup)
 * Args: { businessId }
 * Returns: string[] of normalizedPairKeys where isMatch=false
 * Note: Uses .take(200) max for bandwidth
 */

/**
 * checkOptimizationReadiness — internalQuery
 * Args: { businessId }
 * Returns: { ready: boolean, correctionCount, uniquePairCount }
 */

/**
 * triggerOptimization — action (calls Lambda optimizer)
 * Args: { businessId }
 * Flow:
 *   1. Check readiness (≥20 corrections, ≥10 unique pairs)
 *   2. Get corrections via internalQuery
 *   3. Get active model S3 key
 *   4. Call Lambda optimize_vendor_item_model via callMCPTool
 *   5. Record result in dspy_model_versions via internalMutation
 *   6. If accuracy improves → activate new model; else reject
 */

// ============================================
// handler.py ROUTES (MODIFY existing file)
// ============================================

/**
 * Route: match_vendor_items
 * Input: MatchVendorItemsRequest
 * Output: MatchVendorItemsResponse
 * Flow:
 *   1. Load VendorItemMatcher (base or from S3)
 *   2. If corrections exist and no S3 model → inline BootstrapFewShot
 *   3. Generate all pairwise combinations (items from different vendors)
 *   4. Filter out rejected pair keys
 *   5. Run matcher.forward() for each pair
 *   6. Apply confidence cap (80%) if no optimized model
 *   7. Return top-N suggestions sorted by confidence desc
 */

/**
 * Route: optimize_vendor_item_model
 * Input: OptimizeVendorItemModelRequest
 * Output: OptimizeVendorItemModelResponse
 * Flow:
 *   1. Create training examples from corrections
 *   2. Split 80/20 train/test
 *   3. Run MIPROv2 optimizer
 *   4. Evaluate on test set
 *   5. Compare accuracy to current model
 *   6. If better → save to S3, return accepted
 *   7. If worse → return rejected (don't save)
 */
