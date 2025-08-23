import React from 'react';
import { TerminalWindow, TypingText } from '../components/ui/CliComponents';
import AlertDashboard from '../components/AlertDashboard';

const AlertManagement: React.FC = () => {
  return (
    <div className='space-y-6'>
      {/* Header Terminal */}
      <TerminalWindow title='admin@mockmate:~$ ./alert-management --dashboard' className='mb-6'>
        <div className='p-6'>
          <TypingText
            text='System Alert Management Dashboard'
            className='cli-glow mb-2 font-mono text-2xl font-bold text-primary-500'
            speed={30}
          />
          <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
            <div>$ systemctl status alert-service</div>
            <div className='text-cli-green'>● alert-service.service - MockMate Alert Broadcasting System</div>
            <div className='text-cli-green'>   Loaded: loaded (/etc/systemd/alert-service.service; enabled)</div>
            <div className='text-cli-green'>   Active: active (running)</div>
            <div className='mt-2 text-cli-gray'># Manage user notifications, system alerts, and broadcast messages</div>
          </div>
        </div>
      </TerminalWindow>

      {/* Alert Dashboard */}
      <AlertDashboard className='!bg-transparent !py-0' />
    </div>
  );
};

export default AlertManagement;
