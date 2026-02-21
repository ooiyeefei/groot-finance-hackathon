'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, LogIn, LogOut, Timer, MapPin, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useActiveBusiness } from '@/contexts/business-context'
import { useMyTodayAttendance, useCheckIn, useCheckOut } from '../hooks/use-attendance'

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hrs === 0) return `${mins} min`
  return `${hrs} hrs ${mins} min`
}

export default function CheckInWidget() {
  const { businessId } = useActiveBusiness()
  const attendance = useMyTodayAttendance(businessId ?? undefined)
  const { checkIn, isLoading: isCheckingIn } = useCheckIn()
  const { checkOut, isLoading: isCheckingOut } = useCheckOut()

  const [elapsedMinutes, setElapsedMinutes] = useState(0)
  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

  // attendance is undefined while loading, null when no record
  const isLoading = attendance === undefined
  const isCheckedIn = !!attendance && !!attendance.checkInTime && !attendance.checkOutTime
  const isComplete = !!attendance && !!attendance.checkOutTime

  useEffect(() => {
    if (!isCheckedIn || !attendance?.checkInTime) {
      setElapsedMinutes(0)
      return
    }
    const calculate = () => Math.floor((Date.now() - attendance.checkInTime) / 60000)
    setElapsedMinutes(calculate())
    const interval = setInterval(() => setElapsedMinutes(calculate()), 60000)
    return () => clearInterval(interval)
  }, [isCheckedIn, attendance?.checkInTime])

  useEffect(() => {
    if (!notification) return
    const timeout = setTimeout(() => setNotification(null), 3000)
    return () => clearTimeout(timeout)
  }, [notification])

  const handleCheckIn = useCallback(async () => {
    if (!businessId) return
    let location: { lat: number; lng: number; accuracy: number } | undefined
    try {
      if (navigator.geolocation) {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0,
            })
        )
        location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }
      }
    } catch {
      // Geolocation is optional
    }
    try {
      await checkIn(businessId, location)
      setNotification({ message: 'Checked in successfully', type: 'success' })
    } catch {
      setNotification({ message: 'Failed to check in', type: 'error' })
    }
  }, [businessId, checkIn])

  const handleCheckOut = useCallback(async () => {
    if (!businessId) return
    try {
      await checkOut(businessId)
      setNotification({ message: 'Checked out successfully', type: 'success' })
    } catch {
      setNotification({ message: 'Failed to check out', type: 'error' })
    }
  }, [businessId, checkOut])

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading attendance...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        {notification && (
          <div
            className={`mb-3 rounded-md px-3 py-2 text-sm font-medium ${
              notification.type === 'success'
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {notification.message}
          </div>
        )}

        {!attendance && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Not checked in</p>
                <p className="text-xs text-muted-foreground">Start your work day</p>
              </div>
            </div>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              size="sm"
              onClick={handleCheckIn}
              disabled={isCheckingIn}
            >
              {isCheckingIn ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <LogIn className="h-4 w-4 mr-1" />
              )}
              Check In
            </Button>
          </div>
        )}

        {isCheckedIn && attendance && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
                <Timer className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">
                    Checked in at {formatTime(attendance.checkInTime)}
                  </p>
                  {attendance.location && (
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Working for {formatDuration(elapsedMinutes)}
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCheckOut}
              disabled={isCheckingOut}
            >
              {isCheckingOut ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <LogOut className="h-4 w-4 mr-1" />
              )}
              Check Out
            </Button>
          </div>
        )}

        {isComplete && attendance && (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Checked out</p>
              <p className="text-xs text-muted-foreground">
                {formatTime(attendance.checkInTime)} &ndash;{' '}
                {formatTime(attendance.checkOutTime!)}{' '}
                &middot; {formatDuration(attendance.totalMinutes ?? 0)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
