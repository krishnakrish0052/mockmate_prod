import React, { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import axios from 'axios';
import { CliButton } from '../ui/CliComponents';

interface StripePaymentFormProps {
  paymentIntent: {
    id: string;
    clientSecret: string;
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

const StripePaymentForm: React.FC<StripePaymentFormProps> = ({
  paymentIntent,
  packageInfo,
  onSuccess,
  onError,
  onCancel
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please wait.');
      return;
    }

    setProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('Card element not found');
      setProcessing(false);
      return;
    }

    try {
      console.log('🔄 Confirming payment with Stripe...');
      
      const { error: confirmError, paymentIntent: confirmedPayment } = await stripe.confirmCardPayment(
        paymentIntent.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              // You can add billing details here if needed
            },
          },
        }
      );

      if (confirmError) {
        console.error('❌ Payment confirmation error:', confirmError);
        setError(confirmError.message || 'Payment failed');
        onError(confirmError.message || 'Payment failed');
      } else if (confirmedPayment?.status === 'succeeded') {
        console.log('✅ Payment succeeded!', confirmedPayment);
        
        // Immediately process the payment on the backend to add credits
        try {
          console.log('🔄 Processing payment on backend...');
          const processResult = await axios.post('/api/payments/process-payment-success', {
            paymentIntentId: confirmedPayment.id
          });
          
          if (processResult.data.success) {
            console.log('✅ Credits added successfully:', processResult.data.creditsAdded);
            onSuccess();
          } else {
            console.error('❌ Failed to process payment on backend:', processResult.data);
            onError(`Payment succeeded but failed to add credits: ${processResult.data.message || processResult.data.error}`);
          }
        } catch (processError) {
          console.error('❌ Error processing payment on backend:', processError);
          onError(`Payment succeeded but failed to add credits. Please contact support with payment ID: ${confirmedPayment.id}`);
        }
      } else {
        console.warn('⚠️ Payment status:', confirmedPayment?.status);
        setError(`Payment status: ${confirmedPayment?.status}`);
        onError(`Payment status: ${confirmedPayment?.status}`);
      }
    } catch (err: any) {
      console.error('💥 Payment processing error:', err);
      setError(err.message || 'An unexpected error occurred');
      onError(err.message || 'An unexpected error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#1a1a1a',
        '::placeholder': {
          color: '#666666',
        },
        iconColor: '#00ff9f',
      },
      invalid: {
        color: '#ff6b6b',
        iconColor: '#ff6b6b',
      },
    },
    hidePostalCode: true,
  };

  return (
    <div className="cli-terminal border border-cli-gray rounded-lg p-6 bg-cli-darker">
      <div className="mb-6">
        <h3 className="font-mono text-xl font-bold text-primary-500 mb-2">
          ./complete-purchase --secure
        </h3>
        <div className="font-mono text-sm text-cli-light-gray space-y-1">
          <div>Package: {packageInfo.name}</div>
          <div>Credits: {packageInfo.credits}</div>
          <div>Amount: ${(packageInfo.price / 100).toFixed(2)}</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block font-mono text-sm font-medium text-cli-light-gray mb-2">
            $ enter-card-details --secure
          </label>
          <div className="cli-input p-4 rounded border border-cli-gray bg-cli-black">
            <CardElement options={cardElementOptions} />
          </div>
        </div>

        {error && (
          <div className="cli-error font-mono text-sm p-3 rounded border border-red-500 bg-red-900/20 text-red-400">
            ❌ Error: {error}
          </div>
        )}

        <div className="flex space-x-3">
          <CliButton
            type="submit"
            disabled={!stripe || processing}
            variant="primary"
            className="flex-1"
            isLoading={processing}
          >
            {processing ? './processing-payment...' : './confirm-payment --now'}
          </CliButton>
          
          <CliButton
            type="button"
            onClick={onCancel}
            disabled={processing}
            variant="ghost"
          >
            ./cancel
          </CliButton>
        </div>
      </form>

      <div className="mt-4 font-mono text-xs text-cli-gray">
        <div>🔒 Secured by Stripe</div>
        <div>💳 We never store your card details</div>
      </div>
    </div>
  );
};

export default StripePaymentForm;
