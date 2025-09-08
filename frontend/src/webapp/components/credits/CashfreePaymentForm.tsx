import React, { useState, useEffect } from 'react';
import { CliButton } from '../ui/CliComponents';

interface CashfreePaymentFormProps {
  orderData: {
    orderId?: string;
    cfOrderId?: string;
    paymentSessionId?: string;
    orderToken?: string;
    paymentLink: string;
    isOneClickCheckout?: boolean;
    checkoutType?: 'standard' | 'oneclick';
    linkId?: string;
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
          // Use different endpoint based on checkout type
          const statusEndpoint = orderData.isOneClickCheckout || orderData.checkoutType === 'oneclick'
            ? `/api/payments/cashfree/link-status/${orderData.linkId}`
            : `/api/payments/cashfree/status/${orderData.orderId}`;
            
          const response = await fetch(statusEndpoint, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            },
          });

          if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const result = await response.json();
              
              // Handle different status formats for links vs orders
              let status;
              if (orderData.isOneClickCheckout || orderData.checkoutType === 'oneclick') {
                status = result.data?.linkStatus;
                // Check for successful payment link statuses
                if (status === 'PAID' || status === 'PARTIALLY_PAID') {
                  setPaymentStatus('success');
                  onSuccess();
                  clearInterval(statusCheckInterval);
                } else if (['EXPIRED', 'CANCELLED', 'FAILED', 'INACTIVE'].includes(status)) {
                  setPaymentStatus('failed');
                  setError(`Payment ${status.toLowerCase()}`);
                  onError(`Payment ${status.toLowerCase()}`);
                  clearInterval(statusCheckInterval);
                }
              } else {
                status = result.data?.orderStatus;
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
  }, [processing, orderData, onSuccess, onError]);

  const handleCashfreePayment = () => {
    setProcessing(true);
    setError(null);
    setPaymentStatus('processing');

    try {
      const checkoutType = orderData.isOneClickCheckout || orderData.checkoutType === 'oneclick' ? 'One-Click Checkout' : 'Standard Checkout';
      console.log(`🔄 Redirecting to Cashfree ${checkoutType} payment page...`);
      
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

  const checkoutType = orderData.isOneClickCheckout || orderData.checkoutType === 'oneclick' ? 'oneclick' : 'standard';
  const paymentId = orderData.linkId || orderData.orderId;

  return (
    <div className="cli-terminal border border-cli-gray rounded-lg p-6 bg-cli-darker">
      <div className="mb-6">
        <h3 className="font-mono text-xl font-bold text-primary-500 mb-2">
          ./cashfree-payment --{checkoutType} --secure
        </h3>
        <div className="font-mono text-sm text-cli-light-gray space-y-1">
          <div>Package: {packageInfo.name}</div>
          <div>Credits: {packageInfo.credits}</div>
          <div>Amount: {formatAmount(packageInfo.price)}</div>
          <div className="text-xs text-cli-gray">
            {checkoutType === 'oneclick' ? 'Link ID' : 'Order ID'}: {paymentId}
          </div>
          <div className="text-xs text-cli-gray">
            Checkout: {checkoutType === 'oneclick' ? 'One-Click Direct Link' : 'Standard Hosted Page'}
          </div>
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
          <div className="text-xs mt-1">
            Using {checkoutType === 'oneclick' ? 'One-Click Checkout' : 'Standard Checkout'} flow
          </div>
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
        
        {checkoutType === 'oneclick' && (
          <div className="p-4 rounded border border-primary-500 bg-primary-900/20">
            <h4 className="font-mono text-sm font-medium text-primary-400 mb-2">
              ⚡ One-Click Checkout Enabled
            </h4>
            <div className="text-xs font-mono text-cli-light-gray space-y-1">
              <div>✅ Direct payment link - no redirects</div>
              <div>✅ Faster checkout experience</div>
              <div>✅ Mobile optimized interface</div>
              <div>⏰ Link expires in 24 hours</div>
            </div>
          </div>
        )}
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
              : checkoutType === 'oneclick'
                ? './pay-with-cashfree --oneclick --secure'
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
