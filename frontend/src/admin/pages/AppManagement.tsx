import React from 'react';
import { MatrixRain } from '../components/ui/CliComponents';
// Import the AppManagement component
import AppManagement from '../components/management/AppManagement';
import '../components/management/AppManagement.css';

const AppManagementPage: React.FC = () => {
  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />
      <div className='relative z-10'>
        <AppManagement />
      </div>
    </div>
  );
};

export default AppManagementPage;
