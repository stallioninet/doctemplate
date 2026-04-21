import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const cn = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...rest}
    className={cn(
      'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm',
      'focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500',
      className,
    )}
  />
);

export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...rest}
    className={cn(
      'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm font-mono',
      'focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500',
      className,
    )}
  />
);

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const Button = ({
  variant = 'primary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) => {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400',
    secondary:
      'bg-white text-slate-900 border border-slate-300 hover:bg-slate-100 disabled:opacity-60',
    danger:
      'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
    ghost:
      'bg-transparent text-slate-700 hover:bg-slate-100 disabled:opacity-60',
  };
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
    />
  );
};

export const Label = ({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) => (
  <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 mb-1">
    {children}
  </label>
);

export const ErrorBanner = ({ message }: { message: string | null }) =>
  message ? (
    <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  ) : null;

export const StatusPill = ({ status }: { status: string }) => {
  const palette: Record<string, string> = {
    DRAFT: 'bg-slate-200 text-slate-800',
    SENT: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    DECLINED: 'bg-red-100 text-red-800',
    VOIDED: 'bg-yellow-100 text-yellow-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    FAILED: 'bg-red-100 text-red-800',
    SIGNED: 'bg-green-100 text-green-800',
    VIEWED: 'bg-blue-100 text-blue-800',
  };
  const cls = palette[status] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      {status}
    </span>
  );
};

export const Card = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
    {children}
  </div>
);
