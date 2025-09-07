/**
 * Pre-filled Expense Form - Single Responsibility Component  
 * DSPy-Inspired Architecture: Displays pre-filled form from DSPy extraction results
 * Allows user to review, edit, and submit the expense claim
 */

'use client'

import { useState } from 'react'
import { 
  CheckCircle, 
  AlertCircle, 
  Edit3, 
  Brain, 
  Send, 
  ArrowLeft,
  Tag,
  DollarSign,
  Calendar,
  Building,
  FileText,
  Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DSPyExtractionResult } from '@/types/expense-extraction'
import { EXPENSE_CATEGORY_CONFIG } from '@/types/expense-claims'

interface ExpenseFormData {
  description: string
  business_purpose: string
  expense_category: string
  original_amount: number
  original_currency: string
  transaction_date: string
  vendor_name: string
  reference_number?: string
  notes?: string
}

interface PreFilledExpenseFormProps {
  extractionResult: DSPyExtractionResult
  onSubmit: (formData: ExpenseFormData) => void
  onBack: () => void
  isSubmitting?: boolean
}

export default function PreFilledExpenseForm({ 
  extractionResult, 
  onSubmit, 
  onBack,
  isSubmitting = false 
}: PreFilledExpenseFormProps) {
  // Initialize form with DSPy extracted data
  const [formData, setFormData] = useState<ExpenseFormData>({
    description: extractionResult.extractedData.lineItems?.[0]?.description || 'Business expense',
    business_purpose: '', // This needs user input
    expense_category: inferExpenseCategory(extractionResult),
    original_amount: extractionResult.extractedData.totalAmount,
    original_currency: extractionResult.extractedData.currency,
    transaction_date: extractionResult.extractedData.transactionDate,
    vendor_name: extractionResult.extractedData.vendorName,
    reference_number: extractionResult.extractedData.receiptNumber || '',
    notes: ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState('form')

  // DSPy confidence indicators for each field
  const getFieldConfidence = (fieldName: string): 'high' | 'medium' | 'low' => {
    const confidence = extractionResult.extractedData.confidenceScore
    const missingFields = extractionResult.extractedData.missingFields || []
    
    if (missingFields.includes(fieldName)) return 'low'
    if (confidence >= 0.8) return 'high'
    if (confidence >= 0.6) return 'medium'
    return 'low'
  }

  // Auto-categorize based on vendor name and line items
  function inferExpenseCategory(result: DSPyExtractionResult): string {
    const vendor = result.extractedData.vendorName.toLowerCase()
    const items = result.extractedData.lineItems.map(item => item.description.toLowerCase()).join(' ')
    
    if (vendor.includes('restaurant') || vendor.includes('cafe') || vendor.includes('food') || 
        items.includes('food') || items.includes('meal') || items.includes('lunch')) {
      return 'entertainment_meals'
    }
    if (vendor.includes('gas') || vendor.includes('petrol') || vendor.includes('fuel') ||
        items.includes('fuel') || items.includes('gas')) {
      return 'petrol_transport'
    }
    if (vendor.includes('hotel') || vendor.includes('accommodation') ||
        items.includes('accommodation') || items.includes('room')) {
      return 'travel_accommodation'
    }
    if (vendor.includes('office') || vendor.includes('supplies') ||
        items.includes('supplies') || items.includes('stationery')) {
      return 'office_supplies'
    }
    
    return 'other_business' // Default category
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }
    if (!formData.business_purpose.trim()) {
      newErrors.business_purpose = 'Business purpose is required'
    }
    if (!formData.expense_category) {
      newErrors.expense_category = 'Category is required'
    }
    if (formData.original_amount <= 0) {
      newErrors.original_amount = 'Amount must be greater than 0'
    }
    if (!formData.vendor_name.trim()) {
      newErrors.vendor_name = 'Vendor name is required'
    }
    if (!formData.transaction_date) {
      newErrors.transaction_date = 'Date is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit(formData)
    }
  }

  const FieldConfidenceBadge = ({ confidence }: { confidence: 'high' | 'medium' | 'low' }) => {
    const colors = {
      high: 'bg-green-600 text-white',
      medium: 'bg-yellow-600 text-white', 
      low: 'bg-red-600 text-white'
    }
    
    return (
      <Badge variant="secondary" className={`text-xs ${colors[confidence]}`}>
        <CheckCircle className="w-3 h-3 mr-1" />
        Auto: {confidence}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <Edit3 className="w-16 h-16 mx-auto text-blue-500 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          Review Extracted Data
        </h3>
        <p className="text-gray-400">
          DSPy has pre-filled your expense form. Please review and edit as needed.
        </p>
      </div>

      {/* Extraction Quality Summary */}
      <Card className={`border ${
        extractionResult.extractedData.extractionQuality === 'high' ? 'border-green-600 bg-green-900/20' :
        extractionResult.extractedData.extractionQuality === 'medium' ? 'border-yellow-600 bg-yellow-900/20' :
        'border-red-600 bg-red-900/20'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="w-6 h-6 text-purple-400" />
              <div>
                <div className="text-white font-medium">
                  DSPy Extraction: {extractionResult.extractedData.extractionQuality} quality
                </div>
                <div className="text-gray-400 text-sm">
                  Confidence: {Math.round(extractionResult.extractedData.confidenceScore * 100)}%
                </div>
              </div>
            </div>
            {extractionResult.needsManualReview && (
              <Badge variant="secondary" className="bg-yellow-600">
                Review Required
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Suggested Corrections */}
      {extractionResult.suggestedCorrections && extractionResult.suggestedCorrections.length > 0 && (
        <Alert className="bg-blue-900/20 border-blue-700">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-blue-400">
            <div className="space-y-1">
              <div className="font-medium">DSPy Suggestions:</div>
              {extractionResult.suggestedCorrections.map((suggestion, index) => (
                <div key={index} className="text-sm">• {suggestion}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-gray-700 border border-gray-600">
          <TabsTrigger value="form" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Expense Form
          </TabsTrigger>
          <TabsTrigger value="reasoning" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            DSPy Reasoning
          </TabsTrigger>
        </TabsList>

        {/* Form Tab */}
        <TabsContent value="form" className="space-y-4">
          {/* Basic Information */}
          <Card className="bg-gray-700 border-gray-600">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Building className="w-4 h-4" />
                    Vendor Name *
                    <FieldConfidenceBadge confidence={getFieldConfidence('vendorName')} />
                  </Label>
                  <Input
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({...formData, vendor_name: e.target.value})}
                    className="bg-gray-600 border-gray-500 text-white"
                    placeholder="Vendor or merchant name"
                  />
                  {errors.vendor_name && <p className="text-red-400 text-sm">{errors.vendor_name}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Amount *
                    <FieldConfidenceBadge confidence={getFieldConfidence('totalAmount')} />
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.original_amount}
                      onChange={(e) => setFormData({...formData, original_amount: parseFloat(e.target.value) || 0})}
                      className="bg-gray-600 border-gray-500 text-white flex-1"
                      placeholder="0.00"
                    />
                    <Select 
                      value={formData.original_currency} 
                      onValueChange={(value) => setFormData({...formData, original_currency: value})}
                    >
                      <SelectTrigger className="bg-gray-600 border-gray-500 text-white w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 border-gray-600">
                        {['SGD', 'USD', 'EUR', 'MYR', 'THB', 'IDR', 'CNY', 'VND', 'PHP'].map(currency => (
                          <SelectItem key={currency} value={currency} className="text-white">{currency}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {errors.original_amount && <p className="text-red-400 text-sm">{errors.original_amount}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Transaction Date *
                    <FieldConfidenceBadge confidence={getFieldConfidence('transactionDate')} />
                  </Label>
                  <Input
                    type="date"
                    value={formData.transaction_date}
                    onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
                    className="bg-gray-600 border-gray-500 text-white"
                  />
                  {errors.transaction_date && <p className="text-red-400 text-sm">{errors.transaction_date}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Category *
                  </Label>
                  <Select 
                    value={formData.expense_category} 
                    onValueChange={(value) => setFormData({...formData, expense_category: value})}
                  >
                    <SelectTrigger className="bg-gray-600 border-gray-500 text-white">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      {Object.entries(EXPENSE_CATEGORY_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key} className="text-white">
                          {config.icon} {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.expense_category && <p className="text-red-400 text-sm">{errors.expense_category}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Description *</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="bg-gray-600 border-gray-500 text-white"
                  placeholder="Brief description of expense"
                />
                {errors.description && <p className="text-red-400 text-sm">{errors.description}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-white">Business Purpose *</Label>
                <Textarea
                  value={formData.business_purpose}
                  onChange={(e) => setFormData({...formData, business_purpose: e.target.value})}
                  className="bg-gray-600 border-gray-500 text-white"
                  placeholder="Explain the business reason for this expense"
                  rows={3}
                />
                {errors.business_purpose && <p className="text-red-400 text-sm">{errors.business_purpose}</p>}
              </div>

              {/* Optional Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Reference Number</Label>
                  <Input
                    value={formData.reference_number || ''}
                    onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
                    className="bg-gray-600 border-gray-500 text-white"
                    placeholder="Receipt or reference number"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-white">Additional Notes</Label>
                  <Input
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="bg-gray-600 border-gray-500 text-white"
                    placeholder="Any additional information"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items Display */}
          {extractionResult.extractedData.lineItems.length > 0 && (
            <Card className="bg-gray-700 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white">Extracted Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {extractionResult.extractedData.lineItems.map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-gray-600 p-2 rounded">
                      <span className="text-white">{item.description}</span>
                      <span className="text-gray-300">
                        {item.quantity && `${item.quantity}x `}
                        ${item.lineTotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center bg-blue-900/20 p-2 rounded border border-blue-700">
                    <span className="text-blue-300 font-medium">Total</span>
                    <span className="text-blue-300 font-bold">
                      ${extractionResult.extractedData.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DSPy Reasoning Tab */}
        <TabsContent value="reasoning" className="space-y-4">
          <Card className="bg-purple-900/20 border-purple-700">
            <CardHeader>
              <CardTitle className="text-purple-400 flex items-center gap-2">
                <Brain className="w-5 h-5" />
                DSPy Chain-of-Thought Reasoning
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(extractionResult.thinking).map(([step, reasoning]) => (
                <div key={step} className="bg-gray-800 p-3 rounded">
                  <div className="text-purple-300 font-medium mb-1 text-sm">
                    {step.replace(/_/g, ' ').replace(/^step\d+\s*/, '').toUpperCase()}
                  </div>
                  <div className="text-gray-300 text-sm">{reasoning}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button 
          variant="outline" 
          onClick={onBack}
          disabled={isSubmitting}
          className="border-gray-600 text-gray-300"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Submit Expense Claim
            </>
          )}
        </Button>
      </div>
    </div>
  )
}