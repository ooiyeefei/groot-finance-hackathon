'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Send, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'

type RequestType = 'bug' | 'feature' | 'general'

export default function SupportPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [type, setType] = useState<RequestType>('general')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/v1/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, type, message }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit request')
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-[#E5E7EB] px-6 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <Image
              src="/groot-wordmark.png"
              alt="Groot Finance"
              width={100}
              height={28}
              className="h-7 w-auto"
            />
          </a>
          <a
            href="/"
            className="flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#111111] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-12">
        <div className="max-w-md mx-auto">
          {isSubmitted ? (
            /* Success state */
            <div className="text-center py-16">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-semibold text-[#111111] mb-2">
                Request Submitted
              </h1>
              <p className="text-[#6B7280] mb-8">
                Thank you for reaching out. Our team will review your request and get back to you via email.
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[#111111] text-white hover:bg-[#333333] transition-colors"
              >
                Back to home
              </a>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-2xl md:text-3xl font-semibold text-[#111111] mb-2">
                  Support
                </h1>
                <p className="text-[#6B7280]">
                  Have a question, found an issue, or want to request a feature? Send us a message and our team will get back to you.
                </p>
              </div>

              {/* Contact info */}
              <div className="mb-8 p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
                <p className="text-sm text-[#6B7280]">
                  You can also reach us directly at{' '}
                  <a href="mailto:support@hellogroot.com" className="text-[#4285F4] font-medium hover:underline">
                    support@hellogroot.com
                  </a>
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name & Email row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-[#111111] mb-1.5">
                      Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-3 py-2 rounded-lg border border-[#D1D5DB] text-[#111111] text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-[#111111] mb-1.5">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full px-3 py-2 rounded-lg border border-[#D1D5DB] text-[#111111] text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Request type */}
                <div>
                  <label className="block text-sm font-medium text-[#111111] mb-1.5">
                    Type
                  </label>
                  <div className="flex gap-2">
                    {([
                      { value: 'general', label: 'General' },
                      { value: 'bug', label: 'Bug Report' },
                      { value: 'feature', label: 'Feature Request' },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setType(option.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          type === option.value
                            ? 'bg-[#111111] text-white'
                            : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-[#111111] mb-1.5">
                    Message
                  </label>
                  <textarea
                    id="message"
                    required
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your question, issue, or feature request..."
                    className="w-full px-3 py-2 rounded-lg border border-[#D1D5DB] text-[#111111] text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:border-transparent resize-y"
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-[#111111] text-white hover:bg-[#333333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Request
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] px-6 py-4">
        <p className="text-xs text-[#6B7280] text-center">
          &copy; {currentYear} Groot. Simplifying financial management for businesses.
        </p>
      </footer>
    </div>
  )
}
