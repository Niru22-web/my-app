import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  LockClosedIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import API from '../api';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const navigate = useNavigate();

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const handleSubmit = async (e: React.FormEvent, isResend = false) => {
    if (e) e.preventDefault();
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (isResend) {
      setIsResending(true);
    } else {
      setIsLoading(true);
    }
    
    setError('');

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const response = await API.post('/auth/forgot-password', { email: normalizedEmail });

      if (response.status === 200 || response.data?.success) {
        setIsSuccess(true);
      } else {
        setError(response.data?.message || 'Failed to send reset link. Please try again.');
      }
    } catch (err: any) {
      console.error('Forgot password error:', err);
      if (err.response?.status === 429) {
        setError('Too many requests. Please try again later.');
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('An error occurred. Please check your connection and try again.');
      }
    } finally {
      setIsLoading(false);
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen w-full font-sans flex flex-col lg:flex-row bg-[#f8fafc]">
      
      {/* Left Side: Branding & Features (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 bg-white flex-col justify-between p-12 relative border-r border-gray-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
        
        {/* Animated Background Blob */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-50 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-20">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-16"
          >
            <img src="/asa-logo.png" alt="ASA Logo" className="h-16 object-contain" />
          </motion.div>

          <div className="space-y-8 max-w-md">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">
                Secure Password Recovery
              </h2>
              <p className="text-gray-600 font-medium leading-relaxed">
                Protecting your data is our top priority. Our automated recovery system ensures you regain access quickly and safely.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-6 pt-8 border-t border-gray-100"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                  <ShieldCheckIcon className="w-5 h-5 text-[#00419c]" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Enterprise Grade Security</h3>
                  <p className="text-sm text-gray-500 mt-1">Multi-layered protection protocols for your account credentials.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                  <LockClosedIcon className="w-5 h-5 text-[#00419c]" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Encrypted Tokens</h3>
                  <p className="text-sm text-gray-500 mt-1">Reset links are uniquely generated and mathematically secured.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="relative z-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-100/50 rounded-xl text-sm font-semibold text-orange-800 shadow-sm">
            <ClockIcon className="w-5 h-5 text-orange-500" />
            Reset links expire after 15 minutes for security reasons.
          </div>
        </motion.div>
        
      </div>

      {/* Right Side: Form / Success Area */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[440px] bg-white rounded-3xl p-8 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/asa-logo.png" alt="ASA Logo" className="h-14 object-contain" />
          </div>

          <AnimatePresence mode="wait">
            {!isSuccess ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-black text-gray-900 mb-2">Forgot your password?</h1>
                  <p className="text-sm text-gray-500 font-medium leading-relaxed">
                    Enter your registered email address and we'll send you a secure reset link.
                  </p>
                </div>

                <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm border border-red-100 flex items-start gap-3 font-medium overflow-hidden"
                    >
                      <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm flex-shrink-0" />
                      {error}
                    </motion.div>
                  )}

                  <div className="space-y-2 group">
                    <label className="block text-sm font-bold text-gray-900 transition-colors group-focus-within:text-[#00419c]">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      placeholder="name@ashishshah.com"
                      required
                      className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-[#00419c]/10 focus:border-[#00419c] transition-all text-sm font-medium"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading || !email.trim()}
                      className="w-full relative flex items-center justify-center py-3.5 px-4 border border-transparent rounded-full shadow-md text-sm font-bold text-white bg-[#00419c] hover:bg-[#003380] transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                      {isLoading ? (
                        <div className="flex items-center gap-2">
                          <ArrowPathIcon className="w-5 h-5 animate-spin" />
                          Sending Link...
                        </div>
                      ) : (
                        "Send Reset Link"
                      )}
                    </button>
                  </div>
                </form>

                <div className="mt-8 text-center">
                  <button
                    onClick={() => navigate('/login')}
                    className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#00419c] transition-colors group"
                  >
                    <ArrowLeftIcon className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
                    Back to Login
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="text-center py-4"
              >
                <div className="w-20 h-20 mx-auto bg-green-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                  <CheckCircleIcon className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-3">Reset link sent successfully</h2>
                <p className="text-gray-500 font-medium leading-relaxed mb-8">
                  We've sent an email to <span className="font-bold text-gray-900">{email}</span>. Please check your inbox and follow the instructions to reset your password.
                </p>

                <div className="space-y-4">
                  <button
                    onClick={() => navigate('/login')}
                    className="w-full py-3.5 px-4 bg-gray-900 hover:bg-black text-white rounded-full font-bold text-sm shadow-md transition-colors active:scale-[0.98]"
                  >
                    Return to Login
                  </button>
                  
                  <button
                    onClick={(e) => handleSubmit(e, true)}
                    disabled={isResending}
                    className="w-full py-3.5 px-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-full font-bold text-sm shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isResending ? (
                      <>
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Resend Email"
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
};

export default ForgotPassword;
