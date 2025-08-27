import React, { useState, useEffect } from 'react';
import { CliButton } from '../ui/CliComponents';

interface CashfreePaymentFormProps {
  orderData: {
    orderId: string;
    cfOrderId: string;
    paymentSessionId: string;
    orderToken: string;
    paymentLink: string;
  };
  packageInfo: {
    name: string;
    credits: number;
    price: number;
  };
  onSuccess: () => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

const CashfreePaymentForm: React.FC<CashfreePaymentFormProps> = ({
  orderData,
  packageInfo,
  onSuccess,
  onError,
  onCancel
}) => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'success' | 'failed'>('pending');

  // Check payment status periodically
  useEffect(() => {
    let statusCheckInterval: NodeJS.Timeout;

    if (processing) {
      statusCheckInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/payments/cashfree/status/${orderData.orderId}`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            },
          });

          if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const result = await response.json();
              const status = result.data?.orderStatus;

              if (status === 'PAID') {
                setPaymentStatus('success');
                onSuccess();
                clearInterval(statusCheckInterval);
              } else if (['EXPIRED', 'CANCELLED', 'FAILED'].includes(status)) {
                setPaymentStatus('failed');
                setError(`Payment ${status.toLowerCase()}`);
                onError(`Payment ${status.toLowerCase()}`);
                clearInterval(statusCheckInterval);
              }
            } else {
              console.warn('Received non-JSON response from payment status API');
              const textResponse = await response.text();
              console.log('Response body:', textResponse.substring(0, 200) + '...');
            }
          } else {
            console.warn(`Payment status API returned ${response.status}: ${response.statusText}`);
          }
        } catch (error) {
          console.error('Error checking payment status:', error);
          // Don't clear interval on error, continue checking
        }
      }, 3000); // Check every 3 seconds
    }

    return () => {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
    };
  }, [processing, orderData.orderId, onSuccess, onError]);

  const handleCashfreePayment = () => {
    setProcessing(true);
    setError(null);
    setPaymentStatus('processing');

    try {
      console.log('🔄 Redirecting to Cashfree payment page...');
      
      // Open Cashfree payment link in a new window
      const paymentWindow = window.open(
        orderData.paymentLink,
        'cashfree_payment',
        'width=800,height=600,scrollbars=yes,resizable=yes'
      );

      if (!paymentWindow) {
        throw new Error('Failed to open payment window. Please check your popup blocker.');
      }

      // Listen for window close event
      const checkClosed = setInterval(() => {
        if (paymentWindow.closed) {
          clearInterval(checkClosed);
          
          // Give a moment for any status updates to process
          setTimeout(() => {
            if (paymentStatus === 'processing') {
              setProcessing(false);
              setPaymentStatus('pending');
              setError('Payment window was closed. Please try again if the payment was not completed.');
            }
          }, 2000);
        }
      }, 1000);

      // Set a timeout for the payment
      setTimeout(() => {
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.close();
        }
        clearInterval(checkClosed);
        
        if (paymentStatus === 'processing') {
          setProcessing(false);
          setPaymentStatus('pending');
          setError('Payment timed out. Please try again.');
        }
      }, 300000); // 5 minutes timeout

    } catch (err: any) {
      console.error('💥 Cashfree payment error:', err);
      setError(err.message || 'An unexpected error occurred');
      setProcessing(false);
      setPaymentStatus('failed');
      onError(err.message || 'An unexpected error occurred');
    }
  };

  const handleDirectPayment = () => {
    console.log('🔄 Proceeding with direct Cashfree payment...');
    window.location.href = orderData.paymentLink;
  };

  const formatAmount = (amount: number) => {
    // Convert cents to rupees (assuming 1 USD = 83 INR approximately)
    const rupees = (amount / 100) * 83;
    return `₹${rupees.toFixed(2)}`;
  };

  return (
    <div className="cli-terminal border border-cli-gray rounded-lg p-6 bg-cli-darker">
      <div className="mb-6">
        <h3 className="font-mono text-xl font-bold text-primary-500 mb-2">
          ./cashfree-payment --secure
        </h3>
        <div className="font-mono text-sm text-cli-light-gray space-y-1">
          <div>Package: {packageInfo.name}</div>
          <div>Credits: {packageInfo.credits}</div>
          <div>Amount: {formatAmount(packageInfo.price)}</div>
          <div className="text-xs text-cli-gray">Order ID: {orderData.orderId}</div>
        </div>
      </div>

      {error && (
        <div className="cli-error font-mono text-sm p-3 rounded border border-red-500 bg-red-900/20 text-red-400 mb-4">
          ❌ Error: {error}
        </div>
      )}

      {paymentStatus === 'processing' && (
        <div className="cli-info font-mono text-sm p-3 rounded border border-blue-500 bg-blue-900/20 text-blue-400 mb-4">
          🔄 Payment in progress... Please complete the payment in the opened window.
        </div>
      )}

      {paymentStatus === 'success' && (
        <div className="cli-success font-mono text-sm p-3 rounded border border-green-500 bg-green-900/20 text-green-400 mb-4">
          ✅ Payment completed successfully! Credits are being added to your account.
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div className="p-4 rounded border border-cli-gray bg-cli-black">
          <h4 className="font-mono text-sm font-medium text-cli-light-gray mb-3">
            $ ./payment-methods --available
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono text-cli-gray">
            <div>💳 Credit Cards</div>
            <div>💰 Debit Cards</div>
            <div>🏦 Net Banking</div>
            <div>📱 UPI</div>
            <div>💼 Wallets</div>
            <div>🔄 EMI Options</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <CliButton
          onClick={handleCashfreePayment}
          disabled={processing || paymentStatus === 'success'}
          variant="primary"
          className="w-full"
          isLoading={processing && paymentStatus === 'processing'}
        >
          {paymentStatus === 'success' 
            ? '✅ Payment Completed'
            : processing 
              ? './processing-payment...' 
              : './pay-with-cashfree --secure'
          }
        </CliButton>

        <div className="flex space-x-3">
          <CliButton
            onClick={handleDirectPayment}
            disabled={processing || paymentStatus === 'success'}
            variant="secondary"
            className="flex-1"
          >
            ./direct-payment-page
          </CliButton>
          
          <CliButton
            onClick={onCancel}
            disabled={processing && paymentStatus === 'processing'}
            variant="ghost"
            className="flex-1"
          >
            ./cancel
          </CliButton>
        </div>
      </div>

      <div className="mt-4 font-mono text-xs text-cli-gray space-y-1">
        <div>🔒 Secured by Cashfree Payments</div>
        <div>🇮🇳 Supports all major Indian payment methods</div>
        <div>💳 PCI DSS compliant payment processing</div>
        <div className="text-cli-light-gray">
          📞 Support: Cashfree customer service available 24/7
        </div>
      </div>

      {/* Payment Methods Info */}
      <div className="mt-6 p-4 border border-cli-gray rounded bg-cli-black">
        <h5 className="font-mono text-sm font-medium text-primary-500 mb-2">
          $ ./supported-methods --info
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono text-cli-light-gray">
          <div className="space-y-1">
            <div>💳 Cards: Visa, Mastercard, Rupay</div>
            <div>🏦 Net Banking: All major banks</div>
            <div>📱 UPI: GPay, PhonePe, Paytm, etc.</div>
          </div>
          <div className="space-y-1">
            <div>💼 Wallets: Paytm, Mobikwik, etc.</div>
            <div>🔄 EMI: No-cost EMI available</div>
            <div>💰 BNPL: Buy now, pay later options</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashfreePaymentForm;
