import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Bell, AlertTriangle, AlertCircle, Info, CheckCircle2, Clock } from 'lucide-react';

interface Notification {
  id: number;
  type: 'EXPIRY' | 'STOCK' | 'SYSTEM';
  title: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  timestamp: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/notifications')
        .then(res => res.json())
        .then(data => {
          setNotifications(data);
          setLoading(false);
        })
        .catch(err => console.error('Failed to fetch notifications:', err));
    }
  }, [isOpen]);

  const getIcon = (type: string, severity: string) => {
    if (severity === 'CRITICAL') return <AlertCircle className="text-red-500" size={20} />;
    if (severity === 'WARNING') return <AlertTriangle className="text-amber-500" size={20} />;
    return <Info className="text-blue-500" size={20} />;
  };

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-[70] flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                  <Bell size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
                  <p className="text-xs text-slate-500">{notifications.length} updates pending</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-400">Loading alerts...</div>
              ) : notifications.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-slate-900 font-semibold mb-1">All caught up!</h3>
                  <p className="text-sm text-slate-500">No new alerts or system notifications.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {notifications.map((n) => (
                    <div 
                      key={n.id} 
                      className={`p-6 hover:bg-slate-50 transition-colors cursor-pointer group ${n.severity === 'CRITICAL' ? 'bg-red-50/30' : ''}`}
                    >
                      <div className="flex gap-4">
                        <div className="mt-1">{getIcon(n.type, n.severity)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-bold text-slate-900">{n.title}</h4>
                            <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                              <Clock size={10} />
                              {getTimeAgo(n.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">{n.message}</p>
                          <div className="mt-3 flex items-center gap-2">
                            <button className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">
                              View Details
                            </button>
                            <span className="text-slate-200 text-xs">•</span>
                            <button className="text-xs font-bold text-slate-400 hover:text-slate-500 transition-colors">
                              Mark as read
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button className="w-full py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-sm">
                View All Notification History
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
