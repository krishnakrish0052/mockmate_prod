import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeftIcon,
  CreditCardIcon,
  CheckIcon,
  SparklesIcon,
  StarIcon,
  GiftIcon,
  CommandLineIcon,
  CurrencyDollarIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliBadge,
} from '../ui/CliComponents';
import CashfreePaymentForm from './CashfreePaymentForm';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  originalPrice?: number;
  popular: boolean;
  features: string[];
  bonus?: number;
  description: string;
}

interface PaymentGateway {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  supportedCurrencies: string[];
  supportedCountries: string[];
}

const CreditsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<string>('cashfree');
  const [availableGateways, setAvailableGateways] = useState<PaymentGateway[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [currentOrderData, setCurrentOrderData] = useState<any>(null);
  const [currentPackage, setCurrentPackage] = useState<CreditPackage | null>(null);
  const [currentGateway, setCurrentGateway] = useState<string>('cashfree');

  // Initialize Cashfree payment system
  useEffect(() => {
    console.log('🔍 Initializing Cashfree payment system...');
    console.log('✅ Cashfree ready - no client-side initialization required');
  }, []);
  
  // Fetch available payment gateways
  useEffect(() => {
    const fetchGateways = async () => {
      try {
        const response = await axios.get('/api/payments/gateways');
        if (response.data.success) {
          const gateways = response.data.gateways.filter((g: PaymentGateway) => g.active);
          setAvailableGateways(gateways);
          
          // Set default gateway to the first available one
          if (gateways.length > 0) {
            setSelectedGateway(gateways[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch payment gateways:', error);
        // Default to Cashfree if gateway fetch fails
        setAvailableGateways([{ id: 'cashfree', name: 'Cashfree', active: true, priority: 100, supportedCurrencies: ['INR', 'USD'], supportedCountries: ['IN'] }]);
      }
    };

    fetchGateways();
  }, []);

  // Fetch credit packages from database
  useEffect(() => {
    const fetchPackages = async () => {
      try {
        setPackagesLoading(true);
        const response = await axios.get('/api/payments/packages');

        if (response.data.success) {
          // Transform backend data to frontend format
          const packages = response.data.packages.map((pkg: any) => {
            const credits = pkg.credits;
            const priceInDollars = pkg.price / 100; // Backend returns price in cents
            const basePriceInDollars = pkg.basePrice / 100;
            const bonusCredits = Number(pkg.bonusCredits);
            const discount = Number(pkg.discount) || 0;

            return {
              id: pkg.id,
              name: pkg.name,
              credits: credits,
              price: priceInDollars,
              originalPrice: discount > 0 ? basePriceInDollars : undefined,
              popular: pkg.popular || false,
              bonus: bonusCredits > 0 ? bonusCredits : undefined, // Only set if > 0
              description: pkg.description || `${credits} credits for your interview preparation`,
              features: [
                `${credits} interview sessions`,
                'AI-powered feedback',
                'Detailed performance analysis',
                'Progress tracking',
                ...(bonusCredits > 0 ? [`+${bonusCredits} bonus credits`] : []),
                ...(pkg.features || []), // Additional features from admin
              ],
            };
          });
          setCreditPackages(packages);
        }
      } catch (error) {
        console.error('Failed to fetch packages:', error);
        setCreditPackages([]);
        // Show user-friendly error message instead of fallback data
        alert('Failed to load credit packages. Please refresh the page and try again.');
      } finally {
        setPackagesLoading(false);
      }
    };

    fetchPackages();
  }, []);

  const handlePurchase = async (packageId: string) => {
    const selectedPkg = creditPackages.find(pkg => pkg.id === packageId);
    if (!selectedPkg) return;

    setLoading(true);
    setSelectedPackage(packageId);

    try {
      console.log('Creating payment intent for package:', packageId);
      
      // Create payment intent using the selected gateway
      const response = await axios.post('/api/payments/create-payment-intent', {
        packageId,
        gateway: selectedGateway,
      });

      console.log('Payment intent response:', response.data);

      if (response.data.paymentIntent) {
        const { paymentIntent, package: packageData, gateway } = response.data;
        setCurrentGateway(gateway);
        
        if (gateway === 'cashfree') {
          // Handle Cashfree order data
          console.log('🔍 Cashfree Order Details:', {
            orderId: paymentIntent.id,
            paymentLink: paymentIntent.paymentLink,
            orderToken: paymentIntent.orderToken,
            status: paymentIntent.status
          });
          
          if (!paymentIntent.paymentLink) {
            console.error('❌ Missing paymentLink in Cashfree order:', paymentIntent);
            alert(
              '❌ Payment Setup Error\n\n' +
              'The Cashfree order was created but is missing the payment link.\n' +
              'This is likely a backend configuration issue.\n\n' +
              'Please contact support or try again later.'
            );
            return;
          }
          
          // Show the Cashfree payment form
          console.log('✅ Cashfree order created, showing payment form');
          setCurrentOrderData({
            orderId: paymentIntent.id,
            cfOrderId: paymentIntent.id,
            paymentSessionId: paymentIntent.paymentSessionId || '',
            orderToken: paymentIntent.orderToken || '',
            paymentLink: paymentIntent.paymentLink,
          });
        }
        
        setCurrentPackage({
          ...selectedPkg,
          name: packageData.name,
          credits: packageData.credits,
          price: packageData.price, // Backend already returns price in cents
        });
        setShowPaymentForm(true);
      } else {
        throw new Error('Invalid payment intent response format');
      }
    } catch (error: any) {
      console.error('Payment failed:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      if (error.response?.status === 401) {
        alert('🔐 Authentication Required\n\nPlease log in to purchase credits.');
        window.location.href = '/login';
      } else if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Invalid payment request';
        const errorDetails = error.response?.data?.details ? JSON.stringify(error.response.data.details, null, 2) : '';
        
        alert(
          `❌ Payment Request Error (400)\n\n` +
          `Error: ${errorMsg}\n` +
          `${errorDetails ? `Details: ${errorDetails}\n` : ''}` +
          `\nPlease check the browser console for more details.`
        );
      } else if (error.response?.status === 500) {
        alert('🔧 Payment system error. Please try again later or contact support.');
      } else {
        alert(
          `💥 Payment Failed\n\n` +
          `Status: ${error.response?.status || 'Unknown'}\n` +
          `Error: ${error.response?.data?.error || error.message}\n\n` +
          `Please check the browser console for more details.`
        );
      }
    } finally {
      setLoading(false);
      setSelectedPackage(null);
    }
  };

  const handlePaymentSuccess = async () => {
    console.log('🎉 Payment completed successfully!');
    setShowPaymentForm(false);
    setCurrentOrderData(null);
    setCurrentPackage(null);
    
    // Show success message
    alert(
      '✅ Payment Successful!\n\n' +
      'Your credits have been added to your account.\n' +
      'Thank you for your purchase!'
    );
    
    // Refresh user data to show updated credits
    await refreshUser();
  };

  const handlePaymentError = (error: string) => {
    console.error('❌ Payment failed:', error);
    alert(`❌ Payment Failed\n\n${error}\n\nPlease try again or contact support.`);
  };

  const handlePaymentCancel = () => {
    console.log('Payment canceled by user');
    setShowPaymentForm(false);
    setCurrentOrderData(null);
    setCurrentPackage(null);
  };

  const calculateSavings = (originalPrice: number, currentPrice: number) => {
    return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  };

  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />

      {/* Payment Form Modal */}
      {showPaymentForm && currentOrderData && currentPackage && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75'>
          <div className='relative mx-4 w-full max-w-md'>
            <button
              onClick={handlePaymentCancel}
              className='absolute -top-12 right-0 text-cli-light-gray hover:text-cli-white'
            >
              <XMarkIcon className='h-6 w-6' />
            </button>
            
            <CashfreePaymentForm
              orderData={currentOrderData}
              packageInfo={{
                name: currentPackage.name,
                credits: currentPackage.credits,
                price: currentPackage.price,
              }}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onCancel={handlePaymentCancel}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <header className='relative z-10 border-b border-cli-gray bg-cli-darker'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between py-4'>
            <div className='flex items-center space-x-4'>
              <Link
                to='/dashboard'
                className='flex items-center space-x-2 font-mono text-cli-light-gray transition-colors hover:text-cli-white'
              >
                <ArrowLeftIcon className='h-5 w-5' />
                <span>$ cd ../dashboard</span>
              </Link>
            </div>
            <div className='flex items-center space-x-3'>
              <CliBadge variant='success' className='animate-pulse'>
                BALANCE: {user?.credits} CREDITS
              </CliBadge>
              <div className='cli-terminal h-6 w-6 p-1'>
                <CurrencyDollarIcon className='h-full w-full text-primary-500' />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        {/* Hero Section */}
        <TerminalWindow title='mockmate@store:~$ ./credit-shop.sh --interactive' className='mb-8'>
          <div className='p-8 text-center'>
            <TypingText
              text='Interview Credits Store'
              className='mb-4 font-mono text-3xl font-bold text-primary-500'
              speed={40}
            />
            <div className='mb-6 font-mono text-lg text-cli-light-gray'>
              Expand your interview preparation arsenal with AI-powered sessions
            </div>
            <div className='space-y-1 font-mono text-sm text-cli-gray'>
              <div>$ cat /store/packages.json</div>
              <div>$ ./select-package --best-fit</div>
            </div>
          </div>
        </TerminalWindow>

        {/* Current Balance Card */}
        <CliCard className='mb-8 transition-all hover:shadow-glow-golden'>
          <div className='p-6'>
            <div className='flex items-center justify-between'>
              <div>
                <div className='mb-2 flex items-center space-x-3'>
                  <CliBadge variant='info'>WALLET</CliBadge>
                  <span className='font-mono text-lg text-cli-light-gray'>Current Balance</span>
                </div>
                <div className='cli-glow mb-2 font-mono text-4xl font-bold text-cli-white'>
                  {user?.credits} <span className='text-primary-500'>CREDITS</span>
                </div>
                <div className='font-mono text-sm text-cli-gray'>
                  $ sessions-remaining:{' '}
                  {user?.credits === 1 ? '1 interview' : `${user?.credits} interviews`}
                </div>
              </div>
              <div className='text-primary-500 opacity-20'>
                <SparklesIcon className='h-16 w-16' />
              </div>
            </div>
          </div>
        </CliCard>

        {/* Credit Packages */}
        <div className='mb-12 grid grid-cols-1 gap-8 md:grid-cols-3'>
          {packagesLoading ? (
            <div className='col-span-full py-12 text-center'>
              <TypingText
                text='Loading credit packages...'
                className='mb-4 font-mono text-lg text-primary-500'
              />
              <div className='font-mono text-sm text-cli-gray'>
                $ ./fetch-packages --from-database
              </div>
            </div>
          ) : creditPackages.length === 0 ? (
            <div className='col-span-full py-12 text-center'>
              <div className='mb-2 font-mono text-lg text-cli-light-gray'>
                No packages available
              </div>
              <div className='font-mono text-sm text-cli-gray'>
                $ echo "No packages found in database"
              </div>
            </div>
          ) : (
            creditPackages.map(pkg => (
              <CliCard
                key={pkg.id}
                className={`relative transition-all duration-200 hover:shadow-glow-golden ${
                  pkg.popular
                    ? 'scale-105 transform border-primary-500'
                    : 'border-cli-gray hover:border-primary-300'
                }`}
              >
                {pkg.popular && (
                  <div className='absolute -top-4 left-1/2 -translate-x-1/2 transform'>
                    <CliBadge variant='success' className='flex items-center'>
                      <StarIcon className='mr-1 h-4 w-4' />
                      MOST POPULAR
                    </CliBadge>
                  </div>
                )}

                <div className='p-8'>
                  <div className='mb-6 text-center'>
                    <h3 className='mb-2 font-mono text-xl font-bold text-primary-500'>
                      {pkg.name}
                    </h3>
                    <p className='mb-4 font-mono text-sm text-cli-light-gray'>{pkg.description}</p>

                    <div className='mb-2 flex items-center justify-center space-x-2'>
                      <span className='font-mono text-4xl font-bold text-cli-white'>
                        ${pkg.price}
                      </span>
                      {pkg.originalPrice && (
                        <div className='text-left'>
                          <div className='font-mono text-lg text-cli-gray line-through'>
                            ${pkg.originalPrice}
                          </div>
                          <div className='font-mono text-sm font-medium text-cli-green'>
                            Save {calculateSavings(pkg.originalPrice, pkg.price)}%
                          </div>
                        </div>
                      )}
                    </div>

                    <div className='flex items-center justify-center space-x-1'>
                      <span className='font-mono text-2xl font-bold text-primary-500'>
                        {pkg.credits}
                      </span>
                      {pkg.bonus && pkg.bonus > 0 && (
                        <>
                          <span className='font-mono text-lg text-cli-white'>+</span>
                          <span className='font-mono text-lg font-bold text-cli-green'>
                            {pkg.bonus}
                          </span>
                          <GiftIcon className='ml-1 h-4 w-4 text-cli-green' />
                        </>
                      )}
                      <span className='ml-1 font-mono text-sm text-cli-light-gray'>credits</span>
                    </div>
                  </div>

                  <ul className='mb-8 space-y-3'>
                    {pkg.features.map((feature, index) => (
                      <li key={index} className='flex items-start space-x-3'>
                        <CheckIcon className='mt-0.5 h-5 w-5 flex-shrink-0 text-cli-green' />
                        <span className='font-mono text-sm text-cli-light-gray'>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <CliButton
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={loading && selectedPackage === pkg.id}
                    variant={pkg.popular ? 'primary' : 'secondary'}
                    className='w-full'
                    isLoading={loading && selectedPackage === pkg.id}
                  >
                    {loading && selectedPackage === pkg.id
                      ? './processing-payment...'
                      : `./purchase ${pkg.name.toLowerCase().replace(' ', '-')}`}
                  </CliButton>
                </div>
              </CliCard>
            ))
          )}
        </div>

        {/* Payment Gateways Selection */}
        <TerminalWindow title='mockmate@store:~$ ./payment-gateways --select' className='mb-8'>
          <div className='p-8'>
            <div className='mb-6 text-center'>
              <TypingText
                text='Select Payment Gateway'
                className='mb-4 font-mono text-xl font-bold text-primary-500'
                speed={50}
              />
              <div className='font-mono text-sm text-cli-gray'>$ ls /payment/gateways/ --active</div>
            </div>
            
            {availableGateways.length === 0 ? (
              <div className='text-center py-8'>
                <div className='font-mono text-lg text-cli-light-gray mb-2'>
                  No active payment gateways available
                </div>
                <div className='font-mono text-sm text-cli-gray'>
                  $ echo "Please contact administrator to enable payment gateways"
                </div>
              </div>
            ) : (
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                {availableGateways.map((gateway) => (
                  <CliButton
                    key={gateway.id}
                    onClick={() => setSelectedGateway(gateway.id)}
                    variant={selectedGateway === gateway.id ? 'primary' : 'secondary'}
                    className='flex h-auto items-center justify-start space-x-3 p-4 text-left'
                  >
                    <div className='text-2xl'>
                      {gateway.id === 'stripe' ? '💳' : gateway.id === 'cashfree' ? '🇮🇳' : '💰'}
                    </div>
                    <div>
                      <div className='font-mono font-medium'>./{gateway.id}</div>
                      <div className='font-mono text-xs text-cli-gray'>
                        {gateway.name} - Priority: {gateway.priority}
                      </div>
                      <div className='font-mono text-xs text-cli-gray'>
                        {gateway.supportedCurrencies.join(', ')}
                      </div>
                    </div>
                  </CliButton>
                ))}
              </div>
            )}
          </div>
        </TerminalWindow>

        {/* FAQ Section */}
        <TerminalWindow title='mockmate@store:~$ ./faq.sh --common-questions' className='mb-8'>
          <div className='p-8'>
            <div className='mb-8 text-center'>
              <TypingText
                text='Frequently Asked Questions'
                className='mb-4 font-mono text-xl font-bold text-primary-500'
                speed={50}
              />
              <div className='font-mono text-sm text-cli-gray'>
                $ grep -i "question" /docs/faq.txt
              </div>
            </div>
            <div className='grid grid-cols-1 gap-8 md:grid-cols-2'>
              <div>
                <h4 className='mb-3 font-mono font-bold text-cli-white'>
                  $ man credits --how-it-works
                </h4>
                <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                  Each interview session costs 1 credit. Credits are consumed when you start a new
                  session, regardless of whether you complete it.
                </p>
              </div>
              <div>
                <h4 className='mb-3 font-mono font-bold text-cli-white'>
                  $ credits --expiry-policy
                </h4>
                <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                  No, your credits never expire. You can use them whenever you're ready to practice
                  your interview skills.
                </p>
              </div>
              <div>
                <h4 className='mb-3 font-mono font-bold text-cli-white'>
                  $ refund --terms-conditions
                </h4>
                <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                  We offer refunds for unused credits within 30 days of purchase. Contact our
                  support team for assistance.
                </p>
              </div>
              <div>
                <h4 className='mb-3 font-mono font-bold text-cli-white'>
                  $ security --payment-safety
                </h4>
                <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                  Yes, all payments are processed securely through industry-standard encryption and
                  trusted payment providers.
                </p>
              </div>
            </div>
          </div>
        </TerminalWindow>

        {/* Support Section */}
        <CliCard className='text-center'>
          <div className='p-8'>
            <div className='mb-6'>
              <TypingText
                text='Need Technical Support?'
                className='mb-2 font-mono text-lg font-bold text-primary-500'
                speed={50}
              />
              <div className='mb-4 font-mono text-sm text-cli-light-gray'>
                Our support team is here to help with any questions about credits or payments.
              </div>
              <div className='font-mono text-xs text-cli-gray'>$ ./support --available 24/7</div>
            </div>
            <div className='flex justify-center space-x-4'>
              <CliButton variant='ghost'>./contact-support --help</CliButton>
              <CliButton variant='secondary'>./billing-history --view</CliButton>
            </div>
          </div>
        </CliCard>
      </div>
    </div>
  );
};

export default CreditsPage;
