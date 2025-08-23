import React from 'react';

// Import the AppManagement component
import AppManagement from '../components/management/AppManagement';
import '../components/management/AppManagement.css';

const AppManagementPage: React.FC = () => {
  return (
    <div className='app-management-page'>
      <AppManagement />
    </div>
  );
};

export default AppManagementPage;
