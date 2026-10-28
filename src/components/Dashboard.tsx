import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Package, 
  Clock, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownRight,
  ChevronRight,
  MoreVertical
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface SummaryData {
  metrics: {
    active_medicines: number;
    low_stock_count: number;
    expired_lots_count: number;
    near_expiry_count: number;
    critical_lots_count: number;
    today_revenue_display: string;
    today_sales_count: number;
    total_inventory_cost_display: string;
  }
}

interface SalesTrend {
  date: string;
  count: number;
  revenue_inr: number;
}

interface ExpiryBreakdown {
  expired: { count: number; cost_inr: number };
  critical_7d: { count: number; cost_inr: number };
  high_30d: { count: number; cost_inr: number };
  medium_60d: { count: number; cost_inr: number };
  healthy: { count: number; cost_inr: number };
}

interface Activity {
  id: number;
  type: string;
  medicine_name: string;
  quantity_delta: number;
  reason: string;
  timestamp: string;
}

interface DashboardProps {
  user: any;
}

export default function Dashboard({ user }: DashboardProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [salesTrend, setSalesTrend] = useState<SalesTrend[]>([]);
  const [expiryBreakdown, setExpiryBreakdown] = useState<ExpiryBreakdown | null>(null);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);

  useEffect(() => {
    // Fetch dashboard data
    fetch('/api/dashboard/summary').then(res => res.json()).then(setSummary);
    fetch('/api/dashboard/sales-trend').then(res => res.json()).then(setSalesTrend);
    fetch('/api/dashboard/expiry-breakdown').then(res => res.json()).then(setExpiryBreakdown);
    fetch('/api/dashboard/recent-activity').then(res => res.json()).then(setRecentActivity);
  }, []);

  if (!summary) return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;

  const COLORS = ['#ef4444', '#f97316', '#facc15', '#60a5fa', '#22c55e'];
  const pieData = expiryBreakdown ? [
    { name: 'Expired', value: expiryBreakdown.expired.count },
    { name: 'Critical (7d)', value: expiryBreakdown.critical_7d.count },
    { name: 'High Risk (30d)', value: expiryBreakdown.high_30d.count },
    { name: 'Medium Risk (60d)', value: expiryBreakdown.medium_60d.count },
    { name: 'Healthy', value: expiryBreakdown.healthy.count },
  ] : [];

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pharmacy Overview</h1>
        <p className="text-slate-500">Welcome back. Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Today's Revenue" 
          value={summary.metrics.today_revenue_display} 
          subtext={`${summary.metrics.today_sales_count} sales today`}
          icon={<TrendingUp className="text-blue-600" size={20} />}
          trend={{ value: '12%', positive: true }}
        />
        <StatCard 
          title="Critical Stock" 
          value={summary.metrics.low_stock_count.toString()} 
          subtext="Items below reorder level"
          icon={<Package className="text-orange-600" size={20} />}
          trend={{ value: '3 items', positive: false }}
          critical={summary.metrics.low_stock_count > 5}
        />
        <StatCard 
          title="Expiring Soon" 
          value={summary.metrics.near_expiry_count.toString()} 
          subtext="Batches within 30 days"
          icon={<Clock className="text-yellow-600" size={20} />}
          trend={{ value: `${summary.metrics.critical_lots_count} critical`, positive: false }}
          warning={summary.metrics.near_expiry_count > 0}
        />
        <StatCard 
          title="Expired Lots" 
          value={summary.metrics.expired_lots_count.toString()} 
          subtext="Requires immediate removal"
          icon={<AlertCircle className="text-red-600" size={20} />}
          critical={summary.metrics.expired_lots_count > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-800">Sales Performance</h3>
            <select className="text-xs font-medium bg-slate-100 border-none rounded-md px-2 py-1 outline-none">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue_inr" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expiry Breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-6">Stock Expiry Risk</h3>
          <div className="h-56 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-800">{summary.metrics.active_medicines}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Meds</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {pieData.map((item, idx) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx] }}></div>
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <span className="font-semibold text-slate-800">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Recent Transactions</h3>
            <button className="text-blue-600 text-sm font-medium hover:underline">View All</button>
          </div>
          <div className="divide-y divide-slate-50">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center shrink-0
                  ${activity.type === 'SALE' ? 'bg-green-100 text-green-700' : 
                    activity.type === 'PURCHASE' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}
                `}>
                  {activity.type === 'SALE' ? <ArrowDownRight size={18} /> : 
                   activity.type === 'PURCHASE' ? <ArrowUpRight size={18} /> : <AlertCircle size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{activity.medicine_name}</p>
                  <p className="text-xs text-slate-500">{activity.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${activity.quantity_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {activity.quantity_delta > 0 ? '+' : ''}{activity.quantity_delta} units
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Items */}
        <div className="space-y-6">
          {(user.role === 'ADMIN' || user.role === 'PHARMACIST') && (
            <>
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-md">
                <h4 className="font-semibold mb-2">Quick Inventory Actions</h4>
                <p className="text-blue-100 text-sm mb-6">Keep your pharmacy stock optimized with these tools.</p>
                <div className="space-y-3">
                  <ActionButton label="Stock Adjustment" />
                  <ActionButton label="Generate Purchase Order" />
                  <ActionButton label="Mark Expired Stock" />
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-4">Top Low Stock</h3>
                <div className="space-y-4">
                  <LowStockItem name="Amoxicillin 250mg" stock={12} min={50} />
                  <LowStockItem name="Metformin 500mg" stock={4} min={20} />
                  <LowStockItem name="Cetirizine 10mg" stock={8} min={30} />
                </div>
              </div>
            </>
          )}
          
          {user.role === 'CASHIER' && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
               <h4 className="font-bold text-blue-900 mb-2">Sales Mode Active</h4>
               <p className="text-sm text-blue-700 leading-relaxed">
                 You are currently in Cashier mode. You can record sales and view inventory. For stock adjustments or procurement, please contact a Pharmacist or Admin.
               </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtext, icon, trend, critical = false, warning = false }: any) {
  return (
    <div className={`
      bg-white p-6 rounded-2xl border transition-all duration-200
      ${critical ? 'border-red-200 bg-red-50/30' : warning ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 shadow-sm hover:shadow-md'}
    `}>
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 bg-slate-50 rounded-xl">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-bold ${trend.positive ? 'text-green-600' : 'text-slate-500'}`}>
            {trend.positive ? <ArrowUpRight size={14} /> : null}
            {trend.value}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
        <p className={`text-2xl font-bold ${critical ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
        <p className="text-xs text-slate-400 mt-1">{subtext}</p>
      </div>
    </div>
  );
}

function ActionButton({ label }: { label: string }) {
  return (
    <button className="w-full flex items-center justify-between bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors group">
      <span className="text-sm font-medium">{label}</span>
      <ChevronRight size={16} className="opacity-60 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function LowStockItem({ name, stock, min }: { name: string, stock: number, min: number }) {
  const percentage = (stock / min) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-slate-700">{name}</span>
        <span className="text-slate-500">{stock} / {min} units</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full ${percentage < 20 ? 'bg-red-500' : 'bg-amber-500'}`} 
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
    </div>
  );
}
