import React from 'react';

interface AlertBadgeProps {
  count: number;
  className?: string;
  onClick?: () => void;
}

export const AlertBadge: React.FC<AlertBadgeProps> = ({ count, className = '', onClick }) => {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center justify-center ${className}`}
      aria-label={`${count} unread notifications`}
    >
      {/* Bell Icon */}
      <svg
        className='h-6 w-6 text-gray-600 transition-colors hover:text-gray-800'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M15 17h5l-5-5V9A7 7 0 105 9v3l-5 5h5m0 0v1a3 3 0 006 0v-1m-6 0h6'
        />
      </svg>

      {/* Badge with count */}
      {count > 0 && (
        <span className='absolute -right-2 -top-2 inline-flex h-5 min-w-[20px] -translate-y-1/2 translate-x-1/2 transform items-center justify-center rounded-full bg-red-500 px-2 py-1 text-xs font-bold leading-none text-white'>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
};

export default AlertBadge;
