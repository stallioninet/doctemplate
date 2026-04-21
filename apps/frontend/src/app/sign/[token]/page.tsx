'use client';

import dynamic from 'next/dynamic';
import { use } from 'react';

// PDF.js touches the DOM; bypass SSR entirely for the signer surface.
const SignerSurface = dynamic(() => import('@/components/SignerSurface'), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500">Loading signing session…</p>,
});

export default function SignTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <SignerSurface token={token} />;
}
