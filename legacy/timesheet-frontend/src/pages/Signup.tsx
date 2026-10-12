import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Signup.css';

interface SignupFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
  agreeToTerms: boolean;
}

const Signup: React.FC = () => {
  const [formData, setFormData] = useState<SignupFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'employee',
    agreeToTerms: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateStep1 = () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      setError('Please fill in all required fields');
      return false;
    }
    if (!formData.email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.password || !formData.confirmPassword) {
      setError('Please enter password and confirmation');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!formData.agreeToTerms) {
      setError('Please agree to the terms and conditions');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep3()) return;

    setIsLoading(true);
    setError('');

    try {
      // Simulate API call for registration
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock registration success
      console.log('Registration data:', formData);
      
      // Show success message and redirect to login
      alert('Registration successful! Please login with your credentials.');
      navigate('/login');
    } catch (err) {
      setError('Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        {/* Header */}
        <div className="signup-header">
          <div className="signup-logo-container">
            <span className="signup-logo-text">T</span>
          </div>
          <h1 className="signup-title">Create Account</h1>
          <p className="signup-step-info">
            Step {step} of 3: {step === 1 ? 'Personal Info' : step === 2 ? 'Security' : 'Terms'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="signup-progress-container">
          <div className="signup-progress-labels">
            <span>Personal Info</span>
            <span>Security</span>
            <span>Terms</span>
          </div>
          <div className="signup-progress-bar">
            {[1, 2, 3].map((stepNum) => (
              <div
                key={stepNum}
                className={`signup-progress-step ${stepNum <= step ? 'signup-progress-step-active' : 'signup-progress-step-inactive'}`}
              />
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="signup-error-message">
            {error}
          </div>
        )}

        {/* Step 1: Personal Information */}
        {step === 1 && (
          <div className="signup-form-step">
            <div className="signup-form-row">
              <div>
                <label className="signup-label">
                  First Name
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter your first name"
                  className="input"
                />
              </div>
              <div>
                <label className="signup-label">
                  Last Name
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter your last name"
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="signup-label">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="Enter your email"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="role-select" className="signup-label">
                Role
              </label>
              <select
                id="role-select"
                name="role"
                value={formData.role}
                onChange={handleSelectChange}
                className="input"
              >
                <option value="Admin">Admin</option>
                <option value="HR">HR</option>
                <option value="IT">IT</option>
                <option value="Employee">Employee</option>
                <option value="Manager">Manager</option>
                <option value="Partner">Partner</option>
                <option value="Accounts">Accounts</option>
              </select>
            </div>
          </div>
        )}

        {/* Step 2: Security */}
        {step === 2 && (
          <div className="signup-form-step">
            <div>
              <label className="signup-label">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                placeholder="Enter your password"
                className="input"
              />
              <p className="signup-password-hint">
                Must be at least 6 characters long
              </p>
            </div>
            <div>
              <label className="signup-label">
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                placeholder="Confirm your password"
                className="input"
              />
            </div>
          </div>
        )}

        {/* Step 3: Terms */}
        {step === 3 && (
          <div className="signup-form-step">
            <div className="signup-terms-box">
              <h3 className="signup-terms-title">
                Terms and Conditions
              </h3>
              <p className="signup-terms-summary">
                By creating an account, you agree to our Terms of Service and Privacy Policy.
              </p>
              <ul className="signup-terms-list">
                <li>You must provide accurate information</li>
                <li>You are responsible for maintaining account security</li>
                <li>You agree to use the service for legitimate business purposes</li>
                <li>We reserve the right to terminate accounts for violations</li>
              </ul>
              <p>
                Last updated: {new Date().toLocaleDateString()}
              </p>
            </div>
            <label className="signup-checkbox-label">
              <input
                type="checkbox"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleInputChange}
                className="signup-checkbox"
              />
              <span>
                I have read and agree to the Terms and Conditions
              </span>
            </label>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="signup-actions">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="signup-btn signup-btn-secondary"
            >
              Back
            </button>
          )}
          
          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className={`signup-btn signup-btn-primary ${step > 1 ? 'signup-flex-1' : 'signup-flex-2'}`}
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isLoading}
              className={`signup-btn signup-btn-primary signup-flex-2 ${isLoading ? 'signup-btn-disabled' : ''}`}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          )}
        </div>

        {/* Login Link */}
        <div className="signup-footer">
          <p className="signup-footer-text">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="signup-link-btn"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
