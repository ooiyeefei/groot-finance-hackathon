'use client'

import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Gift } from 'lucide-react'

export function EarnHeaderButton() {
  const router = useRouter()
  const locale = useLocale()

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 group"
            onClick={() => router.push(`/${locale}/referral`)}
          >
            <Gift className="h-4 w-4 transition-transform group-hover:scale-110" />
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-green-500 px-0.5 text-[8px] font-bold text-white">
              $
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Earn $ with referrals</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
