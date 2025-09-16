/**
 * Cross-Border Tax Compliance Analysis Tool
 * AI-powered compliance analysis for cross-border transactions
 * Following ASEAN tax regulations and international compliance requirements
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { GoogleGenAI } from '@google/genai'

interface ComplianceAnalysisParameters {
  transaction_id: string
  amount: number
  original_currency: string
  home_currency: string
  vendor_country?: string
  transaction_type: 'income' | 'expense' | 'transfer' | 'asset' | 'liability' | 'equity'
  category?: string
  description?: string
  vendor_name?: string
}

export interface ComplianceAnalysisResult {
  compliance_status: 'compliant' | 'requires_attention' | 'non_compliant'
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  tax_implications: {
    withholding_tax_required: boolean
    estimated_tax_rate: number
    jurisdiction: string[]
  }
  regulatory_requirements: {
    documentation_required: string[]
    filing_obligations: string[]
    deadlines: string[]
  }
  recommendations: string[]
  confidence_score: number
  analysis_timestamp: string
  sources: Array<{
    uri: string
    title: string
    snippet?: string
  }>
  summary: string
  issues_identified: Array<{
    category: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    description: string
    recommendation: string
  }>
}

export class CrossBorderTaxComplianceTool extends BaseTool {
  getToolName(modelType: ModelType = 'openai'): string {
    return 'analyze_cross_border_compliance'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    return 'Analyze cross-border financial transactions for tax compliance and regulatory requirements. This tool evaluates transactions involving different currencies or cross-jurisdictional activities to identify potential compliance issues, tax obligations, and regulatory requirements. It provides recommendations for proper documentation and filing requirements specific to Southeast Asian markets.'
  }

  getToolSchema(modelType: ModelType = 'openai'): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(modelType),
        description: this.getDescription(modelType),
        parameters: {
          type: "object",
          properties: {
            transaction_id: {
              type: "string",
              description: "Unique identifier of the transaction to analyze"
            },
            amount: {
              type: "number",
              description: "Transaction amount in original currency"
            },
            original_currency: {
              type: "string",
              description: "Original transaction currency code (e.g., USD, SGD, THB)"
            },
            home_currency: {
              type: "string", 
              description: "User's home currency code"
            },
            vendor_country: {
              type: "string",
              description: "Country code of the vendor/counterparty (optional)"
            },
            transaction_type: {
              type: "string",
              description: "Type of transaction",
              enum: ["income", "expense", "transfer", "asset", "liability", "equity"]
            },
            category: {
              type: "string",
              description: "Transaction category (optional)"
            },
            description: {
              type: "string",
              description: "Transaction description (optional)"
            },
            vendor_name: {
              type: "string",
              description: "Vendor or counterparty name (optional)"
            }
          },
          required: ["transaction_id", "amount", "original_currency", "home_currency", "transaction_type"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as ComplianceAnalysisParameters

    if (!params.transaction_id || typeof params.transaction_id !== 'string') {
      return { valid: false, error: 'Transaction ID is required and must be a string' }
    }

    if (!params.amount || typeof params.amount !== 'number' || params.amount <= 0) {
      return { valid: false, error: 'Amount is required and must be a positive number' }
    }

    if (!params.original_currency || typeof params.original_currency !== 'string') {
      return { valid: false, error: 'Original currency is required and must be a string' }
    }

    if (!params.home_currency || typeof params.home_currency !== 'string') {
      return { valid: false, error: 'Home currency is required and must be a string' }
    }

    const validTransactionTypes = ['income', 'expense', 'transfer', 'asset', 'liability', 'equity']
    if (!params.transaction_type || !validTransactionTypes.includes(params.transaction_type)) {
      return { valid: false, error: 'Valid transaction type is required' }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as ComplianceAnalysisParameters

    try {
      console.log(`[CrossBorderTaxComplianceTool] RAG-powered analysis for transaction ${params.transaction_id}`)

      // Verify the transaction exists and belongs to the user
      const { data: transaction, error: txError } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('id', params.transaction_id)
        .eq('user_id', userContext.userId)
        .single()

      if (txError || !transaction) {
        return {
          success: false,
          error: 'Transaction not found or access denied'
        }
      }

      // Perform curated RAG compliance analysis with regulatory knowledge base
      const analysis = await this.performCuratedRAGAnalysis(params)

      // Save the analysis result to the transaction record
      const { error: updateError } = await this.supabase
        .from('transactions')
        .update({ 
          compliance_analysis: analysis,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.transaction_id)
        .eq('user_id', userContext.userId)

      if (updateError) {
        console.error('[CrossBorderTaxComplianceTool] Failed to save compliance analysis:', updateError)
        // Continue with analysis result even if save fails
      }

      return {
        success: true,
        data: JSON.stringify(analysis, null, 2),
        metadata: {
          transaction_id: params.transaction_id,
          compliance_status: analysis.compliance_status,
          risk_level: analysis.risk_level,
          confidence_score: analysis.confidence_score,
          analysis_method: 'curated_rag'
        }
      }

    } catch (error) {
      console.error('[CrossBorderTaxComplianceTool] RAG analysis error:', error)
      
      // Fallback to rule-based analysis if RAG fails
      console.log('[CrossBorderTaxComplianceTool] Falling back to rule-based analysis')
      try {
        const fallbackAnalysis = await this.performFallbackAnalysis(params)
        
        // Save fallback analysis
        await this.supabase
          .from('transactions')
          .update({ 
            compliance_analysis: { ...fallbackAnalysis, analysis_method: 'fallback_rules' },
            updated_at: new Date().toISOString()
          })
          .eq('id', params.transaction_id)
          .eq('user_id', userContext.userId)

        return {
          success: true,
          data: JSON.stringify(fallbackAnalysis, null, 2),
          metadata: {
            transaction_id: params.transaction_id,
            compliance_status: fallbackAnalysis.compliance_status,
            risk_level: fallbackAnalysis.risk_level,
            confidence_score: fallbackAnalysis.confidence_score,
            analysis_method: 'fallback_rules',
            warning: 'Curated RAG analysis failed, using rule-based fallback'
          }
        }
      } catch (fallbackError) {
        return {
          success: false,
          error: `Both RAG and fallback analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
    }
  }

  /**
   * RAG-powered compliance analysis using curated regulatory knowledge base
   */
  private async performCuratedRAGAnalysis(params: ComplianceAnalysisParameters): Promise<ComplianceAnalysisResult> {
    console.log('[CrossBorderTaxComplianceTool] Starting curated RAG analysis with regulatory knowledge base')
    
    try {
      // Build compliance query for RAG retrieval
      const complianceQuery = this.buildRAGComplianceQuery(params)
      console.log('[CrossBorderTaxComplianceTool] RAG query:', complianceQuery)

      // Step 1: Retrieve relevant regulatory knowledge from Qdrant
      const relevantChunks = await this.retrieveRegulatoryKnowledge(complianceQuery)
      console.log(`[CrossBorderTaxComplianceTool] Retrieved ${relevantChunks.length} relevant regulatory chunks`)

      if (relevantChunks.length === 0) {
        console.warn('[CrossBorderTaxComplianceTool] No relevant regulatory knowledge found, falling back to rules')
        throw new Error('No relevant regulatory knowledge found for this transaction type')
      }

      // Step 2: Generate AI analysis using retrieved knowledge
      const ragAnalysis = await this.generateRAGAnalysis(params, relevantChunks)
      console.log('[CrossBorderTaxComplianceTool] RAG analysis completed')

      // Step 3: Extract sources from regulatory chunks
      const sources = this.extractRAGSources(relevantChunks)
      
      // Step 4: Transform analysis to structured compliance result
      const complianceResult = await this.transformRAGResponse(ragAnalysis, params, sources, relevantChunks)
      
      return complianceResult

    } catch (error) {
      console.error('[CrossBorderTaxComplianceTool] RAG analysis failed:', error)
      throw new Error(`RAG analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Build comprehensive compliance query for RAG retrieval
   */
  private buildRAGComplianceQuery(params: ComplianceAnalysisParameters): string {
    const currencyPair = `${params.original_currency} to ${params.home_currency}`
    const transactionContext = params.description || params.category || 'cross-border transaction'
    const amountContext = params.amount > 10000 ? 'high-value' : 'standard'
    
    // Build targeted query for regulatory knowledge retrieval
    return `${amountContext} ${params.transaction_type} transaction ${currencyPair} ${transactionContext} withholding tax requirements documentation filing obligations ${params.vendor_country || ''} cross-border compliance regulations`
  }

  /**
   * Retrieve relevant regulatory knowledge from regulatory_kb collection
   */
  private async retrieveRegulatoryKnowledge(query: string): Promise<Array<{
    id: string,
    text: string,
    metadata: any,
    source_document: any,
    processing_info: any,
    score: number
  }>> {
    try {
      // Use the internal regulatory search API to retrieve knowledge from regulatory_kb
      const searchResult = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/internal/search-regulatory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_KEY || 'dev-service-key-change-in-production'}`
        },
        body: JSON.stringify({
          query: query,
          limit: 5,
          score_threshold: 0.6 // Optimal threshold from RETRIEVAL_ANALYSIS.md
        })
      })

      if (!searchResult.ok) {
        throw new Error(`Regulatory search failed: ${searchResult.statusText}`)
      }

      const response = await searchResult.json()
      const chunks = response.data || []
      console.log(`[CrossBorderTaxComplianceTool] Retrieved ${chunks.length} relevant regulatory chunks from regulatory_kb collection`)
      
      return chunks
      
    } catch (error) {
      console.error('[CrossBorderTaxComplianceTool] RAG retrieval failed:', error)
      return []
    }
  }

  /**
   * Generate AI analysis using retrieved regulatory knowledge
   */
  private async generateRAGAnalysis(
    params: ComplianceAnalysisParameters, 
    relevantChunks: Array<any>
  ): Promise<string> {
    try {
      // Build context from retrieved regulatory knowledge
      const regulatoryContext = relevantChunks.map((chunk, index) => 
        `[Regulatory Source ${index + 1}]:\n${chunk.text}`
      ).join('\n\n')

      const currencyPair = `${params.original_currency} to ${params.home_currency}`
      const transactionContext = params.description || params.category || 'cross-border transaction'
      const amountContext = params.amount > 10000 ? 'high-value' : 'standard'

      const prompt = `Based on the following regulatory knowledge, analyze this cross-border transaction for compliance requirements:

REGULATORY KNOWLEDGE:
${regulatoryContext}

TRANSACTION TO ANALYZE:
- Amount: ${params.amount} ${params.original_currency}
- Currency conversion: ${currencyPair}
- Transaction type: ${params.transaction_type}
- Description: ${transactionContext}
- Vendor: ${params.vendor_name || 'Unknown'}
- Vendor country: ${params.vendor_country || 'Unknown'}
- Category: ${params.category || 'General'}

Please provide a detailed compliance analysis including:
1. Withholding tax requirements and applicable rates
2. Required documentation for this transaction
3. Filing obligations and deadlines
4. Risk assessment and compliance recommendations

Base your analysis strictly on the regulatory knowledge provided above.`

      // Use the Gemini service for analysis (but with RAG context, not grounding)
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured for RAG analysis')
      }

      const genAI = new GoogleGenAI({ apiKey })

      const result = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
      
      return result.text || ''
      
    } catch (error) {
      console.error('[CrossBorderTaxComplianceTool] RAG analysis generation failed:', error)
      throw new Error(`RAG analysis generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Extract sources from regulatory chunks
   */
  private extractRAGSources(chunks: Array<any>): Array<{uri: string, title: string, snippet?: string}> {
    return chunks.map(chunk => ({
      uri: chunk.source_document?.url || '',
      title: chunk.source_document?.id || chunk.metadata?.source_name || 'Regulatory Document',
      snippet: chunk.text.substring(0, 200) + '...'
    }))
  }

  /**
   * Transform RAG response to structured compliance result
   */
  private async transformRAGResponse(
    analysisText: string, 
    params: ComplianceAnalysisParameters,
    sources: Array<{uri: string, title: string, snippet?: string}>,
    relevantChunks: Array<any>
  ): Promise<ComplianceAnalysisResult> {
    
    // Parse the RAG analysis into structured data
    const complianceResult = await this.parseComplianceResponse(analysisText, params)
    
    // Add RAG sources and metadata
    complianceResult.sources = sources
    complianceResult.summary = this.generateSummary(complianceResult, params)
    complianceResult.analysis_timestamp = new Date().toISOString()
    complianceResult.confidence_score = 0.95 // Higher confidence due to curated knowledge base
    
    return complianceResult
  }

  /**
   * Parse natural language compliance response into structured data
   */
  private async parseComplianceResponse(
    analysisText: string, 
    params: ComplianceAnalysisParameters
  ): Promise<ComplianceAnalysisResult> {
    
    // Extract key compliance indicators from the text
    const isCrossBorder = params.original_currency !== params.home_currency
    const isHighValue = params.amount > 10000
    
    // Analyze text for compliance status indicators
    const complianceStatus = this.determineComplianceStatus(analysisText, isCrossBorder, isHighValue)
    const riskLevel = this.determineRiskLevel(analysisText, isCrossBorder, isHighValue)
    
    // Extract specific requirements from the analysis
    const taxImplications = this.extractTaxImplications(analysisText, params)
    const regulatoryRequirements = this.extractRegulatoryRequirements(analysisText)
    const recommendations = this.extractRecommendations(analysisText)
    const issuesIdentified = this.extractIssuesIdentified(analysisText)
    
    return {
      compliance_status: complianceStatus,
      risk_level: riskLevel,
      tax_implications: taxImplications,
      regulatory_requirements: regulatoryRequirements,
      recommendations,
      confidence_score: 0.95, // High confidence due to curated RAG
      analysis_timestamp: new Date().toISOString(),
      sources: [], // Will be populated by caller
      summary: '', // Will be populated by caller
      issues_identified: issuesIdentified
    }
  }

  private determineComplianceStatus(analysisText: string, isCrossBorder: boolean, isHighValue: boolean): ComplianceAnalysisResult['compliance_status'] {
    const lowerText = analysisText.toLowerCase()
    
    if (lowerText.includes('non-compliant') || lowerText.includes('violation') || lowerText.includes('illegal')) {
      return 'non_compliant'
    }
    
    if (lowerText.includes('requires attention') || lowerText.includes('additional documentation') || 
        lowerText.includes('further review') || isHighValue) {
      return 'requires_attention'
    }
    
    return 'compliant'
  }

  private determineRiskLevel(analysisText: string, isCrossBorder: boolean, isHighValue: boolean): ComplianceAnalysisResult['risk_level'] {
    const lowerText = analysisText.toLowerCase()
    
    if (lowerText.includes('critical') || lowerText.includes('high risk') || lowerText.includes('severe')) {
      return 'critical'
    }
    
    if (lowerText.includes('high') || isHighValue || lowerText.includes('significant')) {
      return 'high'
    }
    
    if (lowerText.includes('medium') || isCrossBorder || lowerText.includes('moderate')) {
      return 'medium'
    }
    
    return 'low'
  }

  private extractTaxImplications(analysisText: string, params: ComplianceAnalysisParameters) {
    const lowerText = analysisText.toLowerCase()
    const isCrossBorder = params.original_currency !== params.home_currency
    
    // Extract withholding tax requirement
    const withholdingRequired = lowerText.includes('withholding tax') && 
                               (lowerText.includes('required') || lowerText.includes('applicable'))
    
    // Extract tax rate (look for percentage patterns)
    const rateMatch = analysisText.match(/(\d+(?:\.\d+)?)\s*%/)
    const estimatedRate = rateMatch ? parseFloat(rateMatch[1]) / 100 : 
                         (isCrossBorder ? 0.10 : 0) // Default 10% for cross-border
    
    return {
      withholding_tax_required: withholdingRequired || (isCrossBorder && params.transaction_type === 'income'),
      estimated_tax_rate: estimatedRate,
      jurisdiction: this.determineJurisdictions(params)
    }
  }

  private extractRegulatoryRequirements(analysisText: string) {
    const docs: string[] = []
    const obligations: string[] = []
    const deadlines: string[] = []
    
    // Extract documentation requirements
    if (analysisText.includes('tax residency certificate')) docs.push('Tax residency certificate')
    if (analysisText.includes('source of funds')) docs.push('Source of funds verification')
    if (analysisText.includes('wire transfer')) docs.push('International wire transfer documentation')
    if (analysisText.includes('vendor tax')) docs.push('Vendor tax identification documents')
    
    // Extract filing obligations
    if (analysisText.includes('cross-border reporting')) obligations.push('Cross-border transaction reporting')
    if (analysisText.includes('income tax declaration')) obligations.push('Income tax declaration for foreign earnings')
    if (analysisText.includes('regional compliance')) obligations.push('Regional compliance reporting may be required')
    
    // Extract deadlines
    if (analysisText.includes('annual')) deadlines.push('Annual tax filing deadline applies')
    if (analysisText.includes('quarterly')) deadlines.push('Quarterly filing deadline applies')
    
    return { documentation_required: docs, filing_obligations: obligations, deadlines }
  }

  private extractRecommendations(analysisText: string): string[] {
    const recommendations: string[] = []
    
    // Look for recommendation patterns in the text
    const recPattern = /(?:recommend|suggest|should|advise).*?[.!]/gi
    const matches = analysisText.match(recPattern) || []
    
    matches.forEach(match => {
      recommendations.push(match.trim())
    })
    
    // Add default recommendations if none found
    if (recommendations.length === 0) {
      recommendations.push('Consult with tax advisor for specific compliance requirements')
      recommendations.push('Maintain detailed transaction records')
      recommendations.push('Monitor regulatory changes in relevant jurisdictions')
    }
    
    return recommendations.slice(0, 5) // Limit to 5 recommendations
  }

  private extractIssuesIdentified(analysisText: string): Array<{category: string, severity: 'low' | 'medium' | 'high' | 'critical', description: string, recommendation: string}> {
    const issues: Array<{category: string, severity: 'low' | 'medium' | 'high' | 'critical', description: string, recommendation: string}> = []
    const lowerText = analysisText.toLowerCase()
    
    // Check for common compliance issues
    if (lowerText.includes('withholding tax') && lowerText.includes('required')) {
      issues.push({
        category: 'Tax Compliance',
        severity: 'high',
        description: 'Withholding tax obligations identified',
        recommendation: 'Ensure proper withholding tax calculation and remittance'
      })
    }
    
    if (lowerText.includes('documentation') && lowerText.includes('missing')) {
      issues.push({
        category: 'Documentation',
        severity: 'medium',
        description: 'Missing required documentation',
        recommendation: 'Obtain all required compliance documentation'
      })
    }
    
    return issues
  }

  private generateSummary(result: ComplianceAnalysisResult, params: ComplianceAnalysisParameters): string {
    const currencyPair = `${params.original_currency} to ${params.home_currency}`
    const status = result.compliance_status.replace('_', ' ')
    
    return `Cross-border ${params.transaction_type} transaction (${currencyPair}, ${params.amount} ${params.original_currency}) - Status: ${status}, Risk: ${result.risk_level}. ${result.tax_implications.withholding_tax_required ? 'Withholding tax required.' : 'No withholding tax required.'} ${result.recommendations.length} recommendations provided.`
  }

  /**
   * FALLBACK: Rule-based compliance analysis when RAG fails
   */
  private async performFallbackAnalysis(params: ComplianceAnalysisParameters): Promise<ComplianceAnalysisResult> {
    const isCrossBorder = params.original_currency !== params.home_currency
    const isHighValue = params.amount > 10000 // Threshold for enhanced scrutiny

    // Determine compliance status based on transaction characteristics
    let complianceStatus: ComplianceAnalysisResult['compliance_status'] = 'compliant'
    let riskLevel: ComplianceAnalysisResult['risk_level'] = 'low'
    const recommendations: string[] = []
    const documentationRequired: string[] = []
    const filingObligations: string[] = []
    const deadlines: string[] = []

    // Cross-border transaction analysis
    if (isCrossBorder) {
      riskLevel = isHighValue ? 'high' : 'medium'
      
      // High-value cross-border transactions require additional scrutiny
      if (isHighValue) {
        complianceStatus = 'requires_attention'
        recommendations.push('High-value cross-border transaction requires enhanced due diligence')
        documentationRequired.push('Source of funds verification')
        filingObligations.push('Cross-border transaction reporting')
      }

      // Currency-specific compliance requirements
      if (['USD', 'EUR', 'GBP'].includes(params.original_currency)) {
        recommendations.push('International currency transaction - verify AML/KYC requirements')
        documentationRequired.push('International wire transfer documentation')
      }

      // ASEAN-specific requirements
      if (['THB', 'IDR', 'MYR', 'PHP', 'VND'].includes(params.original_currency)) {
        recommendations.push('ASEAN cross-border transaction - check bilateral tax treaties')
        filingObligations.push('Regional compliance reporting may be required')
      }
    }

    // Transaction type specific analysis
    if (params.transaction_type === 'income' && isCrossBorder) {
      recommendations.push('Foreign income may be subject to withholding tax')
      documentationRequired.push('Tax residency certificate')
      filingObligations.push('Income tax declaration for foreign earnings')
      deadlines.push('Annual tax filing deadline applies')
    }

    // Vendor-specific analysis
    if (params.vendor_country && params.vendor_country !== this.inferHomeCountry(params.home_currency)) {
      riskLevel = this.escalateRiskLevel(riskLevel)
      recommendations.push(`Cross-jurisdictional transaction with ${params.vendor_country} - verify tax treaty benefits`)
      documentationRequired.push('Vendor tax identification documents')
    }

    // Calculate confidence score based on data completeness
    let confidenceScore = 0.6 // Base confidence
    if (params.vendor_country) confidenceScore += 0.1
    if (params.category) confidenceScore += 0.1
    if (params.description) confidenceScore += 0.1
    if (params.vendor_name) confidenceScore += 0.1

    return {
      compliance_status: complianceStatus,
      risk_level: riskLevel,
      tax_implications: {
        withholding_tax_required: isCrossBorder && params.transaction_type === 'income',
        estimated_tax_rate: this.estimateTaxRate(params),
        jurisdiction: this.determineJurisdictions(params)
      },
      regulatory_requirements: {
        documentation_required: documentationRequired,
        filing_obligations: filingObligations,
        deadlines: deadlines
      },
      recommendations,
      confidence_score: Math.min(confidenceScore, 1.0),
      analysis_timestamp: new Date().toISOString(),
      sources: [], // No RAG sources in fallback mode
      summary: `Rule-based fallback analysis for ${params.transaction_type} transaction (${params.original_currency} to ${params.home_currency})`,
      issues_identified: [] // No structured issues in fallback mode
    }
  }

  /**
   * Escalate risk level to the next tier
   */
  private escalateRiskLevel(currentLevel: ComplianceAnalysisResult['risk_level']): ComplianceAnalysisResult['risk_level'] {
    switch (currentLevel) {
      case 'low': return 'medium'
      case 'medium': return 'high'
      case 'high': return 'critical'
      default: return currentLevel
    }
  }

  /**
   * Infer home country from currency code
   */
  private inferHomeCountry(currency: string): string {
    const currencyToCountry: Record<string, string> = {
      'SGD': 'SG', 'THB': 'TH', 'IDR': 'ID', 'MYR': 'MY', 
      'PHP': 'PH', 'VND': 'VN', 'USD': 'US', 'EUR': 'EU',
      'GBP': 'GB', 'CNY': 'CN', 'JPY': 'JP'
    }
    return currencyToCountry[currency] || 'UNKNOWN'
  }

  /**
   * Estimate applicable tax rate
   */
  private estimateTaxRate(params: ComplianceAnalysisParameters): number {
    const isCrossBorder = params.original_currency !== params.home_currency
    
    if (!isCrossBorder) return 0
    
    // Standard withholding tax rates for ASEAN region
    const homeCountry = this.inferHomeCountry(params.home_currency)
    const foreignCountry = this.inferHomeCountry(params.original_currency)
    
    // Simplified tax rate estimation
    if (['SG', 'TH', 'MY', 'ID', 'PH', 'VN'].includes(homeCountry) && 
        ['SG', 'TH', 'MY', 'ID', 'PH', 'VN'].includes(foreignCountry)) {
      return 0.05 // 5% ASEAN preferential rate
    }
    
    return 0.15 // 15% standard international rate
  }

  /**
   * Determine applicable jurisdictions
   */
  private determineJurisdictions(params: ComplianceAnalysisParameters): string[] {
    const jurisdictions = [this.inferHomeCountry(params.home_currency)]
    
    if (params.original_currency !== params.home_currency) {
      jurisdictions.push(this.inferHomeCountry(params.original_currency))
    }
    
    if (params.vendor_country && !jurisdictions.includes(params.vendor_country)) {
      jurisdictions.push(params.vendor_country)
    }
    
    return jurisdictions
  }

  protected formatResultData(data: any[]): string {
    // This tool returns single analysis results, not arrays
    return 'Compliance analysis completed'
  }
}