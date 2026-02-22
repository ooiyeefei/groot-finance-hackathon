'use client';

/**
 * Native Sign-In Component for Capacitor
 *
 * Replaces Clerk's pre-built <SignIn> component when running inside
 * the Capacitor WebView. Google blocks OAuth in WKWebView, so we
 * route social sign-in through SFSafariViewController via the auth bridge.
 *
 * Email/password works directly in the WebView — no bridge needed.
 */

import { useState, useCallback } from 'react';
import { useSignIn, useSignUp } from '@clerk/nextjs';
import { OAuthStrategy } from '@clerk/types';
import { openOAuthInSystemBrowser } from '@/lib/capacitor/auth-bridge';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleEmailSignIn = useCallback(async () => {
    if (!isLoaded || !signIn) return;
    setError('');
    setLoading(true);

    try {
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
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, setActive, email, password]);

  const handleOAuthSignIn = useCallback(async (strategy: OAuthStrategy) => {
    if (!isLoaded || !signIn) return;
    setError('');
    setOauthLoading(strategy);

    try {
      // Create OAuth sign-in attempt with custom scheme callback
      const result = await signIn.create({
        strategy,
        redirectUrl: 'finanseal://oauth-callback',
        actionCompleteRedirectUrl: 'finanseal://oauth-callback',
      });

      const authUrl = result.firstFactorVerification.externalVerificationRedirectURL;
      if (!authUrl) {
        setError('Could not start sign-in. Please try again.');
        setOauthLoading(null);
        return;
      }

      // Open OAuth URL in SFSafariViewController (not the WebView)
      await openOAuthInSystemBrowser(authUrl.toString());

      // After callback, reload sign-in status from Clerk
      const reloaded = await signIn.reload();

      if (reloaded.status === 'complete' && reloaded.createdSessionId) {
        await setActive({ session: reloaded.createdSessionId });
      } else {
        setError('Sign-in was not completed. Please try again.');
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: Array<{ longMessage?: string; message?: string }> };
      const message = clerkError.errors?.[0]?.longMessage
        || clerkError.errors?.[0]?.message
        || 'OAuth sign-in failed. Please try again.';
      setError(message);
    } finally {
      setOauthLoading(null);
    }
  }, [isLoaded, signIn, setActive]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Card className="bg-card border-border w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-foreground text-xl">Sign in to FinanSEAL</CardTitle>
        <CardDescription className="text-muted-foreground">
          Choose your preferred sign-in method
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* OAuth Buttons */}
        <Button
          className="w-full bg-card hover:bg-muted text-foreground border border-border"
          variant="outline"
          onClick={() => handleOAuthSignIn('oauth_google')}
          disabled={!!oauthLoading || loading}
        >
          {oauthLoading === 'oauth_google' ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground mr-2" />
          ) : (
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Continue with Google
        </Button>

        <Button
          className="w-full bg-card hover:bg-muted text-foreground border border-border"
          variant="outline"
          onClick={() => handleOAuthSignIn('oauth_apple')}
          disabled={!!oauthLoading || loading}
        >
          {oauthLoading === 'oauth_apple' ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground mr-2" />
          ) : (
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          )}
          Continue with Apple
        </Button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

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
              disabled={loading || !!oauthLoading}
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
              disabled={loading || !!oauthLoading}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleEmailSignIn}
            disabled={!email || !password || loading || !!oauthLoading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
            ) : null}
            Sign In
          </Button>
        </div>

        {/* Sign Up Link */}
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <a href={signUpUrl} className="text-primary hover:underline">
            Sign up
          </a>
        </p>
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
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
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

  const handleOAuthSignUp = useCallback(async (strategy: OAuthStrategy) => {
    if (!isLoaded || !signUp) return;
    setError('');
    setOauthLoading(strategy);

    try {
      const result = await signUp.create({
        strategy,
        redirectUrl: 'finanseal://oauth-callback',
        actionCompleteRedirectUrl: 'finanseal://oauth-callback',
      });

      const authUrl = result.verifications.externalAccount.externalVerificationRedirectURL;
      if (!authUrl) {
        setError('Could not start sign-up. Please try again.');
        setOauthLoading(null);
        return;
      }

      await openOAuthInSystemBrowser(authUrl.toString());

      const reloaded = await signUp.reload();

      if (reloaded.status === 'complete' && reloaded.createdSessionId) {
        await setActive({ session: reloaded.createdSessionId });
      } else {
        setError('Sign-up was not completed. Please try again.');
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: Array<{ longMessage?: string; message?: string }> };
      const message = clerkError.errors?.[0]?.longMessage
        || clerkError.errors?.[0]?.message
        || 'OAuth sign-up failed. Please try again.';
      setError(message);
    } finally {
      setOauthLoading(null);
    }
  }, [isLoaded, signUp, setActive]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (pendingVerification) {
    return (
      <Card className="bg-card border-border w-full max-w-sm">
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
    <Card className="bg-card border-border w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-foreground text-xl">Create Your Account</CardTitle>
        <CardDescription className="text-muted-foreground">
          Get started with FinanSEAL
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* OAuth Buttons */}
        <Button
          className="w-full bg-card hover:bg-muted text-foreground border border-border"
          variant="outline"
          onClick={() => handleOAuthSignUp('oauth_google')}
          disabled={!!oauthLoading || loading}
        >
          {oauthLoading === 'oauth_google' ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground mr-2" />
          ) : (
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Continue with Google
        </Button>

        <Button
          className="w-full bg-card hover:bg-muted text-foreground border border-border"
          variant="outline"
          onClick={() => handleOAuthSignUp('oauth_apple')}
          disabled={!!oauthLoading || loading}
        >
          {oauthLoading === 'oauth_apple' ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground mr-2" />
          ) : (
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          )}
          Continue with Apple
        </Button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

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
                disabled={loading || !!oauthLoading}
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
                disabled={loading || !!oauthLoading}
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
              disabled={loading || !!oauthLoading}
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
              disabled={loading || !!oauthLoading}
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleEmailSignUp}
            disabled={!email || !password || loading || !!oauthLoading}
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
