import React from 'react';
import { Button, Card, Field, Input, Option, Dropdown } from '@fluentui/react-components';
import { ArrowDownloadRegular, ArrowClockwiseRegular } from '@fluentui/react-icons';
import { format, subDays } from 'date-fns';
import { saveAs } from 'file-saver';
import API from '../../api';

type ReportType = 'Inventory' | 'Asset' | 'Assignment' | 'Maintenance' | 'Ticket';

const REPORT_TYPES: ReportType[] = ['Inventory', 'Asset', 'Assignment', 'Maintenance', 'Ticket'];

const defaultStart = format(subDays(new Date(), 29), 'yyyy-MM-dd');
const defaultEnd = format(new Date(), 'yyyy-MM-dd');

const ReportsGenerator: React.FC = () => {
  const [type, setType] = React.useState<ReportType>('Inventory');
  const [startDate, setStartDate] = React.useState(defaultStart);
  const [endDate, setEndDate] = React.useState(defaultEnd);
  const [category, setCategory] = React.useState('All');
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await API.get('/assets/reports', {
        params: { type, startDate, endDate, category }
      });
      setRows(response.data.data || []);
    } finally {
      setLoading(false);
    }
  }, [type, startDate, endDate, category]);

  React.useEffect(() => {
    loadData().catch(error => console.error('Asset report load failed', error));
  }, [loadData]);

  const handleExport = async () => {
    const response = await API.get('/assets/reports/export', {
      params: { type, startDate, endDate },
      responseType: 'blob'
    });

    saveAs(new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }), `${type.toLowerCase()}-report.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-[24px] border border-slate-200/70 bg-white shadow-sm">
        <div className="p-5 flex flex-col xl:flex-row xl:items-end gap-4 xl:gap-3">
          <Field label="Report type">
            <Dropdown value={type} selectedOptions={[type]} onOptionSelect={(_, data) => setType(data.optionValue as ReportType)}>
              {REPORT_TYPES.map(item => (
                <Option key={item} value={item}>
                  {item}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="From">
            <Input type="date" value={startDate} onChange={(_, data) => setStartDate(data.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={endDate} onChange={(_, data) => setEndDate(data.value)} />
          </Field>
          <Field label="Category">
            <Input value={category} onChange={(_, data) => setCategory(data.value)} placeholder="All" />
          </Field>
          <div className="flex items-center gap-2">
            <Button icon={<ArrowClockwiseRegular />} onClick={() => loadData().catch(console.error)} disabled={loading}>
              Refresh
            </Button>
            <Button appearance="primary" icon={<ArrowDownloadRegular />} onClick={handleExport}>
              Export
            </Button>
          </div>
        </div>
      </Card>

      <Card className="rounded-[24px] border border-slate-200/70 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900">Asset report preview</h2>
          <p className="text-sm text-slate-500">Rendered from the legacy asset reporting endpoints.</p>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 25).map((row, index) => (
                <tr key={index} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                    {row.assetName || row.inventory?.assetName || row.ticketId || row.type || `Row ${index + 1}`}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">
                    {row.category || row.inventory?.category || row.status || row.maintenanceType || row.description || '—'}
                  </td>
                  <td className="px-5 py-4 text-sm text-right text-slate-700">
                    {row.serialNumber || row.inventory?.serialNumber || row.status || row.createdAt || row.allocatedAt || '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-400">
                    No asset records found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ReportsGenerator;
