import React from 'react';
import { UserCircleIcon, BellIcon } from '@heroicons/react/24/outline';
import Avatar from '../Avatar';

interface WelcomeBannerProps {
  userName?: string;
  userRole?: string;
  profileImage?: string | null;
  updatedAt?: string;
  className?: string;
}

const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ 
  userName = 'User', 
  userRole = 'Employee',
  profileImage,
  updatedAt,
  className = '' 
}) => {
  return (
    <div className={`bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-1 bg-white/20 rounded-full">
            <Avatar 
              src={profileImage ?? undefined} 
              name={userName} 
              size="md" 
              className="w-12 h-12"
              updatedAt={updatedAt}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Welcome back, {userName}!
            </h1>
            <p className="text-blue-100">
              {userRole === 'admin' ? 'Administrator' : 
               userRole === 'manager' ? 'Manager' : 
               userRole === 'partner' ? 'Partner' : 'Employee'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <BellIcon className="w-5 h-5 text-white/80" />
          <span className="text-sm text-white/80">2 new notifications</span>
        </div>
      </div>
    </div>
  );
};

export default WelcomeBanner;
