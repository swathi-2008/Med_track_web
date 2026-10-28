import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Layers, Calendar, Package, Truck, Hash, Loader2, History, User, ArrowRight, Camera, FileDown, AlertCircle, AlertTriangle, CheckCircle2, Printer, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import ScannerModal from './ScannerModal';

interface AuditEvent {
  id: number;
  type: 'CREATED' | 'SALE' | 'ADJUSTMENT' | 'EXPIRY';
  message: string;
  user: string;
  timestamp: string;
}

interface BatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  batchId?: number; // If provided, we are in VIEW/AUDIT mode
  initialData?: any;
}

export default function BatchModal({ isOpen, onClose, onSuccess, batchId, initialData }: BatchModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'audit'>('details');
  const [loading, setLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>([]);
  const [formData, setFormData] = useState({
    medicineName: initialData?.medicineName || '',
    batchNumber: initialData?.batchNumber || '',
    expiryDate: initialData?.expiryDate || '',
    quantity: initialData?.quantity || '',
    supplier: initialData?.supplier || ''
  });

  useEffect(() => {
    if (batchId && activeTab === 'audit') {
      setLoading(true);
      fetch(`/api/batches/${batchId}/audit`)
        .then(res => res.json())
        .then(data => {
          setAuditTrail(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch audit trail:', err);
          setLoading(false);
        });
    }
  }, [batchId, activeTab]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        medicineName: initialData.medicineName,
        batchNumber: initialData.batchNumber,
        expiryDate: initialData.expiryDate,
        quantity: initialData.quantity,
        supplier: initialData.supplier
      });
    }
    // Set to audit tab if viewing an existing batch
    if (batchId) {
      setActiveTab('details');
    } else {
      setActiveTab('details');
    }
  }, [initialData, batchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        onSuccess();
        onClose();
        setFormData({
          medicineName: '',
          batchNumber: '',
          expiryDate: '',
          quantity: '',
          supplier: ''
        });
      }
    } catch (err) {
      console.error('Failed to add batch:', err);
    } finally {
      setLoading(false);
    }
  };

  const getExpiryUrgency = (dateStr: string) => {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    const today = new Date();
    // Reset hours to compare dates only
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);
    
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'Expired', color: 'bg-red-600 text-white', icon: <AlertCircle size={10} /> };
    if (diffDays <= 7) return { label: 'Critical', color: 'bg-red-100 text-red-700', icon: <AlertTriangle size={10} /> };
    if (diffDays <= 30) return { label: 'High Risk', color: 'bg-orange-100 text-orange-700', icon: <AlertTriangle size={10} /> };
    if (diffDays <= 60) return { label: 'Medium Risk', color: 'bg-amber-100 text-amber-700', icon: <AlertTriangle size={10} /> };
    return { label: 'Healthy', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 size={10} /> };
  };

  const exportAuditToCSV = () => {
    const headers = ['ID', 'Type', 'Message', 'Performed By', 'Timestamp'];
    const rows = auditTrail.map(event => [
      event.id,
      event.type,
      event.message.replace(/,/g, ';'), // Prevent CSV breaking
      event.user,
      new Date(event.timestamp).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_trail_batch_${formData.batchNumber}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${batchId ? 'bg-indigo-600' : 'bg-green-600'}`}>
                  {batchId ? <History size={20} /> : <Layers size={20} />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{batchId ? `Batch ${formData.batchNumber}` : 'Add New Batch'}</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {batchId ? `Viewing history for ${formData.medicineName}` : 'Restock inventory with a new supply lot.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()}
                  className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-colors no-print"
                  title="Print Batch Report"
                >
                  <Printer size={20} />
                </button>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-colors no-print"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Tabs (only if batchId exists) */}
            {batchId && (
              <div className="px-6 flex border-b border-slate-100 bg-white">
                <TabButton 
                  label="Details" 
                  active={activeTab === 'details'} 
                  onClick={() => setActiveTab('details')} 
                />
                <TabButton 
                  label="Audit Trail" 
                  active={activeTab === 'audit'} 
                  onClick={() => setActiveTab('audit')} 
                />
              </div>
            )}

            {activeTab === 'details' ? (
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Medicine Name</label>
                  <div className="relative">
                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      required
                      readOnly={!!batchId}
                      type="text"
                      placeholder="e.g. Paracetamol 500mg"
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition-all ${
                        batchId ? 'bg-slate-50 border-transparent text-slate-600' : 'bg-slate-50 border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500'
                      }`}
                      value={formData.medicineName}
                      onChange={e => setFormData({ ...formData, medicineName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Batch Number</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        required
                        readOnly={!!batchId}
                        type="text"
                        placeholder="BT-100"
                        className={`w-full pl-10 pr-12 py-2.5 rounded-xl text-sm transition-all ${
                          batchId ? 'bg-slate-50 border-transparent text-slate-600' : 'bg-slate-50 border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500'
                        }`}
                        value={formData.batchNumber}
                        onChange={e => setFormData({ ...formData, batchNumber: e.target.value })}
                      />
                      {!batchId && (
                        <button
                          type="button"
                          onClick={() => setIsScannerOpen(true)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-200 rounded-lg text-purple-600 transition-colors"
                          title="Scan QR Code"
                        >
                          <Camera size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expiry Date</label>
                      {formData.expiryDate && (
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${getExpiryUrgency(formData.expiryDate)?.color}`}>
                          {getExpiryUrgency(formData.expiryDate)?.icon}
                          {getExpiryUrgency(formData.expiryDate)?.label}
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        required
                        readOnly={!!batchId}
                        type="date"
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition-all ${
                          batchId ? 'bg-slate-50 border-transparent text-slate-600' : 'bg-slate-50 border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500'
                        }`}
                        value={formData.expiryDate}
                        onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Quantity</label>
                    <div className="relative">
                      <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        required
                        readOnly={!!batchId}
                        type="number"
                        placeholder="0"
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition-all ${
                          batchId ? 'bg-slate-50 border-transparent text-slate-600' : 'bg-slate-50 border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500'
                        }`}
                        value={formData.quantity}
                        onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Supplier</label>
                    <div className="relative">
                      <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        required
                        readOnly={!!batchId}
                        type="text"
                        placeholder="Supplier Name"
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition-all ${
                          batchId ? 'bg-slate-50 border-transparent text-slate-600' : 'bg-slate-50 border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500'
                        }`}
                        value={formData.supplier}
                        onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                  >
                    {batchId ? 'Close' : 'Cancel'}
                  </button>
                  {!batchId && (
                    <button
                      disabled={loading}
                      type="submit"
                      className="flex-[2] py-3 bg-green-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Layers size={18} />
                          Confirm Add Batch
                        </>
                      )}
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Audit Analytics / Chart */}
                <div className="p-6 bg-slate-50/50 border-b border-slate-100 shrink-0">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantity Trend</h4>
                      <p className="text-sm font-bold text-slate-700">Stock changes over time</p>
                    </div>
                    {auditTrail.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={exportAuditToCSV}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm no-print"
                        >
                          <FileDown size={14} />
                          Export CSV
                        </button>
                        <button 
                          onClick={() => window.print()}
                          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 no-print"
                        >
                          <FileText size={14} />
                          Export PDF
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Print-only Header */}
                  <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">MedTrack Pharmacy Systems</h1>
                        <p className="text-sm font-bold text-slate-500">Official Batch Audit Report</p>
                      </div>
                      <div className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Generated on: {new Date().toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[...auditTrail].reverse()}>
                        <defs>
                          <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="timestamp" 
                          hide 
                        />
                        <YAxis hide domain={['dataMin - 50', 'dataMax + 50']} />
                        <Tooltip 
                          labelFormatter={(val) => new Date(val as string).toLocaleDateString()}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="quantity_after" 
                          stroke="#6366f1" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorQty)" 
                          animationDuration={1000}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="p-6 max-h-[40vh] overflow-y-auto">
                  {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                      <Loader2 size={32} className="animate-spin text-indigo-500" />
                      <p className="text-sm font-medium">Fetching history...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                        {auditTrail.map((event) => (
                        <div key={event.id} className="relative pl-10">
                          <div className={`
                            absolute left-0 top-1.5 w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center
                            ${event.type === 'CREATED' ? 'bg-green-500' : 
                              event.type === 'SALE' ? 'bg-blue-500' : 
                              event.type === 'ADJUSTMENT' ? 'bg-amber-500' : 'bg-red-500'}
                          `}>
                            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                event.type === 'CREATED' ? 'bg-green-100 text-green-700' : 
                                event.type === 'SALE' ? 'bg-blue-100 text-blue-700' : 
                                event.type === 'ADJUSTMENT' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {event.type}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-800">Bal: {(event as any).quantity_after}</span>
                                <span className="text-[10px] font-medium text-slate-400">
                                  {new Date(event.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-slate-700 font-medium mb-2">{event.message}</p>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <User size={12} />
                              <span>Performed by: <span className="font-bold text-slate-600">{event.user}</span></span>
                            </div>
                          </div>
                        </div>
                      ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>

          <ScannerModal 
            isOpen={isScannerOpen} 
            onClose={() => setIsScannerOpen(false)} 
            onScan={(text) => {
              setFormData(prev => ({ ...prev, batchNumber: text }));
            }} 
          />
        </div>
      )}
    </AnimatePresence>
  );
}

function TabButton({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-bold transition-all relative ${
        active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      {label}
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" 
        />
      )}
    </button>
  );
}
