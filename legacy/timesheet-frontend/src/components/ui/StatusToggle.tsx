import React, { useState } from 'react';
import API from '../../api';

interface StatusToggleProps {
  id: string;
  status: string;
  onUpdate: () => void;
  disabled?: boolean;
  type?: 'employee' | 'client' | 'project' | 'job';
}

const StatusToggle: React.FC<StatusToggleProps> = ({ id, status, onUpdate, disabled = false, type }) => {
  const [isLoading, setIsLoading] = useState(false);
  const isActive = status === "Active" || status === "active" || status === "Started" || status === "Completed" || status === "In-Discussion";

  const handleToggle = async () => {
    if (isLoading || disabled) return;

    try {
      setIsLoading(true);
      
      // Use type prop if provided, otherwise detect based on ID pattern
      const endpoint = 
        type === 'client' ? `/clients/${id}/toggle-status` :
        type === 'project' ? `/projects/${id}/toggle-status` :
        type === 'job' ? `/jobs/${id}/toggle-status` :
        `/employees/${id}/toggle-status`;
      
      const response = await API.patch(endpoint);
      
      if (response.data.success) {
        // Instant UI update - callback will refresh the data
        onUpdate();
      }
    } catch (error) {
      console.error("Toggle failed", error);
      // Could show error toast here
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative inline-block">
      <label className="switch">
        <input
          type="checkbox"
          aria-label={`Toggle status (currently ${isActive ? 'active' : 'inactive'})`}
          checked={isActive}
          onChange={handleToggle}
          disabled={isLoading || disabled}
        />
        <span className="slider"></span>
      </label>
      {isLoading && (
        <div className="toggle-loading">
          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
        </div>
      )}
    </div>
  );
};

export default StatusToggle;
