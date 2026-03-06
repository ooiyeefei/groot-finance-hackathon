'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, UserPlus, ChevronDown, Building2, Mail, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCustomerSearch, useCustomerMutations } from '../hooks/use-customers'
import { useActiveBusiness } from '@/contexts/business-context'
import { MALAYSIAN_STATE_CODES } from '@/lib/data/state-codes'
import { COUNTRY_CODES } from '@/lib/data/country-codes'
import type { CustomerSnapshot, Customer } from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CustomerSelectorProps {
  value: CustomerSnapshot
  onChange: (snapshot: CustomerSnapshot) => void
  onCustomerSelect?: (customer: Customer) => void
  onCustomerClear?: () => void
  initialCustomerId?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomerSelector({
  value,
  onChange,
  onCustomerSelect,
  onCustomerClear,
  initialCustomerId,
}: CustomerSelectorProps) {
  const { businessId } = useActiveBusiness()
  const { createCustomer, updateCustomer } = useCustomerMutations()

  // -----------------------------------------------------------------------
  // Local state
  // -----------------------------------------------------------------------

  const [searchQuery, setSearchQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId ?? null)
  const [isSavingNew, setIsSavingNew] = useState(false)
  const [isSavingUpdate, setIsSavingUpdate] = useState(false)
  const [originalSnapshot, setOriginalSnapshot] = useState<CustomerSnapshot | null>(
    initialCustomerId ? value : null
  )

  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // -----------------------------------------------------------------------
  // Customer search query
  // -----------------------------------------------------------------------

  const { results: searchResults, isLoading: isSearching } = useCustomerSearch(
    searchQuery,
    isDropdownOpen,
  )

  // -----------------------------------------------------------------------
  // Close dropdown on outside click
  // -----------------------------------------------------------------------

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSelectCustomer = useCallback(
    (customer: Customer) => {
      const snapshot: CustomerSnapshot = {
        businessName: customer.businessName,
        contactPerson: customer.contactPerson,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        taxId: customer.taxId,
        // 016-e-invoice-schema-change: LHDN buyer compliance fields
        tin: customer.tin,
        brn: customer.brn,
        idType: customer.idType,
        sstRegistration: customer.sstRegistration,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        addressLine3: customer.addressLine3,
        city: customer.city,
        stateCode: customer.stateCode,
        postalCode: customer.postalCode,
        countryCode: customer.countryCode,
      }
      onChange(snapshot)
      setOriginalSnapshot(snapshot)
      setSelectedCustomerId(customer._id)
      setSearchQuery('')
      setIsDropdownOpen(false)
      onCustomerSelect?.(customer)
    },
    [onChange, onCustomerSelect],
  )

  const handleClearSelection = useCallback(() => {
    onChange({
      businessName: '',
      email: '',
    })
    setSelectedCustomerId(null)
    setOriginalSnapshot(null)
    setSearchQuery('')
    setIsCreatingNew(false)
    onCustomerClear?.()
  }, [onChange, onCustomerClear])

  const handleStartCreateNew = useCallback(() => {
    setIsCreatingNew(true)
    setIsDropdownOpen(false)
    setSelectedCustomerId(null)
    onChange({
      businessName: searchQuery,
      email: '',
    })
    setSearchQuery('')
    onCustomerClear?.()
  }, [searchQuery, onChange, onCustomerClear])

  const handleSaveNewCustomer = useCallback(async () => {
    if (!businessId || !value.businessName || !value.email) return

    setIsSavingNew(true)
    try {
      const newCustomerId = await createCustomer({
        businessId: businessId as Id<'businesses'>,
        businessName: value.businessName,
        contactPerson: value.contactPerson,
        email: value.email,
        phone: value.phone,
        address: value.address,
        taxId: value.taxId,
        tin: value.tin,
        brn: value.brn,
        addressLine1: value.addressLine1,
        addressLine2: value.addressLine2,
        addressLine3: value.addressLine3,
        city: value.city,
        stateCode: value.stateCode,
        postalCode: value.postalCode,
        countryCode: value.countryCode,
      })
      setSelectedCustomerId(newCustomerId)
      setIsCreatingNew(false)
      // Link the new customer ID back to the invoice form
      onCustomerSelect?.({
        _id: newCustomerId,
        businessName: value.businessName,
        contactPerson: value.contactPerson,
        email: value.email,
        phone: value.phone,
        address: value.address,
        taxId: value.taxId,
      } as Customer)
    } catch {
      // Silently handle -- the customer snapshot is still usable inline
    } finally {
      setIsSavingNew(false)
    }
  }, [businessId, value, createCustomer, onCustomerSelect])

  const handleSaveUpdatedCustomer = useCallback(async () => {
    if (!businessId || !selectedCustomerId || !value.businessName || !value.email) return

    setIsSavingUpdate(true)
    try {
      await updateCustomer({
        id: selectedCustomerId as Id<'customers'>,
        businessId: businessId as Id<'businesses'>,
        businessName: value.businessName,
        contactPerson: value.contactPerson,
        email: value.email,
        phone: value.phone,
        address: value.address,
        taxId: value.taxId,
        tin: value.tin,
        brn: value.brn,
        addressLine1: value.addressLine1,
        addressLine2: value.addressLine2,
        addressLine3: value.addressLine3,
        city: value.city,
        stateCode: value.stateCode,
        postalCode: value.postalCode,
        countryCode: value.countryCode,
      })
      setOriginalSnapshot({ ...value })
    } catch {
      // Silently handle -- the customer snapshot is still usable inline
    } finally {
      setIsSavingUpdate(false)
    }
  }, [businessId, selectedCustomerId, value, updateCustomer])

  // Check if any field has been modified from the original selected customer
  const hasUnsavedChanges = !!(
    selectedCustomerId &&
    !isCreatingNew &&
    originalSnapshot &&
    (value.businessName !== originalSnapshot.businessName ||
      value.email !== originalSnapshot.email ||
      (value.contactPerson ?? '') !== (originalSnapshot.contactPerson ?? '') ||
      (value.phone ?? '') !== (originalSnapshot.phone ?? '') ||
      (value.tin ?? '') !== (originalSnapshot.tin ?? '') ||
      (value.addressLine1 ?? '') !== (originalSnapshot.addressLine1 ?? '') ||
      (value.city ?? '') !== (originalSnapshot.city ?? '') ||
      (value.stateCode ?? '') !== (originalSnapshot.stateCode ?? '') ||
      (value.postalCode ?? '') !== (originalSnapshot.postalCode ?? '') ||
      (value.countryCode ?? '') !== (originalSnapshot.countryCode ?? ''))
  )

  const handleFieldChange = useCallback(
    (field: keyof CustomerSnapshot, fieldValue: string) => {
      onChange({ ...value, [field]: fieldValue })
    },
    [value, onChange],
  )

  // -----------------------------------------------------------------------
  // Selected customer display
  // -----------------------------------------------------------------------

  const hasSelection = !!value.businessName && (!!selectedCustomerId || isCreatingNew)

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-3" ref={dropdownRef}>
      {/* -----------------------------------------------------------------
          Search / selected header
      ------------------------------------------------------------------ */}
      {!hasSelection && !isCreatingNew ? (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setIsDropdownOpen(true)
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search customers..."
            className="pl-9 pr-9 h-10"
          />
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

          {/* Dropdown */}
          {isDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {isSearching && (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  Searching...
                </div>
              )}

              {!isSearching && searchResults.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  {searchQuery.length > 0
                    ? `No customers matching "${searchQuery}"`
                    : 'No customers yet'}
                </div>
              )}

              {searchResults.map((customer) => (
                <button
                  key={customer._id}
                  type="button"
                  onClick={() => handleSelectCustomer(customer as Customer)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                >
                  <p className="text-sm font-medium text-foreground">
                    {customer.businessName}
                  </p>
                  {customer.email && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {customer.email}
                    </p>
                  )}
                </button>
              ))}

              {/* Create new option */}
              <button
                type="button"
                onClick={handleStartCreateNew}
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-2 border-t border-border"
              >
                <UserPlus className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">
                  {searchQuery
                    ? `Create "${searchQuery}" as new customer`
                    : 'Create new customer'}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Selected customer header */
        <div className="flex items-center justify-between bg-muted/50 border border-border rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">
              {value.businessName || 'New customer'}
            </span>
            {isCreatingNew && (
              <span className="text-xs text-primary font-medium">(new)</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSelection}
            title="Clear customer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* -----------------------------------------------------------------
          Editable customer fields (shown when customer is selected or creating new)
      ------------------------------------------------------------------ */}
      {(hasSelection || isCreatingNew) && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          {/* Business Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Customer / Business Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={value.businessName}
              onChange={(e) => handleFieldChange('businessName', e.target.value)}
              placeholder="Business name"
              className="h-9 text-sm"
            />
          </div>

          {/* Contact Person + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Contact Person
              </label>
              <Input
                value={value.contactPerson ?? ''}
                onChange={(e) =>
                  handleFieldChange('contactPerson', e.target.value)
                }
                placeholder="Contact name"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Email <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="email"
                  value={value.email}
                  onChange={(e) => handleFieldChange('email', e.target.value)}
                  placeholder="customer@example.com"
                  className="h-9 text-sm pl-9"
                />
              </div>
            </div>
          </div>

          {/* Phone + TIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Phone
              </label>
              <Input
                type="tel"
                value={value.phone ?? ''}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
                placeholder="Phone number"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                TIN
              </label>
              <Input
                value={value.tin ?? ''}
                onChange={(e) => handleFieldChange('tin', e.target.value)}
                placeholder="C21638015020"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Compact Structured Address */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Address
            </label>
            <div className="space-y-2">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={value.addressLine1 ?? ''}
                  onChange={(e) => handleFieldChange('addressLine1', e.target.value)}
                  placeholder="Street address"
                  className="h-9 text-sm pl-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={value.city ?? ''}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  placeholder="City"
                  className="h-9 text-sm"
                />
                <Input
                  value={value.postalCode ?? ''}
                  onChange={(e) => handleFieldChange('postalCode', e.target.value)}
                  placeholder="Postal code"
                  className="h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={value.stateCode ?? ''}
                  onChange={(e) => handleFieldChange('stateCode', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">State...</option>
                  {MALAYSIAN_STATE_CODES.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
                <select
                  value={value.countryCode ?? 'MY'}
                  onChange={(e) => handleFieldChange('countryCode', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              For BRN, SST, and Peppol fields, edit full details in the Customer Directory.
            </p>
          </div>

          {/* Save buttons */}
          {isCreatingNew && (
            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveNewCustomer}
                disabled={
                  isSavingNew || !value.businessName || !value.email
                }
              >
                {isSavingNew ? 'Saving...' : 'Save to Customer Directory'}
              </Button>
            </div>
          )}
          {hasUnsavedChanges && (
            <div className="flex items-center justify-between pt-1 border-t border-border mt-2">
              <span className="text-xs text-muted-foreground">Customer info modified</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveUpdatedCustomer}
                disabled={isSavingUpdate || !value.businessName || !value.email}
              >
                {isSavingUpdate ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
