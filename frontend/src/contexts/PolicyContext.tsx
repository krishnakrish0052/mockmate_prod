import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Policy {
  id: string;
  slug: string;
  title: string;
  content: string;
  version: string;
  lastUpdated: string;
  isActive: boolean;
  effectiveDate: string;
}

interface PolicyContextType {
  policies: Policy[];
  setPolicies: React.Dispatch<React.SetStateAction<Policy[]>>;
  getActivePolicies: () => Policy[];
  getPolicyBySlug: (slug: string) => Policy | undefined;
  addPolicy: (policy: Policy) => void;
  updatePolicy: (id: string, updates: Partial<Policy>) => void;
  deletePolicy: (id: string) => void;
  togglePolicyStatus: (id: string) => void;
}

const PolicyContext = createContext<PolicyContextType | undefined>(undefined);

export const usePolicies = (): PolicyContextType => {
  const context = useContext(PolicyContext);
  if (!context) {
    throw new Error('usePolicies must be used within a PolicyProvider');
  }
  return context;
};

const DEFAULT_POLICIES: Policy[] = [
  {
    id: '1',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    content: `# Privacy Policy

## Information Collection

We collect information you provide directly to us when you create an account, use our services, or contact us.

### Data Types We Collect
- Personal information (name, email, phone)
- Usage data and analytics
- Device and browser information
- Session and interaction data

## How We Use Your Information

We use the information we collect to:
- Provide and improve our services
- Communicate with you
- Ensure security and prevent fraud
- Comply with legal obligations

### Data Sharing

We do not sell your personal information. We may share data with:
- Service providers who assist our operations
- Legal authorities when required by law
- Business partners with your consent

## Data Security

We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.

## Your Rights

You have the right to:
- Access your personal information
- Correct inaccurate data
- Request deletion of your data
- Object to processing
- Data portability

## Contact Us

If you have questions about this Privacy Policy, please contact us at privacy@mockmate.com.

*Last updated: ${new Date().toLocaleDateString()}*`,
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    isActive: true,
    effectiveDate: '2024-01-01',
  },
  {
    id: '2',
    slug: 'terms-of-service',
    title: 'Terms of Service',
    content: `# Terms of Service

## Acceptance of Terms

By accessing and using MockMate, you accept and agree to be bound by these terms and conditions.

### User Responsibilities

You agree to:
- Follow all community guidelines
- Respect intellectual property rights
- Use the service appropriately and lawfully
- Maintain account security
- Provide accurate information

## Service Availability

We strive to maintain service availability but do not guarantee:
- Uninterrupted access
- Error-free operation
- Compatibility with all devices

### Account Termination

We reserve the right to suspend or terminate accounts for:
- Violation of these terms
- Fraudulent activity
- Extended inactivity
- Legal compliance requirements

## Intellectual Property

All content, features, and functionality are owned by MockMate and are protected by copyright, trademark, and other intellectual property laws.

## Limitation of Liability

MockMate shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.

## Changes to Terms

We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting.

## Governing Law

These terms are governed by the laws of [Your Jurisdiction].

## Contact Information

For questions about these Terms of Service, contact us at legal@mockmate.com.

*Last updated: ${new Date().toLocaleDateString()}*`,
    version: '1.2',
    lastUpdated: new Date().toISOString(),
    isActive: true,
    effectiveDate: '2024-01-15',
  },
  {
    id: '3',
    slug: 'cookie-policy',
    title: 'Cookie Policy',
    content: `# Cookie Policy

## What Are Cookies

Cookies are small text files stored on your device when you visit our website.

### Types of Cookies We Use

- **Essential Cookies**: Required for basic site functionality
- **Analytics Cookies**: Help us understand how you use our site
- **Preference Cookies**: Remember your settings and preferences
- **Marketing Cookies**: Used to show relevant advertisements

## Managing Cookies

You can control cookies through:
- Browser settings
- Our cookie preference center
- Third-party opt-out tools

### Cookie Retention

Cookies are retained for different periods:
- Session cookies: Until you close your browser
- Persistent cookies: Up to 2 years
- Analytics cookies: Up to 26 months

## Third-Party Cookies

We may use third-party services that set cookies:
- Google Analytics for usage statistics
- Social media platforms for sharing
- Advertising networks for relevant ads

## Your Choices

You can:
- Accept all cookies
- Reject non-essential cookies
- Customize cookie preferences
- Delete existing cookies

## Updates to This Policy

We may update this Cookie Policy to reflect changes in our practices or applicable law.

## Contact Us

For questions about our use of cookies, contact us at cookies@mockmate.com.

*Last updated: ${new Date().toLocaleDateString()}*`,
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    isActive: false,
    effectiveDate: '2024-02-01',
  },
];

export const PolicyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [policies, setPolicies] = useState<Policy[]>(DEFAULT_POLICIES);
  const [isLoading, setIsLoading] = useState(true);

  // Load policies from localStorage on mount
  useEffect(() => {
    const loadPoliciesFromStorage = () => {
      console.log('📋 PolicyContext: Loading policies from localStorage...');
      const storedPolicies = localStorage.getItem('mockmate_policies');
      console.log('📋 Raw localStorage content:', storedPolicies);

      if (storedPolicies) {
        try {
          const parsedPolicies = JSON.parse(storedPolicies);
          setIsLoading(true);
          setPolicies(parsedPolicies);
          setIsLoading(false);
          console.log('✅ Loaded policies from localStorage:', parsedPolicies.length, 'policies');
          console.log(
            '📋 Active policies:',
            parsedPolicies.filter(p => p.isActive).map(p => p.title)
          );
        } catch (error) {
          console.warn('❌ Failed to load policies from localStorage, using defaults:', error);
          setIsLoading(false);
        }
      } else {
        console.log('📋 No policies in localStorage, using defaults');
        setIsLoading(false);
      }
    };

    // Load initially
    loadPoliciesFromStorage();

    // Listen for storage changes (when admin updates policies in different tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mockmate_policies' && e.newValue) {
        console.log('Detected policy changes in localStorage from different tab, reloading...');
        try {
          const updatedPolicies = JSON.parse(e.newValue);
          setPolicies(updatedPolicies);
        } catch (error) {
          console.warn('Failed to parse updated policies from localStorage');
        }
      }
    };

    // Listen for custom policy update events (within same window)
    const handlePolicyUpdate = (e: CustomEvent) => {
      // Avoid processing our own events
      if (!isLoading) {
        console.log('Detected policy update event within same window, reloading...');
        loadPoliciesFromStorage();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('policiesUpdated', handlePolicyUpdate as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('policiesUpdated', handlePolicyUpdate as EventListener);
    };
  }, []);

  // Save policies to localStorage whenever policies change
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('mockmate_policies', JSON.stringify(policies));
      console.log('💾 Saved policies to localStorage:', policies.length, 'policies');
      console.log(
        '💾 Active policies being saved:',
        policies.filter(p => p.isActive).map(p => p.title)
      );

      // Dispatch custom event to notify other components in the same window
      window.dispatchEvent(
        new CustomEvent('policiesUpdated', {
          detail: { policies },
        })
      );
    }
  }, [policies, isLoading]);

  const getActivePolicies = (): Policy[] => {
    const activePolicies = policies.filter(policy => policy.isActive);
    console.log(
      '🔍 getActivePolicies called, returning:',
      activePolicies.length,
      'active policies'
    );
    console.log(
      '🔍 Active policy titles:',
      activePolicies.map(p => p.title)
    );
    return activePolicies;
  };

  const getPolicyBySlug = (slug: string): Policy | undefined => {
    return policies.find(policy => policy.slug === slug);
  };

  const addPolicy = (policy: Policy): void => {
    setPolicies(prev => [...prev, policy]);
  };

  const updatePolicy = (id: string, updates: Partial<Policy>): void => {
    setPolicies(prev =>
      prev.map(policy =>
        policy.id === id ? { ...policy, ...updates, lastUpdated: new Date().toISOString() } : policy
      )
    );
  };

  const deletePolicy = (id: string): void => {
    setPolicies(prev => prev.filter(policy => policy.id !== id));
  };

  const togglePolicyStatus = (id: string): void => {
    setPolicies(prev =>
      prev.map(policy =>
        policy.id === id
          ? { ...policy, isActive: !policy.isActive, lastUpdated: new Date().toISOString() }
          : policy
      )
    );
  };

  const value: PolicyContextType = {
    policies,
    setPolicies,
    getActivePolicies,
    getPolicyBySlug,
    addPolicy,
    updatePolicy,
    deletePolicy,
    togglePolicyStatus,
  };

  // Debug helper for browser console
  if (typeof window !== 'undefined') {
    (window as any).debugPolicies = {
      getPolicies: () => policies,
      getActivePolicies,
      clearPolicies: () => {
        localStorage.removeItem('mockmate_policies');
        setPolicies(DEFAULT_POLICIES);
      },
      reloadPolicies: () => {
        const storedPolicies = localStorage.getItem('mockmate_policies');
        if (storedPolicies) {
          setPolicies(JSON.parse(storedPolicies));
        }
      },
      testUpdate: () => {
        const testPolicy: Policy = {
          id: 'test-' + Date.now(),
          slug: 'test-policy',
          title: 'Test Policy',
          content: '# Test Policy\n\nThis is a test policy.',
          version: '1.0',
          lastUpdated: new Date().toISOString(),
          isActive: true,
          effectiveDate: new Date().toISOString().split('T')[0],
        };
        addPolicy(testPolicy);
      },
    };
  }

  return <PolicyContext.Provider value={value}>{children}</PolicyContext.Provider>;
};
