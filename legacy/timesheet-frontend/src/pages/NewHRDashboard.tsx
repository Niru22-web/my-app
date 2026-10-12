import React from 'react';
import ModernRoleDashboard from '../components/dashboard/ModernRoleDashboard';
import ErrorBoundary from '../components/ErrorBoundary';

const NewHRDashboard: React.FC = () => {
    return (
        <ErrorBoundary>
            <ModernRoleDashboard userRole="hr" />
        </ErrorBoundary>
    );
};

export default NewHRDashboard;
