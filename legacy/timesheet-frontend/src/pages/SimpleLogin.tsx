import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRightIcon, 
  EyeIcon, 
  EyeSlashIcon,
  EnvelopeIcon,
  LockClosedIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import ASALoader from '../components/ui/ASALoader';

const CAROUSEL_IMAGES = [
  {
    url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80',
    title: 'Track your projects and optimize productivity',
    subtitle: 'Manage timesheets, approvals, assets, and workflows efficiently.'
  },
  {
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80',
    title: 'Data-driven insights at your fingertips',
    subtitle: 'Make informed decisions with real-time analytics and reporting.'
  },
  {
    url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80',
    title: 'Seamlessly manage accounts & finances',
    subtitle: 'Enterprise-grade tools built for accuracy and speed.'
  }
];

const SimpleLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Carousel state
  const [currentSlide, setCurrentSlide] = useState(0);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const success = await login(email, password);
      if (success) {
        setIsSuccess(true);
        // Small delay for success animation
        setTimeout(() => {
          const userData = localStorage.getItem('user');
          if (userData) {
            const user = JSON.parse(userData);
            const userRole = user.role?.toLowerCase();
            const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
            if (accountsRoles.includes(userRole) || user.role === 'ACCOUNTS') {
              navigate('/accounts/dashboard');
            } else {
              navigate('/dashboard');
            }
          } else {
            navigate('/dashboard');
          }
        }, 800);
      } else {
        setError('Incorrect email or password. Please try again.');
        setIsLoading(false);
      }
    } catch (err) {
      setError('An error occurred. Please check your connection.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex w-full font-sans overflow-hidden selection:bg-[#00419c]/20 selection:text-[#00419c]">
      
      {/* Left Side: Hero Image Carousel */}
      <div className="hidden lg:flex lg:w-[55%] p-4 relative">
        <div className="w-full h-full relative rounded-3xl overflow-hidden bg-gray-900 group shadow-2xl">
          {CAROUSEL_IMAGES.map((slide, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
              }`}
            >
              <img
                src={slide.url}
                alt={`Slide ${index + 1}`}
                loading={index === 0 ? "eager" : "lazy"}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-[12000ms] scale-100 hover:scale-110 ease-out origin-center"
              />
              {/* Deep dark gradient overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-gray-900/10 mix-blend-multiply" />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-900/30 to-transparent" />
              
              <AnimatePresence mode="wait">
                {index === currentSlide && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="absolute bottom-20 left-16 right-16"
                  >
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: "40px" }}
                      transition={{ duration: 0.8, delay: 0.5 }}
                      className="h-1 bg-blue-500 mb-6 rounded-full"
                    />
                    <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-[1.1] tracking-tight drop-shadow-md">
                      {slide.title}
                    </h2>
                    <p className="text-xl text-gray-200 font-medium max-w-xl leading-relaxed drop-shadow-sm">
                      {slide.subtitle}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {/* Carousel Indicators */}
          <div className="absolute bottom-10 left-16 z-20 flex gap-3">
            {CAROUSEL_IMAGES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                  idx === currentSlide ? 'w-10 bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'w-3 bg-white/30 hover:bg-white/60'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 relative z-10">
        
        {/* Floating background shapes for the right side */}
        <div className="absolute top-[-5%] right-[-5%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[10%] w-[30%] h-[30%] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[440px] bg-white rounded-3xl p-8 sm:p-12 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] border border-gray-100 relative z-20"
        >
          {/* Logo */}
          <div className="flex flex-col items-center justify-center mb-10">
            <img src="/asa-logo.png" alt="ASA Logo" className="h-16 sm:h-20 object-contain drop-shadow-sm" />
          </div>

          <div className="text-center mb-10">
            <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Login to your account</h2>
            <p className="text-sm text-gray-500 font-medium">Enter your credentials to access the portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm border border-red-100 flex items-center justify-center font-medium overflow-hidden"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2 group">
              <label className="block text-[13px] font-bold text-gray-700 uppercase tracking-wide group-focus-within:text-[#00419c] transition-colors">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@asaind.co.in"
                required
                autoComplete="username email"
                className="w-full px-4 py-3.5 bg-gray-50/50 border border-gray-200 hover:border-gray-300 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-[#00419c]/10 focus:border-[#00419c] transition-all duration-300 text-sm font-medium text-gray-900 shadow-sm"
              />
            </div>

            <div className="space-y-2 group">
              <div className="flex justify-between items-center">
                <label className="block text-[13px] font-bold text-gray-700 uppercase tracking-wide group-focus-within:text-[#00419c] transition-colors">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-[13px] font-bold text-[#00419c] hover:text-[#003380] transition-colors hover:underline underline-offset-2"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-4 pr-12 py-3.5 bg-gray-50/50 border border-gray-200 hover:border-gray-300 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-[#00419c]/10 focus:border-[#00419c] transition-all duration-300 text-sm font-medium text-gray-900 shadow-sm font-sans tracking-wide"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-1 pb-2">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="peer appearance-none w-5 h-5 border-2 border-gray-300 rounded-md checked:bg-[#00419c] checked:border-[#00419c] transition-all cursor-pointer outline-none focus:ring-4 focus:ring-[#00419c]/20"
                />
                <motion.svg 
                  initial={false}
                  animate={{ opacity: rememberMe ? 1 : 0, scale: rememberMe ? 1 : 0.5 }}
                  className="absolute w-3 h-3 text-white pointer-events-none" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth="3"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </motion.svg>
              </div>
              <label htmlFor="remember" className="text-sm font-semibold text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors">
                Remember me on this device
              </label>
            </div>

            <motion.button
              type="submit"
              disabled={isLoading || isSuccess}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full relative flex items-center justify-center py-4 px-6 border border-transparent rounded-2xl shadow-[0_8px_20px_-6px_rgba(0,65,156,0.4)] text-[15px] font-bold text-white overflow-hidden group transition-all duration-300 ${isSuccess ? 'bg-green-500 shadow-green-500/40' : 'bg-gradient-to-r from-[#00419c] via-[#0052cc] to-[#00419c] bg-[length:200%_auto] hover:bg-right hover:shadow-[0_12px_24px_-8px_rgba(0,65,156,0.6)]'}`}
            >
              {/* Background shine effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
              
              <span className="relative z-10 flex items-center justify-center gap-3 w-full">
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      Authenticating...
                    </motion.div>
                  ) : isSuccess ? (
                    <motion.div key="success" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                      <motion.svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </motion.svg>
                      Success!
                    </motion.div>
                  ) : (
                    <motion.div key="default" className="flex items-center justify-between w-full">
                      <span className="flex-1 text-center pl-6">Sign In Securely</span>
                      <motion.div 
                        className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white group-hover:text-[#00419c] transition-all duration-300"
                      >
                        <ArrowRightIcon className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform duration-300" />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </span>
            </motion.button>
          </form>

          {/* Replaced FAQ with HR Contact */}
          <div className="mt-10 pt-8 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500 font-medium mb-1">Need assistance?</p>
            <p className="text-[13px] font-bold text-gray-900 uppercase tracking-wide mb-1">Contact HR & Administration</p>
            <a href="mailto:hrsupport@asaind.co.in" className="text-sm font-bold text-[#00419c] hover:text-[#003380] hover:underline underline-offset-4 transition-colors">
              hrsupport@asaind.co.in
            </a>
          </div>
        </motion.div>
        
      </div>

    </div>
  );
};

export default SimpleLogin;
