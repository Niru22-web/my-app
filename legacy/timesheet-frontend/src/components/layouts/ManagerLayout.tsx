import React from 'react';
import { Outlet } from 'react-router-dom';
import FrozenLayout from '../FrozenLayout';

interface LayoutProps {
  children?: React.ReactNode;
}

const ManagerLayout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <FrozenLayout>
      {children || <Outlet />}
    </FrozenLayout>
  );
};

export default ManagerLayout;
