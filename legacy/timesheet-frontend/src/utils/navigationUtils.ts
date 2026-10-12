
export const getDashboardUrl = (role?: string): string => {
  const userRole = role?.toLowerCase() || '';

  const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
  if (accountsRoles.includes(userRole) || role === 'ACCOUNTS') return '/accounts/dashboard';

  return '/dashboard';
};
