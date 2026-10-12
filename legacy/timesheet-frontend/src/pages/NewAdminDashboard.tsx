import ModernRoleDashboard from '../components/dashboard/ModernRoleDashboard';
import ErrorBoundary from '../components/ErrorBoundary';
import { useAuth } from '../contexts/AuthContext';

const NewAdminDashboard: React.FC = () => {
    const { user } = useAuth();
    const userRole = user?.role || 'admin';
    
    console.log("🚀 Admin Dashboard initialized for role:", userRole);
    try {
        return (
            <ErrorBoundary>
                <ModernRoleDashboard userRole={userRole} />
            </ErrorBoundary>
        );
    } catch (error) {
        console.error("Failed to render Admin Dashboard:", error);
        return <div>Error loading dashboard</div>;
    }
};

export default NewAdminDashboard;
