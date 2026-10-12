export interface EsslPunchLog {
  biometricEmployeeId: string;
  biometricName: string;
  punchTime: Date;
  punchType: 'CheckIn' | 'CheckOut' | 'Unknown';
}

export interface EsslConnectionTestResult {
  success: boolean;
  status: 'Online' | 'Offline';
  message: string;
  latency?: number;
}

export interface EsslSyncResult {
  success: boolean;
  recordsSynced: number;
  errors: string[];
}
