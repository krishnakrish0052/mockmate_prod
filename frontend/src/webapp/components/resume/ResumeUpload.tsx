import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeftIcon,
  CloudArrowUpIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';

interface UploadedResume {
  id: string;
  filename: string;
  originalName?: string;
  wordCount: number;
  sectionsFound: string[];
  skillsFound: string[];
  uploadedAt: string;
  createdAt?: string;
}

interface ResumeUploadProps {
  onComplete: () => void;
  onCancel: () => void;
}

const ResumeUpload: React.FC<ResumeUploadProps> = ({ onComplete, onCancel }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<UploadedResume | null>(null);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a PDF or Word document (.pdf, .doc, .docx)');
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    setError('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const response = await axios.post('/resumes/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: progressEvent => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          setUploadProgress(percentCompleted);
        },
      });

      setUploadedResume(response.data.resume);
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload resume');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <header className='bg-white shadow-sm'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between py-4'>
            <div className='flex items-center space-x-4'>
              <button
                onClick={onCancel}
                className='flex items-center space-x-2 text-gray-600 transition-colors hover:text-gray-900'
              >
                <ArrowLeftIcon className='h-5 w-5' />
                <span>Back to Resumes</span>
              </button>
            </div>
            <div className='flex items-center space-x-2 rounded-full bg-primary-50 px-3 py-1'>
              <span className='text-sm font-medium text-primary-800'>{user?.email}</span>
            </div>
          </div>
        </div>
      </header>

      <div className='mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8'>
        <div className='rounded-xl bg-white p-8 shadow-sm'>
          <div className='mb-8'>
            <h1 className='mb-2 text-2xl font-bold text-gray-900'>Upload Resume</h1>
            <p className='text-gray-600'>
              Upload your resume to get personalized interview questions
            </p>
          </div>

          {error && (
            <div className='mb-6 rounded-lg border border-red-200 bg-red-50 p-4'>
              <div className='flex items-center space-x-2 text-sm text-red-700'>
                <XCircleIcon className='h-4 w-4' />
                <span>{error}</span>
              </div>
            </div>
          )}

          {uploadedResume ? (
            <div className='py-8 text-center'>
              <CheckCircleIcon className='mx-auto mb-4 h-16 w-16 text-green-500' />
              <h3 className='mb-2 text-lg font-semibold text-gray-900'>
                Resume Uploaded Successfully!
              </h3>
              <div className='mb-4 rounded-lg bg-gray-50 p-4'>
                <p className='text-sm text-gray-600'>
                  <strong>File:</strong> {uploadedResume.originalName || uploadedResume.filename}
                </p>
                <p className='text-sm text-gray-600'>
                  <strong>Word Count:</strong> {uploadedResume.wordCount}
                </p>
                <p className='text-sm text-gray-600'>
                  <strong>Skills Found:</strong> {uploadedResume.skillsFound.length}
                </p>
                <p className='text-sm text-gray-600'>
                  <strong>Sections:</strong> {uploadedResume.sectionsFound.join(', ')}
                </p>
              </div>
              <p className='text-sm text-gray-500'>Redirecting to your resumes...</p>
            </div>
          ) : (
            <>
              {/* Upload Area */}
              <div
                className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-gray-300 hover:border-gray-400'
                } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type='file'
                  accept='.pdf,.doc,.docx'
                  onChange={handleFileInput}
                  className='absolute inset-0 h-full w-full cursor-pointer opacity-0'
                  disabled={uploading}
                />

                <div className='space-y-4'>
                  {uploading ? (
                    <div className='space-y-4'>
                      <div className='mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600'></div>
                      <div>
                        <p className='text-lg font-medium text-gray-900'>
                          Uploading and analyzing resume...
                        </p>
                        <div className='mt-2 h-2 w-full rounded-full bg-gray-200'>
                          <div
                            className='h-2 rounded-full bg-primary-600 transition-all duration-300'
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                        <p className='mt-1 text-sm text-gray-500'>{uploadProgress}% complete</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CloudArrowUpIcon className='mx-auto h-12 w-12 text-gray-400' />
                      <div>
                        <p className='text-lg font-medium text-gray-900'>
                          Drop your resume here, or <span className='text-primary-600'>browse</span>
                        </p>
                        <p className='text-sm text-gray-500'>PDF, DOC, or DOCX up to 10MB</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Info Section */}
              <div className='mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4'>
                <div className='flex items-start space-x-2'>
                  <InformationCircleIcon className='mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600' />
                  <div className='text-sm text-blue-700'>
                    <p className='mb-2 font-medium'>What happens after upload:</p>
                    <ul className='space-y-1'>
                      <li>• Your resume will be analyzed for skills and experience</li>
                      <li>• Key sections will be identified (education, experience, etc.)</li>
                      <li>• Technical and soft skills will be extracted</li>
                      <li>
                        • This information will be used to generate personalized interview questions
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Sample Questions Preview */}
              <div className='mt-6'>
                <h3 className='mb-3 text-lg font-medium text-gray-900'>
                  Sample Questions Based on Your Resume
                </h3>
                <div className='space-y-2 text-sm text-gray-600'>
                  <div className='flex items-center space-x-2'>
                    <DocumentTextIcon className='h-4 w-4 text-primary-600' />
                    <span>
                      "Tell me about your experience with [specific technology from your resume]"
                    </span>
                  </div>
                  <div className='flex items-center space-x-2'>
                    <DocumentTextIcon className='h-4 w-4 text-primary-600' />
                    <span>"How did you handle [challenge mentioned in your experience]?"</span>
                  </div>
                  <div className='flex items-center space-x-2'>
                    <DocumentTextIcon className='h-4 w-4 text-primary-600' />
                    <span>"Explain a project where you used [skill from your resume]"</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumeUpload;
