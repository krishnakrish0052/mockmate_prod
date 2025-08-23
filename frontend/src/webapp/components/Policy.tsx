import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CommandLineIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliBadge,
} from './ui/CliComponents';
import { usePolicies, Policy as PolicyType } from '../../contexts/PolicyContext';

const Policy: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { getPolicyBySlug } = usePolicies();
  const [policy, setPolicy] = useState<PolicyType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('🔍 Policy component: Looking for slug:', slug);

    if (slug) {
      setLoading(true);
      setError(null);

      const foundPolicy = getPolicyBySlug(slug);
      console.log('🔍 Found policy:', foundPolicy);

      if (foundPolicy) {
        if (foundPolicy.isActive) {
          setPolicy(foundPolicy);
          console.log('✅ Policy loaded successfully:', foundPolicy.title);
        } else {
          setError('This policy is currently inactive');
          console.log('⚠️ Policy found but inactive:', foundPolicy.title);
        }
      } else {
        setError('Policy not found');
        console.log('❌ Policy not found for slug:', slug);
      }

      setLoading(false);
    }
  }, [slug, getPolicyBySlug]);

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content
      .split('\n\n')
      .map((paragraph, index) => {
        if (paragraph.startsWith('# ')) {
          return (
            <h2 key={index} className='mb-4 mt-8 font-mono text-2xl font-bold text-primary-500'>
              <span className='text-cli-green'>$</span> {paragraph.substring(2)}
            </h2>
          );
        } else if (paragraph.startsWith('## ')) {
          return (
            <h3 key={index} className='mb-3 mt-6 font-mono text-xl font-bold text-cli-white'>
              <span className='text-cli-green'>&gt;</span> {paragraph.substring(3)}
            </h3>
          );
        } else if (paragraph.startsWith('### ')) {
          return (
            <h4 key={index} className='mb-2 mt-4 font-mono text-lg font-bold text-cli-cyan'>
              <span className='text-cli-green'>-</span> {paragraph.substring(4)}
            </h4>
          );
        } else if (paragraph.startsWith('- ')) {
          const listItems = paragraph.split('\n').filter(item => item.startsWith('- '));
          return (
            <ul key={index} className='mb-4 ml-6 space-y-2'>
              {listItems.map((item, itemIndex) => (
                <li
                  key={itemIndex}
                  className='flex items-start font-mono text-sm text-cli-light-gray'
                >
                  <span className='mr-2 text-cli-green'>•</span>
                  <span>{item.substring(2)}</span>
                </li>
              ))}
            </ul>
          );
        } else if (paragraph.trim()) {
          return (
            <p key={index} className='mb-4 font-mono text-sm leading-relaxed text-cli-light-gray'>
              {paragraph}
            </p>
          );
        }
        return null;
      })
      .filter(Boolean);
  };

  const getPolicyIcon = (policySlug: string) => {
    switch (policySlug) {
      case 'privacy-policy':
        return <DocumentTextIcon className='h-6 w-6' />;
      case 'terms-of-service':
        return <ExclamationTriangleIcon className='h-6 w-6' />;
      default:
        return <DocumentTextIcon className='h-6 w-6' />;
    }
  };

  const getPolicyTitle = (policySlug: string) => {
    switch (policySlug) {
      case 'privacy-policy':
        return 'Privacy Policy';
      case 'terms-of-service':
        return 'Terms of Service';
      default:
        return 'Legal Document';
    }
  };

  if (loading) {
    return (
      <div className='matrix-bg min-h-screen bg-cli-black'>
        <MatrixRain />
        <div className='relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8'>
          <TerminalWindow title={`mockmate@legal:~$ loading-policy --${slug}`} className='mb-8'>
            <div className='p-8 text-center'>
              <TypingText
                text='Loading policy content...'
                className='mb-4 font-mono text-lg text-primary-500'
                speed={60}
              />
              <div className='font-mono text-sm text-cli-gray'>$ ./fetch-policy --slug={slug}</div>
            </div>
          </TerminalWindow>
        </div>
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className='matrix-bg min-h-screen bg-cli-black'>
        <MatrixRain />
        <div className='relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8'>
          <TerminalWindow title={`mockmate@legal:~$ error-404`} className='mb-8'>
            <div className='p-8 text-center'>
              <CliBadge variant='warning' className='mb-6'>
                ERROR: POLICY NOT FOUND
              </CliBadge>

              <h1 className='mb-4 font-mono text-3xl font-bold text-cli-white'>
                <span className='text-cli-red'>$</span> Policy Not Found
              </h1>

              <p className='mb-6 font-mono text-cli-light-gray'>
                {error || `The policy "${slug}" could not be found or is not available.`}
              </p>

              <div className='flex flex-col justify-center gap-4 sm:flex-row'>
                <Link to='/'>
                  <CliButton variant='primary' size='md' className='flex items-center'>
                    <ArrowLeftIcon className='mr-2 h-4 w-4' />
                    ./back-to-home
                  </CliButton>
                </Link>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </div>
    );
  }

  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />

      {/* Header */}
      <header className='relative z-10 border-b border-cli-gray bg-cli-darker'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between py-4'>
            <Link to='/' className='group flex items-center space-x-3'>
              <div className='cli-terminal h-10 w-10 p-2 transition-all duration-300 group-hover:shadow-glow-golden'>
                <CommandLineIcon className='h-full w-full text-primary-500' />
              </div>
              <span className='cli-glow font-mono text-2xl font-bold text-cli-white'>
                Mock<span className='text-primary-500'>Mate</span>
              </span>
            </Link>

            <div className='flex items-center space-x-4'>
              <Link to='/'>
                <CliButton variant='ghost' size='sm'>
                  <ArrowLeftIcon className='mr-2 h-4 w-4' />
                  ./back-to-home
                </CliButton>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8'>
        {/* Policy Header */}
        <TerminalWindow title={`mockmate@legal:~$ cat /${slug}.md`} className='mb-8'>
          <div className='p-8'>
            <div className='mb-6 flex items-start space-x-4'>
              <div className='cli-terminal flex-shrink-0 p-3 text-primary-500'>
                {getPolicyIcon(slug || '')}
              </div>
              <div className='flex-1'>
                <CliBadge variant='info' className='mb-4'>
                  LEGAL DOCUMENT v{policy.version}
                </CliBadge>

                <TypingText
                  text={policy.title || getPolicyTitle(slug || '')}
                  className='cli-glow mb-4 font-mono text-3xl font-bold text-primary-500'
                  speed={40}
                />

                <div className='flex flex-wrap items-center gap-4 font-mono text-sm text-cli-light-gray'>
                  <div className='flex items-center'>
                    <span className='text-cli-green'>•</span>
                    <span className='ml-2'>Version: {policy.version}</span>
                  </div>
                  <div className='flex items-center'>
                    <span className='text-cli-green'>•</span>
                    <span className='ml-2'>
                      Effective: {new Date(policy.effectiveDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className='flex items-center'>
                    <span className='text-cli-green'>•</span>
                    <span className='ml-2'>
                      Updated: {new Date(policy.lastUpdated).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TerminalWindow>

        {/* Policy Content */}
        <CliCard className='mb-8'>
          <div className='p-8'>
            <div className='prose-cli prose max-w-none'>{formatContent(policy.content)}</div>
          </div>
        </CliCard>

        {/* Footer Navigation */}
        <div className='text-center'>
          <CliBadge variant='success' className='mb-4'>
            END OF DOCUMENT
          </CliBadge>

          <div className='flex flex-col justify-center gap-4 sm:flex-row'>
            <Link to='/'>
              <CliButton variant='primary' size='md' className='flex items-center'>
                <ArrowLeftIcon className='mr-2 h-4 w-4' />
                ./back-to-home
              </CliButton>
            </Link>

            {slug === 'privacy-policy' && (
              <Link to='/terms-of-service'>
                <CliButton variant='secondary' size='md'>
                  ./view-terms-of-service
                </CliButton>
              </Link>
            )}

            {slug === 'terms-of-service' && (
              <Link to='/privacy-policy'>
                <CliButton variant='secondary' size='md'>
                  ./view-privacy-policy
                </CliButton>
              </Link>
            )}
          </div>

          <p className='mt-6 font-mono text-xs text-cli-light-gray'>
            Questions about this policy? Contact us at legal@mockmate.com
          </p>
        </div>
      </div>
    </div>
  );
};

export default Policy;
