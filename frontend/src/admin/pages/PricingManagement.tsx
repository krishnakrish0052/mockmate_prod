import React, { useState, useEffect } from 'react';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliInput,
  CliSelect,
  CliTextarea,
} from '../components/ui/CliComponents';
import {
  CurrencyDollarIcon,
  CreditCardIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl, API_ENDPOINTS, createAuthHeaders } from '../utils/apiConfig';
import { StarIcon } from '@heroicons/react/24/solid';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_purchases?: number;
  total_revenue?: number;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billing_cycle: 'monthly' | 'yearly';
  features: string[];
  credits_per_month: number;
  description: string;
  is_active: boolean;
  is_popular: boolean;
  created_at: string;
  updated_at: string;
  total_subscribers?: number;
  total_revenue?: number;
}

const PricingManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('packages');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Credit Packages State
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [packageForm, setPackageForm] = useState({
    name: '',
    credits: 0,
    price: 0,
    currency: 'USD',
    description: '',
    is_active: true,
  });

  // Subscription Plans State
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    price: 0,
    currency: 'USD',
    billing_cycle: 'monthly' as 'monthly' | 'yearly',
    features: [''],
    credits_per_month: 0,
    description: '',
    is_active: true,
    is_popular: false,
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'packages') {
        await fetchCreditPackages();
      } else {
        await fetchSubscriptionPlans();
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCreditPackages = async () => {
    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.ADMIN.PRICING_PACKAGES), {
        headers: createAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Map backend response to frontend structure
          const packages = (result.data.packages || []).map(pkg => ({
            id: pkg.id,
            name: pkg.packageName || pkg.package_name,
            credits: pkg.creditsAmount || pkg.credits_amount,
            price: pkg.priceUsd || pkg.price_usd,
            currency: 'USD', // Backend doesn't store currency yet
            description: pkg.description || '',
            is_active: pkg.isActive ?? pkg.is_active ?? true,
            created_at: pkg.createdAt || pkg.created_at,
            updated_at: pkg.updatedAt || pkg.updated_at,
            total_purchases: pkg.purchaseCount || pkg.total_purchases || 0,
            total_revenue: pkg.totalRevenue || pkg.total_revenue || 0,
          }));
          setCreditPackages(packages);
        }
      }
    } catch (error) {
      console.error('Failed to fetch credit packages:', error);
    }
  };

  const fetchSubscriptionPlans = async () => {
    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.ADMIN.PRICING_PLANS), {
        headers: createAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSubscriptionPlans(result.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch subscription plans:', error);
    }
  };

  // Credit Package Functions
  const openPackageModal = (pkg?: CreditPackage) => {
    if (pkg) {
      setEditingPackage(pkg);
      setPackageForm({
        name: pkg.name,
        credits: pkg.credits,
        price: pkg.price,
        currency: pkg.currency,
        description: pkg.description,
        is_active: pkg.is_active,
      });
    } else {
      setEditingPackage(null);
      setPackageForm({
        name: '',
        credits: 0,
        price: 0,
        currency: 'USD',
        description: '',
        is_active: true,
      });
    }
    setShowPackageModal(true);
  };

  const savePackage = async () => {
    setSaving(true);
    try {
      const url = editingPackage
        ? getApiUrl(`${API_ENDPOINTS.ADMIN.PRICING_PACKAGES}/${editingPackage.id}`)
        : getApiUrl(API_ENDPOINTS.ADMIN.PRICING_PACKAGES);

      const method = editingPackage ? 'PUT' : 'POST';

      const requestBody = editingPackage
        ? {
            // For updates, only send the fields that should be updated
            packageName: packageForm.name,
            creditsAmount: packageForm.credits,
            priceUsd: packageForm.price,
            description: packageForm.description,
            isActive: packageForm.is_active,
          }
        : {
            // For creates, include the packageId
            packageId: `pkg_${Date.now()}`,
            packageName: packageForm.name,
            creditsAmount: packageForm.credits,
            priceUsd: packageForm.price,
            description: packageForm.description,
            isActive: packageForm.is_active,
          };

      const response = await fetch(url, {
        method,
        headers: createAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchCreditPackages();
          setShowPackageModal(false);
          alert(`Credit package ${editingPackage ? 'updated' : 'created'} successfully!`);
        } else {
          console.error('API Error:', result);
          alert('Failed to save package: ' + (result.message || 'Unknown error'));
        }
      } else {
        const errorText = await response.text();
        console.error('HTTP Error:', response.status, errorText);
        alert(`Failed to save package: HTTP ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Failed to save package:', error);
      alert('Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  const togglePackageStatus = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(getApiUrl(`${API_ENDPOINTS.ADMIN.PRICING_PACKAGES}/${id}`), {
        method: 'PUT',
        headers: createAuthHeaders(),
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (response.ok) {
        await fetchCreditPackages();
      }
    } catch (error) {
      console.error('Failed to toggle package status:', error);
    }
  };

  const deletePackage = async (id: string) => {
    if (!confirm('Are you sure you want to delete this credit package?')) return;

    try {
      const response = await fetch(getApiUrl(`${API_ENDPOINTS.ADMIN.PRICING_PACKAGES}/${id}`), {
        method: 'DELETE',
        headers: createAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchCreditPackages();
          alert('Credit package deleted successfully!');
        } else {
          alert('Failed to delete package: ' + result.message);
        }
      }
    } catch (error) {
      console.error('Failed to delete package:', error);
      alert('Failed to delete package');
    }
  };

  // Subscription Plan Functions
  const openPlanModal = (plan?: SubscriptionPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        billing_cycle: plan.billing_cycle,
        features: [...plan.features],
        credits_per_month: plan.credits_per_month,
        description: plan.description,
        is_active: plan.is_active,
        is_popular: plan.is_popular,
      });
    } else {
      setEditingPlan(null);
      setPlanForm({
        name: '',
        price: 0,
        currency: 'USD',
        billing_cycle: 'monthly',
        features: [''],
        credits_per_month: 0,
        description: '',
        is_active: true,
        is_popular: false,
      });
    }
    setShowPlanModal(true);
  };

  const savePlan = async () => {
    setSaving(true);
    try {
      const url = editingPlan
        ? getApiUrl(`${API_ENDPOINTS.ADMIN.PRICING_PLANS}/${editingPlan.id}`)
        : getApiUrl(API_ENDPOINTS.ADMIN.PRICING_PLANS);

      const method = editingPlan ? 'PUT' : 'POST';

      const requestBody = editingPlan
        ? {
            // For updates, only send the fields that should be updated
            planName: planForm.name,
            monthlyPriceUsd: planForm.price,
            monthlyCredits: planForm.credits_per_month,
            description: planForm.description,
            features: planForm.features.filter(f => f.trim() !== ''),
            isActive: planForm.is_active,
            isFeatured: planForm.is_popular,
          }
        : {
            // For creates, include the planId
            planId: `plan_${Date.now()}`,
            planName: planForm.name,
            monthlyPriceUsd: planForm.price,
            monthlyCredits: planForm.credits_per_month,
            description: planForm.description,
            features: planForm.features.filter(f => f.trim() !== ''),
            isActive: planForm.is_active,
            isFeatured: planForm.is_popular,
          };

      const response = await fetch(url, {
        method,
        headers: createAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchSubscriptionPlans();
          setShowPlanModal(false);
          alert(`Subscription plan ${editingPlan ? 'updated' : 'created'} successfully!`);
        } else {
          console.error('API Error:', result);
          alert('Failed to save plan: ' + (result.message || 'Unknown error'));
        }
      } else {
        const errorText = await response.text();
        console.error('HTTP Error:', response.status, errorText);
        alert(`Failed to save plan: HTTP ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Failed to save plan:', error);
      alert('Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const togglePlanStatus = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(getApiUrl(`${API_ENDPOINTS.ADMIN.PRICING_PLANS}/${id}`), {
        method: 'PUT',
        headers: createAuthHeaders(),
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (response.ok) {
        await fetchSubscriptionPlans();
      }
    } catch (error) {
      console.error('Failed to toggle plan status:', error);
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subscription plan?')) return;

    try {
      const response = await fetch(getApiUrl(`${API_ENDPOINTS.ADMIN.PRICING_PLANS}/${id}`), {
        method: 'DELETE',
        headers: createAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchSubscriptionPlans();
          alert('Subscription plan deleted successfully!');
        } else {
          alert('Failed to delete plan: ' + result.message);
        }
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
      alert('Failed to delete plan');
    }
  };

  const addFeature = () => {
    setPlanForm(prev => ({
      ...prev,
      features: [...prev.features, ''],
    }));
  };

  const updateFeature = (index: number, value: string) => {
    setPlanForm(prev => ({
      ...prev,
      features: prev.features.map((feature, i) => (i === index ? value : feature)),
    }));
  };

  const removeFeature = (index: number) => {
    setPlanForm(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~$ ./pricing --loading'>
          <div className='p-6'>
            <TypingText
              text='Loading pricing data...'
              className='mb-4 text-xl font-semibold text-primary-500'
            />
            <div className='animate-pulse space-y-4'>
              <div className='h-4 w-3/4 rounded bg-cli-gray'></div>
              <div className='h-4 w-1/2 rounded bg-cli-gray'></div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  const tabs = [
    { id: 'packages', label: 'Credit Packages', icon: CreditCardIcon },
    { id: 'plans', label: 'Subscription Plans', icon: StarIcon },
  ];

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~$ ./pricing --manage --interactive'>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex items-center space-x-4'>
              <div className='bg-cli-terminal flex h-12 w-12 items-center justify-center rounded-full'>
                <CurrencyDollarIcon className='h-6 w-6 text-primary-500' />
              </div>
              <div>
                <TypingText
                  text='Pricing Management System'
                  className='font-mono text-xl font-bold text-primary-500'
                />
                <div className='font-mono text-sm text-cli-light-gray'>
                  Manage credit packages and subscription plans
                </div>
              </div>
            </div>
            <div className='flex items-center space-x-4'>
              <div className='flex items-center space-x-2'>
                <div className='h-3 w-3 rounded-full bg-cli-green'></div>
                <span className='font-mono text-sm text-cli-green'>ACTIVE</span>
              </div>
              <CliButton
                variant='primary'
                onClick={() => (activeTab === 'packages' ? openPackageModal() : openPlanModal())}
                className='flex items-center space-x-2'
              >
                <PlusIcon className='h-4 w-4' />
                <span>Add {activeTab === 'packages' ? 'Package' : 'Plan'}</span>
              </CliButton>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className='mb-6 flex space-x-2'>
            {tabs.map(tab => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 rounded px-4 py-2 font-mono text-sm transition-all ${
                    activeTab === tab.id
                      ? 'shadow-glow-primary bg-primary-500 text-white'
                      : 'bg-cli-terminal text-cli-light-gray hover:bg-cli-gray'
                  }`}
                >
                  <IconComponent className='h-4 w-4' />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className='font-mono text-sm text-cli-green'>
            $ ./pricing-manager --category={activeTab} --manage
          </div>
        </div>
      </TerminalWindow>

      {/* Content */}
      <TerminalWindow title={`admin@mockmate:~$ cat pricing_${activeTab}.db`}>
        <div className='p-6'>
          {activeTab === 'packages' ? (
            <div className='space-y-4'>
              <div className='mb-6 flex items-center justify-between'>
                <h3 className='font-mono text-lg font-bold text-primary-500'>Credit Packages</h3>
                <div className='font-mono text-sm text-cli-light-gray'>
                  Total: {creditPackages.length} packages
                </div>
              </div>

              {creditPackages.length === 0 ? (
                <div className='py-12 text-center'>
                  <div className='mb-2 font-mono text-cli-light-gray'>No credit packages found</div>
                  <div className='font-mono text-xs text-cli-green'>
                    $ find ./packages -name "*.json" | wc -l: 0
                  </div>
                </div>
              ) : (
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                  {creditPackages.map(pkg => (
                    <CliCard key={pkg.id} className='hover:shadow-glow-info transition-all'>
                      <div className='p-4'>
                        <div className='mb-3 flex items-center justify-between'>
                          <div className='flex items-center space-x-2'>
                            <CreditCardIcon className='h-5 w-5 text-primary-500' />
                            <h4 className='font-mono font-bold text-cli-white'>{pkg.name}</h4>
                          </div>
                          <CliBadge variant={pkg.is_active ? 'success' : 'danger'}>
                            {pkg.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </CliBadge>
                        </div>

                        <div className='mb-4 space-y-2 font-mono text-sm'>
                          <div className='text-xl font-bold text-cli-green'>
                            {pkg.credits} Credits
                          </div>
                          <div className='text-cli-amber'>
                            ${pkg.price} {pkg.currency}
                          </div>
                          <div className='text-cli-light-gray'>
                            ${(pkg.price / pkg.credits).toFixed(3)} per credit
                          </div>
                          {pkg.description && (
                            <div className='text-xs text-cli-cyan'>{pkg.description}</div>
                          )}
                        </div>

                        {(pkg.total_purchases || pkg.total_revenue) && (
                          <div className='mb-4 border-t border-cli-gray pt-3'>
                            <div className='grid grid-cols-2 gap-2 font-mono text-xs'>
                              <div className='text-cli-cyan'>Sales: {pkg.total_purchases || 0}</div>
                              <div className='text-cli-green'>
                                Revenue: ${pkg.total_revenue || 0}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className='flex space-x-2'>
                          <button
                            onClick={() => openPackageModal(pkg)}
                            className='p-1 text-cli-light-gray transition-colors hover:text-primary-500'
                            title='Edit Package'
                          >
                            <PencilIcon className='h-4 w-4' />
                          </button>
                          <button
                            onClick={() => togglePackageStatus(pkg.id, pkg.is_active)}
                            className={`p-1 transition-colors ${
                              pkg.is_active
                                ? 'text-cli-light-gray hover:text-red-500'
                                : 'text-cli-light-gray hover:text-cli-green'
                            }`}
                            title={pkg.is_active ? 'Deactivate Package' : 'Activate Package'}
                          >
                            {pkg.is_active ? (
                              <XMarkIcon className='h-4 w-4' />
                            ) : (
                              <CheckCircleIcon className='h-4 w-4' />
                            )}
                          </button>
                          <button
                            onClick={() => deletePackage(pkg.id)}
                            className='p-1 text-cli-light-gray transition-colors hover:text-red-500'
                            title='Delete Package'
                          >
                            <TrashIcon className='h-4 w-4' />
                          </button>
                        </div>
                      </div>
                    </CliCard>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className='space-y-4'>
              <div className='mb-6 flex items-center justify-between'>
                <h3 className='font-mono text-lg font-bold text-primary-500'>Subscription Plans</h3>
                <div className='font-mono text-sm text-cli-light-gray'>
                  Total: {subscriptionPlans.length} plans
                </div>
              </div>

              {subscriptionPlans.length === 0 ? (
                <div className='py-12 text-center'>
                  <div className='mb-2 font-mono text-cli-light-gray'>
                    No subscription plans found
                  </div>
                  <div className='font-mono text-xs text-cli-green'>
                    $ find ./plans -name "*.json" | wc -l: 0
                  </div>
                </div>
              ) : (
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                  {subscriptionPlans.map(plan => (
                    <CliCard key={plan.id} className='hover:shadow-glow-info transition-all'>
                      <div className='p-4'>
                        <div className='mb-3 flex items-center justify-between'>
                          <div className='flex items-center space-x-2'>
                            <StarIcon
                              className={`h-5 w-5 ${plan.is_popular ? 'text-cli-amber' : 'text-primary-500'}`}
                            />
                            <h4 className='font-mono font-bold text-cli-white'>{plan.name}</h4>
                          </div>
                          <div className='flex space-x-1'>
                            {plan.is_popular && <CliBadge variant='warning'>POPULAR</CliBadge>}
                            <CliBadge variant={plan.is_active ? 'success' : 'danger'}>
                              {plan.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </CliBadge>
                          </div>
                        </div>

                        <div className='mb-4 space-y-2 font-mono text-sm'>
                          <div className='text-xl font-bold text-cli-green'>
                            ${plan.price} {plan.currency}
                          </div>
                          <div className='text-cli-cyan'>/{plan.billing_cycle}</div>
                          <div className='text-cli-amber'>
                            {plan.credits_per_month} credits/month
                          </div>
                          {plan.description && (
                            <div className='text-xs text-cli-light-gray'>{plan.description}</div>
                          )}
                        </div>

                        {plan.features.length > 0 && (
                          <div className='mb-4 border-t border-cli-gray pt-3'>
                            <div className='space-y-1'>
                              {plan.features.slice(0, 3).map((feature, index) => (
                                <div
                                  key={index}
                                  className='flex items-center space-x-1 font-mono text-xs text-cli-cyan'
                                >
                                  <CheckCircleIcon className='h-3 w-3' />
                                  <span>{feature}</span>
                                </div>
                              ))}
                              {plan.features.length > 3 && (
                                <div className='font-mono text-xs text-cli-light-gray'>
                                  +{plan.features.length - 3} more features
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {(plan.total_subscribers || plan.total_revenue) && (
                          <div className='mb-4 border-t border-cli-gray pt-3'>
                            <div className='grid grid-cols-2 gap-2 font-mono text-xs'>
                              <div className='text-cli-cyan'>
                                Subscribers: {plan.total_subscribers || 0}
                              </div>
                              <div className='text-cli-green'>
                                Revenue: ${plan.total_revenue || 0}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className='flex space-x-2'>
                          <button
                            onClick={() => openPlanModal(plan)}
                            className='p-1 text-cli-light-gray transition-colors hover:text-primary-500'
                            title='Edit Plan'
                          >
                            <PencilIcon className='h-4 w-4' />
                          </button>
                          <button
                            onClick={() => togglePlanStatus(plan.id, plan.is_active)}
                            className={`p-1 transition-colors ${
                              plan.is_active
                                ? 'text-cli-light-gray hover:text-red-500'
                                : 'text-cli-light-gray hover:text-cli-green'
                            }`}
                            title={plan.is_active ? 'Deactivate Plan' : 'Activate Plan'}
                          >
                            {plan.is_active ? (
                              <XMarkIcon className='h-4 w-4' />
                            ) : (
                              <CheckCircleIcon className='h-4 w-4' />
                            )}
                          </button>
                          <button
                            onClick={() => deletePlan(plan.id)}
                            className='p-1 text-cli-light-gray transition-colors hover:text-red-500'
                            title='Delete Plan'
                          >
                            <TrashIcon className='h-4 w-4' />
                          </button>
                        </div>
                      </div>
                    </CliCard>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className='mt-6 font-mono text-xs text-cli-green'>
            $ tail -f pricing_{activeTab}.log | grep -E "CREATE|UPDATE|DELETE"
          </div>
        </div>
      </TerminalWindow>

      {/* Credit Package Modal */}
      {showPackageModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75'>
          <div className='w-full max-w-2xl'>
            <TerminalWindow
              title={`admin@mockmate:~$ ./package ${editingPackage ? '--edit' : '--create'}`}
            >
              <div className='p-6'>
                <div className='mb-6 flex items-center justify-between'>
                  <TypingText
                    text={editingPackage ? 'Edit Credit Package' : 'Create Credit Package'}
                    className='font-mono text-lg font-bold text-primary-500'
                  />
                  <CliButton variant='secondary' onClick={() => setShowPackageModal(false)}>
                    Close
                  </CliButton>
                </div>

                <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Package Name
                    </label>
                    <CliInput
                      value={packageForm.name}
                      onChange={e => setPackageForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder='Enter package name'
                    />
                  </div>

                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Credits
                    </label>
                    <CliInput
                      type='number'
                      value={(packageForm.credits ?? 0).toString()}
                      onChange={e =>
                        setPackageForm(prev => ({
                          ...prev,
                          credits: parseInt(e.target.value) || 0,
                        }))
                      }
                      placeholder='Number of credits'
                    />
                  </div>

                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Price
                    </label>
                    <CliInput
                      type='number'
                      step='0.01'
                      value={(packageForm.price ?? 0).toString()}
                      onChange={e =>
                        setPackageForm(prev => ({
                          ...prev,
                          price: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder='Package price'
                    />
                  </div>

                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Currency
                    </label>
                    <CliSelect
                      value={packageForm.currency}
                      onChange={e =>
                        setPackageForm(prev => ({ ...prev, currency: e.target.value }))
                      }
                      options={[
                        { value: 'USD', label: 'USD' },
                        { value: 'EUR', label: 'EUR' },
                        { value: 'GBP', label: 'GBP' },
                      ]}
                    />
                  </div>

                  <div className='md:col-span-2'>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Description
                    </label>
                    <CliInput
                      value={packageForm.description}
                      onChange={e =>
                        setPackageForm(prev => ({ ...prev, description: e.target.value }))
                      }
                      placeholder='Package description'
                    />
                  </div>

                  <div>
                    <label className='flex items-center space-x-2'>
                      <input
                        type='checkbox'
                        checked={packageForm.is_active ?? true}
                        value=''
                        onChange={e =>
                          setPackageForm(prev => ({ ...prev, is_active: e.target.checked }))
                        }
                        className='rounded'
                      />
                      <span className='font-mono text-sm text-cli-light-gray'>Active Package</span>
                    </label>
                  </div>
                </div>

                <div className='flex space-x-3'>
                  <CliButton
                    variant='primary'
                    onClick={savePackage}
                    disabled={
                      saving ||
                      !packageForm.name ||
                      packageForm.credits <= 0 ||
                      packageForm.price <= 0
                    }
                  >
                    {saving ? 'Saving...' : editingPackage ? 'Update Package' : 'Create Package'}
                  </CliButton>
                  <CliButton variant='secondary' onClick={() => setShowPackageModal(false)}>
                    Cancel
                  </CliButton>
                </div>

                <div className='mt-4 font-mono text-xs text-cli-green'>
                  $ echo "Package data validated" &gt;&gt; packages.log
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      )}

      {/* Subscription Plan Modal */}
      {showPlanModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75'>
          <div className='max-h-[90vh] w-full max-w-4xl overflow-auto'>
            <TerminalWindow
              title={`admin@mockmate:~$ ./plan ${editingPlan ? '--edit' : '--create'}`}
            >
              <div className='p-6'>
                <div className='mb-6 flex items-center justify-between'>
                  <TypingText
                    text={editingPlan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}
                    className='font-mono text-lg font-bold text-primary-500'
                  />
                  <CliButton variant='secondary' onClick={() => setShowPlanModal(false)}>
                    Close
                  </CliButton>
                </div>

                <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Plan Name
                    </label>
                    <CliInput
                      value={planForm.name}
                      onChange={e => setPlanForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder='Enter plan name'
                    />
                  </div>

                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Price
                    </label>
                    <CliInput
                      type='number'
                      step='0.01'
                      value={(planForm.price ?? 0).toString()}
                      onChange={e =>
                        setPlanForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))
                      }
                      placeholder='Plan price'
                    />
                  </div>

                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Currency
                    </label>
                    <CliSelect
                      value={planForm.currency}
                      onChange={e => setPlanForm(prev => ({ ...prev, currency: e.target.value }))}
                      options={[
                        { value: 'USD', label: 'USD' },
                        { value: 'EUR', label: 'EUR' },
                        { value: 'GBP', label: 'GBP' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Billing Cycle
                    </label>
                    <CliSelect
                      value={planForm.billing_cycle}
                      onChange={e =>
                        setPlanForm(prev => ({
                          ...prev,
                          billing_cycle: e.target.value as 'monthly' | 'yearly',
                        }))
                      }
                      options={[
                        { value: 'monthly', label: 'Monthly' },
                        { value: 'yearly', label: 'Yearly' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Credits per Month
                    </label>
                    <CliInput
                      type='number'
                      value={(planForm.credits_per_month ?? 0).toString()}
                      onChange={e =>
                        setPlanForm(prev => ({
                          ...prev,
                          credits_per_month: parseInt(e.target.value) || 0,
                        }))
                      }
                      placeholder='Monthly credit allocation'
                    />
                  </div>

                  <div className='md:col-span-2'>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Description
                    </label>
                    <CliInput
                      value={planForm.description}
                      onChange={e =>
                        setPlanForm(prev => ({ ...prev, description: e.target.value }))
                      }
                      placeholder='Plan description'
                    />
                  </div>
                </div>

                {/* Features */}
                <div className='mb-6'>
                  <div className='mb-3 flex items-center justify-between'>
                    <label className='block font-mono text-sm text-cli-light-gray'>Features</label>
                    <CliButton variant='secondary' onClick={addFeature} className='text-xs'>
                      Add Feature
                    </CliButton>
                  </div>
                  <div className='space-y-2'>
                    {planForm.features.map((feature, index) => (
                      <div key={index} className='flex items-center space-x-2'>
                        <CliInput
                          value={feature}
                          onChange={e => updateFeature(index, e.target.value)}
                          placeholder='Enter feature description'
                          className='flex-1'
                        />
                        <button
                          onClick={() => removeFeature(index)}
                          className='p-2 text-cli-light-gray transition-colors hover:text-red-500'
                        >
                          <TrashIcon className='h-4 w-4' />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Options */}
                <div className='mb-6 grid grid-cols-2 gap-4'>
                  <div>
                    <label className='flex items-center space-x-2'>
                      <input
                        type='checkbox'
                        checked={planForm.is_active ?? true}
                        value=''
                        onChange={e =>
                          setPlanForm(prev => ({ ...prev, is_active: e.target.checked }))
                        }
                        className='rounded'
                      />
                      <span className='font-mono text-sm text-cli-light-gray'>Active Plan</span>
                    </label>
                  </div>
                  <div>
                    <label className='flex items-center space-x-2'>
                      <input
                        type='checkbox'
                        checked={planForm.is_popular ?? false}
                        value=''
                        onChange={e =>
                          setPlanForm(prev => ({ ...prev, is_popular: e.target.checked }))
                        }
                        className='rounded'
                      />
                      <span className='font-mono text-sm text-cli-light-gray'>Popular Plan</span>
                    </label>
                  </div>
                </div>

                <div className='flex space-x-3'>
                  <CliButton
                    variant='primary'
                    onClick={savePlan}
                    disabled={saving || !planForm.name || planForm.price <= 0}
                  >
                    {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                  </CliButton>
                  <CliButton variant='secondary' onClick={() => setShowPlanModal(false)}>
                    Cancel
                  </CliButton>
                </div>

                <div className='mt-4 font-mono text-xs text-cli-green'>
                  $ echo "Plan data validated" &gt;&gt; plans.log
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingManagement;
