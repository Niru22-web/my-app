import { Request, Response } from 'express';
import { exportReportWorkbook, getReportOptions, getReportOverview, queryReportData, ReportFilters } from './reports.service';

function parseFilters(req: Request): ReportFilters {
  const query = req.query as Record<string, string | string[] | undefined>;
  return {
    fromDate: typeof query.fromDate === 'string' ? query.fromDate : undefined,
    toDate: typeof query.toDate === 'string' ? query.toDate : undefined,
    granularity: query.granularity === 'week' || query.granularity === 'month' ? query.granularity : 'day',
    employeeIds: Array.isArray(query.employeeIds) ? query.employeeIds : typeof query.employeeIds === 'string' ? [query.employeeIds] : [],
    projectIds: Array.isArray(query.projectIds) ? query.projectIds : typeof query.projectIds === 'string' ? [query.projectIds] : [],
    departmentIds: Array.isArray(query.departmentIds) ? query.departmentIds : typeof query.departmentIds === 'string' ? [query.departmentIds] : [],
    statuses: Array.isArray(query.statuses) ? query.statuses : typeof query.statuses === 'string' ? [query.statuses] : [],
    tab: typeof query.tab === 'string' ? query.tab : undefined
  };
}

export async function overview(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const filters = parseFilters(req);
    const data = await getReportOverview(user, filters);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Reports overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load report overview'
    });
  }
}

export async function options(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const data = await getReportOptions(user);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Reports options error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load filter options'
    });
  }
}

export async function query(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const data = await queryReportData(user, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    console.error('Reports query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query report data'
    });
  }
}

export async function exportReport(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const filters = parseFilters(req);
    const formatType = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const buffer = await exportReportWorkbook(user, filters, formatType);

    if (formatType === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=reports-export.csv`);
      return res.send(buffer);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reports-export.xlsx`);
    return res.send(Buffer.from(buffer as ArrayBuffer));
  } catch (error) {
    console.error('Reports export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export reports'
    });
  }
}

export async function summary(req: Request, res: Response) {
  return overview(req, res);
}

