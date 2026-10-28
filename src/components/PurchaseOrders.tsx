import { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Truck, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  PackageCheck,
  Search,
  Filter,
  Loader2,
  RefreshCw,
  Printer
} from 'lucide-react';

interface POItem {
  name: string;
  qty: number;
}

interface PurchaseOrder {
  id: number;
  supplier: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'RECEIVED' | 'CANCELLED';
  total: string;
  items: POItem[];
}

interface PurchaseOrdersProps {
  onReceivePO: (po: PurchaseOrder) => void;
}

export default function PurchaseOrders({ onReceivePO }: PurchaseOrdersProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch('/api/purchase-orders')
      .then(res => res.json())
      .then(data => {
        setOrders(data);
        setLoading(false);
      });
  }, [refreshKey]);

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        setRefreshKey(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to update PO status:', err);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'APPROVED': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'RECEIVED': return 'bg-green-100 text-green-700 border-green-200';
      case 'CANCELLED': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-slate-500">Create and track orders with your suppliers.</p>
        </div>
        <div className="flex items-center gap-3 no-print">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
          >
            <Printer size={18} />
            Print Log
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all">
            <Filter size={18} />
            Filter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">
            <Plus size={18} />
            Create PO
          </button>
        </div>
      </div>

      {/* PO List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search orders, suppliers..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
            {orders.length} Orders Total
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Items</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Total Value</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <Loader2 size={32} className="animate-spin mx-auto mb-2 text-blue-500" />
                    <p className="text-sm">Loading purchase orders...</p>
                  </td>
                </tr>
              ) : orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                        <FileText size={16} />
                      </div>
                      <span className="text-sm font-bold text-slate-900">PO-{order.id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Truck size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">{order.supplier}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{order.items.length} Medicines</span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {order.items.map(i => i.name).join(', ').substring(0, 30)}...
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-900">{order.total}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock size={14} />
                      {new Date(order.date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusStyle(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {order.status === 'PENDING' && (
                        <button 
                          onClick={() => handleUpdateStatus(order.id, 'APPROVED')}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors" 
                          title="Approve Order"
                        >
                          <CheckCircle2 size={18} />
                        </button>
                      )}
                      {order.status === 'APPROVED' && (
                        <button 
                          className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-all shadow-md shadow-green-100"
                          onClick={() => {
                            onReceivePO(order);
                            handleUpdateStatus(order.id, 'RECEIVED');
                          }}
                        >
                          <PackageCheck size={14} />
                          Receive
                        </button>
                      )}
                      <button className="p-2 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold">Order Breakdown</h3>
            <RefreshCw size={16} className="text-slate-500 cursor-pointer hover:text-white transition-colors" />
          </div>
          <div className="space-y-4">
             <POStat label="Pending Approval" count={orders.filter(o => o.status === 'PENDING').length} color="bg-amber-500" />
             <POStat label="Awaiting Delivery" count={orders.filter(o => o.status === 'APPROVED').length} color="bg-blue-500" />
             <POStat label="Fully Received" count={orders.filter(o => o.status === 'RECEIVED').length} color="bg-green-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Truck size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Supplier Performance</h3>
              <p className="text-xs text-slate-500">Average fulfillment time: 2.4 days</p>
            </div>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-blue-600 w-4/5 rounded-full"></div>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-right">80% Reliability Score</p>
        </div>
      </div>
    </div>
  );
}

function POStat({ label, count, color }: { label: string, count: number, color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${color}`}></div>
        <span className="text-sm font-medium text-slate-400">{label}</span>
      </div>
      <span className="text-lg font-bold">{count}</span>
    </div>
  );
}
