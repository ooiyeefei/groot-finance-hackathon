/**
 * Comprehensive Form Step for Enhanced Expense Form
 * Includes line items, policy validation, and advanced features
 */

'use client'

import { useState, useEffect } from 'react'
import { roundCurrency } from '@/lib/utils/format-number'
import { Plus, Trash2, AlertCircle, CheckCircle, Loader2, Eye, AlertTriangle, Users, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface LineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  category: string
  total_amount: number
}

interface ComprehensiveExpenseData {
  description: string
  business_purpose: string
  expense_category: string
  original_amount: number
  original_currency: string
  transaction_date: string
  vendor_name: string
  reference_number?: string
  receipt_number?: string
  notes?: string
  // document_id removed - using business_purpose_details for file tracking
  business_purpose_details?: Record<string, any>
  tax_amount?: number
  tax_rate?: number
  line_items: LineItem[]
  requires_manager_approval: boolean
  exceeds_policy_limit: boolean
  policy_violation_reason?: string
  attendees?: string[]
  client_entertainment: boolean
}

interface DuplicateWarning {
  found: boolean
  similarity: number
  existing_claim_id?: string
  details?: string
}

interface ComprehensiveFormStepProps {
  formData: ComprehensiveExpenseData
  setFormData: (data: ComprehensiveExpenseData | ((prev: ComprehensiveExpenseData) => ComprehensiveExpenseData)) => void
  errors: Record<string, string>
  processing: boolean
  ocrResult: any
  selectedFile: File | null
  previewUrl: string | null
  duplicateWarning: DuplicateWarning | null
  addLineItem: () => void
  removeLineItem: (id: string) => void
  updateLineItem: (id: string, updates: Partial<LineItem>) => void
  onNext: () => void
  onBack: () => void
}

export default function ComprehensiveFormStep({
  formData,
  setFormData,
  errors,
  processing,
  ocrResult,
  selectedFile,
  previewUrl,
  duplicateWarning,
  addLineItem,
  removeLineItem,
  updateLineItem,
  onNext,
  onBack
}: ComprehensiveFormStepProps) {
  const [activeTab, setActiveTab] = useState('basic')
  const [newAttendee, setNewAttendee] = useState('')
  const [categories, setCategories] = useState<Array<{
    id: string
    category_name: string
    requires_receipt: boolean
    receipt_threshold?: number
    policy_limit?: number
  }>>([])
  const [loadingCategories, setLoadingCategories] = useState(true)

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true)
      try {
        const response = await fetch('/api/v1/expense-claims/categories')
        const result = await response.json()

        if (result.success && result.data.categories) {
          setCategories(result.data.categories)
        }
      } catch (error) {
        console.error('[Comprehensive Form] Failed to fetch categories:', error)
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [])

  // Calculate totals from line items
  const lineItemsTotal = roundCurrency(formData.line_items.reduce((sum, item) => sum + item.total_amount, 0))
  const hasLineItems = formData.line_items.length > 0

  // Update main amount when line items change
  const syncAmountWithLineItems = () => {
    if (hasLineItems && lineItemsTotal !== formData.original_amount) {
      setFormData(prev => ({ ...prev, original_amount: lineItemsTotal }))
    }
  }

  // Add attendee for entertainment expenses
  const addAttendee = () => {
    if (newAttendee.trim()) {
      setFormData(prev => ({
        ...prev,
        attendees: [...(prev.attendees || []), newAttendee.trim()]
      }))
      setNewAttendee('')
    }
  }

  const removeAttendee = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees?.filter((_, i) => i !== index) || []
    }))
  }

  // Policy compliance check using database categories
  const categoryInfo = categories.find(c => c.id === formData.expense_category)
  const exceedsLimit = categoryInfo?.policy_limit && formData.original_amount > categoryInfo.policy_limit
  // Check for receipt via business_purpose_details instead of document_id
  const hasReceipt = formData.business_purpose_details?.file_upload?.file_path
  const needsReceipt = categoryInfo?.requires_receipt && categoryInfo?.receipt_threshold && formData.original_amount > categoryInfo.receipt_threshold && !hasReceipt

  return (
    <div className="space-y-6">
      {/* OCR Processing Status */}
      {processing && (
        <Alert className="bg-blue-500/10 border border-blue-500/30">
          <Brain className="w-4 h-4 animate-spin" />
          <AlertDescription className="text-blue-600 dark:text-blue-400">
            AI Analyzing... This may take a few moments.
          </AlertDescription>
        </Alert>
      )}

      {/* Duplicate Warning */}
      {duplicateWarning?.found && (
        <Alert className="bg-yellow-500/10 border border-yellow-500/30">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-yellow-600 dark:text-yellow-400">
            <div className="space-y-2">
              <div className="font-medium">Potential duplicate detected!</div>
              <div className="text-sm">
                This receipt appears {duplicateWarning.similarity}% similar to an existing claim.
                {duplicateWarning.details && <div className="mt-1">{duplicateWarning.details}</div>}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 border-yellow-500/50 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10"
                onClick={() => {
                  // TODO: Show duplicate claim details modal
                  console.log('Show duplicate:', duplicateWarning.existing_claim_id)
                }}
              >
                <Eye className="w-3 h-3 mr-1" />
                View existing claim
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* OCR Results Quality Indicator */}
      {ocrResult && (
        <Alert className={`${ocrResult.requires_validation ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
          <CheckCircle className="w-4 h-4" />
          <AlertDescription className={ocrResult.requires_validation ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}>
            {ocrResult.requires_validation
              ? `Receipt processed with ${Math.round((ocrResult.confidence_score || 0) * 100)}% confidence. Please verify the details below.`
              : 'Receipt processed successfully! Please review the extracted details.'
            }
          </AlertDescription>
        </Alert>
      )}

      {/* Receipt Preview */}
      {selectedFile && previewUrl && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <img src={previewUrl} alt="Receipt preview" className="w-24 h-24 object-cover rounded" />
              <div className="flex-1">
                <p className="text-foreground font-medium">{selectedFile.name}</p>
                <p className="text-muted-foreground text-sm">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                {ocrResult && (
                  <Badge variant="secondary" className="mt-1">
                    Confidence: {Math.round((ocrResult.confidence_score || 0) * 100)}%
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Policy Compliance Warnings */}
      {(exceedsLimit || needsReceipt) && (
        <Alert className="bg-red-500/10 border border-red-500/30">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-600 dark:text-red-400">
            <div className="space-y-1">
              <div className="font-medium">Policy Compliance Required</div>
              {exceedsLimit && <div>• Amount exceeds category limit of ${categoryInfo?.policy_limit}</div>}
              {needsReceipt && <div>• Receipt required for amounts over ${categoryInfo?.receipt_threshold}</div>}
              <div className="text-sm mt-2">This expense will require manager approval.</div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabbed Form Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 bg-muted border border-border">
          <TabsTrigger value="basic" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Basic Details
          </TabsTrigger>
          <TabsTrigger value="items" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Line Items ({formData.line_items.length})
          </TabsTrigger>
          <TabsTrigger value="tax" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Tax & Policy
          </TabsTrigger>
          <TabsTrigger value="additional" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Additional Info
          </TabsTrigger>
        </TabsList>

        {/* Basic Details Tab */}
        <TabsContent value="basic" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expense_category" className="text-foreground">Expense Category *</Label>
              <Select
                value={formData.expense_category}
                onValueChange={(value) => setFormData({...formData, expense_category: value})}
                disabled={loadingCategories}
              >
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder={loadingCategories ? "Loading categories..." : "Select category"} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id} className="text-foreground">
                      {category.category_name}
                    </SelectItem>
                  ))}
                  {categories.length === 0 && !loadingCategories && (
                    <SelectItem value="no-categories" disabled className="text-muted-foreground">
                      No categories available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.expense_category && <p className="text-red-400 text-sm">{errors.expense_category}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="original_amount" className="text-foreground">
                Total Amount * {hasLineItems && <span className="text-yellow-600 dark:text-yellow-400">(Auto-calculated from line items)</span>}
              </Label>
              <Input
                id="original_amount"
                type="number"
                step="0.01"
                value={formData.original_amount || ''}
                onChange={(e) => setFormData({...formData, original_amount: parseFloat(e.target.value) || 0})}
                className="bg-input border-border text-foreground"
                placeholder="0.00"
                disabled={hasLineItems}
              />
              {errors.original_amount && <p className="text-red-400 text-sm">{errors.original_amount}</p>}
              {hasLineItems && lineItemsTotal !== formData.original_amount && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncAmountWithLineItems}
                  className="border-yellow-500/50 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10"
                >
                  Sync with line items (${lineItemsTotal.toFixed(2)})
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor_name" className="text-foreground">Vendor Name *</Label>
            <Input
              id="vendor_name"
              value={formData.vendor_name}
              onChange={(e) => setFormData({...formData, vendor_name: e.target.value})}
              className="bg-input border-border text-foreground"
              placeholder="Restaurant, store, or service provider name"
            />
            {errors.vendor_name && <p className="text-red-400 text-sm">{errors.vendor_name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-foreground">Description *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="bg-input border-border text-foreground"
              placeholder="Brief description of the expense"
            />
            {errors.description && <p className="text-red-400 text-sm">{errors.description}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_purpose" className="text-foreground">Business Purpose *</Label>
            <Textarea
              id="business_purpose"
              value={formData.business_purpose}
              onChange={(e) => setFormData({...formData, business_purpose: e.target.value})}
              className="bg-input border-border text-foreground"
              placeholder="Explain the business reason for this expense"
              rows={3}
            />
            {errors.business_purpose && <p className="text-red-400 text-sm">{errors.business_purpose}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transaction_date" className="text-foreground">Transaction Date *</Label>
              <Input
                id="transaction_date"
                type="date"
                value={formData.transaction_date}
                onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
                className="bg-input border-border text-foreground"
              />
              {errors.transaction_date && <p className="text-red-400 text-sm">{errors.transaction_date}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="original_currency" className="text-foreground">Currency</Label>
              <Select
                value={formData.original_currency}
                onValueChange={(value) => setFormData({...formData, original_currency: value})}
              >
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {['SGD', 'USD', 'EUR', 'MYR', 'THB', 'IDR', 'CNY', 'VND', 'PHP'].map(currency => (
                    <SelectItem key={currency} value={currency} className="text-foreground">{currency}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt_number" className="text-foreground">Receipt Number</Label>
              <Input
                id="receipt_number"
                value={formData.receipt_number || ''}
                onChange={(e) => setFormData({...formData, receipt_number: e.target.value})}
                className="bg-input border-border text-foreground"
                placeholder="Receipt #"
              />
            </div>
          </div>
        </TabsContent>

        {/* Line Items Tab */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Itemized Details</h3>
              <p className="text-muted-foreground text-sm">Break down your expense into individual items</p>
            </div>
            <Button onClick={addLineItem} variant="view">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>

          {formData.line_items.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <div className="text-muted-foreground">
                  <Plus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No line items added</p>
                  <p className="text-sm">Add itemized details for better expense tracking</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {formData.line_items.map((item, index) => (
                <Card key={item.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                      <div className="md:col-span-2">
                        <Label className="text-foreground text-xs">Item Description *</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                          className="bg-muted border-border text-foreground text-sm"
                          placeholder="Item name"
                        />
                        {errors[`line_item_${index}_description`] && (
                          <p className="text-red-400 text-xs mt-1">{errors[`line_item_${index}_description`]}</p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-foreground text-xs">Qty *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => {
                            const quantity = parseFloat(e.target.value) || 0
                            const total = roundCurrency(quantity * item.unit_price)
                            updateLineItem(item.id, { quantity, total_amount: total })
                          }}
                          className="bg-muted border-border text-foreground text-sm"
                        />
                      </div>

                      <div>
                        <Label className="text-foreground text-xs">Unit Price *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => {
                            const unitPrice = parseFloat(e.target.value) || 0
                            const total = item.quantity * unitPrice
                            updateLineItem(item.id, { unit_price: unitPrice, total_amount: total })
                          }}
                          className="bg-muted border-border text-foreground text-sm"
                        />
                      </div>

                      <div>
                        <Label className="text-foreground text-xs">Tax %</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={item.tax_rate}
                          onChange={(e) => updateLineItem(item.id, { tax_rate: parseFloat(e.target.value) || 0 })}
                          className="bg-muted border-border text-foreground text-sm"
                          placeholder="0"
                        />
                      </div>

                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label className="text-foreground text-xs">Total</Label>
                          <div className="bg-muted border border-border rounded px-3 py-2 text-foreground text-sm">
                            ${item.total_amount.toFixed(2)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLineItem(item.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {/* Line Items Summary */}
              <Card className="bg-blue-500/10 border border-blue-500/30">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">Line Items Total:</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">
                      ${lineItemsTotal.toFixed(2)} {formData.original_currency}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Tax & Policy Tab */}
        <TabsContent value="tax" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">Tax Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tax_amount" className="text-foreground">Tax Amount</Label>
                <Input
                  id="tax_amount"
                  type="number"
                  step="0.01"
                  value={formData.tax_amount || ''}
                  onChange={(e) => setFormData({...formData, tax_amount: parseFloat(e.target.value) || 0})}
                  className="bg-input border-border text-foreground"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_rate" className="text-foreground">Tax Rate (%)</Label>
                <Input
                  id="tax_rate"
                  type="number"
                  step="0.1"
                  value={formData.tax_rate || ''}
                  onChange={(e) => setFormData({...formData, tax_rate: parseFloat(e.target.value) || 0})}
                  className="bg-input border-border text-foreground"
                  placeholder="0.0"
                />
              </div>
            </div>
          </div>

          {/* Policy Compliance Section */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">Policy Compliance</h3>
            
            <div className="space-y-4">
              {categoryInfo && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-foreground text-base">
                      {categoryInfo.category_name} Policy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Policy Limit:</span>
                        <div className="text-foreground">${categoryInfo.policy_limit || 'No limit'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Receipt Required Over:</span>
                        <div className="text-foreground">${categoryInfo.receipt_threshold || 0}</div>
                      </div>
                    </div>

                    {exceedsLimit && (
                      <Alert className="bg-red-500/10 border border-red-500/30">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription className="text-red-600 dark:text-red-400">
                          Amount exceeds policy limit. Manager approval required.
                        </AlertDescription>
                      </Alert>
                    )}

                    {needsReceipt && (
                      <Alert className="bg-yellow-500/10 border border-yellow-500/30">
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription className="text-yellow-600 dark:text-yellow-400">
                          Receipt required for this amount. Please upload receipt.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              )}
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requires_approval"
                  checked={formData.requires_manager_approval}
                  onCheckedChange={(checked) =>
                    setFormData({...formData, requires_manager_approval: !!checked})
                  }
                />
                <Label htmlFor="requires_approval" className="text-foreground">
                  Requires manager approval
                </Label>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Additional Information Tab */}
        <TabsContent value="additional" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reference_number" className="text-foreground">Reference Number</Label>
            <Input
              id="reference_number"
              value={formData.reference_number || ''}
              onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
              className="bg-input border-border text-foreground"
              placeholder="PO number, invoice number, etc."
            />
            {!formData.reference_number && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Recommended for faster approval
              </p>
            )}
          </div>

          {/* Entertainment Expense Attendees */}
          {formData.expense_category === 'entertainment' && (
            <div className="space-y-4">
              <div>
                <Label className="text-foreground">Client Entertainment</Label>
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox
                    id="client_entertainment"
                    checked={formData.client_entertainment}
                    onCheckedChange={(checked) =>
                      setFormData({...formData, client_entertainment: !!checked})
                    }
                  />
                  <Label htmlFor="client_entertainment" className="text-foreground">
                    This expense included client entertainment
                  </Label>
                </div>
              </div>

              {formData.client_entertainment && (
                <div className="space-y-3">
                  <Label className="text-foreground">Attendees *</Label>

                  <div className="flex gap-2">
                    <Input
                      value={newAttendee}
                      onChange={(e) => setNewAttendee(e.target.value)}
                      className="bg-input border-border text-foreground"
                      placeholder="Name of attendee"
                      onKeyPress={(e) => e.key === 'Enter' && addAttendee()}
                    />
                    <Button onClick={addAttendee} disabled={!newAttendee.trim()}>
                      <Users className="w-4 h-4" />
                    </Button>
                  </div>

                  {formData.attendees && formData.attendees.length > 0 && (
                    <div className="space-y-2">
                      {formData.attendees.map((attendee, index) => (
                        <div key={index} className="flex items-center justify-between bg-card p-2 rounded">
                          <span className="text-foreground">{attendee}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAttendee(index)}
                            className="text-red-600 dark:text-red-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {errors.attendees && <p className="text-red-400 text-sm">{errors.attendees}</p>}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-foreground">Additional Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="bg-input border-border text-foreground"
              placeholder="Any additional information or special circumstances"
              rows={4}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          Back
        </Button>
        <Button onClick={onNext} variant="primary" className="flex-1">
          Review & Submit
        </Button>
      </div>
    </div>
  )
}