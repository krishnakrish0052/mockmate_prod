import React, { useState, useEffect } from 'react';

// Terminal Window Component
export interface TerminalWindowProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  showControls?: boolean;
}

export const TerminalWindow: React.FC<TerminalWindowProps> = ({
  children,
  className = '',
  title = 'Terminal',
  showControls = true,
}) => {
  return (
    <div className={`cli-terminal relative ${className}`}>
      {showControls && (
        <div className='flex items-center justify-between border-b border-cli-gray bg-cli-darker px-4 py-2'>
          <div className='flex items-center space-x-2'>
            <div className='h-3 w-3 rounded-full bg-red-500'></div>
            <div className='h-3 w-3 rounded-full bg-yellow-500'></div>
            <div className='h-3 w-3 rounded-full bg-green-500'></div>
          </div>
          <span className='font-mono text-sm text-cli-light-gray'>{title}</span>
          <div></div>
        </div>
      )}
      <div className='cli-scanlines relative'>{children}</div>
    </div>
  );
};

// Typing Text Effect Component
export interface TypingTextProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
  showCursor?: boolean;
}

export const TypingText: React.FC<TypingTextProps> = ({
  text,
  speed = 50,
  className = '',
  onComplete,
  showCursor = true,
}) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);

  return (
    <span className={`font-mono ${className}`}>
      {displayText}
      {showCursor && currentIndex < text.length && (
        <span className='animate-terminal-cursor text-primary-500'>|</span>
      )}
    </span>
  );
};

// CLI Button Component
export interface CliButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

export const CliButton: React.FC<CliButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  children,
  disabled,
  ...props
}) => {
  const baseClasses =
    'font-mono font-medium transition-all duration-200 border-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-cli-black disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary:
      'bg-cli-black border-primary-500 text-primary-500 hover:bg-primary-500 hover:text-cli-black hover:shadow-glow-golden',
    secondary:
      'bg-cli-dark border-cli-light-gray text-cli-light-gray hover:border-primary-500 hover:text-primary-500',
    ghost:
      'bg-transparent border-transparent text-cli-light-gray hover:border-primary-500 hover:text-primary-500',
    danger: 'bg-cli-black border-red-500 text-red-500 hover:bg-red-500 hover:text-cli-black',
  };

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className='flex items-center space-x-2'>
          <div className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent'></div>
          <span>Loading...</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
};

// CLI Input Component
export interface CliInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  showPrompt?: boolean;
}

export const CliInput: React.FC<CliInputProps> = ({
  label,
  error,
  showPrompt = false,
  className = '',
  value,
  ...props
}) => {
  // Ensure value is always controlled (never undefined)
  const controlledValue = value !== undefined ? value : '';

  return (
    <div className='space-y-2'>
      {label && (
        <label className='block font-mono text-sm font-medium text-primary-500'>{label}</label>
      )}
      <div className='relative'>
        {showPrompt && (
          <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3'>
            <span className='font-mono font-bold text-cli-green'>$</span>
          </div>
        )}
        <input
          className={`
            block w-full rounded-md border-2 border-cli-gray bg-cli-dark 
            font-mono text-cli-white placeholder-cli-light-gray
            transition-all duration-200 focus:border-primary-500 focus:outline-none 
            focus:ring-2 focus:ring-primary-500
            focus:ring-offset-2 focus:ring-offset-cli-black
            ${showPrompt ? 'pl-8' : 'pl-3'} py-2 pr-3
            ${error ? 'border-red-500' : ''}
            ${className}
          `}
          value={controlledValue}
          {...props}
        />
      </div>
      {error && <p className='font-mono text-sm text-red-400'>{error}</p>}
    </div>
  );
};

// CLI Card Component
export interface CliCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  glowing?: boolean;
  style?: React.CSSProperties;
}

export const CliCard: React.FC<CliCardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  glowing = false,
  style,
}) => {
  return (
    <div
      className={`
        cli-terminal transition-all duration-300 hover:shadow-glow-golden
        ${glowing ? 'animate-pulse-golden' : ''}
        ${className}
      `}
      style={style}
    >
      {(title || subtitle) && (
        <div className='border-b border-cli-gray px-6 py-4'>
          {title && <h3 className='font-mono text-lg font-bold text-primary-500'>{title}</h3>}
          {subtitle && <p className='mt-1 font-mono text-sm text-cli-light-gray'>{subtitle}</p>}
        </div>
      )}
      <div className='p-6'>{children}</div>
    </div>
  );
};

// Matrix Rain Background Component
export const MatrixRain: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [drops, setDrops] = useState<Array<{ id: number; left: string; delay: string }>>([]);

  useEffect(() => {
    const newDrops = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 5}s`,
    }));
    setDrops(newDrops);
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {drops.map(drop => (
        <div
          key={drop.id}
          className='absolute top-0 h-20 w-px animate-matrix-rain bg-gradient-to-b from-transparent via-cli-green to-transparent'
          style={{
            left: drop.left,
            animationDelay: drop.delay,
          }}
        />
      ))}
    </div>
  );
};

// CLI Badge Component
export interface CliBadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default';
  className?: string;
}

export const CliBadge: React.FC<CliBadgeProps> = ({
  children,
  variant = 'default',
  className = '',
}) => {
  const variantClasses = {
    success: 'bg-cli-green text-cli-black',
    warning: 'bg-primary-500 text-cli-black',
    error: 'bg-red-500 text-cli-white',
    info: 'bg-cli-cyan text-cli-black',
    default: 'bg-cli-dark text-cli-light-gray border border-cli-gray',
  };

  return (
    <span
      className={`
      inline-block rounded-sm px-2 py-1 font-mono text-xs font-bold
      ${variantClasses[variant]} ${className}
    `}
    >
      {children}
    </span>
  );
};

// Command Line Interface Component
export interface CliPromptProps {
  commands: Array<{ command: string; output?: string; delay?: number }>;
  className?: string;
  autoStart?: boolean;
}

export const CliPrompt: React.FC<CliPromptProps> = ({
  commands,
  className = '',
  autoStart = true,
}) => {
  const [currentCommandIndex, setCurrentCommandIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (autoStart && !started) {
      setStarted(true);
    }
  }, [autoStart, started]);

  const handleCommandComplete = () => {
    setIsTyping(false);
    setTimeout(() => {
      if (currentCommandIndex < commands.length - 1) {
        setCurrentCommandIndex(prev => prev + 1);
        setIsTyping(true);
      }
    }, 1000);
  };

  useEffect(() => {
    if (started && !isTyping) {
      setIsTyping(true);
    }
  }, [started, currentCommandIndex]);

  return (
    <div className={`space-y-2 font-mono text-cli-white ${className}`}>
      {commands.slice(0, currentCommandIndex).map((cmd, index) => (
        <div key={index}>
          <div className='flex items-center space-x-2'>
            <span className='text-cli-green'>$</span>
            <span>{cmd.command}</span>
          </div>
          {cmd.output && (
            <div className='whitespace-pre-wrap pl-6 text-cli-light-gray'>{cmd.output}</div>
          )}
        </div>
      ))}

      {currentCommandIndex < commands.length && started && (
        <div className='flex items-center space-x-2'>
          <span className='text-cli-green'>$</span>
          {isTyping ? (
            <TypingText
              text={commands[currentCommandIndex].command}
              onComplete={handleCommandComplete}
              speed={100}
            />
          ) : (
            <span>{commands[currentCommandIndex].command}</span>
          )}
        </div>
      )}
    </div>
  );
};
