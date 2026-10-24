import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Loading content...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-8 h-8 rounded-full border-2 border-forest border-t-transparent animate-spin mb-3"></div>
      <p className="text-xs text-ink-500 font-medium">{message}</p>
    </div>
  );
};

export const ErrorBanner: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}> = ({
  title = 'System Error',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div className={`p-4 rounded-lg bg-critical-bg border border-critical-border text-critical-text flex items-start space-x-3 ${className}`}>
      <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="text-xs mt-0.5">{message}</p>
        {onRetry && (
          <div className="mt-3">
            <Button
              onClick={onRetry}
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
