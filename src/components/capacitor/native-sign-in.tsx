'use client';

/**
 * Native Sign-In Component for Capacitor
 *
 * Replaces Clerk's pre-built <SignIn> component when running inside
 * the Capacitor WebView. Email/password works directly in the WebView.
 *
 * OAuth (Google/Apple) is intentionally excluded for the initial App Store
 * submission. Adding social login later will require also adding Sign in
 * with Apple per App Store guideline 4.8.
 */

import { useState, useCallback } from 'react';
import { useSignIn, useSignUp, useClerk } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface NativeSignInProps {
  locale: string;
  redirectUrl: string;
  signUpUrl: string;
}

export function NativeSignIn({ locale, redirectUrl, signUpUrl }: NativeSignInProps) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { signOut } = useClerk();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailSignIn = useCallback(async () => {
    if (!isLoaded || !signIn) return;
    setError('');
    setLoading(true);

    try {
      // Clear any stale session before attempting sign-in.
      // In Capacitor WKWebView, signOut() from the previous page may not
      // have fully cleared cookies by the time this page loaded.
      try {
        await signOut();
      } catch {
        // Ignore - may already be signed out
      }

      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        // Clerk will handle redirect via ClerkProvider
      } else {
        // Handle other statuses (MFA, etc.)
        setError('Additional verification required. Please try again.');
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: Array<{ longMessage?: string; message?: string }> };
      const message = clerkError.errors?.[0]?.longMessage
        || clerkError.errors?.[0]?.message
        || 'Sign in failed. Please check your credentials.';

      // If Clerk says "already signed in", the session is actually valid -
      // redirect to the app instead of showing an error
      if (message.toLowerCase().includes('already signed in')) {
        window.location.href = redirectUrl || `/${locale}`;
        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, setActive, signOut, email, password, redirectUrl, locale]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Card className="bg-card border-border w-full max-w-sm mx-4">
      <CardHeader className="text-center">
        <CardTitle className="text-foreground text-xl">Sign in to Groot Finance</CardTitle>
        <CardDescription className="text-muted-foreground">
          Enter your email and password to continue
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Email/Password Form */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              className="bg-input border-border text-foreground"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && password && handleEmailSignIn()}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              className="bg-input border-border text-foreground"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email && handleEmailSignIn()}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleEmailSignIn}
            disabled={!email || !password || loading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
            ) : null}
            Sign In
          </Button>
        </div>

        {/* Sign Up Link — hidden on native iOS (Apple 3.1.1: no registration) */}
        {signUpUrl && (
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <a href={signUpUrl} className="text-primary hover:underline">
              Sign up
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface NativeSignUpProps {
  locale: string;
  redirectUrl: string;
  signInUrl: string;
}

export function NativeSignUp({ locale, redirectUrl, signInUrl }: NativeSignUpProps) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');

  const handleEmailSignUp = useCallback(async () => {
    if (!isLoaded || !signUp) return;
    setError('');
    setLoading(true);

    try {
      const result = await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      } else {
        // Email verification needed
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setPendingVerification(true);
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: Array<{ longMessage?: string; message?: string }> };
      const message = clerkError.errors?.[0]?.longMessage
        || clerkError.errors?.[0]?.message
        || 'Sign up failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signUp, setActive, email, password, firstName, lastName]);

  const handleVerification = useCallback(async () => {
    if (!isLoaded || !signUp) return;
    setError('');
    setLoading(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: Array<{ longMessage?: string; message?: string }> };
      const message = clerkError.errors?.[0]?.longMessage
        || clerkError.errors?.[0]?.message
        || 'Verification failed.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signUp, setActive, code]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (pendingVerification) {
    return (
      <Card className="bg-card border-border w-full max-w-sm mx-4">
        <CardHeader className="text-center">
          <CardTitle className="text-foreground text-xl">Verify Your Email</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter the verification code sent to {email}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code" className="text-foreground">Verification Code</Label>
            <Input
              id="code"
              className="bg-input border-border text-foreground"
              placeholder="Enter code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && code && handleVerification()}
              disabled={loading}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleVerification}
            disabled={!code || loading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
            ) : null}
            Verify
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border w-full max-w-sm mx-4">
      <CardHeader className="text-center">
        <CardTitle className="text-foreground text-xl">Create Your Account</CardTitle>
        <CardDescription className="text-muted-foreground">
          Get started with Groot Finance
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Email/Password Form */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-foreground">First Name</Label>
              <Input
                id="firstName"
                className="bg-input border-border text-foreground"
                placeholder="First"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-foreground">Last Name</Label>
              <Input
                id="lastName"
                className="bg-input border-border text-foreground"
                placeholder="Last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signupEmail" className="text-foreground">Email</Label>
            <Input
              id="signupEmail"
              type="email"
              className="bg-input border-border text-foreground"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signupPassword" className="text-foreground">Password</Label>
            <Input
              id="signupPassword"
              type="password"
              className="bg-input border-border text-foreground"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email && password && handleEmailSignUp()}
              disabled={loading}
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleEmailSignUp}
            disabled={!email || !password || loading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
            ) : null}
            Create Account
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <a href={signInUrl} className="text-primary hover:underline">
            Sign in
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
