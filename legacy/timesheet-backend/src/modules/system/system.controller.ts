import { Request, Response } from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/prisma';
import { getUploadsDir } from '../../utils/assetUrl';

// Helper: Format bytes into human-readable string
const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Helper: Recursive directory size & file scanner
interface FileItem {
  name: string;
  relativePath: string;
  category: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  modifiedAt: string;
  url: string;
}

const scanDirectory = (dirPath: string, baseDir: string, category: string, fileList: FileItem[] = []): { totalBytes: number; count: number; files: FileItem[] } => {
  let totalBytes = 0;
  let count = 0;

  if (!fs.existsSync(dirPath)) {
    return { totalBytes: 0, count: 0, files: fileList };
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        const subResult = scanDirectory(fullPath, baseDir, category, fileList);
        totalBytes += subResult.totalBytes;
        count += subResult.count;
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          totalBytes += stats.size;
          count += 1;

          const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          fileList.push({
            name: entry.name,
            relativePath: relPath,
            category: category,
            sizeBytes: stats.size,
            sizeFormatted: formatBytes(stats.size),
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
            url: `/uploads/${relPath}`
          });
        } catch (e) {
          // ignore stat errors on locked files
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dirPath}:`, err);
  }

  return { totalBytes, count, files: fileList };
};

export const getSystemStatus = async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    let dbStatus = 'Disconnected';
    let dbLatencyMs = 0;

    // Test DB connection & latency
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - startTime;
      dbStatus = 'Connected';
    } catch (dbErr) {
      dbStatus = 'Error';
    }

    // DB Record Counts
    let counts = {
      employees: 0,
      timelogs: 0,
      tickets: 0,
      leaves: 0,
      attendance: 0,
      clients: 0,
      projects: 0,
      notifications: 0
    };

    if (dbStatus === 'Connected') {
      try {
        const [empCount, timeCount, tktCount, leaveCount, attCount, clientCount, projCount, notifCount] = await Promise.all([
          prisma.employee.count(),
          prisma.timelog.count(),
          (prisma as any).supportTicket ? (prisma as any).supportTicket.count() : 0,
          prisma.leave.count(),
          prisma.attendance.count(),
          prisma.client.count(),
          prisma.project.count(),
          prisma.notification.count()
        ]);
        counts = {
          employees: empCount,
          timelogs: timeCount,
          tickets: tktCount,
          leaves: leaveCount,
          attendance: attCount,
          clients: clientCount,
          projects: projCount,
          notifications: notifCount
        };
      } catch (countErr) {
        console.warn('Could not fetch all table counts:', countErr);
      }
    }

    // Memory metrics
    const memUsage = process.memoryUsage();
    const totalSystemMem = os.totalmem();
    const freeSystemMem = os.freemem();
    const usedSystemMem = totalSystemMem - freeSystemMem;

    // Storage metrics
    const uploadsDir = getUploadsDir();
    const categories = ['profile', 'documents', 'tickets', 'temp'];
    const storageBreakdown: Record<string, { bytes: number; formatted: string; count: number }> = {};
    let totalUploadsBytes = 0;
    let totalUploadsFiles = 0;

    for (const cat of categories) {
      const catPath = path.join(uploadsDir, cat);
      const scan = scanDirectory(catPath, uploadsDir, cat, []);
      storageBreakdown[cat] = {
        bytes: scan.totalBytes,
        formatted: formatBytes(scan.totalBytes),
        count: scan.count
      };
      totalUploadsBytes += scan.totalBytes;
      totalUploadsFiles += scan.count;
    }

    // Logs directory
    const logsDir = path.join(process.cwd(), 'logs');
    let logsBytes = 0;
    let logsCount = 0;
    if (fs.existsSync(logsDir)) {
      const scanLogs = scanDirectory(logsDir, process.cwd(), 'logs', []);
      logsBytes = scanLogs.totalBytes;
      logsCount = scanLogs.count;
    }
    storageBreakdown['logs'] = {
      bytes: logsBytes,
      formatted: formatBytes(logsBytes),
      count: logsCount
    };

    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    const uptimeFormatted = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`;

    return res.json({
      success: true,
      data: {
        server: {
          status: 'Online',
          environment: process.env.NODE_ENV || 'production',
          nodeVersion: process.version,
          platform: `${os.type()} ${os.release()} (${os.arch()})`,
          hostname: os.hostname(),
          pid: process.pid,
          uptimeSeconds: Math.floor(uptimeSeconds),
          uptimeFormatted,
          port: process.env.PORT || 5000,
          serverTime: new Date().toISOString()
        },
        memory: {
          heapUsedBytes: memUsage.heapUsed,
          heapUsedFormatted: formatBytes(memUsage.heapUsed),
          heapTotalBytes: memUsage.heapTotal,
          heapTotalFormatted: formatBytes(memUsage.heapTotal),
          rssBytes: memUsage.rss,
          rssFormatted: formatBytes(memUsage.rss),
          systemTotalBytes: totalSystemMem,
          systemTotalFormatted: formatBytes(totalSystemMem),
          systemFreeBytes: freeSystemMem,
          systemFreeFormatted: formatBytes(freeSystemMem),
          systemUsedBytes: usedSystemMem,
          systemUsedFormatted: formatBytes(usedSystemMem),
          systemUsedPercent: Math.round((usedSystemMem / totalSystemMem) * 100)
        },
        cpu: {
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || 'Generic CPU',
          loadAverage: os.loadavg ? os.loadavg() : [0, 0, 0]
        },
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          counts
        },
        storage: {
          totalBytes: totalUploadsBytes + logsBytes,
          totalFormatted: formatBytes(totalUploadsBytes + logsBytes),
          totalFiles: totalUploadsFiles + logsCount,
          uploadsPath: uploadsDir,
          breakdown: storageBreakdown
        }
      }
    });
  } catch (error: any) {
    console.error('System status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve system status', error: error.message });
  }
};

export const getStorageFiles = async (req: Request, res: Response) => {
  try {
    const { category = 'all', search = '', page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 50;

    const uploadsDir = getUploadsDir();
    const allFiles: FileItem[] = [];

    const targetCategories = category === 'all' 
      ? ['profile', 'documents', 'tickets', 'temp']
      : [category as string];

    for (const cat of targetCategories) {
      const catPath = path.join(uploadsDir, cat);
      if (fs.existsSync(catPath)) {
        scanDirectory(catPath, uploadsDir, cat, allFiles);
      }
    }

    // Also include logs if category is logs or all
    if (category === 'all' || category === 'logs') {
      const logsDir = path.join(process.cwd(), 'logs');
      if (fs.existsSync(logsDir)) {
        scanDirectory(logsDir, process.cwd(), 'logs', allFiles);
      }
    }

    // Filter by search term
    let filtered = allFiles;
    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.toLowerCase();
      filtered = allFiles.filter(f => f.name.toLowerCase().includes(q) || f.relativePath.toLowerCase().includes(q));
    }

    // Sort by modified date descending
    filtered.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    const total = filtered.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(startIndex, startIndex + limitNum);

    return res.json({
      success: true,
      data: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error: any) {
    console.error('Get storage files error:', error);
    return res.status(500).json({ success: false, message: 'Failed to list storage files', error: error.message });
  }
};

export const deleteStorageFile = async (req: Request, res: Response) => {
  try {
    const { relativePath, category } = req.body;
    if (!relativePath || typeof relativePath !== 'string') {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }

    // Security guard: Prevent directory traversal
    const safeRelPath = relativePath.replace(/^(\.\.[\/\\])+/, '').replace(/^[\\\/]+/, '');
    const uploadsDir = getUploadsDir();
    
    let targetFilePath = path.join(uploadsDir, safeRelPath);

    if (category === 'logs') {
      targetFilePath = path.join(process.cwd(), safeRelPath);
    }

    const resolvedPath = path.resolve(targetFilePath);
    const resolvedUploadsDir = path.resolve(uploadsDir);
    const resolvedLogsDir = path.resolve(path.join(process.cwd(), 'logs'));

    // Check that resolved path is safely inside uploads or logs
    const isSafe = resolvedPath.startsWith(resolvedUploadsDir) || resolvedPath.startsWith(resolvedLogsDir);
    if (!isSafe) {
      return res.status(403).json({ success: false, message: 'Access denied: Invalid file path' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    const stats = fs.statSync(resolvedPath);
    const sizeReclaimed = stats.size;
    fs.unlinkSync(resolvedPath);

    return res.json({
      success: true,
      message: `File deleted successfully. Reclaimed ${formatBytes(sizeReclaimed)}.`,
      reclaimedBytes: sizeReclaimed
    });
  } catch (error: any) {
    console.error('Delete storage file error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete file', error: error.message });
  }
};

export const cleanupStorage = async (req: Request, res: Response) => {
  try {
    const { action } = req.body; // 'clean_temp' | 'clean_logs'
    const uploadsDir = getUploadsDir();
    let filesDeleted = 0;
    let bytesReclaimed = 0;

    if (action === 'clean_temp') {
      const tempDir = path.join(uploadsDir, 'temp');
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              bytesReclaimed += stats.size;
              fs.unlinkSync(filePath);
              filesDeleted++;
            }
          } catch (e) {}
        }
      }
    } else if (action === 'clean_logs') {
      const logsDir = path.join(process.cwd(), 'logs');
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        for (const file of files) {
          const filePath = path.join(logsDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile() && stats.mtime.getTime() < thirtyDaysAgo) {
              bytesReclaimed += stats.size;
              fs.unlinkSync(filePath);
              filesDeleted++;
            }
          } catch (e) {}
        }
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid cleanup action. Supported actions: clean_temp, clean_logs' });
    }

    return res.json({
      success: true,
      message: `Cleanup completed. Removed ${filesDeleted} file(s) and reclaimed ${formatBytes(bytesReclaimed)}.`,
      filesDeleted,
      bytesReclaimed,
      formattedReclaimed: formatBytes(bytesReclaimed)
    });
  } catch (error: any) {
    console.error('Storage cleanup error:', error);
    return res.status(500).json({ success: false, message: 'Cleanup failed', error: error.message });
  }
};
