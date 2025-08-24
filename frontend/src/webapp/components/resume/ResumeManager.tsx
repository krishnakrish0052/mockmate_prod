import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  CalendarIcon,
  ChartBarIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import ResumeUpload from './ResumeUpload';
import axios from 'axios';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliBadge,
} from '../ui/CliComponents';

interface Resume {
  id: string;
  filename: string;
  originalFilename?: string;
  wordCount: number;
  sectionsFound: string[];
  skillsFound: string[];
  createdAt: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  experience?: any[];
  education?: any[];
  certifications?: any[];
  projects?: any[];
  totalExperienceYears?: number;
  parsingStatus?: string;
  analysis?: {
    summary: string;
    strengths: string[];
    improvements: string[];
  };
}

const ResumeManager: React.FC = () => {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchResumes();
  }, []);

  const fetchResumes = async () => {
    try {
      const response = await axios.get('/resumes');
      setResumes(response.data.resumes || []);
    } catch (error) {
      console.error('Failed to fetch resumes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (resumeId: string) => {
    if (!window.confirm('Are you sure you want to delete this resume?')) {
      return;
    }

    setDeleting(resumeId);
    try {
      await axios.delete(`/resumes/${resumeId}`);
      setResumes(resumes.filter(r => r.id !== resumeId));
    } catch (error) {
      console.error('Failed to delete resume:', error);
      alert('Failed to delete resume. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    fetchResumes();
  };

  if (loading) {
    return (
      <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain />
        <div className='relative z-10 h-12 w-12 animate-spin rounded-full border-b-2 border-primary-500'></div>
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
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        <TerminalWindow title='mockmate@resumes:~$ ./resume-manager.sh' className='mb-8'>
          <div className='p-8'>
            <div className='mb-6 flex items-center justify-between'>
              <div>
                <TypingText
                  text='Resume Library Management System'
                  className='mb-2 font-mono text-2xl font-bold text-primary-500'
                  speed={40}
                />
                <div className='font-mono text-sm text-cli-light-gray'>
                  Upload and manage your resumes for personalized interview questions
                </div>
                <div className='mt-2 font-mono text-xs text-cli-gray'>
                  $ ls /documents/resumes/ --analyze
                </div>
              </div>
              <CliButton
                onClick={() => setShowUpload(true)}
                variant='primary'
                className='flex items-center'
              >
                <PlusIcon className='mr-2 h-4 w-4' />
                ./upload-resume
              </CliButton>
            </div>
          </div>
        </TerminalWindow>

        {/* Upload Modal */}
        {showUpload && (
          <ResumeUpload onComplete={handleUploadComplete} onCancel={() => setShowUpload(false)} />
        )}

        {/* Resume Grid */}
        {resumes.length === 0 ? (
          <CliCard className='py-12 text-center'>
            <div className='p-12'>
              <DocumentTextIcon className='mx-auto mb-4 h-16 w-16 text-cli-gray' />
              <TypingText
                text='No Resumes Found'
                className='mb-2 font-mono text-lg font-bold text-primary-500'
                speed={50}
              />
              <div className='mb-6 font-mono text-sm text-cli-light-gray'>
                Upload your first resume to get started with personalized interview questions
              </div>
              <div className='mb-6 font-mono text-xs text-cli-gray'>
                $ find /documents/resumes/ -name "*.pdf" -o -name "*.docx" | wc -l
                <br />0
              </div>
              <CliButton
                onClick={() => setShowUpload(true)}
                variant='primary'
                className='mx-auto flex items-center'
              >
                <PlusIcon className='mr-2 h-5 w-5' />
                ./upload-first-resume
              </CliButton>
            </div>
          </CliCard>
        ) : (
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
            {resumes.map(resume => (
              <CliCard key={resume.id} className='transition-all hover:shadow-glow-golden cursor-pointer group'>
                <div className='relative'>
                  {/* Clickable overlay for the entire card */}
                  <div 
                    onClick={() => setSelectedResume(resume)}
                    className='absolute inset-0 z-0 cursor-pointer'
                    aria-label={`View details for ${resume.originalFilename || resume.filename}`}
                  />
                  
                  <div className='relative z-10 p-6'>
                  {/* Header with file icon and name */}
                  <div className='mb-4 flex items-center space-x-3'>
                    <div className='cli-terminal h-10 w-10 flex-shrink-0 p-2'>
                      <DocumentTextIcon className='h-full w-full text-primary-500' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <h3 className='truncate font-mono text-sm font-bold text-cli-white'>
                        {resume.originalFilename || resume.filename}
                      </h3>
                      <p className='font-mono text-xs text-cli-gray'>
                        {new Date(resume.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className='space-y-3'>
                    <div className='flex items-center justify-between text-sm'>
                      <span className='font-mono text-cli-light-gray'>$ wc -w</span>
                      <span className='font-mono text-cli-white'>
                        {resume.wordCount.toLocaleString()}
                      </span>
                    </div>
                    <div className='flex items-center justify-between text-sm'>
                      <span className='font-mono text-cli-light-gray'>$ sections</span>
                      <CliBadge variant='info' className='text-xs'>
                        {resume.sectionsFound.length}
                      </CliBadge>
                    </div>
                    <div className='flex items-center justify-between text-sm'>
                      <span className='font-mono text-cli-light-gray'>$ skills</span>
                      <CliBadge variant='success' className='text-xs'>
                        {resume.skillsFound.length}
                      </CliBadge>
                    </div>
                  </div>

                  <div className='mt-4 border-t border-cli-gray pt-4'>
                    <div className='mb-3 flex items-center justify-between'>
                      <div className='flex items-center font-mono text-xs text-cli-gray'>
                        <CalendarIcon className='mr-1 h-4 w-4' />$ stat --format='%y' | cut -d' '
                        -f1
                      </div>
                      <div className='font-mono text-xs text-cli-light-gray'>
                        {new Date(resume.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className='flex items-center justify-between space-x-2'>
                      <CliButton
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedResume(resume);
                        }}
                        variant='ghost'
                        size='sm'
                        className='relative z-20 flex-1 justify-center px-3 py-2 text-xs'
                        title='View Details'
                      >
                        <EyeIcon className='mr-1 h-3 w-3' />
                        view
                      </CliButton>
                      <CliButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(resume.id);
                        }}
                        disabled={deleting === resume.id}
                        variant='danger'
                        size='sm'
                        className='relative z-20 flex-1 justify-center px-3 py-2 text-xs'
                        title='Delete Resume'
                        isLoading={deleting === resume.id}
                      >
                        {deleting === resume.id ? (
                          'rm...'
                        ) : (
                          <>
                            <TrashIcon className='mr-1 h-3 w-3' />
                            rm
                          </>
                        )}
                      </CliButton>
                    </div>
                  </div>
                </div>
                </div>
              </CliCard>
            ))}
          </div>
        )}

        {/* Resume Details Modal */}
        {selectedResume && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4'>
            <TerminalWindow
              title={`mockmate@resumes:~$ ./view-resume.sh "${selectedResume.originalFilename || selectedResume.filename}"`}
              className='max-h-[90vh] w-full max-w-4xl overflow-y-auto'
            >
              <div className='p-6'>
                <div className='mb-6 flex items-center justify-between'>
                  <TypingText
                    text='Resume Analysis Report'
                    className='font-mono text-xl font-bold text-primary-500'
                    speed={50}
                  />
                  <button
                    onClick={() => setSelectedResume(null)}
                    className='text-cli-gray transition-colors hover:text-cli-white'
                  >
                    <XMarkIcon className='h-6 w-6' />
                  </button>
                </div>

                <div className='space-y-6'>
                  <CliCard>
                    <div className='p-4'>
                      <h3 className='mb-3 font-mono font-bold text-cli-white'>$ file --info</h3>
                      <div className='space-y-2 rounded-lg bg-cli-darker p-4 font-mono text-sm'>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>filename:</span>
                          <span className='text-cli-white'>
                            {selectedResume.originalFilename || selectedResume.filename}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>word_count:</span>
                          <span className='text-primary-500'>
                            {selectedResume.wordCount.toLocaleString()}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>upload_date:</span>
                          <span className='text-cli-white'>
                            {new Date(selectedResume.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CliCard>

                  <CliCard>
                    <div className='p-4'>
                      <h3 className='mb-3 font-mono font-bold text-cli-white'>
                        $ grep -i "section" --count: {selectedResume.sectionsFound.length}
                      </h3>
                      <div className='flex flex-wrap gap-2'>
                        {selectedResume.sectionsFound.map(section => (
                          <CliBadge key={section} variant='info' className='text-xs'>
                            {section}
                          </CliBadge>
                        ))}
                      </div>
                    </div>
                  </CliCard>

                  <CliCard>
                    <div className='p-4'>
                      <h3 className='mb-3 font-mono font-bold text-cli-white'>
                        $ grep -i "skill" --extract: {selectedResume.skillsFound.length}
                      </h3>
                      <div className='flex flex-wrap gap-2'>
                        {selectedResume.skillsFound.slice(0, 20).map(skill => (
                          <CliBadge key={skill} variant='success' className='text-xs'>
                            {skill}
                          </CliBadge>
                        ))}
                        {selectedResume.skillsFound.length > 20 && (
                          <CliBadge variant='default' className='text-xs'>
                            +{selectedResume.skillsFound.length - 20} more
                          </CliBadge>
                        )}
                      </div>
                    </div>
                  </CliCard>

                  {selectedResume.analysis && (
                    <CliCard className='border-primary-500/30 bg-gradient-to-r from-primary-900/20 to-yellow-900/20'>
                      <div className='p-4'>
                        <h3 className='mb-3 font-mono font-bold text-primary-500'>
                          $ ai-analyze --comprehensive
                        </h3>
                        <div className='space-y-3'>
                          <div>
                            <h4 className='mb-2 font-mono font-medium text-cli-white'># Summary</h4>
                            <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                              {selectedResume.analysis.summary}
                            </p>
                          </div>
                          {selectedResume.analysis.strengths.length > 0 && (
                            <div>
                              <h4 className='mb-2 font-mono font-medium text-cli-green'>
                                # Strengths
                              </h4>
                              <ul className='space-y-1 font-mono text-sm text-cli-light-gray'>
                                {selectedResume.analysis.strengths.map((strength, index) => (
                                  <li key={index}>+ {strength}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {selectedResume.analysis.improvements.length > 0 && (
                            <div>
                              <h4 className='mb-2 font-mono font-medium text-yellow-500'>
                                # Improvement Areas
                              </h4>
                              <ul className='space-y-1 font-mono text-sm text-cli-light-gray'>
                                {selectedResume.analysis.improvements.map((improvement, index) => (
                                  <li key={index}>⚠ {improvement}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </CliCard>
                  )}
                </div>

                <div className='mt-6 flex justify-end space-x-3 border-t border-cli-gray pt-6'>
                  <CliButton onClick={() => setSelectedResume(null)} variant='ghost'>
                    ./exit
                  </CliButton>
                  <Link to={`/session/create?resumeId=${selectedResume.id}`}>
                    <CliButton variant='primary'>./use-for-interview --start</CliButton>
                  </Link>
                </div>
              </div>
            </TerminalWindow>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeManager;
