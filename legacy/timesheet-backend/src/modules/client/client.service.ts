import { prisma } from '../../config/prisma';

export class ClientService {
  async getAllClients(user?: any, filters?: { q?: string; status?: string; all?: boolean }) {
    try {
      let whereClause: any = {};
      
      // Default filter for non-admins if no explicit status filter
      if (!filters?.status) {
        whereClause.status = 'Active';
      } else if (filters.status !== 'All Status') {
        whereClause.status = filters.status;
      }

      // Apply search query
      let searchOR: any[] = [];
      if (filters?.q) {
        const query = filters.q.trim();
        searchOR = [
          { name: { contains: query, mode: 'insensitive' } },
          { clientId: { contains: query, mode: 'insensitive' } },
          { alias: { contains: query, mode: 'insensitive' } },
          { pan: { contains: query, mode: 'insensitive' } },
          { gstin: { contains: query, mode: 'insensitive' } },
        ];
      }
      
      // Apply role-based visibility
      if (user && !filters?.all) {
        const role = user.role?.toLowerCase();
        const isAdmin = ['admin', 'owner', 'it'].includes(role);
        
        if (!isAdmin) {
          let roleOR: any[] = [];
          if (role === 'partner') {
            roleOR = [
              { createdBy: user.id },
              { partnerId: user.id },
              { projects: { some: { createdBy: user.id } } },
              { projects: { some: { managerId: user.id } } },
              { projects: { some: { partnerId: user.id } } },
              { projects: { some: { users: { some: { employeeId: user.id } } } } }
            ];
          } else if (role === 'manager') {
            roleOR = [
              { createdBy: user.id },
              {
                projects: {
                  some: {
                    OR: [
                      { createdBy: user.id },
                      { managerId: user.id },
                      { partnerId: user.id },
                      { users: { some: { employeeId: user.id } } },
                      { jobs: { some: { users: { some: { employeeId: user.id } } } } }
                    ]
                  }
                }
              }
            ];
          } else {
            // Employee: Show only clients where they are assigned via ProjectUser or JobUser
            whereClause.projects = {
              some: {
                OR: [
                  { users: { some: { employeeId: user.id } } },
                  { jobs: { some: { users: { some: { employeeId: user.id } } } } }
                ]
              }
            };
          }

          if (roleOR.length > 0) {
            if (searchOR.length > 0) {
              whereClause.AND = [
                { OR: roleOR },
                { OR: searchOR }
              ];
            } else {
              whereClause.OR = roleOR;
            }
          } else if (searchOR.length > 0) {
            whereClause.OR = searchOR;
          }
        } else if (searchOR.length > 0) {
          whereClause.OR = searchOR;
        }
      } else if (searchOR.length > 0) {
        whereClause.OR = searchOR;
      }

      console.log('🔍 Executing Client findMany with where:', JSON.stringify(whereClause, null, 2));

      const clients = await prisma.client.findMany({
        where: whereClause,
        select: {
          id: true,
          clientId: true,
          name: true,
          alias: true,
          address: true,
          pin: true,
          state: true,
          country: true,
          gstStatus: true,
          gstin: true,
          pan: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              projects: true
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });

      // Fetch sum of timelog hours grouped by clientId
      const timelogGroups = await prisma.timelog.groupBy({
        by: ['clientId'],
        _sum: {
          hours: true
        }
      });

      const clientHoursMap = new Map<string, number>();
      timelogGroups.forEach(group => {
        if (group.clientId) {
          clientHoursMap.set(group.clientId, group._sum.hours || 0);
        }
      });

      return clients.map(client => ({
        ...client,
        loggedHours: clientHoursMap.get(client.id) || 0
      }));
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }
  }

  async getClientById(id: string) {
    try {
      const client = await prisma.client.findUnique({
        where: { id },
        include: {
          projects: {
            select: {
              id: true,
              name: true,
              status: true
            }
          }
        }
      });

      if (!client) return null;

      const timelogsSum = await prisma.timelog.aggregate({
        where: { clientId: id },
        _sum: { hours: true }
      });

      return {
        ...client,
        loggedHours: timelogsSum._sum.hours || 0
      };
    } catch (error) {
      console.error('Error fetching client:', error);
      throw error;
    }
  }

  async getNextClientId(): Promise<string> {
    const clients = await prisma.client.findMany({
      where: {
        clientId: {
          startsWith: 'CL',
        }
      },
      orderBy: {
        clientId: 'desc'
      }
    });

    // Filter to ensure it matches CLXXXX format in JS since some DBs don't support regex in Prisma
    const validClients = clients.filter(c => /^CL\d+$/.test(c.clientId));
    const lastClient = validClients[0]; // Already ordered by desc

    if (!lastClient) {
      return 'CL0001';
    }

    const lastId = lastClient.clientId;
    const match = lastId.match(/CL(\d+)/);
    if (!match) {
      return 'CL0001';
    }

    const nextNumber = parseInt(match[1]) + 1;
    return `CL${String(nextNumber).padStart(4, '0')}`;
  }

  async createClient(clientData: any, user?: any) {
    try {
      // 1. Validate required fields
      if (!clientData.name || !clientData.name.trim()) {
        throw new Error('Client name is required');
      }
      if (!clientData.country || !clientData.country.trim()) {
        throw new Error('Country is required');
      }
      if (clientData.gstStatus === 'Yes' && !clientData.gstin?.trim()) {
        throw new Error('GSTIN is required for GST registered clients');
      }

      const name = clientData.name.trim();
      const gstin = clientData.gstin?.trim() || null;
      const pan = clientData.pan?.trim()?.toUpperCase() || ''; // PAN is required in schema

      // 2. Check for duplicates in DB
      const duplicate = await prisma.client.findFirst({
        where: {
          OR: [
            { name: { equals: name, mode: 'insensitive' as const } },
            ...(gstin ? [{ gstin: { equals: gstin, mode: 'insensitive' as const } }] : []),
            ...(pan && pan !== '' ? [{ pan: { equals: pan, mode: 'insensitive' as const } }] : [])
          ]
        }
      });

      if (duplicate) {
        if (duplicate.name.toLowerCase() === name.toLowerCase()) {
          throw new Error(`Client with name "${name}" already exists`);
        }
        if (gstin && duplicate.gstin?.toLowerCase() === gstin.toLowerCase()) {
          throw new Error(`Client with GSTIN "${gstin}" already exists`);
        }
        if (pan && pan !== '' && duplicate.pan?.toUpperCase() === pan) {
          throw new Error(`Client with PAN "${pan}" already exists`);
        }
      }

      // 3. Generate sequential clientId if not valid/provided
      let clientId = clientData.clientId;
      if (!clientId || !clientId.startsWith('CL') || isNaN(Number(clientId.substring(2)))) {
        clientId = await this.getNextClientId();
      }

      // Extra safety: Check if generated clientId already exists
      const existingClient = await prisma.client.findUnique({
        where: { clientId }
      });
      if (existingClient) {
        clientId = await this.getNextClientId();
      }

      // 4. Format-specific validations
      if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase())) {
        throw new Error('Invalid GSTIN format (expected 15 characters)');
      }
      if (pan && pan !== '' && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
        throw new Error('Invalid PAN format (expected 10 characters)');
      }
      if (clientData.pin && !/^[0-9]{6}$/.test(clientData.pin)) {
        throw new Error('PIN code must be exactly 6 digits');
      }

      // Prepare client data with ownership
      const createData: any = {
        clientId,
        name: clientData.name,
        alias: clientData.alias || '',
        address: clientData.address || null,
        pin: clientData.pin || null,
        state: clientData.state || null,
        country: clientData.country || null,
        gstStatus: clientData.gstStatus || 'No',
        gstin: clientData.gstin || null,
        pan: clientData.pan ? clientData.pan.toUpperCase() : '',
        status: clientData.status || 'Active',
        createdBy: user?.id || 'System',
      };

      // Assign partner ownership
      if (clientData.partnerId) {
        createData.partnerId = clientData.partnerId;
      } else {
        const userRoleFull = user?.role?.toLowerCase();
        if (user && userRoleFull === 'partner') {
          createData.partnerId = user.id;
        } else if (user && userRoleFull === 'manager') {
          // Find manager's reporting partner to associate the client
          const employee = await prisma.employee.findUnique({
            where: { id: user.id },
            include: { partners: { select: { partnerId: true } } } as any
          });
          if (employee && (employee as any).partners && (employee as any).partners.length > 0) {
            createData.partnerId = (employee as any).partners[0].partnerId;
          }
        }
      }

      const client = await prisma.client.create({
        data: createData
      });

      return client;
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
  }

  async updateClient(id: string, clientData: any) {
    try {
      // Validate GSTIN format
      // Standard GSTIN: 2 digits + PAN (10 chars) + 1 digit + 'Z' + 1 checksum char (total 15)
      if (clientData.gstStatus === 'Yes' && !clientData.gstin) {
        throw new Error('GSTIN is required for GST registered clients');
      }

      if (clientData.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(clientData.gstin.toUpperCase())) {
        throw new Error('Invalid GSTIN format (expected 15 characters, e.g., 27ABCDE1234F1Z1)');
      }

      // Validate PAN format
      if (clientData.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(clientData.pan.toUpperCase())) {
        throw new Error('Invalid PAN format (expected 10 characters, e.g., ABCDE1234F)');
      }

      // Validate PIN code format
      if (clientData.pin && !/^[0-9]{6}$/.test(clientData.pin)) {
        throw new Error('PIN code must be exactly 6 digits');
      }

      const updateData: any = {
        name: clientData.name,
        alias: clientData.alias || '',
        address: clientData.address || null,
        pin: clientData.pin || null,
        state: clientData.state || null,
        country: clientData.country || null,
        gstStatus: clientData.gstStatus || 'No',
        gstin: clientData.gstin || null,
        pan: clientData.pan ? clientData.pan.toUpperCase() : '',
      };

      // Only update status if explicitly provided to avoid setting to undefined
      if (clientData.status) {
        updateData.status = clientData.status;
      }

      const client = await prisma.client.update({
        where: { id },
        data: updateData
      });

      return client;
    } catch (error) {
      console.error('Error updating client:', error);
      throw error;
    }
  }

  async deleteClient(id: string) {
    try {
      // Use a transaction for safe cascade deletion
      return await prisma.$transaction(async (tx) => {
        // 1. Delete all reimbursements associated with this client
        await tx.reimbursement.deleteMany({
          where: { clientId: id }
        });

        // 2. Fetch all project IDs to clean up their jobs/timelogs
        const projects = await tx.project.findMany({
          where: { clientId: id },
          select: { id: true }
        });
        const projectIds = projects.map(p => p.id);

        if (projectIds.length > 0) {
          // 3. Delete timelogs for all projects of this client
          await tx.timelog.deleteMany({
            where: {
              job: {
                projectId: { in: projectIds }
              }
            }
          });

          // 4. Delete jobs for all projects
          await tx.job.deleteMany({
            where: {
              projectId: { in: projectIds }
            }
          });

          // 5. Delete project attachments
          await tx.projectAttachment.deleteMany({
            where: {
              projectId: { in: projectIds }
            }
          });


          // 7. Delete the projects themselves
          await tx.project.deleteMany({
            where: {
              id: { in: projectIds }
            }
          });
        }

        // 8. Finally delete the client
        await tx.client.delete({
          where: { id }
        });

        return { message: 'Client and all associated projects/reimbursements deleted successfully' };
      });
    } catch (error) {
      console.error('Error in cascade client deletion:', error);
      throw error;
    }
  }

  async bulkCreateClients(clientsData: any[], user?: any) {
    try {
      const results: {
        totalRows: number;
        successCount: number;
        errorCount: number;
        duplicateCount: number;
        success: Array<{ row: number; clientId: string; name: string }>;
        errors: Array<{ row: number; data: any; error: string }>;
      } = {
        totalRows: clientsData.length,
        successCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        success: [],
        errors: []
      };

      // Get initial next number
      const lastClient = await prisma.client.findFirst({
        where: { 
          clientId: { 
            startsWith: 'CL',
            // Try to match the numeric pattern if possible
          } 
        },
        orderBy: { clientId: 'desc' }
      });

      let nextNumber = 1;
      if (lastClient) {
        const match = lastClient.clientId.match(/CL(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      for (let i = 0; i < clientsData.length; i++) {
        const clientData = clientsData[i];
        const rowNum = i + 1;
        
        try {
          // Skip empty rows
          if (!clientData || Object.keys(clientData).length === 0 || (!clientData.name && !clientData.gstin && !clientData.pan)) {
            continue;
          }

          if (!clientData.name || !clientData.name.trim()) {
            results.errors.push({
              row: rowNum,
              data: clientData,
              error: 'Client name is required'
            });
            results.errorCount++;
            continue;
          }

          const name = clientData.name.trim();
          const gstin = clientData.gstin?.toString().trim() || null;
          const pan = clientData.pan?.toString().trim().toUpperCase() || null;

          // Check for duplicates in DB
          const duplicateInDb = await prisma.client.findFirst({
            where: {
              OR: [
                { name: { equals: name, mode: 'insensitive' as const } },
                ...(gstin ? [{ gstin: { equals: gstin, mode: 'insensitive' as const } }] : []),
                ...(pan ? [{ pan: { equals: pan, mode: 'insensitive' as const } }] : [])
              ]
            }
          });

          if (duplicateInDb) {
            results.errors.push({
              row: rowNum,
              data: clientData,
              error: `Duplicate record: ${duplicateInDb.name.toLowerCase() === name.toLowerCase() ? 'Name' : (gstin && duplicateInDb.gstin?.toLowerCase() === gstin.toLowerCase() ? 'GSTIN' : 'PAN')} already exists`
            });
            results.duplicateCount++;
            results.errorCount++;
            continue;
          }

          // Check for duplicates within the same file
          const duplicateInCurrent = results.success.find(s => {
            const prevData = clientsData[s.row - 1];
            return s.name.toLowerCase() === name.toLowerCase() || 
                   (gstin && prevData.gstin?.toString().trim().toLowerCase() === gstin.toLowerCase()) ||
                   (pan && prevData.pan?.toString().trim().toUpperCase() === pan);
          });

          if (duplicateInCurrent) {
            results.errors.push({
              row: rowNum,
              data: clientData,
              error: 'Duplicate record within the same file'
            });
            results.duplicateCount++;
            results.errorCount++;
            continue;
          }

          // Generate clientId
          const clientId = `CL${String(nextNumber).padStart(4, '0')}`;

          // Create client using the service method (this handles other validations)
          await this.createClient({
            ...clientData,
            clientId
          }, user);

          results.success.push({
            row: rowNum,
            clientId,
            name: name
          });
          results.successCount++;
          nextNumber++;

        } catch (error: any) {
          results.errors.push({
            row: rowNum,
            data: clientData,
            error: error.message || 'Unknown error occurred'
          });
          results.errorCount++;
        }
      }

      return results;
    } catch (error) {
      console.error('Error in bulk client creation:', error);
      throw error;
    }
  }
}