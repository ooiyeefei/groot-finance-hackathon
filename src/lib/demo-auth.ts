/**
 * Demo Auth Bypass — Hackathon Demo Mode
 *
 * When DEMO_MODE=true, all auth checks return a hardcoded demo user.
 * This allows the app to run without Clerk authentication.
 */

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// Hardcoded demo user from Convex production
export const DEMO_USER = {
  userId: 'user_39b0XuoRawLEh1V6G8rrXpfzE6P',
  convexUserId: 'kd77qngqyj89s5yyr9jtv9f5qn812rnj',
  businessId: 'jd751yr6vefpscp3yzmhnnrqax812bcb',
  email: 'demo@financecopilot.ai',
  fullName: 'Finance Admin Kate',
  role: 'finance_admin' as const,
}

/**
 * Get auth context — returns demo user in demo mode, or null.
 * API routes should call this instead of Clerk's auth().
 */
export function getDemoAuth() {
  if (!DEMO_MODE) return null
  return {
    userId: DEMO_USER.userId,
    sessionId: 'demo-session',
    getToken: async () => null,
  }
}
