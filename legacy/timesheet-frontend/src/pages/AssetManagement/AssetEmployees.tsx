import React, { useState, useEffect, useCallback } from 'react';
import { 
  User, Search, Monitor, ArrowRight
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import CardSkeleton from '../../components/ui/CardSkeleton';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  designation?: string;
  department?: string;
  officeEmail?: string;
  role?: string;
}

interface Asset {
  id: string;
  employee_id: string | null;
  status: string;
  assetName: string;
  serialNumber?: string;
  officeTagNo?: string;
}

const AssetEmployees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  
  const toast = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [empRes, assetRes] = await Promise.all([
        API.get('/employees'),
        API.get('/assets')
      ]);
      if (empRes.data.success) setEmployees(empRes.data.data);
      if (assetRes.data.success) setAssets(assetRes.data.data);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getEmpAssets = (empId: string) => {
    return assets.filter(a => a.employee_id === empId && a.status === 'Assigned');
  };

  const filteredEmployees = employees.filter(e => {
    const name = `${e.firstName} ${e.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase()) || e.employeeId.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Employee <span className="text-indigo-600">Assets</span></h1>
          <p className="text-slate-500 text-sm">Monitor staff fleet allocations, check personal equipment custody, and review hardware distribution.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative bg-white p-4 rounded-2xl shadow-sm">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          placeholder="Search employees by name or employee ID..." 
          className="w-full pl-12 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left List of Employees */}
        <div className="lg:col-span-2 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="bg-white p-8 text-center text-slate-400 rounded-3xl shadow-sm">No employees match your search query.</div>
          ) : filteredEmployees.map((emp) => {
            const empAssets = getEmpAssets(emp.employeeId);
            return (
              <div 
                key={emp.id} 
                onClick={() => setSelectedEmp(emp)}
                className={`p-5 rounded-3xl bg-white border-2 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md flex items-center justify-between ${
                  selectedEmp?.id === emp.id ? 'border-indigo-500 shadow-sm' : 'border-transparent shadow-sm'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                    {emp.firstName[0]}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 leading-snug">{emp.firstName} {emp.lastName}</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{emp.designation} • {emp.department}</p>
                    <p className="text-[10px] text-indigo-500 font-mono mt-0.5">{emp.officeEmail}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <Badge variant={empAssets.length > 0 ? 'success' : 'secondary'} className="rounded-lg text-[9px] font-black">
                      {empAssets.length} ASSIGNED
                    </Badge>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Details Sidebar */}
        <div className="sticky top-6">
          {selectedEmp ? (
            <Card className="p-8 border-none shadow-2xl bg-white rounded-[2rem] space-y-6">
              <div className="text-center space-y-3 pb-6 border-b border-slate-100">
                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-3xl mx-auto shadow-inner">
                  {selectedEmp.firstName[0]}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">{selectedEmp.firstName} {selectedEmp.lastName}</h2>
                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mt-1">{selectedEmp.department}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Assigned Hardware Fleet</h3>
                
                {getEmpAssets(selectedEmp.employeeId).length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 font-medium">
                    No hardware assets currently assigned to this employee.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {getEmpAssets(selectedEmp.employeeId).map((a) => (
                      <div key={a.id} className="p-4 bg-slate-50 rounded-2xl flex items-start justify-between border border-slate-100/50">
                        <div className="flex gap-3">
                          <Monitor className="w-4 h-4 text-indigo-600 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-slate-700">{a.assetName}</p>
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">SN: {a.serialNumber}</p>
                            {a.officeTagNo && <p className="text-[9px] text-indigo-500 font-mono">Tag: {a.officeTagNo}</p>}
                          </div>
                        </div>
                        <Badge variant="success" className="text-[8px] font-black rounded-md">ISSUED</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Role Permission:</span>
                  <span className="font-bold text-slate-700 capitalize">{selectedEmp.role || 'Employee'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Email Connections:</span>
                  <span className="font-semibold text-slate-700">Active</span>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-8 border-dashed border-2 border-slate-200 rounded-[2rem] text-center py-20 flex flex-col items-center justify-center gap-4 text-slate-400 bg-white">
              <User className="w-12 h-12 text-slate-300" />
              <div>
                <p className="text-sm font-bold text-slate-900">Select Employee</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">Click any employee on the left to see their full hardware catalog.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetEmployees;
