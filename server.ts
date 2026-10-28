import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  // Mock Dashboard Data
  app.get('/api/dashboard/summary', (req, res) => {
    res.json({
      metrics: {
        active_medicines: 124,
        low_stock_count: 8,
        expired_lots_count: 3,
        near_expiry_count: 12,
        critical_lots_count: 5,
        today_revenue_display: '₹ 12,450',
        today_sales_count: 42,
        total_inventory_cost_display: '₹ 4,50,000',
      }
    });
  });

  app.get('/api/dashboard/sales-trend', (req, res) => {
    res.json([
      { date: 'Oct 21', count: 30, revenue_inr: 8500 },
      { date: 'Oct 22', count: 45, revenue_inr: 12000 },
      { date: 'Oct 23', count: 38, revenue_inr: 10500 },
      { date: 'Oct 24', count: 52, revenue_inr: 15000 },
      { date: 'Oct 25', count: 48, revenue_inr: 13500 },
      { date: 'Oct 26', count: 55, revenue_inr: 16000 },
      { date: 'Oct 27', count: 42, revenue_inr: 12450 },
    ]);
  });

  app.get('/api/dashboard/expiry-breakdown', (req, res) => {
    res.json({
      expired: { count: 3, cost_inr: 1200 },
      critical_7d: { count: 5, cost_inr: 2500 },
      high_30d: { count: 12, cost_inr: 8000 },
      medium_60d: { count: 25, cost_inr: 15000 },
      healthy: { count: 79, cost_inr: 423300 },
    });
  });

  app.get('/api/dashboard/recent-activity', (req, res) => {
    res.json([
      { id: 1, type: 'SALE', medicine_name: 'Paracetamol 500mg', quantity_delta: -2, reason: 'Patient Sale', timestamp: new Date().toISOString() },
      { id: 2, type: 'PURCHASE', medicine_name: 'Amoxicillin 250mg', quantity_delta: 100, reason: 'New Stock', timestamp: new Date(Date.now() - 3600000).toISOString() },
      { id: 3, type: 'ADJUSTMENT', medicine_name: 'Ibuprofen 400mg', quantity_delta: -1, reason: 'Damaged', timestamp: new Date(Date.now() - 7200000).toISOString() },
    ]);
  });

  app.get('/api/notifications', (req, res) => {
    const meds = [
      { id: 1, name: 'Paracetamol 500mg', category: 'Analgesics', stock: 450 },
      { id: 2, name: 'Amoxicillin 250mg', category: 'Antibiotics', stock: 12 },
      { id: 3, name: 'Ibuprofen 400mg', category: 'NSAID', stock: 85 },
      { id: 4, name: 'Cetirizine 10mg', category: 'Antihistamine', stock: 200 },
      { id: 7, name: 'Metformin 500mg', category: 'Antidiabetic', stock: 120 },
      { id: 8, name: 'Atorvastatin 20mg', category: 'Statin', stock: 60 },
    ];

    const dynamicNotifications = meds
      .filter(m => {
        const t = categoryThresholds.find(ct => ct.category === m.category);
        return m.stock <= (t ? t.threshold : 10);
      })
      .map(m => ({
        id: `stock-${m.id}`,
        type: 'STOCK',
        title: 'Low Stock Alert',
        message: `${m.name} is below safety threshold (${m.stock} units left).`,
        severity: 'CRITICAL',
        timestamp: new Date().toISOString()
      }));

    const staticAlerts = [
      { 
        id: 'exp-1', 
        type: 'EXPIRY', 
        title: 'Batch Expiring Soon', 
        message: 'Paracetamol (Batch #B102) expires in 3 days.', 
        severity: 'CRITICAL',
        timestamp: new Date().toISOString() 
      },
      { 
        id: 'sys-1', 
        type: 'SYSTEM', 
        title: 'Database Backup', 
        message: 'Daily automated backup completed successfully.', 
        severity: 'INFO',
        timestamp: new Date(Date.now() - 86400000).toISOString() 
      },
    ];

    res.json([...dynamicNotifications, ...staticAlerts]);
  });

  app.get('/api/search', (req, res) => {
    const q = (req.query.q as string || '').toLowerCase();
    const allItems = [
      { id: 1, name: 'Paracetamol 500mg', type: 'MEDICINE', category: 'Analgesics', stock: 450 },
      { id: 2, name: 'Amoxicillin 250mg', type: 'MEDICINE', category: 'Antibiotics', stock: 12 },
      { id: 3, name: 'Ibuprofen 400mg', type: 'MEDICINE', category: 'NSAID', stock: 85 },
      { id: 4, name: 'Cetirizine 10mg', type: 'MEDICINE', category: 'Antihistamine', stock: 200 },
      { id: 5, name: 'Batch #B102 (Paracetamol)', type: 'BATCH', expiry: '2026-10-30', stock: 100 },
      { id: 6, name: 'Batch #B205 (Amoxicillin)', type: 'BATCH', expiry: '2026-12-15', stock: 12 },
      { id: 7, name: 'Metformin 500mg', type: 'MEDICINE', category: 'Antidiabetic', stock: 120 },
      { id: 8, name: 'Atorvastatin 20mg', type: 'MEDICINE', category: 'Statin', stock: 60 },
    ];

    const filtered = allItems.filter(item => 
      item.name.toLowerCase().includes(q) || 
      (item.category && item.category.toLowerCase().includes(q))
    );

    res.json(filtered);
  });

  let categoryThresholds = [
    { category: 'Analgesics', threshold: 100 },
    { category: 'Antibiotics', threshold: 50 },
    { category: 'NSAID', threshold: 30 },
    { category: 'Antihistamine', threshold: 20 },
    { category: 'Antidiabetic', threshold: 40 },
    { category: 'Statin', threshold: 25 },
  ];

  app.get('/api/inventory/thresholds', (req, res) => {
    res.json(categoryThresholds);
  });

  app.post('/api/inventory/thresholds', express.json(), (req, res) => {
    const { category, threshold } = req.body;
    const idx = categoryThresholds.findIndex(t => t.category === category);
    if (idx > -1) {
      categoryThresholds[idx].threshold = threshold;
    } else {
      categoryThresholds.push({ category, threshold });
    }
    res.json({ success: true, thresholds: categoryThresholds });
  });

  app.get('/api/inventory', (req, res) => {
    const meds = [
      { id: 1, name: 'Paracetamol 500mg', category: 'Analgesics', stock: 450, price: '₹ 2.50' },
      { id: 2, name: 'Amoxicillin 250mg', category: 'Antibiotics', stock: 12, price: '₹ 15.00' },
      { id: 3, name: 'Ibuprofen 400mg', category: 'NSAID', stock: 85, price: '₹ 8.00' },
      { id: 4, name: 'Cetirizine 10mg', category: 'Antihistamine', stock: 200, price: '₹ 5.00' },
      { id: 7, name: 'Metformin 500mg', category: 'Antidiabetic', stock: 120, price: '₹ 12.00' },
      { id: 8, name: 'Atorvastatin 20mg', category: 'Statin', stock: 60, price: '₹ 25.00' },
    ];
    
    // Add threshold info to meds
    const medsWithThresholds = meds.map(med => {
      const t = categoryThresholds.find(ct => ct.category === med.category);
      return { ...med, threshold: t ? t.threshold : 10 };
    });

    res.json(medsWithThresholds);
  });

  let batches: any[] = [];

  app.post('/api/batches', express.json(), (req, res) => {
    const { medicineName, batchNumber, expiryDate, quantity, supplier } = req.body;
    const newBatch = {
      id: Date.now(),
      medicineName,
      batchNumber,
      expiryDate,
      quantity: parseInt(quantity),
      supplier,
      timestamp: new Date().toISOString()
    };
    batches.push(newBatch);
    res.json({ success: true, batch: newBatch });
  });

  app.get('/api/batches/:id/audit', (req, res) => {
    // Mock audit trail data
    res.json([
      { id: 1, type: 'CREATED', message: 'Batch received and added to inventory', user: 'Admin', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), quantity_after: 500 },
      { id: 2, type: 'SALE', message: 'Sold 100 units to Patient #4521', user: 'Cashier-1', timestamp: new Date(Date.now() - 86400000).toISOString(), quantity_after: 400 },
      { id: 3, type: 'ADJUSTMENT', message: 'Manual adjustment: -50 units (Damaged)', user: 'Pharmacist', timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), quantity_after: 350 },
      { id: 4, type: 'SALE', message: 'Sold 50 units to Patient #4550', user: 'Cashier-1', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), quantity_after: 300 },
    ]);
  });

  app.get('/api/medicines/:id/fefo-suggestion', (req, res) => {
    // FEFO Logic: Find batches for this medicine, sort by expiry date (earliest first), return the top one.
    const suggestions: Record<number, any> = {
      1: { batchId: 'B102', expiryDate: '2026-10-30', location: 'Shelf A-12', quantity: 100 },
      2: { batchId: 'B205', expiryDate: '2026-12-15', location: 'Fridge 2', quantity: 12 },
      3: { batchId: 'B301', expiryDate: '2027-01-20', location: 'Shelf B-04', quantity: 85 },
      4: { batchId: 'B410', expiryDate: '2027-03-10', location: 'Shelf C-01', quantity: 200 },
      7: { batchId: 'B705', expiryDate: '2027-05-15', location: 'Shelf D-08', quantity: 120 },
      8: { batchId: 'B802', expiryDate: '2027-06-01', location: 'Shelf E-02', quantity: 60 },
    };
    
    const medId = parseInt(req.params.id);
    res.json(suggestions[medId] || { batchId: 'NONE', expiryDate: 'N/A', location: 'Unknown', quantity: 0 });
  });

  app.get('/api/analytics/expiry-forecast', (req, res) => {
    // Forecast Logic: 
    // 1. Calculate average daily consumption (ADC) based on last 7 days sales
    // 2. Project sell-through date: (Current Stock / ADC)
    // 3. Compare with Expiry Date. If Expiry < Sell-through -> RISK.
    
    const meds = [
      { id: 1, name: 'Paracetamol 500mg', stock: 450, dailySales: 15, expiry: '2026-10-30', batchId: 'B102' },
      { id: 2, name: 'Amoxicillin 250mg', stock: 12, dailySales: 0.5, expiry: '2026-12-15', batchId: 'B205' },
      { id: 3, name: 'Ibuprofen 400mg', stock: 85, dailySales: 12, expiry: '2027-01-20', batchId: 'B301' },
      { id: 4, name: 'Cetirizine 10mg', stock: 200, dailySales: 2, expiry: '2027-03-10', batchId: 'B410' },
      { id: 7, name: 'Metformin 500mg', stock: 120, dailySales: 8, expiry: '2027-05-15', batchId: 'B705' },
      { id: 8, name: 'Atorvastatin 20mg', stock: 60, dailySales: 1, expiry: '2027-06-01', batchId: 'B802' },
    ];

    const forecast = meds.map(m => {
      const daysToSell = Math.ceil(m.stock / m.dailySales);
      const projectedSellThroughDate = new Date(Date.now() + daysToSell * 86400000);
      const expiryDate = new Date(m.expiry);
      
      const isRisk = projectedSellThroughDate > expiryDate;
      const riskAmount = isRisk ? Math.ceil((projectedSellThroughDate.getTime() - expiryDate.getTime()) / 86400000 * m.dailySales) : 0;

      return {
        ...m,
        daysToSell,
        projectedSellThrough: projectedSellThroughDate.toISOString(),
        isRisk,
        riskAmount: Math.min(riskAmount, m.stock)
      };
    });

    res.json(forecast);
  });

  let purchaseOrders: any[] = [
    { id: 101, supplier: 'Global Pharma Ltd', date: '2026-10-25', status: 'PENDING', total: '₹ 45,000', items: [{ name: 'Paracetamol 500mg', qty: 1000 }] },
    { id: 102, supplier: 'Metro Meds', date: '2026-10-26', status: 'APPROVED', total: '₹ 12,000', items: [{ name: 'Amoxicillin 250mg', qty: 500 }] },
    { id: 103, supplier: 'Zydus Life', date: '2026-10-27', status: 'RECEIVED', total: '₹ 8,500', items: [{ name: 'Ibuprofen 400mg', qty: 300 }] },
  ];

  app.get('/api/purchase-orders', (req, res) => {
    res.json(purchaseOrders);
  });

  app.post('/api/purchase-orders', express.json(), (req, res) => {
    const { supplier, items, total } = req.body;
    const newPO = {
      id: 100 + purchaseOrders.length + 1,
      supplier,
      date: new Date().toISOString().split('T')[0],
      status: 'PENDING',
      total,
      items
    };
    purchaseOrders.push(newPO);
    res.json(newPO);
  });

  app.patch('/api/purchase-orders/:id', express.json(), (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    const po = purchaseOrders.find(p => p.id === id);
    if (po) {
      po.status = status;
      res.json(po);
    } else {
      res.status(404).json({ error: 'PO not found' });
    }
  });

  let suppliers = [
    { id: 1, name: 'Global Pharma Ltd', contact: 'John Smith (+91 98765 43210)', email: 'sales@globalpharma.com', leadTime: '2-4 days', rating: 4.8, status: 'ACTIVE', qualityNotes: 'Consistently high quality, rare packaging damage.' },
    { id: 2, name: 'Metro Meds', contact: 'Sarah Chen (+91 87654 32109)', email: 'orders@metromeds.in', leadTime: '1-2 days', rating: 4.5, status: 'ACTIVE', qualityNotes: 'Fastest delivery in the metro area.' },
    { id: 3, name: 'Zydus Life', contact: 'Mike Ross (+91 76543 21098)', email: 'support@zydus.com', leadTime: '3-5 days', rating: 4.2, status: 'ACTIVE', qualityNotes: 'Great bulk discounts but paperwork is sometimes slow.' },
    { id: 4, name: 'Apollo Distrib', contact: 'Anita Desai (+91 65432 10987)', email: 'anita@apollo.in', leadTime: '5-7 days', rating: 3.9, status: 'PROBATION', qualityNotes: 'Recent delays in cold-chain transport.' },
  ];

  app.get('/api/suppliers', (req, res) => {
    res.json(suppliers);
  });

  app.post('/api/suppliers', express.json(), (req, res) => {
    const newSupplier = {
      id: suppliers.length + 1,
      ...req.body,
      status: 'ACTIVE'
    };
    suppliers.push(newSupplier);
    res.json(newSupplier);
  });

  app.get('/api/suppliers/performance', (req, res) => {
    const performance = [
      { id: 1, name: 'Global Pharma Ltd', onTimeRate: 98, avgDelay: -0.2, totalOrders: 156 },
      { id: 2, name: 'Metro Meds', onTimeRate: 92, avgDelay: 0.5, totalOrders: 89 },
      { id: 3, name: 'Zydus Life', onTimeRate: 85, avgDelay: 1.2, totalOrders: 45 },
      { id: 4, name: 'Apollo Distrib', onTimeRate: 78, avgDelay: 2.4, totalOrders: 32 },
    ];
    res.json(performance);
  });

  app.get('/api/transactions', (req, res) => {
    const transactions = [
      { id: 'TX-1001', type: 'SALE', item: 'Paracetamol 500mg', qty: -10, user: 'Cashier-1', status: 'COMPLETED', timestamp: new Date(Date.now() - 3600000).toISOString(), amount: '₹ 25.00' },
      { id: 'TX-1002', type: 'PURCHASE', item: 'Amoxicillin 250mg', qty: 500, user: 'Admin', status: 'RECEIVED', timestamp: new Date(Date.now() - 7200000).toISOString(), amount: '₹ 7,500.00' },
      { id: 'TX-1003', type: 'ADJUSTMENT', item: 'Ibuprofen 400mg', qty: -2, user: 'Pharmacist', status: 'DAMAGED', timestamp: new Date(Date.now() - 86400000).toISOString(), amount: '-' },
      { id: 'TX-1004', type: 'SALE', item: 'Cetirizine 10mg', qty: -5, user: 'Cashier-2', status: 'COMPLETED', timestamp: new Date(Date.now() - 9000000).toISOString(), amount: '₹ 15.00' },
      { id: 'TX-1005', type: 'PURCHASE', item: 'Metformin 500mg', qty: 200, user: 'Admin', status: 'RECEIVED', timestamp: new Date(Date.now() - 108000000).toISOString(), amount: '₹ 2,400.00' },
    ];
    res.json(transactions);
  });

  app.post('/api/auth/login', express.json(), (req, res) => {
    const { email, password } = req.body;
    
    const users = [
      { id: 1, email: 'admin@medtrack.com', name: 'John Doe', role: 'ADMIN', password: 'password123' },
      { id: 2, email: 'pharmacist@medtrack.com', name: 'Sarah Ross', role: 'PHARMACIST', password: 'password123' },
      { id: 3, email: 'cashier@medtrack.com', name: 'Mike Chen', role: 'CASHIER', password: 'password123' },
    ];

    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
      const { password, ...userWithoutPassword } = user;
      res.json({ success: true, user: userWithoutPassword });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const template = await vite.transformIndexHtml(url, '');
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
