import type { ReactNode } from 'react';

/**
 * Minimal centered layout for the public signer surface — no sidebar nav,
 * no auth gate. The token in the URL is the only authentication.
 */
export default function SigningLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  );
}
