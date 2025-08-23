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
} from '@heroicons/react/24/outline';
import ResumeUpload from './ResumeUpload';
import axios from 'axios';

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

const ResumeManagerDebug: React.FC = () => {
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
      console.log('🔍 [DEBUG] Fetching resumes from /api/resumes');
      const response = await axios.get('/api/resumes');

      console.log('📊 [DEBUG] Raw API Response:', response.data);
      console.log('📋 [DEBUG] Response.data.resumes:', response.data.resumes);

      if (response.data.resumes && response.data.resumes.length > 0) {
        const firstResume = response.data.resumes[0];
        console.log('📄 [DEBUG] First Resume Object:', firstResume);
        console.log(
          '📊 [DEBUG] First Resume wordCount:',
          firstResume.wordCount,
          typeof firstResume.wordCount
        );
        console.log(
          '📊 [DEBUG] First Resume sectionsFound:',
          firstResume.sectionsFound,
          Array.isArray(firstResume.sectionsFound)
            ? firstResume.sectionsFound.length
            : 'Not an array'
        );
        console.log(
          '📊 [DEBUG] First Resume skillsFound:',
          firstResume.skillsFound,
          Array.isArray(firstResume.skillsFound) ? firstResume.skillsFound.length : 'Not an array'
        );
        console.log('📊 [DEBUG] Available fields:', Object.keys(firstResume));
      }

      setResumes(response.data.resumes || []);
    } catch (error) {
      console.error('❌ [DEBUG] Failed to fetch resumes:', error);
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
      await axios.delete(`/api/resumes/${resumeId}`);
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

  const handleViewDetails = (resume: Resume) => {
    console.log('👁️ [DEBUG] Viewing resume details:', resume);
    setSelectedResume(resume);
  };

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <div className='h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600'></div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <header className='bg-white shadow-sm'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between py-4'>
            <div className='flex items-center space-x-4'>
              <Link
                to='/dashboard'
                className='flex items-center space-x-2 text-gray-600 transition-colors hover:text-gray-900'
              >
                <ArrowLeftIcon className='h-5 w-5' />
                <span>Back to Dashboard</span>
              </Link>
            </div>
            <div className='flex items-center space-x-2 rounded-full bg-primary-50 px-3 py-1'>
              <span className='text-sm font-medium text-primary-800'>
                {user?.credits} credits available
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className='mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        <div className='mb-8 flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>Resume Library (DEBUG)</h1>
            <p className='text-gray-600'>
              Upload and manage your resumes for personalized interview questions
            </p>
            <p className='mt-2 text-sm text-red-600'>
              🐛 DEBUG MODE: Check console for API response details
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className='inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700'
          >
            <PlusIcon className='mr-2 h-4 w-4' />
            Upload Resume
          </button>
        </div>

        {/* Upload Modal */}
        {showUpload && (
          <ResumeUpload onComplete={handleUploadComplete} onCancel={() => setShowUpload(false)} />
        )}

        {/* Resume Grid */}
        {resumes.length === 0 ? (
          <div className='py-12 text-center'>
            <DocumentTextIcon className='mx-auto mb-4 h-16 w-16 text-gray-300' />
            <h3 className='mb-2 text-lg font-medium text-gray-900'>No resumes uploaded</h3>
            <p className='mb-6 text-gray-600'>
              Upload your first resume to get started with personalized interview questions
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className='inline-flex items-center rounded-lg bg-primary-600 px-6 py-3 font-medium text-white transition-colors hover:bg-primary-700'
            >
              <PlusIcon className='mr-2 h-5 w-5' />
              Upload Your First Resume
            </button>
          </div>
        ) : (
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
            {resumes.map(resume => (
              <div
                key={resume.id}
                className='rounded-xl border border-gray-200 bg-white shadow-sm transition-colors hover:border-primary-200'
              >
                <div className='p-6'>
                  <div className='mb-4 flex items-center justify-between'>
                    <div className='flex items-center space-x-3'>
                      <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100'>
                        <DocumentTextIcon className='h-6 w-6 text-primary-600' />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <h3 className='truncate text-sm font-medium text-gray-900'>
                          {resume.originalFilename || resume.filename}
                        </h3>
                        <p className='text-xs text-gray-500'>
                          {new Date(resume.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className='flex items-center space-x-2'>
                      <button
                        onClick={() => handleViewDetails(resume)}
                        className='rounded-lg p-2 text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600'
                        title='View Details'
                      >
                        <EyeIcon className='h-4 w-4' />
                      </button>
                      <button
                        onClick={() => handleDelete(resume.id)}
                        disabled={deleting === resume.id}
                        className='rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50'
                        title='Delete Resume'
                      >
                        {deleting === resume.id ? (
                          <div className='h-4 w-4 animate-spin rounded-full border-b-2 border-red-600'></div>
                        ) : (
                          <TrashIcon className='h-4 w-4' />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className='space-y-3'>
                    {/* Debug info */}
                    <div className='rounded bg-red-50 p-2 text-xs text-red-600'>
                      DEBUG: wordCount = {resume.wordCount} ({typeof resume.wordCount})
                    </div>

                    <div className='flex items-center justify-between text-sm'>
                      <span className='text-gray-600'>Word Count</span>
                      <span className='font-medium text-gray-900'>
                        {resume.wordCount ? resume.wordCount.toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div className='flex items-center justify-between text-sm'>
                      <span className='text-gray-600'>Sections</span>
                      <span className='font-medium text-gray-900'>
                        {resume.sectionsFound ? resume.sectionsFound.length : 'N/A'}
                      </span>
                    </div>
                    <div className='flex items-center justify-between text-sm'>
                      <span className='text-gray-600'>Skills Found</span>
                      <span className='font-medium text-gray-900'>
                        {resume.skillsFound ? resume.skillsFound.length : 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className='mt-4 border-t border-gray-200 pt-4'>
                    <div className='flex items-center text-xs text-gray-500'>
                      <CalendarIcon className='mr-1 h-4 w-4' />
                      Uploaded {new Date(resume.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resume Details Modal */}
        {selectedResume && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4'>
            <div className='max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-xl'>
              <div className='p-6'>
                <div className='mb-6 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-900'>Resume Details (DEBUG)</h2>
                  <button
                    onClick={() => setSelectedResume(null)}
                    className='text-gray-400 transition-colors hover:text-gray-600'
                  >
                    <svg className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M6 18L18 6M6 6l12 12'
                      />
                    </svg>
                  </button>
                </div>

                <div className='space-y-6'>
                  {/* Raw JSON Debug */}
                  <div>
                    <h3 className='mb-2 font-medium text-gray-900'>🐛 DEBUG: Raw Resume Object</h3>
                    <pre className='max-h-40 overflow-auto rounded-lg bg-gray-100 p-4 text-xs'>
                      {JSON.stringify(selectedResume, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h3 className='mb-2 font-medium text-gray-900'>File Information</h3>
                    <div className='space-y-2 rounded-lg bg-gray-50 p-4'>
                      <div className='flex justify-between'>
                        <span className='text-gray-600'>Filename:</span>
                        <span className='font-medium'>
                          {selectedResume.originalFilename || selectedResume.filename}
                        </span>
                      </div>
                      <div className='flex justify-between'>
                        <span className='text-gray-600'>Word Count:</span>
                        <span className='font-medium'>
                          {selectedResume.wordCount
                            ? selectedResume.wordCount.toLocaleString()
                            : 'N/A'}
                        </span>
                      </div>
                      <div className='flex justify-between'>
                        <span className='text-gray-600'>Uploaded:</span>
                        <span className='font-medium'>
                          {new Date(selectedResume.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className='mb-3 font-medium text-gray-900'>
                      Sections Found (
                      {selectedResume.sectionsFound ? selectedResume.sectionsFound.length : 0})
                    </h3>
                    <div className='flex flex-wrap gap-2'>
                      {selectedResume.sectionsFound && selectedResume.sectionsFound.length > 0 ? (
                        selectedResume.sectionsFound.map(section => (
                          <span
                            key={section}
                            className='rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800'
                          >
                            {section}
                          </span>
                        ))
                      ) : (
                        <span className='text-sm text-gray-500'>No sections found</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className='mb-3 font-medium text-gray-900'>
                      Skills Identified (
                      {selectedResume.skillsFound ? selectedResume.skillsFound.length : 0})
                    </h3>
                    <div className='flex flex-wrap gap-2'>
                      {selectedResume.skillsFound && selectedResume.skillsFound.length > 0 ? (
                        selectedResume.skillsFound.slice(0, 20).map(skill => (
                          <span
                            key={skill}
                            className='rounded-full bg-green-100 px-3 py-1 text-sm text-green-800'
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className='text-sm text-gray-500'>No skills found</span>
                      )}
                      {selectedResume.skillsFound && selectedResume.skillsFound.length > 20 && (
                        <span className='rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600'>
                          +{selectedResume.skillsFound.length - 20} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className='mt-6 flex justify-end space-x-3 border-t border-gray-200 pt-6'>
                  <button
                    onClick={() => setSelectedResume(null)}
                    className='rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200'
                  >
                    Close
                  </button>
                  <Link
                    to={`/session/create?resumeId=${selectedResume.id}`}
                    className='rounded-lg bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700'
                  >
                    Use for Interview
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeManagerDebug;
