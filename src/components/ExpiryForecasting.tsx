import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Calendar, 
  Package, 
  ArrowRight, 
  CheckCircle2, 
  Info,
  Clock,
  TrendingDown
} from 'lucide-react';

interface ForecastItem {
  id: number;
  name: string;
  batchId: string;
  stock: number;
  dailySales: number;
  expiry: string;
  daysToSell: number;
  projectedSellThrough: string;
  isRisk: boolean;
  riskAmount: number;
}

export default function ExpiryForecasting() {
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics/expiry-forecast')
      .then(res => res.json())
      .then(data => {
        setForecast(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-12 text-center text-slate-500">Calculating projections...</div>;

  const riskItems = forecast.filter(i => i.isRisk);
  const totalRiskStock = riskItems.reduce((acc, i) => acc + i.riskAmount, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Expiry Forecasting</h1>
        <p className="text-slate-500">Predictive analysis based on historical consumption and current batch expiry.</p>
      </div>

      {/* Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h3 className="font-bold text-slate-700">Stock at Risk</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalRiskStock}</p>
          <p className="text-xs text-slate-400 mt-1">Units projected to expire before sale</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
            <h3 className="font-bold text-slate-700">Risk Batches</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">{riskItems.length}</p>
          <p className="text-xs text-slate-400 mt-1">Batches with sell-through date {'>'} expiry</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="font-bold text-slate-700">Safe Inventory</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">{forecast.length - riskItems.length}</p>
          <p className="text-xs text-slate-400 mt-1">Medications projected to sell completely</p>
        </div>
      </div>

      {/* Forecast Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-700">Detailed Projection List</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Medicine / Batch</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Daily Consumption</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Stock / Est. Days</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Projection Timeline</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {forecast.map((item) => (
                <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.isRisk ? 'bg-red-50/20' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">{item.name}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.batchId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">{item.dailySales} units/day</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">{item.stock} units</span>
                      <span className="text-[10px] font-medium text-slate-500">Sells in ~{item.daysToSell} days</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Expiry</span>
                        <span className="text-xs font-bold text-slate-700">{new Date(item.expiry).toLocaleDateString()}</span>
                      </div>
                      <ArrowRight className="text-slate-300" size={14} />
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Sell-Through</span>
                        <span className={`text-xs font-bold ${item.isRisk ? 'text-red-600' : 'text-green-600'}`}>
                          {new Date(item.projectedSellThrough).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {item.isRisk ? (
                      <div className="flex flex-col items-end">
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full uppercase">
                          <AlertTriangle size={10} />
                          Expiry Risk
                        </span>
                        <span className="text-[10px] font-medium text-red-500 mt-1">Loss: ~{item.riskAmount} units</span>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">
                        <CheckCircle2 size={10} />
                        Safe
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advisory Note */}
      <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex gap-4">
        <Info className="text-indigo-500 shrink-0 mt-0.5" size={20} />
        <div>
          <h4 className="text-sm font-bold text-indigo-900">How forecasting works</h4>
          <p className="text-xs text-indigo-700 leading-relaxed mt-1">
            Projections are calculated by analyzing the Average Daily Consumption (ADC) of each medication. We compare the predicted date when your current stock will hit zero against the batch's hard expiry date. Batches marked as "Expiry Risk" are projected to reach their expiry date while still having units on the shelf.
          </p>
        </div>
      </div>
    </div>
  );
}
