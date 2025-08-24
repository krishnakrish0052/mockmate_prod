import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeftIcon,
  PlayIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  CommandLineIcon,
  CogIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliInput,
  CliCard,
  MatrixRain,
  CliBadge,
} from '../ui/CliComponents';

interface Resume {
  id: string;
  filename: string;
  wordCount: number;
  sectionsFound: string[];
  skillsFound: string[];
}

const CreateSession: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    jobTitle: '',
    jobDescription: '',
    difficulty: 'intermediate',
    duration: 30,
    sessionType: 'mixed',
    resumeId: '',
  });

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [estimatedCost, setEstimatedCost] = useState(1);

  const fetchResumes = async () => {
    try {
      const response = await axios.get('/resumes');
      setResumes(response.data.resumes || []);
    } catch (error) {
      console.error('Failed to fetch resumes:', error);
    }
  };

  const calculateEstimatedCost = useCallback(() => {
    // Fixed cost: 1 credit per session regardless of duration or difficulty
    const cost = 1;
    setEstimatedCost(cost);
  }, []);

  useEffect(() => {
    fetchResumes();
  }, []);

  useEffect(() => {
    calculateEstimatedCost();
  }, [calculateEstimatedCost]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'duration' ? parseInt(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (user && user.credits < estimatedCost) {
      setError(
        `Insufficient credits. You need ${estimatedCost} credits but only have ${user.credits}.`
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/sessions/create', {
        ...formData,
        resumeId: formData.resumeId || undefined,
      });

      const sessionId = response.data.session.id;
      navigate(`/session/${sessionId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />

      {/* Header */}
      <header className='relative z-10 border-b border-cli-gray bg-cli-darker'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between py-4'>
            <div className='flex items-center space-x-4'>
              <Link
                to='/dashboard'
                className='flex items-center space-x-2 font-mono text-cli-light-gray transition-colors hover:text-cli-white'
              >
                <ArrowLeftIcon className='h-5 w-5' />
                <span>$ cd ../dashboard</span>
              </Link>
            </div>
            <div className='flex items-center space-x-3'>
              <CliBadge variant='success' className='animate-pulse'>
                CREDITS: {user?.credits}
              </CliBadge>
              <CliBadge variant='warning'>COST: {estimatedCost}</CliBadge>
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8'>
        <TerminalWindow title='mockmate@sessions:~$ ./create-session.sh --configure' className=''>
          <div className='p-8'>
            <div className='mb-8 text-center'>
              <div className='cli-terminal mx-auto mb-4 h-12 w-12 p-2'>
                <CogIcon className='h-full w-full text-primary-500' />
              </div>
              <TypingText
                text='Session Configuration Wizard'
                className='mb-2 font-mono text-2xl font-bold text-primary-500'
                speed={40}
              />
              <div className='font-mono text-sm text-cli-light-gray'>
                Configure AI-powered mock interview parameters
              </div>
            </div>

            {error && (
              <div className='mb-6 rounded-lg border border-red-500 bg-red-900/20 p-4'>
                <div className='font-mono text-sm text-red-400'>ERROR: {error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className='space-y-6'>
              {/* Job Title */}
              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  $ job-title --required
                </label>
                <CliInput
                  name='jobTitle'
                  type='text'
                  placeholder='Senior Software Engineer'
                  value={formData.jobTitle}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Job Description */}
              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  $ job-description --optional
                </label>
                <textarea
                  name='jobDescription'
                  rows={3}
                  value={formData.jobDescription}
                  onChange={handleChange}
                  className='
                    block w-full rounded-md border-2 border-cli-gray bg-cli-dark 
                    py-2 pl-3 pr-3
                    font-mono text-cli-white placeholder-cli-light-gray transition-all 
                    duration-200 focus:border-primary-500
                    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-cli-black
                  '
                  placeholder='Brief role description and requirements...'
                />
                <div className='mt-1 font-mono text-xs text-cli-gray'>
                  # Helps AI generate more relevant questions
                </div>
              </div>

              {/* Configuration Grid */}
              <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                {/* Session Type */}
                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    $ session-type
                  </label>
                  <select
                    name='sessionType'
                    value={formData.sessionType}
                    onChange={handleChange}
                    className='
                      block w-full rounded-md border-2 border-cli-gray bg-cli-dark 
                      py-2 pl-3
                      pr-3 font-mono text-cli-white transition-all 
                      duration-200 focus:border-primary-500
                      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-cli-black
                    '
                  >
                    <option value='technical' className='bg-cli-dark text-cli-white'>
                      Technical
                    </option>
                    <option value='behavioral' className='bg-cli-dark text-cli-white'>
                      Behavioral
                    </option>
                    <option value='mixed' className='bg-cli-dark text-cli-white'>
                      Mixed
                    </option>
                  </select>
                </div>

                {/* Difficulty */}
                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    $ difficulty-level
                  </label>
                  <select
                    name='difficulty'
                    value={formData.difficulty}
                    onChange={handleChange}
                    className='
                      block w-full rounded-md border-2 border-cli-gray bg-cli-dark 
                      py-2 pl-3
                      pr-3 font-mono text-cli-white transition-all 
                      duration-200 focus:border-primary-500
                      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-cli-black
                    '
                  >
                    <option value='beginner' className='bg-cli-dark text-cli-white'>
                      Beginner
                    </option>
                    <option value='intermediate' className='bg-cli-dark text-cli-white'>
                      Intermediate
                    </option>
                    <option value='advanced' className='bg-cli-dark text-cli-white'>
                      Advanced
                    </option>
                  </select>
                </div>

                {/* Duration */}
                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    $ duration --minutes
                  </label>
                  <select
                    name='duration'
                    value={formData.duration}
                    onChange={handleChange}
                    className='
                      block w-full rounded-md border-2 border-cli-gray bg-cli-dark 
                      py-2 pl-3
                      pr-3 font-mono text-cli-white transition-all 
                      duration-200 focus:border-primary-500
                      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-cli-black
                    '
                  >
                    <option value={15} className='bg-cli-dark text-cli-white'>
                      15 min
                    </option>
                    <option value={30} className='bg-cli-dark text-cli-white'>
                      30 min
                    </option>
                    <option value={45} className='bg-cli-dark text-cli-white'>
                      45 min
                    </option>
                    <option value={60} className='bg-cli-dark text-cli-white'>
                      60 min
                    </option>
                    <option value={90} className='bg-cli-dark text-cli-white'>
                      90 min
                    </option>
                  </select>
                </div>
              </div>

              {/* Resume Selection */}
              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  $ select-resume --optional
                </label>
                <select
                  name='resumeId'
                  value={formData.resumeId}
                  onChange={handleChange}
                  className='
                    block w-full rounded-md border-2 border-cli-gray bg-cli-dark 
                    py-2 pl-3
                    pr-3 font-mono text-cli-white transition-all 
                    duration-200 focus:border-primary-500
                    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-cli-black
                  '
                >
                  <option value='' className='bg-cli-dark text-cli-white'>
                    No resume - Use job description only
                  </option>
                  {resumes.map(resume => (
                    <option
                      key={resume.id}
                      value={resume.id}
                      className='bg-cli-dark text-cli-white'
                    >
                      {resume.filename} ({resume.wordCount}w, {resume.skillsFound.length}s)
                    </option>
                  ))}
                </select>
                {resumes.length === 0 && (
                  <div className='mt-2 rounded-lg border border-blue-500 bg-blue-900/20 p-3'>
                    <div className='flex items-center space-x-2 font-mono text-sm text-cli-light-gray'>
                      <DocumentTextIcon className='h-4 w-4 text-primary-500' />
                      <span>
                        No resumes found.{' '}
                        <Link
                          to='/resumes'
                          className='text-primary-500 underline hover:text-primary-400'
                        >
                          ./upload-resume
                        </Link>{' '}
                        for personalized questions.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Cost Estimate */}
              <CliCard className='border-primary-500/30 bg-gradient-to-r from-primary-900/20 to-yellow-900/20'>
                <div className='p-4'>
                  <div className='mb-3 flex items-center justify-between'>
                    <div className='flex items-center space-x-2'>
                      <CliBadge variant='warning'>COST ESTIMATE</CliBadge>
                      <span className='font-mono text-sm text-cli-light-gray'>
                        Resource Allocation
                      </span>
                    </div>
                    <div className='font-mono text-2xl font-bold text-primary-500'>
                      {estimatedCost} {estimatedCost === 1 ? 'CREDIT' : 'CREDITS'}
                    </div>
                  </div>
                  <div className='space-y-1 font-mono text-xs text-cli-gray'>
                    <div>$ calculate-cost --session-type=standard</div>
                    <div>$ estimated-time: {formData.duration} minutes</div>
                    <div>$ fixed-rate: 1 credit per session</div>
                  </div>
                </div>
              </CliCard>

              {/* Action Buttons */}
              <div className='flex items-center space-x-4 pt-6'>
                <CliButton
                  type='submit'
                  variant='primary'
                  disabled={loading || !!(user && user.credits < estimatedCost)}
                  isLoading={loading}
                  className='flex-1'
                >
                  {loading ? './initializing-session...' : './create-session --start'}
                </CliButton>

                <Link to='/dashboard'>
                  <CliButton variant='ghost'>./cancel</CliButton>
                </Link>
              </div>

              {/* Insufficient Credits Warning */}
              {user && user.credits < estimatedCost && (
                <CliCard className='border-red-500/30 bg-red-900/20'>
                  <div className='p-4 text-center'>
                    <CliBadge variant='error' className='mb-3'>
                      INSUFFICIENT CREDITS
                    </CliBadge>
                    <div className='mb-3 font-mono text-sm text-red-400'>
                      Need {estimatedCost - user.credits} more credit
                      {estimatedCost - user.credits !== 1 ? 's' : ''} for this session
                    </div>
                    <Link to='/credits'>
                      <CliButton variant='primary' size='sm'>
                        ./buy-credits --now
                      </CliButton>
                    </Link>
                  </div>
                </CliCard>
              )}
            </form>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default CreateSession;
