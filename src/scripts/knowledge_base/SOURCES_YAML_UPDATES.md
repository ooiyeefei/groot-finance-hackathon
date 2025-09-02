# SOURCES.YAML UPDATES - Final Research Results

## Executive Summary

After systematic research of the 14 failed documents, here are the **specific URL updates** needed in sources.yaml to fix the processing failures:

## **CRITICAL UPDATES REQUIRED**

### **Singapore IRAS Documents** 

#### 1. **GST General Guide for Businesses** (Currently Failing)
**CURRENT (Line 30):**
```yaml
url: "https://www.iras.gov.sg/media/docs/default-source/e-tax/etaxguide_gst_gst-general-guide-for-businesses(1).pdf?sfvrsn=8a66716d_97"
```

**PROPOSED FIX:**
```yaml  
url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst"
```

#### 2. **OVR Remote Services Guide** (Lines 4-8) 
**CURRENT:**
```yaml
url: "https://www.iras.gov.sg/media/docs/default-source/e-tax/gst-e-tax-guide_taxing-imported-remote-services-by-way-of-the-overseas-vendor-registration-regime_(1st-ed).pdf?sfvrsn=7a18d6f5_49"
```

**PROPOSED FIX:**
```yaml
url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-and-digital-economy/overseas-businesses"
```

#### 3. **OVR Low-Value Goods Guide** (Lines 15-19)
**CURRENT:** 
```yaml
url: "https://www.iras.gov.sg/media/docs/default-source/e-tax/gst-e-tax-guide_taxing-imported-low-value-goods-by-way-of-the-overseas-vendor-registration-regime_(1st-ed).pdf?sfvrsn=b1a36692_34"
```

**PROPOSED FIX:**
```yaml
url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-and-digital-economy/overseas-businesses"  
```

### **Malaysia LHDN Documents** 

#### 4. **ADD: Withholding Tax Guidelines (Missing)**
**NEW ENTRY NEEDED:**
```yaml
- id: "my_withholding_tax_guidelines_2025"
  country: "malaysia"
  tax_type: "withholding_tax"
  source_name: "LHDN Guidelines on Withholding Tax"
  url: "https://www.hasil.gov.my/en/guidelines/direct-taxes/"
  document_version: "2025.latest"
  language: "en" 
  last_checked_date: "2025-09-01"
  priority: "high"
  topics: ["withholding_tax", "cross_border_payments", "non_resident_tax", "dta_benefits"]
```

#### 5. **ADD: Service Tax Guidelines (Missing)**
**NEW ENTRY NEEDED:**
```yaml  
- id: "my_service_tax_guidelines_2025"
  country: "malaysia"
  tax_type: "service_tax"
  source_name: "LHDN Guidelines on Service Tax"
  url: "https://www.hasil.gov.my/en/guidelines/service-tax/"
  document_version: "2025.latest"
  language: "en"
  last_checked_date: "2025-09-01" 
  priority: "high"
  topics: ["service_tax", "cross_border_services", "sst_compliance", "imported_services"]
```

### **Customs Documents**

#### 6. **Singapore Customs** (Line 164)
**CURRENT:**
```yaml
url: "https://www.customs.gov.sg/businesses/circulars-and-guidelines"
```

**PROPOSED FIX:**
```yaml
url: "https://www.customs.gov.sg/businesses/businesses-overview"
```

### **Corporate Law Documents**

#### 7. **Singapore Companies Act** (Lines 108, 119) - **403 FORBIDDEN**
**STATUS:** Remove or mark for manual download - AGC website blocks automated access

**PROPOSED ACTION:**
```yaml
# COMMENT OUT OR REMOVE due to 403 Forbidden errors:
# - sg_acra_companies_act_1967_main
# - sg_acra_companies_act_subsidiary  
```

## **IMPLEMENTATION PLAN**

### **Phase 1: High-Success Updates (Immediate)**
1. Update IRAS GST guide URLs to landing pages (Items 1-3)
2. Update Singapore Customs URL (Item 6)  
3. Add Malaysia LHDN guidelines entries (Items 4-5)

### **Phase 2: Manual Research Required**
- Thailand VAT documents (rd.go.th server issues)
- Indonesia PPN documents (pajak.go.id restructured)
- Singapore Companies Act (AGC access restrictions)

### **Phase 3: Verification** 
Run `python process.py` to test all updated URLs and confirm processing success.

## **EXPECTED IMPACT**

**Before:** 14/148 documents failing (9.5% failure rate)  
**After:** 6-8/148 documents failing (4-5% failure rate)  
**Success:** 50%+ improvement in document acquisition reliability

## **QUALITY NOTES**

- All proposed URLs are from official government domains
- Landing pages provide comprehensive guidance when direct PDFs unavailable
- Maintains regulatory compliance quality for cross-border tax analysis
- Follows Otto's 3-strategy prioritization (Direct PDF → Specific Landing Page → Alternative Source)

**This update will significantly improve the knowledge base completeness for professional Southeast Asian tax compliance guidance.**