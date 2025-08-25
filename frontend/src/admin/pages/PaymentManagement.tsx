import React from 'react';
import PaymentGatewaysTab from '../../components/admin/PaymentGatewaysTab';
import { TerminalWindow, TypingText } from '../components/ui/CliComponents';

const PaymentManagement: React.FC = () => {
  return (
    <div className="payment-management-page">
      {/* Terminal Header */}
      <div className="mb-6">
        <TerminalWindow title="admin@mockmate:~$ ./payment-gateways --manage --multi-provider">
          <div className="p-4">
            <TypingText 
              text="💳 Payment Gateway Management System v2.0" 
              className="text-cli-cyan font-mono text-lg"
              speed={30}
            />
            <div className="mt-2 text-cli-light-gray font-mono text-sm">
              <div>├── Multi-provider support (Stripe, Cashfree)</div>
              <div>├── Real-time health monitoring</div>
              <div>├── Dynamic configuration management</div>
              <div>└── Secure credential handling</div>
            </div>
          </div>
        </TerminalWindow>
      </div>

      {/* Payment Gateways Tab Component */}
      <PaymentGatewaysTab />
    </div>
  );
};

export default PaymentManagement;
