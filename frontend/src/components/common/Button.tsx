import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-sans font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-forest hover:bg-forest-hover text-white shadow-card focus:ring-forest border border-forest-dark/30',
    secondary: 'bg-surface hover:bg-canvas text-ink-800 border border-ink-200 shadow-subtle hover:border-ink-300 focus:ring-ink-400',
    danger: 'bg-red-700 hover:bg-red-800 text-white shadow-card focus:ring-red-600 border border-red-900/30',
    ghost: 'bg-transparent hover:bg-ink-100 text-ink-700 focus:ring-ink-400',
  };

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5 space-x-1.5',
    md: 'text-xs sm:text-sm px-3.5 py-2 space-x-2',
    lg: 'text-sm sm:text-base px-4 py-2.5 space-x-2.5',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin -ml-0.5 mr-2 h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
