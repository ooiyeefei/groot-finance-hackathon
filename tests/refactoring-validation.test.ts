/**
 * Refactoring Validation Test
 * Validates that the expense claims domain refactoring was completed successfully
 * This test verifies that all components and hooks can be imported from their new locations
 */

describe('Expense Claims Domain Refactoring Validation', () => {
  test('should import components from new domain structure', () => {
    // Test importing components from the new domain structure
    expect(() => {
      require('../src/domains/expense-claims/components/expense-form-fields')
      require('../src/domains/expense-claims/components/create-expense-page-new')
      require('../src/domains/expense-claims/components/edit-expense-modal-new')
      require('../src/domains/expense-claims/components/expense-submission-flow')
    }).not.toThrow()
  })

  test('should import hooks from new domain structure', () => {
    // Test importing hooks from the new domain structure
    expect(() => {
      require('../src/domains/expense-claims/hooks/use-expense-form')
      require('../src/domains/expense-claims/hooks/use-expense-categories')
      require('../src/domains/expense-claims/hooks/use-expense-claims')
      require('../src/domains/expense-claims/hooks/use-expense-claim-processing')
    }).not.toThrow()
  })

  test('should import data access from new Golden Structure', () => {
    // Test importing from the lib/data-access.ts location
    expect(() => {
      require('../src/domains/expense-claims/lib/data-access')
    }).not.toThrow()
  })

  test('should import types from new Golden Structure', () => {
    // Test importing from the types/index.ts location
    expect(() => {
      require('../src/domains/expense-claims/types')
    }).not.toThrow()
  })

  test('should verify Golden Structure directory layout', () => {
    const fs = require('fs')
    const path = require('path')

    const domainPath = path.resolve(__dirname, '../src/domains/expense-claims')

    // Verify all required directories exist
    expect(fs.existsSync(path.join(domainPath, 'components'))).toBe(true)
    expect(fs.existsSync(path.join(domainPath, 'hooks'))).toBe(true)
    expect(fs.existsSync(path.join(domainPath, 'lib'))).toBe(true)
    expect(fs.existsSync(path.join(domainPath, 'types'))).toBe(true)

    // Verify key files exist in correct locations
    expect(fs.existsSync(path.join(domainPath, 'lib/data-access.ts'))).toBe(true)
    expect(fs.existsSync(path.join(domainPath, 'types/index.ts'))).toBe(true)

    // Verify at least some components were moved
    const componentsDir = path.join(domainPath, 'components')
    const componentFiles = fs.readdirSync(componentsDir)
    expect(componentFiles.length).toBeGreaterThan(10) // Should have 18 components

    // Verify at least some hooks were moved
    const hooksDir = path.join(domainPath, 'hooks')
    const hookFiles = fs.readdirSync(hooksDir)
    expect(hookFiles.length).toBeGreaterThan(2) // Should have 4 hooks
  })
})