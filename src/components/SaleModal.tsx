import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingCart, Package, User, Hash, Loader2, Sparkles, MapPin, Calendar, AlertCircle } from 'lucide-react';

interface FefoSuggestion {
  batchId: string;
  expiryDate: string;
  location: string;
  quantity: number;
}

interface SaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SaleModal({ isOpen, onClose, onSuccess }: SaleModalProps) {
  const [loading, setLoading] = useState(false);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [fefoSuggestion, setFefoSuggestion] = useState<FefoSuggestion | null>(null);
  const [loadingFefo, setLoadingFefo] = useState(false);
  
  const [formData, setFormData] = useState({
    patientName: '',
    quantity: '1',
    notes: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetch('/api/inventory')
        .then(res => res.json())
        .then(setMedicines);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedMedId) {
      setLoadingFefo(true);
      fetch(`/api/medicines/${selectedMedId}/fefo-suggestion`)
        .then(res => res.json())
        .then(data => {
          setFefoSuggestion(data);
          setLoadingFefo(false);
        })
        .catch(() => setLoadingFefo(false));
    } else {
      setFefoSuggestion(null);
    }
  }, [selectedMedId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // In a real app, this would post to /api/sales
    setTimeout(() => {
      onSuccess();
      onClose();
      setLoading(false);
    }, 1000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
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
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Record Sale</h2>
                  <p className="text-xs text-slate-500 font-medium">Capture patient sale and update stock.</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Patient Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    required
                    type="text"
                    placeholder="e.g. John Doe"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={formData.patientName}
                    onChange={e => setFormData({ ...formData, patientName: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Select Medicine</label>
                <div className="relative">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                    value={selectedMedId}
                    onChange={e => setSelectedMedId(e.target.value)}
                  >
                    <option value="">Select a medication...</option>
                    {medicines.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* FEFO SUGGESTION INDICATOR */}
              <AnimatePresence mode="wait">
                {selectedMedId && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 overflow-hidden relative"
                  >
                    {loadingFefo ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="animate-spin text-indigo-500" size={20} />
                      </div>
                    ) : fefoSuggestion ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="text-indigo-600" size={16} />
                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">FEFO Suggestion</span>
                          </div>
                          <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded uppercase">Sell This First</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-2">
                            <Hash className="text-indigo-400" size={14} />
                            <div className="flex flex-col">
                              <span className="text-[10px] text-indigo-400 font-bold uppercase">Batch ID</span>
                              <span className="text-sm font-bold text-slate-800">{fefoSuggestion.batchId}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="text-indigo-400" size={14} />
                            <div className="flex flex-col">
                              <span className="text-[10px] text-indigo-400 font-bold uppercase">Location</span>
                              <span className="text-sm font-bold text-slate-800">{fefoSuggestion.location}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="text-indigo-400" size={14} />
                            <div className="flex flex-col">
                              <span className="text-[10px] text-indigo-400 font-bold uppercase">Expires</span>
                              <span className="text-sm font-bold text-slate-800">{new Date(fefoSuggestion.expiryDate).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <AlertCircle className="text-indigo-400" size={14} />
                            <div className="flex flex-col">
                              <span className="text-[10px] text-indigo-400 font-bold uppercase">Available</span>
                              <span className="text-sm font-bold text-slate-800">{fefoSuggestion.quantity} units</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {/* Background Glow */}
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-200/20 blur-2xl rounded-full"></div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Quantity to Sell</label>
                <div className="relative">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    required
                    type="number"
                    min="1"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={formData.quantity}
                    onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  disabled={loading || !selectedMedId}
                  type="submit"
                  className="flex-[2] py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Complete Sale
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
