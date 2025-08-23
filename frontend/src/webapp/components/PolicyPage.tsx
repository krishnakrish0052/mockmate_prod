import React, { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import {
  CommandLineIcon,
  ArrowLeftIcon,
  CalendarIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  MatrixRain,
} from '../../admin/components/ui/CliComponents';
import { usePolicies } from '../../contexts/PolicyContext';
import ReactMarkdown from 'react-markdown';

const PolicyPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { getPolicyBySlug } = usePolicies();
  const [policy, setPolicy] = useState(getPolicyBySlug(slug || ''));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) {
      const foundPolicy = getPolicyBySlug(slug);
      setPolicy(foundPolicy);
    }
    setLoading(false);
  }, [slug, getPolicyBySlug]);

  if (loading) {
    return (
      <div className='matrix-bg relative flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain className='opacity-10' />
        <TerminalWindow
          title={`mockmate@legal:~$ loading --policy=${slug}`}
          className='mx-auto max-w-2xl'
        >
          <div className='p-8 text-center'>
            <TypingText
              text='Fetching legal document...'
              className='mb-4 font-mono text-lg text-primary-500'
              speed={50}
            />
            <div className='font-mono text-sm text-cli-gray'>$ cat /legal/{slug}.md</div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className='matrix-bg relative flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain className='opacity-10' />
        <TerminalWindow
          title='mockmate@legal:~$ error --policy-not-found'
          className='mx-auto max-w-2xl'
        >
          <div className='p-8 text-center'>
            <div className='mb-4 font-mono text-6xl text-red-500'>404</div>
            <TypingText
              text='Policy document not found'
              className='mb-4 font-mono text-xl text-cli-light-gray'
              speed={60}
            />
            <div className='mb-6 font-mono text-sm text-cli-gray'>
              $ find /legal/ -name "{slug}.md" → No matches found
            </div>
            <Link to='/'>
              <CliButton variant='primary' className='flex items-center'>
                <ArrowLeftIcon className='mr-2 h-4 w-4' />
                ./home --return
              </CliButton>
            </Link>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  if (!policy.isActive) {
    return <Navigate to='/' replace />;
  }

  return (
    <div className='matrix-bg relative min-h-screen bg-cli-black'>
      <MatrixRain className='opacity-5' />

      <div className='relative z-10'>
        {/* Header */}
        <header className='sticky top-0 z-20 border-b border-cli-gray bg-cli-darker'>
          <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
            <div className='flex h-16 items-center justify-between'>
              <Link to='/' className='group flex items-center space-x-3'>
                <div className='cli-terminal h-8 w-8 p-2 transition-all duration-300 group-hover:shadow-glow-golden'>
                  <CommandLineIcon className='h-full w-full text-primary-500' />
                </div>
                <span className='font-mono text-xl font-bold text-cli-white'>
                  Mock<span className='text-primary-500'>Mate</span>
                </span>
              </Link>

              <Link to='/'>
                <CliButton variant='ghost' size='sm' className='flex items-center'>
                  <ArrowLeftIcon className='mr-2 h-4 w-4' />
                  ./home
                </CliButton>
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className='mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8'>
          <TerminalWindow title={`legal@mockmate:~$ cat /legal/${policy.slug}.md`} className='mb-8'>
            <div className='p-6'>
              {/* Policy Header */}
              <div className='mb-8 border-b border-cli-gray pb-6'>
                <div className='mb-4 flex items-center space-x-3'>
                  <DocumentTextIcon className='h-8 w-8 text-primary-500' />
                  <div>
                    <TypingText
                      text={policy.title}
                      className='cli-glow font-mono text-3xl font-bold text-cli-white'
                      speed={30}
                    />
                    <div className='mt-2 font-mono text-sm text-cli-green'>
                      $ ./policy --type=legal --version={policy.version}
                    </div>
                  </div>
                </div>

                <div className='flex flex-wrap items-center gap-4 font-mono text-xs text-cli-light-gray'>
                  <div className='flex items-center space-x-2'>
                    <CalendarIcon className='h-4 w-4' />
                    <span>Effective: {new Date(policy.effectiveDate).toLocaleDateString()}</span>
                  </div>
                  <span className='text-cli-gray'>•</span>
                  <span>Version: {policy.version}</span>
                  <span className='text-cli-gray'>•</span>
                  <span>Updated: {new Date(policy.lastUpdated).toLocaleDateString()}</span>
                  <span className='text-cli-gray'>•</span>
                  <span className='text-cli-green'>Status: Active</span>
                </div>
              </div>

              {/* Policy Content */}
              <div className='prose prose-invert max-w-none'>
                <ReactMarkdown
                  className='policy-content font-mono leading-relaxed text-cli-light-gray'
                  components={{
                    h1: ({ children }) => (
                      <h1 className='cli-glow mb-6 mt-8 font-mono text-2xl font-bold text-primary-500 first:mt-0'>
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className='mb-4 mt-8 border-b border-cli-gray pb-2 font-mono text-xl font-bold text-cli-white'>
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className='mb-3 mt-6 font-mono text-lg font-bold text-primary-400'>
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className='mb-4 leading-relaxed text-cli-light-gray'>{children}</p>
                    ),
                    ul: ({ children }) => <ul className='mb-4 list-none space-y-2'>{children}</ul>,
                    li: ({ children }) => (
                      <li className='flex items-start space-x-2'>
                        <span className='mt-1 text-cli-green'>→</span>
                        <span className='text-cli-light-gray'>{children}</span>
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className='font-mono font-bold text-cli-white'>{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className='font-mono text-primary-400'>{children}</em>
                    ),
                    code: ({ children }) => (
                      <code className='rounded bg-cli-dark px-2 py-1 font-mono text-sm text-primary-500'>
                        {children}
                      </code>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className='my-4 rounded border-l-4 border-primary-500 bg-cli-dark p-4 pl-4'>
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {policy.content}
                </ReactMarkdown>
              </div>
            </div>
          </TerminalWindow>

          {/* Footer Navigation */}
          <div className='text-center'>
            <div className='mb-4 font-mono text-sm text-cli-gray'>
              $ end-of-document --policy={policy.slug}
            </div>
            <Link to='/'>
              <CliButton variant='primary' className='mx-auto flex items-center'>
                <ArrowLeftIcon className='mr-2 h-4 w-4' />
                ./return-home
              </CliButton>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PolicyPage;
