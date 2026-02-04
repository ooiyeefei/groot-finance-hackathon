/**
 * Public Holidays API
 *
 * Fetches country-specific public holidays using the date-holidays library.
 *
 * GET /api/v1/leave-management/holidays?country=MY&year=2025
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Holidays from 'date-holidays'

// Supported SEA countries
const SUPPORTED_COUNTRIES: Record<string, string> = {
  MY: 'Malaysia',
  SG: 'Singapore',
  ID: 'Indonesia',
  PH: 'Philippines',
  TH: 'Thailand',
  VN: 'Vietnam',
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const countryCode = searchParams.get('country')?.toUpperCase()
    const yearStr = searchParams.get('year')
    const year = yearStr ? parseInt(yearStr) : new Date().getFullYear()

    // Validate country code
    if (!countryCode || !SUPPORTED_COUNTRIES[countryCode]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid country code. Supported: ${Object.keys(SUPPORTED_COUNTRIES).join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate year
    if (isNaN(year) || year < 2020 || year > 2030) {
      return NextResponse.json(
        { success: false, error: 'Year must be between 2020 and 2030' },
        { status: 400 }
      )
    }

    // Initialize date-holidays for the country
    const hd = new Holidays(countryCode)

    // Get holidays for the year
    const rawHolidays = hd.getHolidays(year)

    // Filter to only public holidays (not observances or optional)
    const publicHolidays = rawHolidays
      .filter((h) => h.type === 'public')
      .map((h) => ({
        date: h.date.split(' ')[0], // Extract YYYY-MM-DD from datetime string
        name: h.name,
        type: h.type,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    console.log(
      `[Holidays API] Fetched ${publicHolidays.length} public holidays for ${countryCode} ${year}`
    )

    return NextResponse.json({
      success: true,
      data: {
        country: countryCode,
        countryName: SUPPORTED_COUNTRIES[countryCode],
        year,
        holidays: publicHolidays,
        totalCount: publicHolidays.length,
      },
    })
  } catch (error) {
    console.error('[Holidays API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch holidays' },
      { status: 500 }
    )
  }
}
