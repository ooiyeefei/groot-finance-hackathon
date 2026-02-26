# Prebuilt Template Contracts: Master Accounting

## Template Definitions

Each Master Accounting prebuilt template follows the existing `PrebuiltTemplate` interface with these additions: `sectionHeader`, `includeColumnHeaders`, `requiresCodeMapping`, `codeMappingTypes`.

### Transaction Templates

#### master-accounting-purchases-bill (module: "expense")

```
Section Header: "Purchases Book-Bill"
Format: hierarchical, pipe-delimited, .txt
Requires Code Mapping: ["account_code", "creditor_code"]

M row fields (15): M | Invoice Code | Invoice Date | Creditor Code | Description | Reference No | Amount | Currency Rate | Term Code | Staff Code | Area Code | Department Code | Job Code | Cancelled | Cancelled Remark

D-Item row fields (11): D-Item | Account Code | Description | Department Code | Job Code | Amount Before GST | GST Type Code | GST % | GST Inclusive | Taxable Amount | GST Amount
```

#### master-accounting-cashbook-payment (module: "expense")

```
Section Header: "Cash Book-Payment"
Format: hierarchical, pipe-delimited, .txt
Requires Code Mapping: ["account_code", "bank_code"]

M row fields (25): M | Payment Code | Payment Date | Payment Type | Bank/Cash A/C Code | Pay To | Description | Cheque No | Bank/Cash Amount | Bank Currency Rate | Amount | Staff Code | Area Code | Remark 1-8 | Department Code | Job Code | Cancelled | Cancelled Remark

D-Item row fields (15): D-Item | Account Code | Description 1 | Description 2 | Ref No 1 | Ref No 2 | Staff Code | Department Code | Job Code | Amount Before GST | GST Type Code | GST % | GST Inclusive | Taxable Amount | GST Amount
```

#### master-accounting-sales-invoice (module: "invoice")

```
Section Header: "Sales Book-Invoice"
Format: hierarchical, pipe-delimited, .txt
Requires Code Mapping: ["account_code", "debtor_code"]

M row fields (15): M | Invoice Code | Invoice Date | Debtor Code | Description | Reference No | Amount | Currency Rate | Term Code | Staff Code | Area Code | Department Code | Job Code | Cancelled | Cancelled Remark

D-Item row fields (12): D-Item | Account Code | Description | Department Code | Job Code | Non-Sales Item | Amount Before GST | GST Type Code | GST % | GST Inclusive | Taxable Amount | GST Amount
```

#### master-accounting-journal (module: "accounting")

```
Section Header: "Journal Book"
Format: hierarchical, pipe-delimited, .txt
Requires Code Mapping: ["account_code"]

M row fields (8): M | Journal Code | Journal Date | Journal Book Type | Description | Reference No | Cancelled | Cancelled Remark

D-Item row fields (21): D-Item | Account Code | Description 1 | Description 2 | Ref No 1 | Ref No 2 | Debit | Credit | Local Debit | Local Credit | GST Type Code | GST % | GST Inclusive | Taxable Amount | GST Amount | Staff/Agent Code | Department Code | Job Code | Currency Rate | Remark 1 | Remark 2
```

### Master Data Templates

#### master-accounting-chart-of-account (module: "accounting")

```
Section Header: "Chart of Account"
Format: flat, pipe-delimited, .txt, no column headers
Requires Code Mapping: false

Fields (11): Account Code | Description | Account Type | Special Type | DRCR | Cost Centre Code | Default GST Type Supply | Default GST Type Purchase | MSIC Code | Currency Code | Customs Tariff/Service Type
```

#### master-accounting-creditor (module: "expense")

```
Section Header: "Creditor/Supplier"
Format: flat, pipe-delimited, .txt, no column headers
Requires Code Mapping: false

Fields (43): Creditor Code | Name | Name 2 | Register No | Address 1-4 | City | Postal Code | State | Country Code | Contact Person | Phone 1-2 | Fax 1-2 | Email 1-2 | Home Page | Business Nature | Suspended | Control Account Code | Area Code | Category Code | Group Code | Term Code | Staff Code | Currency Code | GST Exemption No | GST Exemption Expired Date | GST Register No | Last GST Verified Date | GST Type Code | GST Register Date | Self-Bill Invoice Approval No | Self-Bill Invoice Approval Date | SST CJ Register No | SST CP Register No | TIN | ID Type | MSIC Code | Tourism Tax Reg No
```

#### master-accounting-debtor (module: "invoice")

```
Section Header: "Debtor/Customer"
Format: flat, pipe-delimited, .txt, no column headers
Requires Code Mapping: false

Fields (44): Debtor Code | Name | Name 2 | Register No | Address 1-4 | City | Postal Code | State | Country Code | Contact Person | Contact Person Position | Phone 1-2 | Fax 1-2 | Email 1-2 | Home Page | Business Nature | Suspended | Control Account Code | Area Code | Category Code | Group Code | Term Code | Staff Code 1-2 | POS | Currency Code | Department Code | Cash Debtor | GST Exemption No | GST Exemption Expired Date | GST Register No | Last GST Verified Date | GST Type Code | GST Register Date | SST CJ Register No | SST CP Register No | TIN | ID Type
```
