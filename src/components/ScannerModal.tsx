import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, RefreshCw, AlertCircle } from 'lucide-react';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

export default function ScannerModal({ isOpen, onClose, onScan }: ScannerModalProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the container is rendered
      const timer = setTimeout(() => {
        try {
          const scanner = new Html5QrcodeScanner(
            "qr-reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
          );

          scanner.render(
            (decodedText) => {
              onScan(decodedText);
              scanner.clear();
              onClose();
            },
            (errorMessage) => {
              // Not usually helpful to show every frame's error
              // console.warn(errorMessage);
            }
          );
          scannerRef.current = scanner;
        } catch (err) {
          setError("Failed to initialize camera. Please check permissions.");
          console.error(err);
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
        }
      };
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white">
                  <Camera size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">QR Scanner</h2>
                  <p className="text-xs text-slate-500 font-medium">Align the QR code within the frame.</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {error ? (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-center">
                  <AlertCircle className="mx-auto text-red-500 mb-2" size={24} />
                  <p className="text-sm font-bold text-red-700">{error}</p>
                  <button 
                    onClick={() => { setError(null); onClose(); }}
                    className="mt-4 text-xs font-bold text-red-600 hover:underline"
                  >
                    Close and Try Again
                  </button>
                </div>
              ) : (
                <div className="relative aspect-square bg-slate-900 rounded-2xl overflow-hidden">
                   <div id="qr-reader" className="w-full h-full"></div>
                   {/* Overlay guide */}
                   <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                     <div className="w-full h-full border-2 border-purple-500/50 rounded-lg"></div>
                   </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-2">
               <RefreshCw size={14} className="text-slate-400 animate-spin-slow" />
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Searching for QR code...</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
