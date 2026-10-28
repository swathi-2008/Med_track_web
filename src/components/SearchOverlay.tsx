import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Package, Layers, ChevronRight, X, Loader2 } from 'lucide-react';

interface SearchResult {
  id: number;
  name: string;
  type: 'MEDICINE' | 'BATCH';
  category?: string;
  expiry?: string;
  stock: number;
}

interface SearchOverlayProps {
  isOpen: boolean;
  query: string;
  onClose: () => void;
}

export default function SearchOverlay({ isOpen, query, onClose }: SearchOverlayProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && query.length >= 2) {
      setLoading(true);
      const timer = setTimeout(() => {
        fetch(`/api/search?q=${encodeURIComponent(query)}`)
          .then(res => res.json())
          .then(data => {
            setResults(data);
            setLoading(false);
          })
          .catch(err => {
            console.error('Search failed:', err);
            setLoading(false);
          });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setLoading(false);
    }
  }, [isOpen, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />

      {/* Search Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
      >
        <div className="p-4 border-b border-slate-100 flex items-center gap-4">
          <Search className="text-slate-400 shrink-0" size={20} />
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Search medications, batches, categories..."
            className="flex-1 bg-transparent border-none outline-none text-slate-800 text-lg placeholder:text-slate-400"
            readOnly // Managed by parent component but visual match
          />
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <p className="text-sm font-medium">Searching inventory...</p>
            </div>
          ) : query.length < 2 ? (
            <div className="p-12 text-center text-slate-400">
              <Search size={40} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm">Type at least 2 characters to search</p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-sm font-medium text-slate-600 mb-1">No results found for "{query}"</p>
              <p className="text-xs">Try searching for a different keyword or category.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  className="w-full p-4 hover:bg-slate-50 flex items-center gap-4 transition-colors group text-left"
                >
                  <div className={`
                    w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                    ${result.type === 'MEDICINE' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}
                  `}>
                    {result.type === 'MEDICINE' ? <Package size={20} /> : <Layers size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-slate-900 truncate">{result.name}</span>
                      <span className={`
                        px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                        ${result.type === 'MEDICINE' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}
                      `}>
                        {result.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {result.category && <span>{result.category}</span>}
                      {result.expiry && <span>Expires: {new Date(result.expiry).toLocaleDateString()}</span>}
                      <span>Stock: {result.stock} units</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-600 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          <span>Results for "{query}"</span>
          <span>{results.length} Found</span>
        </div>
      </motion.div>
    </div>
  );
}
