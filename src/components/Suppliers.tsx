import { useState, useEffect } from 'react';
import { 
  Truck, 
  Plus, 
  Star, 
  Phone, 
  Mail, 
  Clock, 
  MoreVertical, 
  Search, 
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Filter,
  TrendingUp,
  BarChart3,
  CalendarCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Supplier {
  id: number;
  name: string;
  contact: string;
  email: string;
  leadTime: string;
  rating: number;
  status: 'ACTIVE' | 'PROBATION' | 'INACTIVE';
  qualityNotes?: string;
}

interface PerformanceMetric {
  id: number;
  name: string;
  onTimeRate: number;
  avgDelay: number;
  totalOrders: number;
}

export default function Suppliers() {
  const [activeTab, setActiveTab] = useState<'directory' | 'performance'>('directory');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [performance, setPerformance] = useState<PerformanceMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    const endpoints = activeTab === 'directory' ? ['/api/suppliers'] : ['/api/suppliers', '/api/suppliers/performance'];
    
    Promise.all(endpoints.map(e => fetch(e).then(res => res.json())))
      .then(([supps, perf]) => {
        setSuppliers(supps);
        if (perf) setPerformance(perf);
        setLoading(false);
      });
  }, [activeTab]);

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const avgRating = suppliers.length > 0 
    ? (suppliers.reduce((acc, s) => acc + s.rating, 0) / suppliers.length).toFixed(1)
    : "0.0";

  const StarRating = ({ rating }: { rating: number }) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star 
            key={star} 
            size={12} 
            className={`${star <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} 
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Supplier Management</h1>
          <p className="text-slate-500">Track partner performance and directory details.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">
            <Plus size={18} />
            Add Supplier
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-8">
        <button 
          onClick={() => setActiveTab('directory')}
          className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'directory' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Partner Directory
          {activeTab === 'directory' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('performance')}
          className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'performance' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Performance Analytics
          {activeTab === 'performance' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {activeTab === 'directory' ? (
        <>
          {/* Supplier Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SupplierMetric label="Total Partners" value={suppliers.length.toString()} icon={<Truck size={20} />} />
            <SupplierMetric label="Avg. Lead Time" value="2.8 Days" icon={<Clock size={20} />} />
            <SupplierMetric label="Global Rating" value={avgRating} icon={<Star size={20} className="fill-amber-400 text-amber-400" />} />
            <SupplierMetric label="Active Orders" value="12" icon={<ExternalLink size={20} />} />
          </div>

          {/* List / Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  placeholder="Search by name or email..."
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">
                <Filter size={16} />
                Filter Status
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-6">
              {loading ? (
                <div className="col-span-full py-12 flex flex-col items-center text-slate-400">
                   <Loader2 size={32} className="animate-spin text-blue-500 mb-2" />
                   <p className="text-sm font-medium">Syncing supplier data...</p>
                </div>
              ) : filteredSuppliers.map((supplier) => (
                <div key={supplier.id} className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-lg hover:border-blue-100 transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <Truck size={24} />
                    </div>
                    <div className="flex flex-col items-end">
                       <div className="flex flex-col items-end gap-1 bg-amber-50 px-2 py-1 rounded-xl">
                          <div className="flex items-center gap-1.5">
                            <Star size={12} className="fill-amber-400 text-amber-400" />
                            <span className="text-sm font-black text-amber-700">{supplier.rating}</span>
                          </div>
                          <StarRating rating={supplier.rating} />
                       </div>
                       <span className={`mt-2 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                         supplier.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                       }`}>
                         {supplier.status}
                       </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-900 mb-1">{supplier.name}</h3>
                  <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
                    <Clock size={12} />
                    Lead time: <span className="font-bold text-slate-700">{supplier.leadTime}</span>
                  </p>

                  {supplier.qualityNotes && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100 italic">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        "{supplier.qualityNotes}"
                      </p>
                    </div>
                  )}

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone size={14} className="text-slate-400" />
                      <span className="truncate">{supplier.contact}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail size={14} className="text-slate-400" />
                      <span className="truncate">{supplier.email}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                     <button className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                       Create Purchase Order
                       <ExternalLink size={12} />
                     </button>
                     <button className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400">
                       <MoreVertical size={16} />
                     </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                    <CalendarCheck size={20} />
                  </div>
                  <h3 className="font-bold text-slate-700">On-Time Performance</h3>
                </div>
                <p className="text-3xl font-black text-slate-900">92.4%</p>
                <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                   <div className="h-full bg-green-500 w-[92.4%] rounded-full"></div>
                </div>
             </div>
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                    <TrendingUp size={20} />
                  </div>
                  <h3 className="font-bold text-slate-700">Lead Time Deviation</h3>
                </div>
                <p className="text-3xl font-black text-slate-900">+0.8 Days</p>
                <p className="text-xs text-slate-400 mt-1">Average delay across all shipments</p>
             </div>
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
                    <BarChart3 size={20} />
                  </div>
                  <h3 className="font-bold text-slate-700">Total Fulfilled</h3>
                </div>
                <p className="text-3xl font-black text-slate-900">322</p>
                <p className="text-xs text-slate-400 mt-1">Total batches received this year</p>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-700">Individual Partner Performance</h3>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                   <thead>
                      <tr className="border-b border-slate-100">
                         <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Supplier</th>
                         <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">On-Time Rate</th>
                         <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Avg. Deviation</th>
                         <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Total Orders</th>
                         <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Score</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {performance.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                           <td className="px-6 py-4">
                              <span className="text-sm font-bold text-slate-900">{p.name}</span>
                           </td>
                           <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                 <span className="text-sm font-medium text-slate-700">{p.onTimeRate}%</span>
                                 <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${p.onTimeRate > 90 ? 'bg-green-500' : p.onTimeRate > 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${p.onTimeRate}%` }}></div>
                                 </div>
                              </div>
                           </td>
                           <td className="px-6 py-4">
                              <span className={`text-sm font-bold ${p.avgDelay <= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                                 {p.avgDelay > 0 ? '+' : ''}{p.avgDelay} days
                              </span>
                           </td>
                           <td className="px-6 py-4">
                              <span className="text-sm font-medium text-slate-600">{p.totalOrders}</span>
                           </td>
                           <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                                p.onTimeRate > 90 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                 {p.onTimeRate > 90 ? 'Elite' : 'Reliable'}
                              </span>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierMetric({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
          {icon}
        </div>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}
