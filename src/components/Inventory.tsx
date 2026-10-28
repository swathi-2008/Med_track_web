import { useState, useEffect } from 'react';
import { 
  Package, 
  Settings2, 
  Search, 
  Filter, 
  AlertTriangle, 
  Save, 
  Plus, 
  RefreshCw,
  ArrowUpDown,
  FileDown
} from 'lucide-react';

interface Medicine {
  id: number;
  name: string;
  category: string;
  stock: number;
  price: string;
  threshold: number;
}

interface CategoryThreshold {
  category: string;
  threshold: number;
}

interface InventoryProps {
  user: any;
  onAddBatch: () => void;
  onViewBatch: (batchId: number, data: any) => void;
}

export default function Inventory({ user, onAddBatch, onViewBatch }: InventoryProps) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [thresholds, setThresholds] = useState<CategoryThreshold[]>([]);
  const [isManagingThresholds, setIsManagingThresholds] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [medsRes, threshRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/inventory/thresholds')
      ]);
      const meds = await medsRes.json();
      const thresh = await threshRes.json();
      setMedicines(meds);
      setThresholds(thresh);
    } catch (err) {
      console.error('Failed to fetch inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateThreshold = async (category: string, newThreshold: number) => {
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, threshold: newThreshold })
      });
      if (res.ok) {
        const data = await res.json();
        setThresholds(data.thresholds);
        // Update local medicines list with new thresholds
        setMedicines(prev => prev.map(m => 
          m.category === category ? { ...m, threshold: newThreshold } : m
        ));
      }
    } catch (err) {
      console.error('Failed to save threshold:', err);
    } finally {
      setSaving(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Name', 'Category', 'Stock Level', 'Threshold', 'Unit Price', 'Status'];
    const rows = medicines.map(m => [
      m.id,
      m.name,
      m.category,
      m.stock,
      m.threshold,
      m.price.replace('₹ ', ''),
      m.stock <= m.threshold ? 'Low Stock' : 'Optimal'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `medtrack_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-slate-500">View and manage pharmacy stock levels.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
          >
            <FileDown size={18} />
            Export Data
          </button>
          
          {(user.role === 'ADMIN' || user.role === 'PHARMACIST') && (
            <>
              <button 
                onClick={() => setIsManagingThresholds(!isManagingThresholds)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  isManagingThresholds ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Settings2 size={18} />
                {isManagingThresholds ? 'Exit Config' : 'Configure Thresholds'}
              </button>
              <button 
                onClick={onAddBatch}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
              >
                <Plus size={18} />
                Add Medicine
              </button>
            </>
          )}
        </div>
      </div>

      {isManagingThresholds && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
              <Settings2 size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Category Threshold Configuration</h3>
              <p className="text-xs text-slate-500">Define minimum stock levels before alerts are triggered.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {thresholds.map((t) => (
              <div key={t.category} className="bg-white p-4 rounded-xl border border-blue-200 flex items-center justify-between shadow-sm">
                <span className="text-sm font-bold text-slate-700">{t.category}</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    defaultValue={t.threshold}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (val !== t.threshold) handleUpdateThreshold(t.category, val);
                    }}
                    className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Min</span>
                </div>
              </div>
            ))}
          </div>
          {saving && (
            <div className="mt-4 flex items-center gap-2 text-blue-600 text-xs font-bold">
              <RefreshCw size={14} className="animate-spin" />
              Saving changes...
            </div>
          )}
        </div>
      )}

      {/* Main Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search inventory..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">
              <Filter size={16} />
              Filter
            </button>
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">
              <ArrowUpDown size={16} />
              Sort
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Medicine Name</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Stock Level</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Threshold</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Unit Price</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {medicines.map((med) => (
                <tr key={med.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div 
                      className="flex items-center gap-3 cursor-pointer group"
                      onClick={() => onViewBatch(med.id, {
                        medicineName: med.name,
                        batchNumber: `BT-${med.id}00`,
                        expiryDate: '2026-12-31',
                        quantity: med.stock,
                        supplier: 'Global Pharma Ltd'
                      })}
                    >
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Package size={16} />
                      </div>
                      <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors underline-offset-4 group-hover:underline">{med.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider">
                      {med.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-bold ${med.stock <= med.threshold ? 'text-red-600' : 'text-slate-900'}`}>
                      {med.stock} units
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-500">
                    {med.threshold}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                    {med.price}
                  </td>
                  <td className="px-6 py-4">
                    {med.stock <= med.threshold ? (
                      <span className="flex items-center gap-1.5 text-red-600 text-xs font-bold animate-pulse">
                        <AlertTriangle size={14} />
                        Low Stock
                      </span>
                    ) : (
                      <span className="text-green-600 text-xs font-bold">Optimal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <button className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors">
            Load More Medicines
          </button>
        </div>
      </div>
    </div>
  );
}
