# Regulatory Knowledge Base Retrieval Analysis

## Collection Status & Key Findings

### Collection Statistics
- **Total Points**: 148 chunks
- **Vector Dimensions**: 2560 (Qwen3-4B embeddings)
- **Distance Metric**: Cosine similarity
- **Content Distribution**: 
  - Countries: 100% Singapore (`singapore: 148`)
  - Tax Types: 100% GST (`gst: 148`)

## Critical Issue Identified

### ⚠️ Limited Jurisdiction Coverage
**Problem**: The regulatory_kb collection currently contains ONLY Singapore GST documents (148 chunks), missing Malaysia and other Southeast Asian jurisdictions.

**Impact**: 
- Malaysia SST queries return Singapore GST results with low relevance scores (0.5-0.6 range)
- Cross-border tax compliance queries have limited coverage
- Users expecting Malaysia/Thailand/Indonesia tax guidance will get inappropriate Singapore-specific advice

**Root Cause**: The ingestion appears to have processed only Singapore IRAS documents from sources.yaml, missing Malaysia LHDN sources.

## Retrieval Quality Assessment

### Threshold Performance Analysis

| Threshold | SGP GST Query | MYS SST Query | Corporate Tax | Withholding Tax | Import GST |
|-----------|---------------|---------------|---------------|-----------------|------------|
| 0.5       | ✅ 5 results  | ⚠️ 5 results*  | ❌ 0 results   | ⚠️ 1 result*    | ✅ 5 results |
| 0.6       | ✅ 5 results  | ⚠️ 5 results*  | ❌ 0 results   | ❌ 0 results    | ✅ 5 results |
| 0.7       | ✅ 1 result   | ❌ 0 results   | ❌ 0 results   | ❌ 0 results    | ⚠️ 1 result  |
| 0.8       | ❌ 0 results  | ❌ 0 results   | ❌ 0 results   | ❌ 0 results    | ❌ 0 results |

*Results marked with ⚠️ are Singapore GST documents returned for Malaysia queries (false positives)

### TopK Performance (Singapore GST Registration Query)

| TopK | Results | Score Range | Average Score | Recommendation |
|------|---------|-------------|---------------|----------------|
| 3    | 3       | 0.685-0.706 | 0.695        | ✅ **Optimal** - High precision |
| 5    | 5       | 0.677-0.706 | 0.689        | ✅ **Recommended** - Good balance |
| 10   | 10      | 0.664-0.706 | 0.678        | ⚠️ Acceptable - Some noise |
| 15   | 15      | 0.636-0.706 | 0.669        | ⚠️ Lower precision |
| 20   | 20      | 0.625-0.706 | 0.659        | ❌ Too much noise |

## Recommendations

### 1. Immediate Actions Required

#### A. Complete Jurisdiction Ingestion
```bash
# Verify sources.yaml contains Malaysia LHDN documents
grep -i "malaysia\|lhdn" sources.yaml

# Re-run processing to include all jurisdictions
python process.py --force-reprocess
python ingest.py
```

#### B. Verify Collection Content Distribution
Expected after complete ingestion:
- Singapore: ~70-80 chunks (IRAS GST guides)
- Malaysia: ~60-70 chunks (LHDN SST, income tax, withholding tax)
- Target total: ~150-200 chunks covering both jurisdictions

### 2. Optimal TopK Configuration

#### Production Recommendations
- **Primary topK**: `5` (best balance of precision and coverage)
- **Fallback topK**: `10` (when initial search yields < 3 results)
- **Similarity Threshold**: `0.6` (filters noise while maintaining recall)

#### Implementation Pattern
```typescript
// Adaptive topK strategy
async function adaptiveRetrieval(query: string, jurisdiction?: string) {
  let results = await vectorSearch(query, { topK: 5, threshold: 0.6, country: jurisdiction })
  
  if (results.length < 3) {
    // Expand search for sparse queries
    results = await vectorSearch(query, { topK: 10, threshold: 0.5, country: jurisdiction })
  }
  
  return results
}
```

### 3. Quality Assurance Framework

#### A. Jurisdiction-Specific Filtering
- **Problem**: Current collection lacks metadata indexing for country filtering
- **Solution**: Qdrant requires creating field indexes for metadata filtering

```python
# Create country index for filtering
qdrant_client.create_field_index(
    collection_name="regulatory_kb",
    field_name="country",
    field_type="keyword"
)
```

#### B. Cross-Border Query Handling
- Queries mentioning specific countries should filter by jurisdiction
- Generic tax queries should search across all jurisdictions with jurisdiction scoring
- Implement query classification to route country-specific vs. general queries

### 4. Monitoring & Validation

#### Key Metrics to Track
1. **Coverage Metrics**: Documents per jurisdiction (target: Singapore ~80, Malaysia ~70)
2. **Relevance Metrics**: Average similarity scores per query type (target: >0.65)
3. **Precision Metrics**: Jurisdiction matching accuracy (target: >90%)

#### Test Query Set
```python
VALIDATION_QUERIES = [
    # Singapore-specific
    "Singapore GST registration threshold",
    "IRAS electronic filing requirements", 
    
    # Malaysia-specific  
    "Malaysia SST registration process",
    "LHDN withholding tax rates",
    
    # Cross-border
    "ASEAN tax treaty benefits",
    "transfer pricing documentation"
]
```

## Implementation Priority

### Phase 1: Critical (Immediate)
1. ✅ **Complete jurisdiction ingestion** - Ensure Malaysia LHDN documents are processed
2. ✅ **Verify collection distribution** - Confirm balanced Singapore/Malaysia content
3. ✅ **Implement topK=5 with threshold=0.6** in production CrossBorderTaxComplianceTool

### Phase 2: Enhancement (Next Sprint)
1. **Create metadata indexes** for country filtering
2. **Implement adaptive topK strategy** based on result count
3. **Add jurisdiction classification** for query routing

### Phase 3: Monitoring (Ongoing)
1. **Track retrieval quality metrics** in production usage
2. **Monitor false positive rates** for cross-jurisdiction queries  
3. **Quarterly content updates** as regulatory documents change

## Conclusion

The retrieval system is technically sound with appropriate embedding quality (2560D Qwen3-4B) and good performance for Singapore GST queries. However, **the critical blocker is incomplete jurisdiction coverage**. 

**Recommended topK configuration**: **5 results with 0.6 similarity threshold** provides optimal precision-recall balance for regulatory compliance queries.

**Next steps**: Complete Malaysia document ingestion and verify balanced multi-jurisdiction content before production deployment.