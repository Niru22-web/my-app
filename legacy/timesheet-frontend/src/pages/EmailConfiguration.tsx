import React, { useState, useEffect, useRef } from 'react';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import {
  EnvelopeIcon,
  ServerIcon,
  KeyIcon,
  ShieldCheckIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  GlobeAltIcon,
  LockClosedIcon,
  ArrowTopRightOnSquareIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

// UI Components
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';

interface OAuthConnection {
  provider: string;
  email: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt?: string;
}

interface EmailConfig {
  emailProvider: string;
  enableNotifications: boolean;
  oauthConnection?: OAuthConnection;
}

interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  authType: 'OAuth' | 'API';
  setupNote: string;
}

const EmailConfiguration: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  
  const [config, setConfig] = useState<EmailConfig>(() => ({
    emailProvider: 'outlook-365',
    enableNotifications: true
  }));

  const [savedConfig, setSavedConfig] = useState<EmailConfig | null>(null);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [selectedProviderInfo, setSelectedProviderInfo] = useState<ProviderConfig | null>(null);
  
  // Separate states for Outlook and Gmail connection details
  const [outlookConnection, setOutlookConnection] = useState<OAuthConnection | null>(null);
  const [gmailConnection, setGmailConnection] = useState<OAuthConnection | null>(null);
  const [oauthLoading, setOAuthLoading] = useState(false);
  
  // Track active provider tab
  const [activeProvider, setActiveProvider] = useState<'outlook-365' | 'google-workspace'>('outlook-365');

  // Ref to prevent duplicate API calls in StrictMode
  const hasFetched = useRef(false);

  // Check if user is admin, if not redirect to dashboard
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'Admin') {
      window.location.href = '/';
    }
  }, [user]);

  // Add debugging for user authentication
  useEffect(() => {
    console.log('User authentication status:', {
      user: user,
      token: localStorage.getItem('authToken'),
      isAdmin: user && (user.role === 'admin' || user.role === 'Admin')
    });
  }, [user]);

  useEffect(() => {
    // Prevent duplicate calls in React StrictMode
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetchEmailConfig();
    fetchProviderConfigs();
    checkOAuthStatus();
  }, []);

  // Update selected provider info whenever activeProvider or providerConfigs changes
  useEffect(() => {
    if (providerConfigs.length > 0) {
      const activeInfo = providerConfigs.find((p: ProviderConfig) => p.id === activeProvider);
      setSelectedProviderInfo(activeInfo || providerConfigs[0] || null);
    }
  }, [activeProvider, providerConfigs]);

  // Auto-switch tab based on loaded config emailProvider
  useEffect(() => {
    if (config.emailProvider === 'google-workspace' || config.emailProvider === 'gmail-workspace') {
      setActiveProvider('google-workspace');
    } else if (config.emailProvider === 'outlook-365' || config.emailProvider === 'outlook-workspace') {
      setActiveProvider('outlook-365');
    }
  }, [config.emailProvider]);

  // Check for OAuth callback on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const provider = urlParams.get('provider');
    const email = urlParams.get('email');
    const error = urlParams.get('error');
    const outlookConnected = urlParams.get('outlook');

    // Handle OAuth callback result - new format
    if (outlookConnected === 'connected') {
      const connectedEmail = urlParams.get('email');
      setTestResult({
        success: true,
        message: 'Outlook account connected successfully!',
        details: { 
          provider: 'outlook', 
          email: connectedEmail || 'Connected',
          connectedAt: new Date().toISOString() 
        }
      });
      setShowTestModal(true);
      setActiveProvider('outlook-365');
      
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
      
      // Refresh OAuth status
      checkOAuthStatus();
    }
    // Handle OAuth callback result - legacy format
    else if (success === 'true' && provider && email) {
      const isGmail = provider === 'gmail' || provider === 'google';
      setTestResult({
        success: true,
        message: `${isGmail ? 'Gmail' : 'Outlook'} account ${email} connected successfully!`,
        details: { provider: isGmail ? 'gmail' : 'outlook', email, connectedAt: new Date().toISOString() }
      });
      setShowTestModal(true);
      setActiveProvider(isGmail ? 'google-workspace' : 'outlook-365');
      
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
      
      // Refresh OAuth status
      checkOAuthStatus();
    } else if (success === 'false' && provider && error) {
      const isGmail = provider === 'gmail' || provider === 'google';
      setTestResult({
        success: false,
        message: `Failed to connect ${isGmail ? 'Gmail' : 'Outlook'}: ${error}`,
        details: { provider, error }
      });
      setShowTestModal(true);
      setActiveProvider(isGmail ? 'google-workspace' : 'outlook-365');
      
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Listen for OAuth messages from popup
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data.type === 'OAUTH_SUCCESS') {
        const searchParams = new URLSearchParams(window.location.search);
        const outlookConnected = searchParams.get('outlook');
        const connectedEmail = searchParams.get('email');
        const provider = searchParams.get('provider');
        
        if (outlookConnected === 'connected') {
          setTestResult({
            success: true,
            message: 'Outlook account connected successfully!',
            details: { 
              provider: 'outlook', 
              status: 'Connected',
              email: connectedEmail || 'Connected',
              connectedAt: new Date().toLocaleString() 
            }
          });
          setShowTestModal(true);
          setActiveProvider('outlook-365');
          checkOAuthStatus();
          window.history.replaceState({}, '', '/email-configuration');
        } else if (provider === 'gmail' || provider === 'google') {
          setTestResult({
            success: true,
            message: 'Gmail account connected successfully!',
            details: { 
              provider: 'gmail', 
              status: 'Connected',
              email: connectedEmail || 'Connected',
              connectedAt: new Date().toLocaleString() 
            }
          });
          setShowTestModal(true);
          setActiveProvider('google-workspace');
          checkOAuthStatus();
          window.history.replaceState({}, '', '/email-configuration');
        }
        checkOAuthStatus();
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const checkOAuthStatus = async () => {
    try {
      console.log('🔍 Checking OAuth status...');
      const response = await API.get('/email/status');
      console.log('📊 OAuth status response:', response.data);
      
      if (response?.data?.success) {
        const resData = response.data;
        
        // Handle dual structure from backend controllers (email vs. email-connector)
        let outlookActive = false;
        let outlookEmail = '';
        let gmailActive = false;
        let gmailEmail = '';

        if ('outlookConnected' in resData) {
          outlookActive = !!resData.outlookConnected;
          outlookEmail = resData.providers?.outlook?.email || 'Connected';
          gmailActive = !!resData.gmailConnected;
          gmailEmail = resData.providers?.gmail?.email || 'Connected';
        } else if (resData.data) {
          const outlookData = resData.data.outlook;
          if (outlookData && (outlookData.connected || outlookData.isActive)) {
            outlookActive = true;
            outlookEmail = outlookData.email || 'Connected';
          }
          const gmailData = resData.data.gmail;
          if (gmailData && (gmailData.connected || gmailData.isActive)) {
            gmailActive = true;
            gmailEmail = gmailData.email || 'Connected';
          }
        }

        if (outlookActive) {
          setOutlookConnection({
            provider: 'outlook',
            email: outlookEmail,
            isActive: true,
            createdAt: new Date().toISOString()
          });
        } else {
          setOutlookConnection(null);
        }

        if (gmailActive) {
          setGmailConnection({
            provider: 'gmail',
            email: gmailEmail,
            isActive: true,
            createdAt: new Date().toISOString()
          });
        } else {
          setGmailConnection(null);
        }
      } else {
        setOutlookConnection(null);
        setGmailConnection(null);
      }
    } catch (err) {
      console.error('❌ Failed to check OAuth status:', err);
      setOutlookConnection(null);
      setGmailConnection(null);
    }
  };

  const fetchProviderConfigs = async () => {
    try {
      const response = await API.get('/email/provider-configurations');
      if (response?.data && Array.isArray(response.data)) {
        setProviderConfigs(response.data);
      } else {
        setProviderConfigs([]);
      }
    } catch (err) {
      console.error('Failed to fetch provider configurations:', err);
      // Fallback to hardcoded providers if API fails
      const fallbackProviders = [
        {
          id: 'outlook-365',
          name: 'Outlook 365',
          description: 'Use Microsoft Outlook or Office 365 account',
          authType: 'OAuth' as const,
          setupNote: 'Register app in Azure Active Directory and enable Mail.Send permission'
        },
        {
          id: 'google-workspace',
          name: 'Google Workspace',
          description: 'Use Gmail or Google Workspace account',
          authType: 'OAuth' as const,
          setupNote: 'Enable Gmail API in Google Cloud Console and configure OAuth credentials'
        }
      ];
      setProviderConfigs(fallbackProviders);
    }
  };

  const fetchEmailConfig = async () => {
    try {
      setLoading(true);
      const response = await API.get('/email/email-configuration');
      if (response?.data && typeof response.data === 'object') {
        setConfig(prev => ({ 
          ...prev, 
          ...response.data,
          enableNotifications: response.data.enableNotifications ?? prev.enableNotifications
        }));
        setSavedConfig(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch email configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectOutlook = () => {
    console.log('🔍 Attempting to connect Outlook OAuth...');
    const token = localStorage.getItem("authToken") || localStorage.getItem("token");
    
    if (token) {
      console.log('✅ Token found, redirecting to Outlook OAuth endpoint');
      const oauthUrl = `/api/email/oauth/outlook?token=${encodeURIComponent(token)}`;
      window.location.href = oauthUrl;
    } else {
      console.error('❌ No authentication token found');
      setTestResult({
        success: false,
        message: 'Authentication required. Please log in again.',
        details: { 
          error: 'No token found in localStorage',
          suggestion: 'Please log out and log back in to refresh your authentication token.'
        }
      });
      setShowTestModal(true);
    }
  };

  const handleDisconnectOutlook = async () => {
    if (!confirm('Are you sure you want to disconnect your Outlook account?')) {
      return;
    }

    try {
      setOAuthLoading(true);
      console.log('🔌 Disconnecting Outlook account...');
      
      await API.delete('/email/disconnect/outlook');
      
      console.log('✅ Outlook account disconnected successfully');
      setOutlookConnection(null);
      setTestResult({
        success: true,
        message: 'Outlook account disconnected successfully',
        details: null
      });
      setShowTestModal(true);
      await checkOAuthStatus();
    } catch (err: any) {
      console.error('❌ Failed to disconnect Outlook:', err);
      setTestResult({
        success: false,
        message: err?.response?.data?.message || 'Failed to disconnect Outlook account',
        details: null
      });
      setShowTestModal(true);
    } finally {
      setOAuthLoading(false);
    }
  };

  const handleConnectGmail = () => {
    console.log('🔍 Attempting to connect Gmail OAuth...');
    const token = localStorage.getItem("authToken") || localStorage.getItem("token");
    
    if (token) {
      console.log('✅ Token found, redirecting to Google OAuth endpoint');
      const oauthUrl = `/api/email/oauth/google?token=${encodeURIComponent(token)}`;
      window.location.href = oauthUrl;
    } else {
      console.error('❌ No authentication token found');
      setTestResult({
        success: false,
        message: 'Authentication required. Please log in again.',
        details: { 
          error: 'No token found in localStorage',
          suggestion: 'Please log out and log back in to refresh your authentication token.'
        }
      });
      setShowTestModal(true);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!confirm('Are you sure you want to disconnect your Google Workspace/Gmail account?')) {
      return;
    }

    try {
      setOAuthLoading(true);
      console.log('🔌 Disconnecting Gmail account...');
      
      await API.delete('/email/disconnect/gmail');
      
      console.log('✅ Gmail account disconnected successfully');
      setGmailConnection(null);
      setTestResult({
        success: true,
        message: 'Google Workspace/Gmail account disconnected successfully',
        details: null
      });
      setShowTestModal(true);
      await checkOAuthStatus();
    } catch (err: any) {
      console.error('❌ Failed to disconnect Gmail:', err);
      setTestResult({
        success: false,
        message: err?.response?.data?.message || 'Failed to disconnect Gmail account',
        details: null
      });
      setShowTestModal(true);
    } finally {
      setOAuthLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const isGmail = activeProvider === 'google-workspace';
    const providerName = isGmail ? 'Gmail/Google' : 'Outlook';
    try {
      setTestLoading(true);
      const response = await API.post('/email/test-email-configuration', {
        to: user?.officeEmail || user?.email,
        subject: `Test Email from Timesheet Pro`,
        text: `This is a test email sent from your Timesheet Pro application using your connected ${providerName} account.`,
        html: `<p>This is a test email sent from your Timesheet Pro application using your connected <strong>${providerName}</strong> account.</p>`
      });
      
      if (response?.data) {
        const responseData = response.data;
        setTestResult({ 
          success: responseData.success === true, 
          message: responseData.message || 'Test email sent successfully',
          details: responseData.details 
        });
      } else {
        setTestResult({ 
          success: false, 
          message: `Unable to send test email. Please check your ${providerName} connection.`,
          details: null 
        });
      }
      setShowTestModal(true);
    } catch (err: any) {
      const errorData = err?.response?.data;
      setTestResult({ 
        success: false, 
        message: errorData?.message || `Failed to send test email. Please check your ${providerName} connection.`,
        details: errorData?.details || null 
      });
      setShowTestModal(true);
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      const updatedConfig = {
        ...config,
        emailProvider: activeProvider === 'google-workspace' ? 'google-workspace' : 'outlook-365'
      };
      await API.post('/email/email-configuration', updatedConfig);
      setConfig(updatedConfig);
      setSavedConfig(updatedConfig);
      setTestResult({ success: true, message: 'Email configuration saved successfully!' });
      setShowTestModal(true);
    } catch (err: any) {
      setTestResult({ 
        success: false, 
        message: err?.response?.data?.message || 'Failed to save email configuration.' 
      });
      setShowTestModal(true);
    } finally {
      setLoading(false);
    }
  };

  // Status check for selected and overall connection
  const activeConnection = activeProvider === 'google-workspace' ? gmailConnection : outlookConnection;
  const isCurrentProviderConnected = !!(activeConnection && activeConnection.isActive);
  const isAnyProviderConnected = !!((outlookConnection && outlookConnection.isActive) || (gmailConnection && gmailConnection.isActive));

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in max-h-[calc(100vh-200px)] lg:max-h-[calc(100vh-220px)] overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-none bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-slate-100 dark:border-slate-800/40 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary-500/10 rounded-xl text-primary-500 dark:text-primary-400">
            <EnvelopeIcon className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-secondary-900 dark:text-white tracking-tight">Email Configuration</h1>
            <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-0.5">Connect and manage your email workspace connectors for automated system notifications.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {isAnyProviderConnected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 rounded-xl text-success-700 dark:text-success-400 font-semibold text-xs uppercase tracking-wider shadow-sm">
              <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
              Connected
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/60 rounded-xl text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              Disconnected
            </div>
          )}
          
          <button
            onClick={() => {
              checkOAuthStatus();
              fetchEmailConfig();
            }}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all font-semibold text-sm cursor-pointer bg-white dark:bg-[#151F32]"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-hidden">
        {/* Left Card: Configuration Form */}
        <div className="lg:col-span-2 flex flex-col h-full bg-white dark:bg-[#151F32] rounded-2xl border border-slate-100 dark:border-slate-800/40 shadow-md overflow-hidden">
          {/* Card Header */}
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/40 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/10 flex-none">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-primary-500 rounded-full" />
              <h3 className="text-base font-bold text-secondary-900 dark:text-white uppercase tracking-wider">Workspace Connector Settings</h3>
            </div>
            <ServerIcon className="w-5 h-5 text-secondary-400" />
          </div>
          
          {/* Card Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Provider Selection Option Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Microsoft Outlook Option Card */}
              <div
                onClick={() => setActiveProvider('outlook-365')}
                className={`p-5 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                  activeProvider === 'outlook-365'
                    ? 'border-primary-500 bg-primary-500/5 dark:bg-primary-500/10 shadow-md'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151F32] hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-900/30'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-colors ${
                    activeProvider === 'outlook-365'
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {/* Outlook Brand Logo Icon */}
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M1.5 5.25a2.25 2.25 0 0 1 2.25-2.25h16.5a2.25 2.25 0 0 1 2.25 2.25v13.5a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18.75V5.25zm3.75 3.32v6.86c0 .414.336.75.75.75h9.75a.75.75 0 0 0 .75-.75V8.57l-5.185 3.24a1.5 1.5 0 0 1-1.63 0L5.25 8.57zm11.25-.975-5.185 3.24a.75.75 0 0 1-.815 0L5.31 7.595V15h9.19V7.595z"/>
                    </svg>
                  </div>
                  
                  {outlookConnection && outlookConnection.isActive ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-lg text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Disconnected
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">Microsoft Outlook 365</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Connect to Outlook using secure Microsoft Graph OAuth.</p>
                </div>
              </div>

              {/* Google Workspace Option Card */}
              <div
                onClick={() => setActiveProvider('google-workspace')}
                className={`p-5 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                  activeProvider === 'google-workspace'
                    ? 'border-primary-500 bg-primary-500/5 dark:bg-primary-500/10 shadow-md'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151F32] hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-900/30'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-colors ${
                    activeProvider === 'google-workspace'
                      ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {/* Google Workspace Icon */}
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.24 10.285V13.4h6.887c-.275 1.564-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.102 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 5.92 1 1 5.92 1 12s4.92 11 11.24 11c6.6 0 11-4.65 11-11.2 0-.756-.08-1.333-.176-1.785H12.24z"/>
                    </svg>
                  </div>
                  
                  {gmailConnection && gmailConnection.isActive ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-lg text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Disconnected
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">Google Workspace / Gmail</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Connect to Gmail using secure Google OAuth 2.0.</p>
                </div>
              </div>
            </div>

            {/* Selected Connection Status Panel */}
            <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-[#1E2C44]/20 dark:to-[#1E2C44]/5 rounded-2xl border border-slate-200/60 dark:border-slate-800/50 relative overflow-hidden group">
              {/* Subtle background glow */}
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary-500/5 dark:bg-primary-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-primary-500/10 dark:group-hover:bg-primary-500/20 transition-all duration-500" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                    activeProvider === 'google-workspace' 
                      ? 'bg-gradient-to-tr from-red-500 to-rose-600 shadow-rose-500/20' 
                      : 'bg-gradient-to-tr from-blue-500 to-indigo-600 shadow-blue-500/20'
                  }`}>
                    {activeProvider === 'google-workspace' ? (
                      <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.24 10.285V13.4h6.887c-.275 1.564-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.102 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 5.92 1 12 5.92 1 12s4.92 11 11.24 11c6.6 0 11-4.65 11-11.2 0-.756-.08-1.333-.176-1.785H12.24z"/>
                      </svg>
                    ) : (
                      <EnvelopeIcon className="w-7 h-7 text-white" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                      {activeProvider === 'google-workspace' ? 'Google Workspace' : 'Microsoft Outlook'}
                    </h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      Secure {activeProvider === 'google-workspace' ? 'Google OAuth 2.0 API' : 'Microsoft Graph OAuth'} integration
                    </p>
                  </div>
                </div>
                
                <span className={`self-start sm:self-auto px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  isCurrentProviderConnected 
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}>
                  {isCurrentProviderConnected ? 'Connected' : 'Not Configured'}
                </span>
              </div>

              {/* Connection Details */}
              {isCurrentProviderConnected && activeConnection ? (
                <div className="mb-6 p-5 bg-white dark:bg-[#151F32]/50 border border-emerald-100 dark:border-emerald-950/20 rounded-xl shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg text-emerald-500 dark:text-emerald-400">
                      <CheckCircleIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Connected User Account</p>
                      <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{activeConnection.email}</p>
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Connected on {activeConnection.createdAt ? new Date(activeConnection.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Recently'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-6 p-5 bg-slate-50/50 dark:bg-slate-900/30 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No {activeProvider === 'google-workspace' ? 'Google Workspace / Gmail' : 'Outlook'} account is currently linked. Connect an account below to start sending emails.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {!isCurrentProviderConnected ? (
                  <button
                    onClick={activeProvider === 'google-workspace' ? handleConnectGmail : handleConnectOutlook}
                    disabled={oauthLoading}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 text-white font-bold rounded-xl shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm ${
                      activeProvider === 'google-workspace'
                        ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-rose-500/10 hover:shadow-rose-500/20'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/10 hover:shadow-blue-500/20'
                    }`}
                  >
                    {oauthLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                        Connect to {activeProvider === 'google-workspace' ? 'Google Workspace' : 'Outlook'}
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={activeProvider === 'google-workspace' ? handleDisconnectGmail : handleDisconnectOutlook}
                    disabled={oauthLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-rose-200 dark:border-rose-950/20 text-rose-600 dark:text-rose-400 bg-white dark:bg-[#151F32] hover:bg-rose-50 dark:hover:bg-rose-950/10 hover:border-rose-300 dark:hover:border-rose-900/40 font-bold rounded-xl active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {oauthLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-rose-600 dark:border-rose-400 border-t-transparent" />
                        Disconnecting...
                      </>
                    ) : (
                      <>
                        <TrashIcon className="w-5 h-5" />
                        Disconnect {activeProvider === 'google-workspace' ? 'Google Workspace' : 'Outlook'} Account
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Notification Checkbox Section */}
            <div className="p-5 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-slate-100 dark:border-slate-800/40 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-all duration-200">
              <div className="flex items-center h-5 mt-0.5">
                <input
                  type="checkbox"
                  id="enableNotifications"
                  checked={config.enableNotifications}
                  onChange={(e) => setConfig(prev => ({ ...prev, enableNotifications: e.target.checked }))}
                  className="w-5 h-5 text-primary-500 focus:ring-primary-500 border-slate-300 dark:border-slate-700 rounded-md cursor-pointer accent-primary-500"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="enableNotifications" className="block text-sm font-bold text-slate-800 dark:text-white cursor-pointer select-none">
                  Enable System Notifications
                </label>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Allow the system to automatically trigger and send alert emails for employee registration requests, timesheet compliance alerts, and leave approval notifications.
                </span>
              </div>
            </div>
          </div>
          
          {/* Card Footer */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/40 flex items-center justify-between flex-none gap-4 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => setConfig({ emailProvider: 'outlook-365', enableNotifications: true })}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all font-bold text-sm cursor-pointer flex items-center gap-1.5 bg-transparent"
            >
              Reset to Defaults
            </button>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handleTestConnection}
                disabled={testLoading || !isCurrentProviderConnected}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-[#151F32] hover:bg-slate-50 dark:hover:bg-slate-800/60 font-semibold rounded-xl active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {testLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-600 dark:border-slate-400 border-t-transparent" />
                    Sending...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-4 h-4" />
                    Test Connection
                  </>
                )}
              </button>
              
              <button
                onClick={handleSaveSettings}
                disabled={loading || !isCurrentProviderConnected}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-md shadow-primary-500/10 hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Columns: Information Panels */}
        <div className="flex flex-col gap-6 overflow-y-auto no-scrollbar pb-6 min-h-0">
          {/* Card: Guide */}
          <div className="p-6 bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-white rounded-2xl border border-slate-800/80 shadow-md relative overflow-hidden group">
            <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 w-36 h-36 bg-primary-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-primary-500/20 transition-all duration-300" />
            
            <h3 className={`text-base font-bold tracking-wider mb-5 flex items-center gap-2 uppercase ${
              activeProvider === 'google-workspace' ? 'text-rose-400' : 'text-blue-400'
            }`}>
              <GlobeAltIcon className="w-5 h-5" />
              {activeProvider === 'google-workspace' ? 'Google Workspace Setup' : 'Outlook Setup Guide'}
            </h3>
            <div className="space-y-4">
              {(activeProvider === 'google-workspace' ? [
                'Click "Connect to Google Workspace" to start the OAuth authentication',
                'Sign in with your Google / Gmail account',
                'Grant permission to send emails and access your profile information',
                'Verify the status shows Connected, then click Test Connection'
              ] : [
                'Click "Connect to Outlook" to start the OAuth authentication',
                'Sign in with your Microsoft account',
                'Grant permission to send emails and access your profile',
                'Verify the status shows Connected, then click Test Connection'
              ]).map((step, index) => (
                <div key={index} className="flex items-start gap-3 text-sm">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 border ${
                    activeProvider === 'google-workspace'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}>
                    {index + 1}
                  </div>
                  <p className="text-slate-300 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Card: Security Features */}
          <div className="p-6 bg-white dark:bg-[#151F32] rounded-2xl border border-slate-100 dark:border-slate-800/40 shadow-sm">
            <h3 className="text-xs font-bold text-secondary-500 dark:text-secondary-400 uppercase tracking-widest mb-4">Security Features</h3>
            <div className="space-y-3.5">
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <LockClosedIcon className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-900 dark:text-blue-400">OAuth 2.0 Authentication</p>
                    <p className="text-xs text-blue-700 dark:text-blue-500/80 mt-1 leading-relaxed">Secure protocol integration with encrypted authorization tokens</p>
                  </div>
                </div>
              </div>
              
              <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-400">No Passwords Required</p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-500/80 mt-1 leading-relaxed">Uses secure OAuth tokens instead of SMTP credentials</p>
                  </div>
                </div>
              </div>
              
              <div className="p-3 bg-purple-50/50 dark:bg-purple-950/10 border border-purple-100 dark:border-purple-900/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <ShieldCheckIcon className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-purple-900 dark:text-purple-400">Auto Token Refresh</p>
                    <p className="text-xs text-purple-700 dark:text-purple-500/80 mt-1 leading-relaxed">Automatic token refresh for seamless background operation</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Email Features */}
          <div className="p-6 bg-white dark:bg-[#151F32] rounded-2xl border border-slate-100 dark:border-slate-800/40 shadow-sm">
            <h3 className="text-xs font-bold text-secondary-500 dark:text-secondary-400 uppercase tracking-widest mb-4">Email Features</h3>
            <div className="grid grid-cols-1 gap-2.5">
              {[
                'Employee Registration Emails',
                'Leave Approval/Rejection',
                'Timesheet Reminders',
                'Reimbursement Updates',
                'Password Reset Emails',
                'System Notifications'
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Test Result Modal */}
      <Modal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        title={testResult?.success ? "Connection Successful" : "Connection Failed"}
        size="md"
      >
        <div className="text-center py-6">
          {testResult?.success ? (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircleIcon className="w-10 h-10" />
              </div>
              <p className="text-base font-bold text-slate-900 dark:text-white">{testResult?.message || 'Connection successful'}</p>
              {testResult?.details && (
                <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl text-left border border-slate-100 dark:border-slate-800/40">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Connection Details:</h4>
                  <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900/40">
                      <span className="text-slate-400">Provider</span>
                      <span className="font-semibold text-slate-900 dark:text-white capitalize">{testResult.details?.provider || 'Outlook'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900/40">
                      <span className="text-slate-400">Email</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{testResult.details?.email || 'Connected'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Connected At</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {testResult.details?.connectedAt ? new Date(testResult.details.connectedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto shadow-md">
                <ExclamationTriangleIcon className="w-10 h-10" />
              </div>
              <p className="text-base font-bold text-slate-900 dark:text-white">{testResult?.message || 'Connection failed'}</p>
              {testResult?.details && (
                <div className="space-y-3">
                  {testResult.details?.suggestion && (
                    <div className="bg-amber-50 dark:bg-amber-950/10 p-5 rounded-2xl text-left border border-amber-100 dark:border-amber-900/30">
                      <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest mb-1.5">Suggested Solution:</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-500/80 leading-relaxed">{testResult.details.suggestion}</p>
                    </div>
                  )}
                  {testResult.details?.error && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl text-left border border-slate-100 dark:border-slate-800/40">
                      <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Technical Details:</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono overflow-x-auto whitespace-pre-wrap">{testResult.details.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="primary" size="sm" onClick={() => setShowTestModal(false)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default EmailConfiguration;
