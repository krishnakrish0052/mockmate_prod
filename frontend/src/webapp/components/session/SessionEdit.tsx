import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeftIcon, PencilIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

interface SessionData {
  id: string;
  sessionName: string;
  jobTitle: string;
  jobDescription?: string;
  difficulty: string;
  sessionType: string;
  duration: number;
  status: string;
  createdAt: string;
}

const SessionEdit: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    sessionName: '',
    jobTitle: '',
    jobDescription: '',
    difficulty: 'medium',
    sessionType: 'behavioral',
    duration: 30,
  });

  useEffect(() => {
    if (sessionId) {
      fetchSession();
    }
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/sessions/${sessionId}`);
      const sessionData = response.data.session;

      // Check if session can be edited
      if (sessionData.status !== 'created') {
        setError('This session cannot be edited because it has already been started.');
        return;
      }

      setSession(sessionData);
      setFormData({
        sessionName: sessionData.sessionName || sessionData.jobTitle,
        jobTitle: sessionData.jobTitle,
        jobDescription: sessionData.jobDescription || '',
        difficulty: sessionData.difficulty,
        sessionType: sessionData.sessionType,
        duration: sessionData.duration,
      });
    } catch (error: any) {
      console.error('Failed to fetch session:', error);
      setError(error.response?.data?.error || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setSaving(true);
    try {
      await axios.patch(`/api/sessions/${sessionId}/edit`, formData);
      navigate('/sessions');
    } catch (error: any) {
      console.error('Failed to update session:', error);
      setError(error.response?.data?.error || 'Failed to update session');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <div className='h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600'></div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <div className='text-center'>
          <ExclamationTriangleIcon className='mx-auto mb-4 h-16 w-16 text-red-500' />
          <h2 className='mb-2 text-xl font-semibold text-gray-900'>Cannot Edit Session</h2>
          <p className='mb-4 text-gray-600'>{error || 'Session not found'}</p>
          <Link
            to='/sessions'
            className='inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700'
          >
            <ArrowLeftIcon className='mr-2 h-4 w-4' />
            Back to Sessions
          </Link>
        </div>
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
                to='/sessions'
                className='flex items-center space-x-2 text-gray-600 transition-colors hover:text-gray-900'
              >
                <ArrowLeftIcon className='h-5 w-5' />
                <span>Back to Sessions</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className='mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8'>
        <div className='rounded-xl bg-white shadow-sm'>
          <div className='border-b border-gray-200 p-6'>
            <div className='flex items-center space-x-3'>
              <PencilIcon className='h-6 w-6 text-primary-600' />
              <div>
                <h1 className='text-2xl font-bold text-gray-900'>Edit Session</h1>
                <p className='text-gray-600'>Modify your interview session details</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className='space-y-6 p-6'>
            {/* Session Name */}
            <div>
              <label htmlFor='sessionName' className='mb-2 block text-sm font-medium text-gray-700'>
                Session Name
              </label>
              <input
                type='text'
                id='sessionName'
                name='sessionName'
                value={formData.sessionName}
                onChange={handleChange}
                className='w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500'
                placeholder='Enter a memorable name for this session'
                required
              />
            </div>

            {/* Job Title */}
            <div>
              <label htmlFor='jobTitle' className='mb-2 block text-sm font-medium text-gray-700'>
                Job Title *
              </label>
              <input
                type='text'
                id='jobTitle'
                name='jobTitle'
                value={formData.jobTitle}
                onChange={handleChange}
                className='w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500'
                placeholder='e.g. Senior Software Engineer'
                required
              />
            </div>

            {/* Job Description */}
            <div>
              <label
                htmlFor='jobDescription'
                className='mb-2 block text-sm font-medium text-gray-700'
              >
                Job Description
              </label>
              <textarea
                id='jobDescription'
                name='jobDescription'
                value={formData.jobDescription}
                onChange={handleChange}
                rows={4}
                className='w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500'
                placeholder='Paste the job description here (optional)...'
              />
              <p className='mt-1 text-sm text-gray-500'>
                Adding a job description helps generate more relevant interview questions.
              </p>
            </div>

            {/* Session Type and Difficulty */}
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              <div>
                <label
                  htmlFor='sessionType'
                  className='mb-2 block text-sm font-medium text-gray-700'
                >
                  Interview Type *
                </label>
                <select
                  id='sessionType'
                  name='sessionType'
                  value={formData.sessionType}
                  onChange={handleChange}
                  className='w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500'
                  required
                >
                  <option value='behavioral'>Behavioral</option>
                  <option value='technical'>Technical</option>
                  <option value='mixed'>Mixed</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor='difficulty'
                  className='mb-2 block text-sm font-medium text-gray-700'
                >
                  Difficulty Level *
                </label>
                <select
                  id='difficulty'
                  name='difficulty'
                  value={formData.difficulty}
                  onChange={handleChange}
                  className='w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500'
                  required
                >
                  <option value='beginner'>Beginner</option>
                  <option value='easy'>Easy</option>
                  <option value='intermediate'>Intermediate</option>
                  <option value='medium'>Medium</option>
                  <option value='advanced'>Advanced</option>
                  <option value='hard'>Hard</option>
                  <option value='expert'>Expert</option>
                </select>
              </div>
            </div>

            {/* Duration */}
            <div>
              <label htmlFor='duration' className='mb-2 block text-sm font-medium text-gray-700'>
                Session Duration (minutes) *
              </label>
              <input
                type='number'
                id='duration'
                name='duration'
                value={formData.duration}
                onChange={handleChange}
                min='5'
                max='120'
                className='w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500'
                required
              />
              <p className='mt-1 text-sm text-gray-500'>
                Recommended: 30-60 minutes for comprehensive practice.
              </p>
            </div>

            {/* Session Info */}
            <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
              <h3 className='mb-2 text-sm font-medium text-blue-900'>Session Information</h3>
              <div className='space-y-1 text-sm text-blue-700'>
                <p>
                  <strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}
                </p>
                <p>
                  <strong>Status:</strong> {session.status}
                </p>
                <p>
                  <strong>Current Session ID:</strong> {session.id}
                </p>
              </div>
            </div>

            {/* Form Actions */}
            <div className='flex items-center justify-end space-x-4 border-t border-gray-200 pt-6'>
              <Link
                to='/sessions'
                className='rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200'
              >
                Cancel
              </Link>
              <button
                type='submit'
                disabled={saving}
                className='flex items-center space-x-2 rounded-lg bg-primary-600 px-6 py-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {saving ? (
                  <>
                    <div className='h-4 w-4 animate-spin rounded-full border-b-2 border-white'></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <PencilIcon className='h-4 w-4' />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SessionEdit;
