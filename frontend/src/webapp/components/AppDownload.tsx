import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  StarIcon,
  ShieldCheckIcon,
  CloudIcon,
  BoltIcon,
  CommandLineIcon,
  EyeSlashIcon,
  SpeakerWaveIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliBadge,
} from './ui/CliComponents';

const AppDownload: React.FC = () => {
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);

  useEffect(() => {
    fetchAppDownloads();
  }, []);

  const fetchAppDownloads = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/apps/available');
      const result = await response.json();

      if (result.success) {
        setPlatforms(result.data.platforms);
        setDetectedPlatform(result.data.detectedPlatform);
      } else {
        setError('Failed to load app downloads');
        setPlatforms(
          platformDownloads.map(p => ({
            platform: p.platform.toLowerCase(),
            displayName: p.platform,
            icon: p.platform === 'iOS' || p.platform === 'Android' ? 'fa-mobile' : 'fa-desktop',
            isDetected: false,
            versions: [
              {
                id: p.platform.toLowerCase(),
                version: p.version.replace('v', ''),
                fileName: `mockmate-${p.platform.toLowerCase()}.pkg`,
                fileSize: p.size,
                isBeta: p.status === 'beta',
                isFeatured: p.badge === 'LIVE',
                isLatest: true,
                minOsVersion: p.requirements,
                downloadCount: Math.floor(Math.random() * 10000) + 1000,
                createdAt: new Date().toISOString(),
              },
            ],
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching app downloads:', err);
      setError('Failed to connect to server');
      setPlatforms(
        platformDownloads.map(p => ({
          platform: p.platform.toLowerCase(),
          displayName: p.platform,
          icon: p.platform === 'iOS' || p.platform === 'Android' ? 'fa-mobile' : 'fa-desktop',
          isDetected: false,
          versions: [
            {
              id: p.platform.toLowerCase(),
              version: p.version.replace('v', ''),
              fileName: `mockmate-${p.platform.toLowerCase()}.pkg`,
              fileSize: p.size,
              isBeta: p.status === 'beta',
              isFeatured: p.badge === 'LIVE',
              isLatest: true,
              minOsVersion: p.requirements,
              downloadCount: Math.floor(Math.random() * 10000) + 1000,
              createdAt: new Date().toISOString(),
            },
          ],
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const appFeatures = [
    {
      icon: EyeSlashIcon,
      title: '100% Stealth Mode',
      description:
        'Completely undetectable interview assistance. No traces left behind, seamless integration during live calls.',
      color: 'text-cli-green',
    },
    {
      icon: SpeakerWaveIcon,
      title: 'Fast Transcription',
      description:
        'Real-time audio processing with lightning-fast transcription. Get instant text from interview questions.',
      color: 'text-cli-cyan',
    },
    {
      icon: ChatBubbleLeftRightIcon,
      title: 'Real-Time Answers',
      description:
        'Instant AI-generated responses during live interviews. Get perfect answers within seconds.',
      color: 'text-primary-500',
    },
    {
      icon: DocumentTextIcon,
      title: 'Context-Aware AI',
      description:
        'Answers tailored to your resume, job description, and company details. Personalized and relevant responses.',
      color: 'text-cli-golden',
    },
    {
      icon: ArrowPathIcon,
      title: 'Lightweight Design',
      description:
        'Minimal system resources usage. Fast startup, low memory footprint, optimized for performance.',
      color: 'text-cli-purple',
    },
    {
      icon: ShieldCheckIcon,
      title: 'Enhanced Security',
      description:
        'End-to-end encryption for all your interview data and personal information. Zero data retention policy.',
      color: 'text-cli-red',
    },
  ];

  const platformDownloads = [
    {
      platform: 'iOS',
      icon: DevicePhoneMobileIcon,
      version: 'v2.1.0',
      size: '45.2 MB',
      requirements: 'iOS 14.0+',
      downloadUrl: '#',
      status: 'available',
      badge: 'LIVE',
    },
    {
      platform: 'Android',
      icon: DevicePhoneMobileIcon,
      version: 'v2.1.0',
      size: '38.7 MB',
      requirements: 'Android 8.0+',
      downloadUrl: '#',
      status: 'available',
      badge: 'LIVE',
    },
    {
      platform: 'Windows',
      icon: ComputerDesktopIcon,
      version: 'v2.0.5',
      size: '127.4 MB',
      requirements: 'Windows 10+',
      downloadUrl: '#',
      status: 'available',
      badge: 'STABLE',
    },
    {
      platform: 'macOS',
      icon: ComputerDesktopIcon,
      version: 'v2.0.5',
      size: '142.1 MB',
      requirements: 'macOS 11.0+',
      downloadUrl: '#',
      status: 'available',
      badge: 'STABLE',
    },
    {
      platform: 'Linux',
      icon: ComputerDesktopIcon,
      version: 'v2.0.3',
      size: '98.6 MB',
      requirements: 'Ubuntu 20.04+',
      downloadUrl: '#',
      status: 'beta',
      badge: 'BETA',
    },
  ];

  const handleDownload = (versionId: string, platform: string) => {
    console.log(`Downloading MockMate for ${platform}`);
    const link = document.createElement('a');
    link.href = `/api/apps/download/${versionId}`;
    link.download = `mockmate-${platform.toLowerCase()}.pkg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTitle = (title: string) => {
    return title.toLowerCase().split(' ').join('-');
  };

  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />

      <header className='relative z-10 border-b border-cli-gray bg-cli-darker'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between py-4'>
            <Link to='/dashboard' className='group flex items-center space-x-3'>
              <div className='cli-terminal h-10 w-10 p-2 transition-all duration-300 group-hover:shadow-glow-golden'>
                <CommandLineIcon className='h-full w-full text-primary-500' />
              </div>
              <span className='cli-glow font-mono text-2xl font-bold text-cli-white'>
                Mock<span className='text-primary-500'>Mate</span>
              </span>
            </Link>

            <div className='flex items-center space-x-4'>
              <Link to='/dashboard'>
                <CliButton variant='ghost' size='sm'>
                  ./back-to-dashboard
                </CliButton>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        <TerminalWindow title='mockmate@downloads: get-apps --all-platforms' className='mb-8'>
          <div className='p-8 text-center'>
            <CliBadge variant='success' className='mb-6 animate-pulse'>
              MULTI-PLATFORM READY
            </CliBadge>

            <TypingText
              text='Download MockMate Apps'
              className='cli-glow mb-6 font-mono text-4xl font-bold text-primary-500'
              speed={60}
            />

            <p className='mx-auto mb-8 max-w-3xl font-mono text-xl text-cli-light-gray'>
              Take your interview preparation anywhere with our native apps.
              <span className='text-primary-500'> Same powerful AI</span>, now available on all your
              devices.
            </p>

            <div className='flex flex-col justify-center gap-4 sm:flex-row'>
              <CliButton
                variant='primary'
                size='lg'
                className='group flex items-center justify-center'
              >
                <ArrowDownTrayIcon className='mr-2 h-5 w-5' />
                <span>./download --auto-detect</span>
              </CliButton>
              <CliButton variant='secondary' size='lg'>
                ./view-all-platforms
              </CliButton>
            </div>

            <div className='mt-6 flex items-center justify-center space-x-4 font-mono text-sm text-cli-light-gray'>
              <span className='text-cli-green'>✓</span>
              <span>Free downloads</span>
              <span className='text-cli-gray'>•</span>
              <span className='text-cli-green'>✓</span>
              <span>No ads</span>
              <span className='text-cli-gray'>•</span>
              <span className='text-cli-green'>✓</span>
              <span>Same account sync</span>
            </div>
          </div>
        </TerminalWindow>

        <section className='mb-12'>
          <div className='mb-8 text-center'>
            <CliBadge variant='info' className='mb-4'>
              NATIVE APP FEATURES
            </CliBadge>
            <h2 className='mb-4 font-mono text-3xl font-bold text-cli-white'>
              <span className='text-cli-green'>$</span> cat features-native-apps.json
            </h2>
          </div>

          <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
            {appFeatures.map((feature, index) => (
              <CliCard
                key={feature.title}
                className='animate-slide-up transition-all duration-500 hover:scale-105'
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className='flex items-start space-x-4 p-6'>
                  <div className={`cli-terminal flex-shrink-0 p-3 ${feature.color}`}>
                    {React.createElement(feature.icon, { className: 'h-6 w-6' })}
                  </div>
                  <div className='flex-1'>
                    <h3 className='mb-3 font-mono text-lg font-bold text-primary-500'>
                      {formatTitle(feature.title)}
                    </h3>
                    <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                      {feature.description}
                    </p>
                    <div className='mt-4 flex items-center space-x-2 font-mono text-xs text-cli-green'>
                      <CheckIcon className='h-4 w-4' />
                      <span>production-ready</span>
                    </div>
                  </div>
                </div>
              </CliCard>
            ))}
          </div>
        </section>

        <section className='mb-12'>
          <div className='mb-8 text-center'>
            <CliBadge variant='warning' className='mb-4'>
              PLATFORM DOWNLOADS
            </CliBadge>
            <h2 className='mb-4 font-mono text-3xl font-bold text-cli-white'>
              <span className='text-cli-green'>$</span> ls releases-latest
            </h2>
          </div>

          {loading ? (
            <div className='flex h-64 items-center justify-center'>
              <div className='cli-terminal animate-pulse p-4'>
                <p className='font-mono text-lg text-cli-green'>$ Loading app versions...</p>
                <div className='cli-loading mt-2'></div>
              </div>
            </div>
          ) : error ? (
            <div className='cli-terminal border border-red-500 p-6'>
              <p className='mb-2 font-mono text-lg text-red-500'>$ Error fetching app downloads</p>
              <p className='font-mono text-cli-light-gray'>{error}</p>
              <CliButton variant='warning' size='sm' className='mt-4' onClick={fetchAppDownloads}>
                ./retry --force
              </CliButton>
            </div>
          ) : (
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
              {platforms.map((platform, index) => {
                const latestVersion =
                  platform.versions.find((v: any) => v.isLatest) || platform.versions[0];

                return (
                  <CliCard
                    key={platform.platform}
                    className={`group transition-all duration-300 hover:scale-105 ${
                      latestVersion.isBeta ? 'animate-pulse-warning' : 'hover:shadow-glow-neon'
                    }`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className='p-6'>
                      <div className='mb-4 flex items-center justify-between'>
                        <div className='flex items-center space-x-3'>
                          <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                            {platform.platform === 'windows' ||
                            platform.platform === 'macos' ||
                            platform.platform === 'linux' ? (
                              <ComputerDesktopIcon className='h-6 w-6 text-primary-500' />
                            ) : (
                              <DevicePhoneMobileIcon className='h-6 w-6 text-primary-500' />
                            )}
                          </div>
                          <h3 className='font-mono text-xl font-bold text-cli-white'>
                            {platform.displayName}
                            {platform.isDetected && (
                              <span className='ml-2 rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white'>
                                Detected
                              </span>
                            )}
                          </h3>
                        </div>
                        <CliBadge
                          variant={latestVersion.isBeta ? 'warning' : 'success'}
                          className={latestVersion.isBeta ? 'animate-pulse' : ''}
                        >
                          {latestVersion.isBeta
                            ? 'BETA'
                            : latestVersion.isFeatured
                              ? 'FEATURED'
                              : 'STABLE'}
                        </CliBadge>
                      </div>

                      <div className='mb-6 space-y-2 font-mono text-sm'>
                        <div className='flex justify-between text-cli-light-gray'>
                          <span>Version:</span>
                          <span className='text-primary-500'>v{latestVersion.version}</span>
                        </div>
                        <div className='flex justify-between text-cli-light-gray'>
                          <span>Size:</span>
                          <span className='text-cli-white'>
                            {typeof latestVersion.fileSize === 'string'
                              ? latestVersion.fileSize
                              : formatFileSize(latestVersion.fileSize)}
                          </span>
                        </div>
                        <div className='flex justify-between text-cli-light-gray'>
                          <span>Requires:</span>
                          <span className='text-cli-green'>
                            {latestVersion.minOsVersion || 'Any version'}
                          </span>
                        </div>
                      </div>

                      <CliButton
                        variant='primary'
                        size='md'
                        className='group flex w-full items-center justify-center'
                        onClick={() => handleDownload(latestVersion.id, platform.platform)}
                      >
                        <ArrowDownTrayIcon className='mr-2 h-4 w-4' />
                        <span>./download --{platform.platform.toLowerCase()}</span>
                      </CliButton>

                      <div className='mt-3 text-center font-mono text-xs text-cli-green'>
                        $ curl -O mockmate-{platform.platform.toLowerCase()}.pkg
                      </div>
                    </div>
                  </CliCard>
                );
              })}
            </div>
          )}
        </section>

        <TerminalWindow title='mockmate@install: installation-guide' className='mb-8'>
          <div className='p-6'>
            <TypingText
              text='Installation Instructions'
              className='mb-6 font-mono text-xl font-bold text-primary-500'
              speed={40}
            />

            <div className='space-y-4 font-mono text-sm'>
              <div className='text-cli-light-gray'>
                <span className='text-cli-green'>$</span> # For mobile devices:
              </div>
              <div className='ml-4 text-cli-white'>
                1. Download from App Store or Google Play
                <br />
                2. Install and launch MockMate
                <br />
                3. Sign in with your existing account
                <br />
                4. Start practicing immediately
              </div>

              <div className='mt-6 text-cli-light-gray'>
                <span className='text-cli-green'>$</span> # For desktop:
              </div>
              <div className='ml-4 text-cli-white'>
                1. Download the installer for your OS
                <br />
                2. Run the installer with admin privileges
                <br />
                3. Launch MockMate from Applications
                <br />
                4. Your web account data syncs automatically
              </div>

              <div className='mt-6 text-cli-light-gray'>
                <span className='text-cli-green'>$</span> # All platforms:
              </div>
              <div className='ml-4 text-primary-500'>
                ✓ Same account across all devices
                <br />
                ✓ Automatic progress synchronization
                <br />
                ✓ Offline mode with cloud sync
                <br />✓ Free updates for life
              </div>
            </div>
          </div>
        </TerminalWindow>

        <div className='text-center'>
          <CliBadge variant='info' className='mb-4'>
            NEED HELP?
          </CliBadge>
          <p className='mb-4 font-mono text-cli-light-gray'>
            Having trouble with installation or need technical support?
          </p>
          <div className='flex flex-col justify-center gap-4 sm:flex-row'>
            <CliButton variant='ghost' size='md'>
              ./support --contact
            </CliButton>
            <CliButton variant='ghost' size='md'>
              ./docs --installation-guide
            </CliButton>
          </div>
        </div>
      </div>
    </div>
  );
};

const formatFileSize = (bytes: number): string => {
  if (!bytes) return 'Unknown';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
};

export default AppDownload;
