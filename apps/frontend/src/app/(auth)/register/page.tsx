'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth, type AuthSession } from '@/lib/auth';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<AuthSession>('/api/auth/register', {
        method: 'POST',
        body: { organizationName, organizationSlug, email, password },
      });
      setSession({ token: result.token, user: result.user });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold">Create your organization</h1>
      <div>
        <Label htmlFor="orgName">Organization name</Label>
        <Input
          id="orgName"
          required
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="orgSlug">Organization slug</Label>
        <Input
          id="orgSlug"
          required
          placeholder="acme"
          pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?"
          value={organizationSlug}
          onChange={(e) => setOrganizationSlug(e.target.value.toLowerCase())}
        />
        <p className="mt-1 text-xs text-slate-500">
          Lowercase letters, digits and hyphens. Must be globally unique.
        </p>
      </div>
      <div>
        <Label htmlFor="email">Owner email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">Minimum 8 characters.</p>
      </div>
      <ErrorBanner message={error} />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Creating…' : 'Create organization'}
      </Button>
      <p className="text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-slate-900 underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
