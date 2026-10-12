import express, { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middleware/auth.middleware";
import { ClientService } from "../client/client.service";

const router = express.Router();

// ==========================================
// Middleware: Accounts & Finance Role Guard
// ==========================================
export const checkAccountsAccess = (req: any, res: Response, next: NextFunction) => {
  authenticate(req, res, () => {
    const userRole = (req.user?.role as string)?.toUpperCase();
    const accountsRoles = [
      "ADMIN",
      "ACCOUNTS",
      "ACCOUNTS_ADMIN",
      "ACCOUNTS_MANAGER",
      "ACCOUNTS_EXECUTIVE",
      "FINANCE_APPROVER",
      "AR_MANAGER",
      "AP_MANAGER",
      "ACCOUNTANT"
    ];
    
    if (accountsRoles.includes(userRole) || req.user?.hasAccountsAccess) {
      next();
    } else {
      res.status(403).json({ 
        success: false, 
        message: "Access Denied: Restrictive to Accounts and Finance roles." 
      });
    }
  });
};

// Apply checkAccountsAccess guard to all sub-routes
router.use(checkAccountsAccess);

// Helper to log audit trail entries
async function logAudit(tableName: string, recordId: string, action: string, performedBy: string, oldValue: any = null, newValue: any = null) {
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "AuditTrail" ("id", "tableName", "recordId", "action", "performedBy", "oldValue", "newValue", "timestamp")
      VALUES (
        '${crypto.randomUUID()}', 
        '${tableName}', 
        '${recordId}', 
        '${action}', 
        '${performedBy}', 
        '${JSON.stringify(oldValue)}'::jsonb, 
        '${JSON.stringify(newValue)}'::jsonb, 
        NOW()
      )
    `);
  } catch (err) {
    console.error("Audit logging error:", err);
  }
}

// ==========================================
// 1. ACCOUNTS DASHBOARD
// ==========================================
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Pull from database in parallel
    const [
      invoices,
      receipts,
      reimbursements,
      payrolls,
      transactions
    ] = await Promise.all([
      prisma.invoice.findMany({
        where: { status: { not: "CANCELLED" } },
        include: { receiptAllocations: true, client: true }
      }),
      prisma.receipt.findMany({
        where: { receiptDate: { gte: startOfMonth } }
      }),
      prisma.reimbursement.findMany({
        where: { status: { in: ["APPROVED", "APPROVED_DIRECTOR", "APPROVED_CFO", "PENDING_PAYMENT", "PENDING_ACCOUNTS", "PENDING_MANAGER", "PENDING_PARTNER"] } }
      }),
      prisma.payroll.findMany({
        where: { status: "PENDING" }
      }),
      prisma.transaction.findMany()
    ]);

    // AR Calculations
    let arOutstanding = 0;
    const clientAgingMap: Record<string, number> = {};
    const invoiceAging = {
      current: 0,
      overdue1to30: 0,
      overdue31to60: 0,
      overdueAbove60: 0
    };
    let forexExposure = 0;

    for (const inv of invoices) {
      const paidAmount = inv.receiptAllocations.reduce((sum, a) => sum + a.amountAllocated, 0);
      const outstandingForeign = inv.totalAmount - paidAmount;
      const outstandingBase = outstandingForeign * inv.exchangeRate;

      if (outstandingBase > 0) {
        arOutstanding += outstandingBase;

        // Group by client
        const clientName = inv.client.name;
        clientAgingMap[clientName] = (clientAgingMap[clientName] || 0) + outstandingBase;

        // Aging buckets based on issueDate
        const diffTime = today.getTime() - new Date(inv.issueDate).getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          invoiceAging.current += outstandingBase;
        } else if (diffDays > 30 && diffDays <= 60) {
          invoiceAging.overdue1to30 += outstandingBase;
        } else if (diffDays > 60 && diffDays <= 90) {
          invoiceAging.overdue31to60 += outstandingBase;
        } else {
          invoiceAging.overdueAbove60 += outstandingBase;
        }

        // Forex Exposure
        if (inv.currency !== "INR") {
          forexExposure += outstandingBase;
        }
      }
    }

    // Sort client aging and convert to array format
    const clientAging = Object.entries(clientAgingMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Keep top 10

    // AP Calculations
    const apReimbursements = reimbursements
      .filter(r => ["APPROVED", "APPROVED_DIRECTOR", "APPROVED_CFO", "PENDING_PAYMENT"].includes(r.status.toUpperCase()))
      .reduce((sum, r) => sum + r.amount, 0);

    const apPayroll = payrolls.reduce((sum, p) => sum + p.netPayable, 0);
    const apOutstanding = apReimbursements + apPayroll;

    // Financial Metrics
    const monthlyRevenue = invoices
      .filter(inv => inv.status !== "CANCELLED" && new Date(inv.issueDate) >= startOfMonth)
      .reduce((sum, inv) => sum + inv.subTotal * inv.exchangeRate, 0);

    const monthlyCollections = receipts.reduce((sum, r) => sum + r.amount * r.exchangeRate, 0);

    const gstLiability = invoices
      .filter(inv => inv.status !== "CANCELLED")
      .reduce((sum, inv) => sum + inv.taxAmount * inv.exchangeRate, 0);

    res.json({
      success: true,
      data: {
        summary: {
          arOutstanding,
          apOutstanding,
          monthlyRevenue,
          monthlyCollections,
          pendingReimbursements: apReimbursements,
          pendingTimesheetPayments: apPayroll,
          gstLiability,
          forexExposure
        },
        widgets: {
          receivables: {
            clientAging: clientAging.length > 0 ? clientAging : [
              { name: "No Outstanding Clients", value: 0 }
            ],
            invoiceAging
          },
          payables: {
            payrollDue: apPayroll,
            reimbursementsDue: apReimbursements
          },
          banking: {
            importedStatements: transactions.length,
            unmappedEntries: transactions.filter(t => t.mappedStatus === "UNMAPPED").length,
            reconciliationSummary: {
              reconciled: transactions.filter(t => t.mappedStatus === "RECONCILED").length,
              total: transactions.length
            }
          },
          operations: {
            pendingInvoiceApprovals: invoices.filter(inv => inv.status === "PENDING_APPROVAL").length,
            pendingPaymentApprovals: reimbursements.filter(r => r.status === "PENDING_APPROVAL").length
          }
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. BILLING ENTITIES
// ==========================================
router.get("/entities", async (req: Request, res: Response) => {
  try {
    const entities = await prisma.entity.findMany();
    
    // Seed sample entities if none exist in the database
    if (entities.length === 0) {
      const sampleEntities = [
        { name: "ASA India Pvt Ltd", legalName: "Ashish Shah & Associates India Pvt Ltd", gstin: "27AAACA1234F1Z0", pan: "AAACA1234F", address: "A 701, Rameshwer Tower 2, Phase XI, New Golden Nest,\nBhayander East, Thane - 401 105", status: "ACTIVE", bankDetails: { bankName: "HDFC Bank", accountNo: "50200012345678", ifsc: "HDFC0000060" } },
        { name: "ASA Consulting LLP", legalName: "ASA Consulting LLP", gstin: "27AABCA5678K1Z5", pan: "AABCA5678K", address: "Pune, India", status: "ACTIVE", bankDetails: { bankName: "ICICI Bank", accountNo: "000401123456", ifsc: "ICIC0000004" } },
        { name: "ASA UAE Ltd", legalName: "ASA UAE Consulting FZ-LLC", gstin: null, pan: null, address: "Dubai, UAE", status: "ACTIVE", bankDetails: { bankName: "Emirates NBD", accountNo: "10123456789", ifsc: "EBILAEAD" } },
        { name: "ASA Singapore", legalName: "ASA Singapore Pte Ltd", gstin: null, pan: null, address: "Singapore", status: "ACTIVE", bankDetails: { bankName: "DBS Bank", accountNo: "0031234567", ifsc: "DBSSSG" } }
      ];
      
      for (const ent of sampleEntities) {
        await prisma.entity.create({ data: ent as any });
      }
      const seeded = await prisma.entity.findMany();
      return res.json({ success: true, data: seeded });
    }
    
    res.json({ success: true, data: entities });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/entities", async (req: any, res: Response) => {
  try {
    const { name, legalName, gstin, pan, address, bankDetails, status, msmeReg } = req.body;
    const entity = await prisma.entity.create({
      data: { name, legalName, gstin, pan, address, bankDetails, status, msmeReg }
    });
    
    await logAudit("Entity", entity.id, "CREATE", req.user?.id || "System", null, entity);
    res.status(201).json({ success: true, data: entity });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/entities/:id", async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const oldVal = await prisma.entity.findUnique({ where: { id } });
    const { name, legalName, gstin, pan, address, bankDetails, status, msmeReg } = req.body;
    
    const entity = await prisma.entity.update({
      where: { id },
      data: { name, legalName, gstin, pan, address, bankDetails, status, msmeReg }
    });
    
    await logAudit("Entity", id, "UPDATE", req.user?.id || "System", oldVal, entity);
    res.json({ success: true, data: entity });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/entities/:id", async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const oldVal = await prisma.entity.findUnique({ where: { id } });
    await prisma.entity.delete({ where: { id } });
    
    await logAudit("Entity", id, "DELETE", req.user?.id || "System", oldVal, null);
    res.json({ success: true, message: "Billing Entity deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. CURRENCIES & EXCHANGE RATES
// ==========================================
router.get("/currencies", async (req: Request, res: Response) => {
  try {
    const currencies = await (prisma as any).currency.findMany({ include: { exchangeRates: true } });
    
    if (currencies.length === 0) {
      const sampleCurrencies = [
        { code: "INR", name: "Indian Rupee", symbol: "₹" },
        { code: "USD", name: "US Dollar", symbol: "$" },
        { code: "AED", name: "UAE Dirham", symbol: "AED" },
        { code: "EUR", name: "Euro", symbol: "€" },
        { code: "GBP", name: "Pound Sterling", symbol: "£" }
      ];
      for (const cur of sampleCurrencies) {
        await (prisma as any).currency.create({ data: cur });
      }
      const seeded = await (prisma as any).currency.findMany({ include: { exchangeRates: true } });
      return res.json({ success: true, data: seeded });
    }
    
    res.json({ success: true, data: currencies });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/exchange-rates", async (req: any, res: Response) => {
  try {
    const { currencyCode, baseCurrency, rate, date } = req.body;
    const currency = await (prisma as any).currency.findUnique({ where: { code: currencyCode } });
    if (!currency) return res.status(404).json({ success: false, message: "Currency not found" });

    const exchangeRate = await (prisma as any).exchangeRate.create({
      data: {
        currencyId: currency.id,
        baseCurrency: baseCurrency || "INR",
        rate: parseFloat(rate),
        date: new Date(date)
      }
    });

    await logAudit("ExchangeRate", exchangeRate.id, "CREATE", req.user?.id || "System", null, exchangeRate);
    res.status(201).json({ success: true, data: exchangeRate });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. INVOICES (Enterprise Multi-Project / Multi-Client / Multi-Currency / GST)
// ==========================================
router.get("/invoices", async (req: Request, res: Response) => {
  try {
    const invoices = await (prisma as any).invoice.findMany({
      include: {
        entity: true,
        client: true,
        project: true,
        items: {
          include: {
            project: true,
            client: true,
            employee: true
          }
        },
        receiptAllocations: {
          include: {
            receipt: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: invoices });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/invoices/:id", async (req: Request, res: Response) => {
  try {
    const invoice = await (prisma as any).invoice.findUnique({
      where: { id: req.params.id },
      include: {
        entity: true,
        client: true,
        project: true,
        items: {
          include: {
            project: true,
            client: true,
            employee: true
          }
        },
        receiptAllocations: {
          include: {
            receipt: true
          }
        }
      }
    });
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    res.json({ success: true, data: invoice });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/invoices", async (req: any, res: Response) => {
  try {
    const {
      entityId,
      clientId,
      newClientName,
      newClientGstin,
      newClientAddress,
      projectId,
      udin,
      dueDate,
      currency,
      exchangeRate,
      status,
      items // Array of: { description, quantity, unitPrice, projectId, clientId, employeeId, currency, gstRate }
    } = req.body;

    let resolvedClientId = clientId;
    if (newClientName && newClientName.trim()) {
      const trimmedName = newClientName.trim();
      const existingClient = await prisma.client.findFirst({
        where: { name: { equals: trimmedName, mode: 'insensitive' } }
      });
      if (existingClient) {
        resolvedClientId = existingClient.id;
      } else {
        const trimmedGstin = newClientGstin && newClientGstin.trim() ? newClientGstin.trim().toUpperCase() : null;
        const stateFromGstin = (trimmedGstin && trimmedGstin.length >= 2 && trimmedGstin.substring(0, 2) === '27') ? 'Maharashtra' : '';
        const clientService = new ClientService();
        const newClient = await clientService.createClient({
          name: trimmedName,
          country: 'India',
          pan: (trimmedGstin && trimmedGstin.length >= 12) ? trimmedGstin.substring(2, 12) : '',
          gstin: trimmedGstin,
          gstStatus: trimmedGstin ? 'Yes' : 'No',
          state: stateFromGstin,
          address: newClientAddress || null,
          status: 'Active'
        }, req.user);
        resolvedClientId = newClient.id;
      }
    }

    // Generate Invoice Number based on Entity Prefix & Custom Format Pattern
    const entity = await prisma.entity.findUnique({ where: { id: entityId } });
    const bankDetails = entity?.bankDetails as any;
    const prefix = bankDetails?.invoicePrefix || "";
    const customFormat = bankDetails?.customFormat || "{PREFIX}-{YYYY}-{NNNN}";
    const count = await prisma.invoice.count({ where: { entityId } });

    const now = new Date();
    const year = now.getFullYear();
    const currentYearShort = year.toString().slice(-2);

    // Calculate Fiscal Year (April to March)
    const month = now.getMonth(); // 0-11
    const fiscalStartYear = month >= 3 ? year : year - 1;
    const fiscalEndYear = fiscalStartYear + 1;
    const fiscalStartShort = fiscalStartYear.toString().slice(-2);
    const fiscalEndShort = fiscalEndYear.toString().slice(-2);

    const fyLong = `${fiscalStartYear}-${fiscalEndYear}`;
    const fyShort = `${fiscalStartShort}-${fiscalEndShort}`;
    const fyMid = `${fiscalStartYear}-${fiscalEndShort}`;

    let sequence = count + 1;
    let invoiceNumber = "";
    let isUnique = false;

    while (!isUnique) {
      invoiceNumber = customFormat
        .replace(/{PREFIX}/g, prefix)
        .replace(/{YYYY}/g, year.toString())
        .replace(/{YY}/g, currentYearShort)
        .replace(/{FY_LONG}/g, fyLong)
        .replace(/{FY_MID}/g, fyMid)
        .replace(/{FY_SHORT}/g, fyShort)
        .replace(/{FY}/g, fyMid)
        .replace(/{NNNN}/g, sequence.toString().padStart(4, "0"))
        .replace(/{NNN}/g, sequence.toString().padStart(3, "0"))
        .replace(/{NN}/g, sequence.toString().padStart(2, "0"))
        .replace(/{N}/g, sequence.toString());

      // Check if this invoice number already exists
      const existing = await prisma.invoice.findUnique({ where: { invoiceNumber } });
      if (!existing) {
        isUnique = true;
      } else {
        sequence++;
      }
    }


    // Compute sums
    let subTotal = 0;
    let taxAmount = 0;

    // Fetch client to check if interstate or local
    const client = await prisma.client.findUnique({ where: { id: resolvedClientId } });
    const clientGstin = client?.gstin || '';
    const clientState = client?.state || '';
    let isLocal = true;
    if (clientGstin && clientGstin.trim().length >= 2) {
      isLocal = clientGstin.trim().substring(0, 2) === '27';
    } else if (clientState) {
      isLocal = clientState.toLowerCase() === 'maharashtra';
    } else if (client?.address) {
      const addrUpper = client.address.toUpperCase();
      isLocal = addrUpper.includes('MAHARASHTRA') || addrUpper.includes('MH') || addrUpper.includes('MUMBAI') || addrUpper.includes('THANE') || addrUpper.includes('PUNE') || addrUpper.includes('GOLDEN NEST');
    }

    const lineItemsData = items.map((item: any) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const lineTotal = quantity * unitPrice;
      const gstRate = parseFloat(item.gstRate) || 0;
      const gstAmount = lineTotal * (gstRate / 100);
      
      subTotal += lineTotal;
      taxAmount += gstAmount;

      return {
        description: item.description,
        sacCode: item.sacCode || "998311",
        quantity,
        unitPrice,
        total: lineTotal,
        projectId: item.projectId || null,
        clientId: item.clientId || null,
        employeeId: item.employeeId || null,
        hours: item.hours ? parseFloat(item.hours) : null,
        rate: item.rate ? parseFloat(item.rate) : null,
        currency: item.currency || currency || "INR",
        gstRate,
        gstAmount,
        cgst: isLocal ? gstAmount / 2 : 0.0,
        sgst: isLocal ? gstAmount / 2 : 0.0,
        igst: isLocal ? 0.0 : gstAmount
      };
    });

    const totalAmount = subTotal + taxAmount;

    // Create Invoice with Line Items
    const invoice = await (prisma as any).invoice.create({
      data: {
        invoiceNumber,
        entityId,
        clientId: resolvedClientId,
        projectId: projectId || null,
        udin: udin || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        subTotal,
        taxAmount,
        totalAmount,
        currency: currency || "INR",
        exchangeRate: parseFloat(exchangeRate || "1.0"),
        status: status || "DRAFT",
        items: {
          create: lineItemsData
        }
      },
      include: {
        items: true
      }
    });

    // Create a ledger entry for accounts receivable
    await (prisma as any).ledger.create({
      data: {
        entityId,
        type: "CLIENT",
        clientId: resolvedClientId,
        date: new Date(),
        description: `Generated Invoice ${invoiceNumber}`,
        debit: totalAmount,
        credit: 0.0,
        balance: totalAmount,
        referenceId: invoice.id,
        referenceType: "INVOICE"
      }
    });

    await logAudit("Invoice", invoice.id, "CREATE", req.user?.id || "System", null, invoice);

    res.status(201).json({ success: true, data: invoice });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/invoices/:id", async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const oldInvoice = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!oldInvoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    const {
      dueDate,
      status,
      currency,
      exchangeRate,
      udin,
      items,
      invoiceNumber,
      issueDate,
      clientId,
      newClientName,
      newClientGstin,
      newClientAddress
    } = req.body;

    let resolvedClientId = clientId || oldInvoice.clientId;
    if (newClientName && newClientName.trim()) {
      const trimmedName = newClientName.trim();
      const existingClient = await prisma.client.findFirst({
        where: { name: { equals: trimmedName, mode: 'insensitive' } }
      });
      if (existingClient) {
        resolvedClientId = existingClient.id;
      } else {
        const trimmedGstin = newClientGstin && newClientGstin.trim() ? newClientGstin.trim().toUpperCase() : null;
        const stateFromGstin = (trimmedGstin && trimmedGstin.length >= 2 && trimmedGstin.substring(0, 2) === '27') ? 'Maharashtra' : '';
        const clientService = new ClientService();
        const newClient = await clientService.createClient({
          name: trimmedName,
          country: 'India',
          pan: (trimmedGstin && trimmedGstin.length >= 12) ? trimmedGstin.substring(2, 12) : '',
          gstin: trimmedGstin,
          gstStatus: trimmedGstin ? 'Yes' : 'No',
          state: stateFromGstin,
          address: newClientAddress || null,
          status: 'Active'
        }, req.user);
        resolvedClientId = newClient.id;
      }
    }

    let subTotal = oldInvoice.subTotal;
    let taxAmount = oldInvoice.taxAmount;
    let totalAmount = oldInvoice.totalAmount;

    if (items) {
      subTotal = 0;
      taxAmount = 0;

      // Fetch client from resolvedClientId to check if interstate or local
      const client = await prisma.client.findUnique({ where: { id: resolvedClientId } });
      const clientGstin = client?.gstin || '';
      const clientState = client?.state || '';
      let isLocal = true;
      if (clientGstin && clientGstin.trim().length >= 2) {
        isLocal = clientGstin.trim().substring(0, 2) === '27';
      } else if (clientState) {
        isLocal = clientState.toLowerCase() === 'maharashtra';
      } else if (client?.address) {
        const addrUpper = client.address.toUpperCase();
        isLocal = addrUpper.includes('MAHARASHTRA') || addrUpper.includes('MH') || addrUpper.includes('MUMBAI') || addrUpper.includes('THANE') || addrUpper.includes('PUNE') || addrUpper.includes('GOLDEN NEST');
      }
      
      // Delete old line items
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });

      // Recreate them
      for (const item of items) {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        const lineTotal = qty * price;
        const gstR = parseFloat(item.gstRate) || 0;
        const gstAmt = lineTotal * (gstR / 100);

        subTotal += lineTotal;
        taxAmount += gstAmt;

        await (prisma as any).invoiceItem.create({
          data: {
            invoiceId: id,
            description: item.description,
            sacCode: item.sacCode || "998311",
            quantity: qty,
            unitPrice: price,
            total: lineTotal,
            projectId: item.projectId || null,
            clientId: item.clientId || null,
            employeeId: item.employeeId || null,
            currency: item.currency || currency || "INR",
            gstRate: gstR,
            gstAmount: gstAmt,
            cgst: isLocal ? gstAmt / 2 : 0.0,
            sgst: isLocal ? gstAmt / 2 : 0.0,
            igst: isLocal ? 0.0 : gstAmt
          }
        });
      }
      totalAmount = subTotal + taxAmount;
    }

    const updatedInvoice = await (prisma as any).invoice.update({
      where: { id },
      data: {
        invoiceNumber: invoiceNumber || undefined,
        issueDate: issueDate ? new Date(issueDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        clientId: resolvedClientId,
        status: status || undefined,
        currency: currency || undefined,
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
        udin: udin !== undefined ? (udin || null) : undefined,
        subTotal,
        taxAmount,
        totalAmount
      },
      include: {
        items: true
      }
    });

    // Update the ledger entry for accounts receivable
    await (prisma as any).ledger.updateMany({
      where: { referenceId: id, referenceType: "INVOICE" },
      data: {
        clientId: resolvedClientId,
        debit: totalAmount,
        balance: totalAmount
      }
    });

    await logAudit("Invoice", id, "UPDATE", req.user?.id || "System", oldInvoice, updatedInvoice);
    res.json({ success: true, data: updatedInvoice });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/invoices/:id", async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const oldInvoice = await prisma.invoice.findUnique({ where: { id } });
    if (!oldInvoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // Perform database deletion in a transaction to maintain referential integrity
    await prisma.$transaction([
      prisma.invoiceItem.deleteMany({ where: { invoiceId: id } }),
      prisma.receiptAllocation.deleteMany({ where: { invoiceId: id } }),
      prisma.ledger.deleteMany({ where: { referenceId: id, referenceType: "INVOICE" } }),
      prisma.invoice.delete({ where: { id } })
    ]);

    await logAudit("Invoice", id, "DELETE", req.user?.id || "System", oldInvoice, null);
    res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. RECEIPTS & FIFO ALLOCATION
// ==========================================
router.get("/receipts", async (req: Request, res: Response) => {
  try {
    const receipts = await (prisma as any).receipt.findMany({
      include: { client: true, entity: true, allocations: true }
    });
    res.json({ success: true, data: receipts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/receipts", async (req: any, res: Response) => {
  try {
    const { clientId, entityId, amount, currency, exchangeRate, receiptDate, paymentMode, referenceNumber, notes } = req.body;
    
    const count = await (prisma as any).receipt.count();
    const receiptNumber = `RCPT-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, "0")}`;

    const receipt = await (prisma as any).receipt.create({
      data: {
        receiptNumber,
        clientId,
        entityId,
        amount: parseFloat(amount),
        currency: currency || "INR",
        exchangeRate: parseFloat(exchangeRate || "1.0"),
        receiptDate: new Date(receiptDate),
        paymentMode,
        referenceNumber,
        notes
      }
    });

    // Create credit entry in Client Ledger
    await (prisma as any).ledger.create({
      data: {
        entityId,
        type: "CLIENT",
        clientId,
        date: new Date(receiptDate),
        description: `Collection Received ${receiptNumber}`,
        debit: 0.0,
        credit: parseFloat(amount),
        balance: -parseFloat(amount),
        referenceId: receipt.id,
        referenceType: "RECEIPT"
      }
    });

    // Automatically trigger FIFO Allocation
    let remainingAmount = parseFloat(amount);
    
    // Find all unpaid invoices for this client
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        clientId,
        status: { in: ["DRAFT", "SENT", "PARTIALLY_PAID", "OVERDUE"] }
      },
      orderBy: { issueDate: "asc" } // FIFO order
    });

    for (const inv of unpaidInvoices) {
      if (remainingAmount <= 0) break;

      // Find previously allocated amount for this invoice
      const allocations = await prisma.receiptAllocation.findMany({
        where: { invoiceId: inv.id }
      });
      const allocatedTotal = allocations.reduce((sum, a) => sum + a.amountAllocated, 0);
      const balanceDue = inv.totalAmount - allocatedTotal;

      if (balanceDue > 0) {
        const allocateValue = Math.min(remainingAmount, balanceDue);
        
        await prisma.receiptAllocation.create({
          data: {
            receiptId: receipt.id,
            invoiceId: inv.id,
            amountAllocated: allocateValue
          }
        });

        remainingAmount -= allocateValue;

        // Update Invoice status
        const isFullyPaid = (allocatedTotal + allocateValue) >= inv.totalAmount;
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { status: isFullyPaid ? "PAID" : "PARTIALLY_PAID" }
        });
      }
    }

    await logAudit("Receipt", receipt.id, "CREATE", req.user?.id || "System", null, receipt);
    res.status(201).json({ success: true, data: receipt });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. BANK STATEMENT IMPORT & AUTO-RECONCILIATION
// ==========================================
router.post("/bank-statements/import", async (req: any, res: Response) => {
  try {
    const { entityId, statements } = req.body; // Array of: { bankReference, date, description, type (DEBIT/CREDIT), amount, balance }
    const imported = [];

    for (const stmt of statements) {
      try {
        const trans = await prisma.transaction.create({
          data: {
            entityId,
            bankReference: stmt.bankReference || `TXN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
            date: new Date(stmt.date),
            description: stmt.description,
            type: stmt.type, // DEBIT / CREDIT
            amount: parseFloat(stmt.amount),
            balance: stmt.balance ? parseFloat(stmt.balance) : null,
            mappedStatus: "UNMAPPED"
          }
        });
        imported.push(trans);
      } catch (err) {
        console.warn("Skipping duplicates or invalid statement line:", stmt.bankReference);
      }
    }

    res.status(201).json({ success: true, count: imported.length, data: imported });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Auto Matching engine
router.post("/bank-statements/auto-match", async (req: any, res: Response) => {
  try {
    const unmapped = await prisma.transaction.findMany({
      where: { mappedStatus: "UNMAPPED" }
    });

    let matchCount = 0;

    for (const txn of unmapped) {
      // 1. Credit Reconciliation: Match by amount and reference against invoices or receipts
      if (txn.type.toUpperCase() === "CREDIT" || txn.amount > 0) {
        const invoice = await prisma.invoice.findFirst({
          where: {
            totalAmount: txn.amount,
            status: { in: ["DRAFT", "SENT", "PARTIALLY_PAID", "OVERDUE"] }
          }
        });

        if (invoice) {
          await prisma.transaction.update({
            where: { id: txn.id },
            data: {
              mappedStatus: "RECONCILED",
              invoiceId: invoice.id,
              clientId: invoice.clientId
            }
          });

          // Mark invoice as paid
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: "PAID" }
          });

          matchCount++;
          continue;
        }
      }

      // 2. Debit Reconciliation: Match by amount against Reimbursements
      if (txn.type.toUpperCase() === "DEBIT" || txn.amount < 0) {
        const absAmount = Math.abs(txn.amount);
        const reimb = await prisma.reimbursement.findFirst({
          where: {
            amount: absAmount,
            status: { in: ["APPROVED", "PENDING_PAYMENT"] }
          }
        });

        if (reimb) {
          await prisma.transaction.update({
            where: { id: txn.id },
            data: {
              mappedStatus: "RECONCILED",
              employeeId: reimb.employeeId
            }
          });

          await prisma.reimbursement.update({
            where: { id: reimb.id },
            data: { status: "PAID" }
          });

          matchCount++;
          continue;
        }
      }
    }

    res.json({ success: true, matchedCount: matchCount });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 7. LEDGERS (Client & Employee)
// ==========================================
router.get("/ledgers/employee/:employeeId", async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const ledgers = await (prisma as any).ledger.findMany({
      where: { employeeId },
      orderBy: { date: "asc" }
    }) as any[];

    let runningBalance = 0;
    const dataWithRunningBalance = ledgers.map(l => {
      runningBalance += ((l.debit || 0) - (l.credit || 0));
      return { ...l, runningBalance };
    });

    res.json({ success: true, data: dataWithRunningBalance });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/ledgers/client/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const ledgers = await (prisma as any).ledger.findMany({
      where: { clientId },
      orderBy: { date: "asc" }
    }) as any[];

    let runningBalance = 0;
    const dataWithRunningBalance = ledgers.map(l => {
      runningBalance += ((l.debit || 0) - (l.credit || 0));
      return { ...l, runningBalance };
    });

    res.json({ success: true, data: dataWithRunningBalance });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 8. APPROVALmatrix & QUEUE
// ==========================================
router.get("/approval-queue", async (req: Request, res: Response) => {
  try {
    const pendingReimbursements = await prisma.reimbursement.findMany({
      where: { status: { in: ["PENDING_MANAGER", "PENDING_PARTNER", "PENDING_ACCOUNTS"] } },
      include: { employee: true, client: true, project: true }
    });
    
    const pendingInvoices = await prisma.invoice.findMany({
      where: { status: "PENDING_APPROVAL" },
      include: { client: true, entity: true }
    });

    res.json({
      success: true,
      data: {
        reimbursements: pendingReimbursements,
        invoices: pendingInvoices
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/approval-queue/:type/:id/approve", async (req: any, res: Response) => {
  try {
    const { type, id } = req.params;
    const { remarks } = req.body;
    const approverId = req.user?.id || "System";

    if (type === "reimbursement") {
      const reimb = await prisma.reimbursement.findUnique({ where: { id } });
      if (!reimb) return res.status(404).json({ success: false, message: "Reimbursement not found" });

      // Apply Approval Matrix Rules
      // Below 50K: Manager
      // 50K - 5L: Director
      // Above 5L: CFO
      const amount = reimb.amount;
      let targetStatus = "PENDING_PAYMENT";

      if (amount >= 50000 && amount < 500000) {
        targetStatus = "APPROVED_DIRECTOR";
      } else if (amount >= 500000) {
        targetStatus = "APPROVED_CFO";
      } else {
        targetStatus = "APPROVED";
      }

      const updated = await prisma.reimbursement.update({
        where: { id },
        data: {
          status: targetStatus,
          remarks: remarks || reimb.remarks,
          approvedBy: approverId,
          approvedAt: new Date()
        }
      });

      // Post to employee ledger on final approval
      if (["APPROVED", "APPROVED_DIRECTOR", "APPROVED_CFO", "PENDING_PAYMENT"].includes(targetStatus)) {
        await (prisma as any).ledger.create({
          data: {
            entityId: reimb.clientId ? "3e1c5782-6cf5-42e6-8649-45d7383e516c" : "3e1c5782-6cf5-42e6-8649-45d7383e516c", // default fallback entity
            type: "EMPLOYEE",
            employeeId: reimb.employeeId,
            date: new Date(),
            description: `Approved Reimbursement Claim ${reimb.claimId}`,
            debit: amount,
            credit: 0.0,
            balance: amount,
            referenceId: reimb.id,
            referenceType: "REIMBURSEMENT"
          }
        });
      }

      await logAudit("Reimbursement", id, "APPROVE", approverId, reimb, updated);
      return res.json({ success: true, data: updated });
    }

    if (type === "invoice") {
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: "SENT" }
      });

      await logAudit("Invoice", id, "APPROVE", approverId, invoice, updated);
      return res.json({ success: true, data: updated });
    }

    res.status(400).json({ success: false, message: "Invalid queue type" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 9. FINANCE REPORTS
// ==========================================
router.get("/reports/gst", async (req: Request, res: Response) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: { entity: true, client: true, items: true }
    });

    const report = invoices.map(inv => {
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      let totalGst = 0;

      for (const item of inv.items) {
        cgst += (item.cgst || 0) * inv.exchangeRate;
        sgst += (item.sgst || 0) * inv.exchangeRate;
        igst += (item.igst || 0) * inv.exchangeRate;
        totalGst += (item.gstAmount || 0) * inv.exchangeRate;
      }

      // If itemized taxes are 0 but invoice has flat taxAmount (legacy or edge case), determine split dynamically:
      if (totalGst === 0 && inv.taxAmount > 0) {
        totalGst = inv.taxAmount * inv.exchangeRate;

        const gstin = inv.client?.gstin || '';
        const state = inv.client?.state || '';
        const address = inv.client?.address || '';

        let isLocal = true;
        if (gstin && gstin.trim().length >= 2) {
          isLocal = (gstin.trim().substring(0, 2) === '27');
        } else if (state) {
          const stUpper = state.toUpperCase();
          isLocal = (stUpper === 'MAHARASHTRA' || stUpper === 'MH');
        } else if (address) {
          const addrUpper = address.toUpperCase();
          isLocal = addrUpper.includes('MAHARASHTRA') || addrUpper.includes('MH') || addrUpper.includes('MUMBAI') || addrUpper.includes('THANE') || addrUpper.includes('PUNE') || addrUpper.includes('GOLDEN NEST');
        }

        if (isLocal) {
          cgst = totalGst / 2;
          sgst = totalGst / 2;
          igst = 0.0;
        } else {
          cgst = 0.0;
          sgst = 0.0;
          igst = totalGst;
        }
      }

      const taxableVal = inv.subTotal * inv.exchangeRate;
      const isLocal = cgst > 0 || (igst === 0 && sgst === 0 && cgst === 0 && totalGst === 0);
      const gstRate = taxableVal > 0 ? Math.round((totalGst / taxableVal) * 100) : 18;

      return {
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        entity: inv.entity.name,
        client: inv.client.name,
        gstin: inv.client.gstin || '',
        state: inv.client.state || '',
        taxableValue: taxableVal,
        cgst,
        sgst,
        igst,
        totalGst,
        totalAmount: (inv.subTotal + (totalGst / inv.exchangeRate)) * inv.exchangeRate,
        gstType: (cgst > 0 || sgst > 0) ? 'Local' : (igst > 0 ? 'Inter-State' : 'Exempt'),
        cgstRate: gstRate / 2,
        sgstRate: gstRate / 2,
        igstRate: igst > 0 ? gstRate : 0
      };
    });

    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/reports/pnl", async (req: Request, res: Response) => {
  try {
    // Basic income and expenses reporting
    const invoices = await prisma.invoice.findMany();
    const reimbursements = await prisma.reimbursement.findMany();
    const payrolls = await prisma.payroll.findMany();

    const revenue = invoices
      .filter(i => i.status !== "CANCELLED")
      .reduce((sum, i) => sum + i.subTotal, 0);

    const travelExpense = reimbursements
      .filter(r => r.category.toUpperCase() === "TRAVEL")
      .reduce((sum, r) => sum + r.amount, 0);

    const mealExpense = reimbursements
      .filter(r => r.category.toUpperCase() === "MEALS")
      .reduce((sum, r) => sum + r.amount, 0);

    const salaryExpense = payrolls
      .reduce((sum, p) => sum + p.netPayable, 0);

    const officeOverheads = reimbursements
      .filter(r => {
        const cat = (r.category || "").toUpperCase();
        return cat !== "TRAVEL" && cat !== "MEALS";
      })
      .reduce((sum, r) => sum + r.amount, 0);

    const totalExpense = travelExpense + mealExpense + salaryExpense + officeOverheads;

    // Fetch total and billable timesheet hours
    const [totalHoursSum, billableHoursSum, timelogGroups, clients] = await Promise.all([
      prisma.timelog.aggregate({
        _sum: { hours: true }
      }),
      prisma.timelog.aggregate({
        where: { billableStatus: 'billable' },
        _sum: { hours: true }
      }),
      prisma.timelog.groupBy({
        by: ['clientId'],
        _sum: { hours: true }
      }),
      prisma.client.findMany({
        select: { id: true, name: true }
      })
    ]);

    const clientMap = new Map<string, string>();
    clients.forEach(c => clientMap.set(c.id, c.name));

    const clientBreakdown = timelogGroups.map(group => ({
      clientId: group.clientId,
      clientName: clientMap.get(group.clientId) || 'Unknown Client',
      hours: group._sum.hours || 0
    })).sort((a, b) => b.hours - a.hours);
    
    res.json({
      success: true,
      data: {
        revenue,
        expenses: {
          salary: salaryExpense,
          travel: travelExpense,
          meals: mealExpense,
          officeOverheads
        },
        netProfit: revenue - totalExpense,
        timesheetOverview: {
          totalHours: totalHoursSum._sum.hours || 0,
          billableHours: billableHoursSum._sum.hours || 0,
          clientBreakdown
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================================
// 10. NEW SUMMARY APIs
// ==========================================

// GET /api/accounts/ar-summary
router.get("/ar-summary", async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const invoices = await prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { receiptAllocations: true, client: true }
    });

    let totalOutstanding = 0;
    let overdueAmount = 0;
    let currentAmount = 0;
    const agingBuckets = {
      current: 0,
      overdue1to30: 0,
      overdue31to60: 0,
      overdueAbove60: 0
    };

    const currencyWiseMap: Record<string, { amount: number; baseAmount: number }> = {};

    for (const inv of invoices) {
      const paid = inv.receiptAllocations.reduce((sum, a) => sum + a.amountAllocated, 0);
      const outstandingForeign = inv.totalAmount - paid;
      const outstandingBase = outstandingForeign * inv.exchangeRate;

      if (outstandingBase > 0) {
        totalOutstanding += outstandingBase;

        // Overdue vs Current check (dueDate)
        const isOverdue = inv.dueDate ? new Date(inv.dueDate) < today : false;
        if (isOverdue) {
          overdueAmount += outstandingBase;
        } else {
          currentAmount += outstandingBase;
        }

        // Aging buckets (issueDate)
        const diffTime = today.getTime() - new Date(inv.issueDate).getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          agingBuckets.current += outstandingBase;
        } else if (diffDays > 30 && diffDays <= 60) {
          agingBuckets.overdue1to30 += outstandingBase;
        } else if (diffDays > 60 && diffDays <= 90) {
          agingBuckets.overdue31to60 += outstandingBase;
        } else {
          agingBuckets.overdueAbove60 += outstandingBase;
        }

        // Currency-wise grouping
        const cur = inv.currency || "INR";
        if (!currencyWiseMap[cur]) {
          currencyWiseMap[cur] = { amount: 0, baseAmount: 0 };
        }
        currencyWiseMap[cur].amount += outstandingForeign;
        currencyWiseMap[cur].baseAmount += outstandingBase;
      }
    }

    const currencyWiseSummary = Object.entries(currencyWiseMap).map(([currency, data]) => ({
      currency,
      amount: data.amount,
      baseAmount: data.baseAmount
    }));

    res.json({
      success: true,
      data: {
        totalOutstanding,
        overdueAmount,
        currentAmount,
        agingBuckets,
        currencyWiseSummary
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/ap-summary
router.get("/ap-summary", async (req: Request, res: Response) => {
  try {
    const reimbursements = await prisma.reimbursement.findMany({
      where: { status: { in: ["APPROVED", "APPROVED_DIRECTOR", "APPROVED_CFO", "PENDING_PAYMENT", "PENDING_ACCOUNTS"] } }
    });

    const payrolls = await prisma.payroll.findMany({
      where: { status: "PENDING" }
    });

    const ledgers = await prisma.ledger.findMany({
      where: { type: "VENDOR" }
    });

    const approvedReimbursements = reimbursements.reduce((sum, r) => sum + r.amount, 0);
    const payrollPending = payrolls.reduce((sum, p) => sum + p.netPayable, 0);
    
    // Vendor dues from VENDOR ledgers (debit - credit or net balance)
    const vendorDues = ledgers.reduce((sum, l) => sum + ((l.debit || 0) - (l.credit || 0)), 0);

    const totalPayable = approvedReimbursements + payrollPending + (vendorDues > 0 ? vendorDues : 0);

    res.json({
      success: true,
      data: {
        totalPayable,
        payrollPending,
        approvedReimbursements,
        vendorDues: vendorDues > 0 ? vendorDues : 0
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/monthly-revenue
router.get("/monthly-revenue", async (req: Request, res: Response) => {
  try {
    const { gst } = req.query;
    const useGst = gst === "true";

    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

    const invoices = await prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" } }
    });

    let currentMonthRevenue = 0;
    let lastMonthRevenue = 0;

    for (const inv of invoices) {
      const amount = useGst ? inv.totalAmount : inv.subTotal;
      const baseAmount = amount * inv.exchangeRate;
      const issueDate = new Date(inv.issueDate);

      if (issueDate >= currentMonthStart) {
        currentMonthRevenue += baseAmount;
      } else if (issueDate >= lastMonthStart && issueDate <= lastMonthEnd) {
        lastMonthRevenue += baseAmount;
      }
    }

    const growthPercentage = lastMonthRevenue > 0 
      ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
      : 0;

    // Generate trend for the last 6 months
    const revenueTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthLabel = d.toLocaleString("default", { month: "short", year: "2-digit" });
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const mRevenue = invoices
        .filter(inv => {
          const id = new Date(inv.issueDate);
          return id >= mStart && id <= mEnd;
        })
        .reduce((sum, inv) => sum + (useGst ? inv.totalAmount : inv.subTotal) * inv.exchangeRate, 0);

      revenueTrend.push({ month: monthLabel, revenue: mRevenue });
    }

    res.json({
      success: true,
      data: {
        currentMonthRevenue,
        lastMonthRevenue,
        growthPercentage,
        revenueTrend
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/gst-summary
router.get("/gst-summary", async (req: Request, res: Response) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { 
        status: { not: "CANCELLED" },
        entity: { gstin: { not: "" } }
      },
      include: { items: true }
    });

    let totalGst = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    for (const inv of invoices) {
      for (const item of inv.items) {
        const itemCgst = (item.cgst || 0) * inv.exchangeRate;
        const itemSgst = (item.sgst || 0) * inv.exchangeRate;
        const itemIgst = (item.igst || 0) * inv.exchangeRate;
        const itemGst = (item.gstAmount || 0) * inv.exchangeRate;

        cgst += itemCgst;
        sgst += itemSgst;
        igst += itemIgst;
        totalGst += itemGst;
      }
    }

    res.json({
      success: true,
      data: {
        totalGst,
        cgst,
        sgst,
        igst
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/bank-summary
router.get("/bank-summary", async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany();

    const importedStatements = transactions.length;
    const unmappedEntries = transactions.filter(t => t.mappedStatus === "UNMAPPED").length;
    const reconciledAmount = transactions
      .filter(t => t.mappedStatus === "RECONCILED")
      .reduce((sum, t) => sum + t.amount, 0);
    const pendingMappings = unmappedEntries;

    res.json({
      success: true,
      data: {
        importedStatements,
        unmappedEntries,
        reconciledAmount,
        pendingMappings
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/recent-activities (legacy alias)
router.get("/recent-activities", async (req: Request, res: Response) => {
  try {
    const auditLogs = await prisma.auditTrail.findMany({
      take: 20,
      orderBy: { timestamp: "desc" }
    });
    const activities = auditLogs.map(log => ({
      title: `${log.tableName} ${log.action}`,
      description: `${log.tableName} record was ${log.action.toLowerCase()}d by ${log.performedBy}`,
      timestamp: log.timestamp,
      performedBy: log.performedBy
    }));
    res.json({ success: true, data: activities });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/audit-log — full audit log with filters + pagination
router.get("/audit-log", async (req: Request, res: Response) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit     = Math.min(100, parseInt(req.query.limit as string) || 50);
    const action    = (req.query.action as string) || '';     // CREATE | UPDATE | DELETE | APPROVE
    const portal    = (req.query.portal as string) || '';     // Invoice | Receipt | Entity | etc.
    const search    = (req.query.search as string) || '';
    const dateFrom  = req.query.dateFrom as string;
    const dateTo    = req.query.dateTo as string;

    // Build WHERE clauses for raw query (AuditTrail has no Prisma model, uses raw SQL)
    const conditions: string[] = [];
    if (action) conditions.push(`"action" ILIKE '${action}'`);
    if (portal) conditions.push(`"tableName" ILIKE '${portal}'`);
    if (search) conditions.push(`("performedBy" ILIKE '%${search}%' OR "recordId" ILIKE '%${search}%')`);
    if (dateFrom) conditions.push(`"timestamp" >= '${dateFrom}'::timestamptz`);
    if (dateTo) conditions.push(`"timestamp" <= '${dateTo}'::timestamptz + interval '1 day'`);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT id, "tableName", "recordId", action, "performedBy", "timestamp"
        FROM "AuditTrail"
        ${where}
        ORDER BY "timestamp" DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*) as total FROM "AuditTrail" ${where}
      `)
    ]);

    // Resolve performedBy (user id → name) via Employee table
    const performerIds = [...new Set(rows.map((r: any) => r.performedBy).filter(Boolean))];
    let employeeMap: Record<string, string> = {};
    if (performerIds.length > 0) {
      const employees = await prisma.employee.findMany({
        where: { id: { in: performerIds } },
        select: { id: true, firstName: true, lastName: true, officeEmail: true }
      });
      employees.forEach(e => {
        employeeMap[e.id] = `${e.firstName} ${e.lastName}`.trim() || e.officeEmail;
      });
    }

    const portalIcon: Record<string, string> = {
      Invoice: '🧾', Receipt: '💳', Reimbursement: '📤', Entity: '🏢',
      ExchangeRate: '💱', Transaction: '🏦', Client: '👤',
      Employee: '👷', Project: '📁', Leave: '🏖️', Asset: '🖥️',
    };

    const actionColor: Record<string, string> = {
      CREATE: 'green', UPDATE: 'blue', DELETE: 'red', APPROVE: 'violet', IMPORT: 'amber'
    };

    const logs = rows.map((log: any) => {
      const performerName = employeeMap[log.performedBy] || log.performedBy || 'System';
      const icon = portalIcon[log.tableName] || '🔧';
      const color = actionColor[log.action] || 'secondary';

      let description = `${log.tableName} record was ${log.action.toLowerCase()}d`;
      if (log.tableName === 'Invoice' && log.action === 'CREATE') description = 'New invoice generated';
      else if (log.tableName === 'Invoice' && log.action === 'UPDATE') description = 'Invoice details modified';
      else if (log.tableName === 'Invoice' && log.action === 'DELETE') description = 'Invoice deleted';
      else if (log.tableName === 'Invoice' && log.action === 'APPROVE') description = 'Invoice approved';
      else if (log.tableName === 'Receipt') description = 'Payment receipt recorded';
      else if (log.tableName === 'Reimbursement' && log.action === 'APPROVE') description = 'Reimbursement claim approved';
      else if (log.tableName === 'Entity' && log.action === 'CREATE') description = 'New billing entity created';
      else if (log.tableName === 'Transaction') description = 'Bank transaction imported';
      else if (log.tableName === 'ExchangeRate') description = 'Exchange rate updated';

      return {
        id: log.id,
        portal: log.tableName,
        action: log.action,
        recordId: log.recordId,
        performedBy: log.performedBy,
        performerName,
        description,
        icon,
        color,
        timestamp: log.timestamp
      };
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total: Number(countRows[0]?.total || 0),
        pages: Math.ceil(Number(countRows[0]?.total || 0) / limit)
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/live-users — employees active in the last 30 min (based on audit trail)
router.get("/live-users", async (req: Request, res: Response) => {
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Get unique performedBy IDs that have had audit activity in last 30min
    const recentActivity = await prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT "performedBy", MAX("timestamp") as "lastSeen"
      FROM "AuditTrail"
      WHERE "timestamp" >= '${thirtyMinAgo}'::timestamptz
        AND "performedBy" IS NOT NULL AND "performedBy" != 'System'
      GROUP BY "performedBy"
    `);

    const userIds = recentActivity.map((r: any) => r.performedBy).filter(Boolean);
    const lastSeenMap: Record<string, string> = {};
    recentActivity.forEach((r: any) => { lastSeenMap[r.performedBy] = r.lastSeen; });

    let employees: any[] = [];
    if (userIds.length > 0) {
      employees = await prisma.employee.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, officeEmail: true, role: true, department: true, profileImage: true }
      });
    }

    const liveUsers = employees.map(e => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      email: e.officeEmail,
      role: e.role,
      department: e.department,
      profileImage: e.profileImage || null,
      lastSeen: lastSeenMap[e.id] || null,
      online: true
    }));

    res.json({ success: true, data: liveUsers, count: liveUsers.length });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/transactions
router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      include: {
        client: true,
        employee: true,
        invoice: true
      },
      orderBy: { date: "desc" }
    });
    res.json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/accounts/payments
router.get("/payments", async (req: Request, res: Response) => {
  try {
    const reimbursements = await prisma.reimbursement.findMany({
      where: { status: { in: ["PAID", "APPROVED", "APPROVED_DIRECTOR", "APPROVED_CFO", "PENDING_PAYMENT"] } },
      include: { employee: true }
    });
    const payments = reimbursements.map(r => ({
      id: r.claimId || `PAY-${r.id.substring(0, 8).toUpperCase()}`,
      date: r.partnerApprovedAt || r.submittedAt || r.date || new Date(),
      recipient: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "Unknown Employee",
      amount: r.amount,
      mode: "NEFT",
      ref: r.id.substring(0, 10).toUpperCase(),
      status: r.status === "PAID" ? "DISBURSED" : "APPROVED"
    }));
    res.json({ success: true, data: payments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
