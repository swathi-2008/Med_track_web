import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  AlertTriangle, 
  History, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu, 
  X,
  Bell,
  Search,
  User as UserIcon,
  Plus,
  Zap,
  FileText,
  ShoppingCart,
  Layers,
  Camera,
  Truck
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import NotificationDrawer from './components/NotificationDrawer';
import SearchOverlay from './components/SearchOverlay';
import Inventory from './components/Inventory';
import BatchModal from './components/BatchModal';
import SaleModal from './components/SaleModal';
import ScannerModal from './components/ScannerModal';
import ExpiryForecasting from './components/ExpiryForecasting';
import PurchaseOrders from './components/PurchaseOrders';
import Suppliers from './components/Suppliers';
import Transactions from './components/Transactions';
import Settings from './components/Settings';
import Login from './components/Login';
import { useStockMonitor } from './hooks/useStockMonitor';

export default function App() {
  const [user, setUser] = useState<any>(null);
  useStockMonitor();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<{ id: number; data: any } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentView, setCurrentView] = useState<'dashboard' | 'inventory' | 'forecasting' | 'purchasing' | 'suppliers' | 'transactions' | 'settings'>('dashboard');

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  const userInitials = user.name.split(' ').map((n: string) => n[0]).join('');

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 transition-transform duration-300 transform
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0
      `}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
              M
            </div>
            <span className="text-xl font-bold text-white tracking-tight">MedTrack</span>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            <NavItem 
              icon={<LayoutDashboard size={20} />} 
              label="Dashboard" 
              active={currentView === 'dashboard'} 
              onClick={() => setCurrentView('dashboard')}
            />
            <NavItem 
              icon={<Package size={20} />} 
              label="Inventory" 
              active={currentView === 'inventory'} 
              onClick={() => setCurrentView('inventory')}
            />
            <NavItem 
              icon={<AlertTriangle size={20} />} 
              label="Expiry Forecast" 
              active={currentView === 'forecasting'}
              onClick={() => setCurrentView('forecasting')}
            />
            
            {(user.role === 'ADMIN' || user.role === 'PHARMACIST') && (
              <NavItem 
                icon={<ShoppingCart size={20} />} 
                label="Purchase Orders" 
                active={currentView === 'purchasing'}
                onClick={() => setCurrentView('purchasing')}
              />
            )}

            {user.role === 'ADMIN' && (
              <NavItem 
                icon={<Truck size={20} />} 
                label="Suppliers" 
                active={currentView === 'suppliers'}
                onClick={() => setCurrentView('suppliers')}
              />
            )}

            <NavItem 
              icon={<History size={20} />} 
              label="Transactions" 
              active={currentView === 'transactions'}
              onClick={() => setCurrentView('transactions')}
            />
            <NavItem 
              icon={<SettingsIcon size={20} />} 
              label="Settings" 
              active={currentView === 'settings'}
              onClick={() => setCurrentView('settings')}
            />
          </nav>

          <div className="p-4 border-t border-slate-800">
            <div 
              onClick={() => setUser(null)}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-red-500/10 group cursor-pointer transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium group-hover:bg-red-500 transition-colors">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate group-hover:text-red-400">{user.role}</p>
              </div>
              <LogOut size={16} className="text-slate-500 group-hover:text-red-500" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 hover:bg-slate-100 rounded-lg"
            >
              <Menu size={20} />
            </button>
            <div className="relative hidden md:block w-64 lg:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search medicines, batches, orders..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-full text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value) setIsSearchOpen(true);
                }}
                onFocus={() => {
                  if (searchQuery) setIsSearchOpen(true);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <QuickActions 
              user={user}
              onAddBatch={() => setIsBatchModalOpen(true)} 
              onRecordSale={() => setIsSaleModalOpen(true)}
              onVerifyStock={() => setIsScannerOpen(true)}
            />
            <button 
              onClick={() => setNotificationsOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-full relative"
            >
              <Bell size={20} className="text-slate-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="w-px h-6 bg-slate-200 mx-2"></div>
            <button className="flex items-center gap-2 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
                <UserIcon size={18} />
              </div>
              <span className="text-sm font-medium text-slate-700 hidden sm:inline">Profile</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {currentView === 'dashboard' ? (
            <Dashboard key={`dash-${refreshKey}`} user={user} />
          ) : currentView === 'inventory' ? (
            <Inventory 
              key={`inv-${refreshKey}`} 
              user={user}
              onAddBatch={() => {
                setSelectedBatch(null);
                setIsBatchModalOpen(true);
              }} 
              onViewBatch={(id, data) => {
                setSelectedBatch({ id, data });
                setIsBatchModalOpen(true);
              }}
            />
          ) : currentView === 'forecasting' ? (
            <ExpiryForecasting key={`fore-${refreshKey}`} />
          ) : currentView === 'purchasing' ? (
            <PurchaseOrders 
              key={`purch-${refreshKey}`} 
              onReceivePO={(po) => {
                setSelectedBatch({
                  id: 0, // 0 means new batch from PO
                  data: {
                    medicineName: po.items[0]?.name || '',
                    batchNumber: `PO-${po.id}`,
                    expiryDate: '',
                    quantity: po.items[0]?.qty || '',
                    supplier: po.supplier
                  }
                });
                setIsBatchModalOpen(true);
              }}
            />
          ) : currentView === 'suppliers' ? (
            <Suppliers key={`supp-${refreshKey}`} />
          ) : currentView === 'transactions' ? (
            <Transactions key={`tx-${refreshKey}`} />
          ) : (
            <Settings />
          )}
        </main>
      </div>

      <NotificationDrawer 
        isOpen={isNotificationsOpen} 
        onClose={() => setNotificationsOpen(false)} 
      />

      <SearchOverlay 
        isOpen={isSearchOpen} 
        query={searchQuery} 
        onClose={() => setIsSearchOpen(false)} 
      />

      <BatchModal 
        isOpen={isBatchModalOpen} 
        batchId={selectedBatch?.id}
        initialData={selectedBatch?.data}
        onClose={() => {
          setIsBatchModalOpen(false);
          setSelectedBatch(null);
        }} 
        onSuccess={() => {
          setRefreshKey(prev => prev + 1);
          console.log('Batch action successful');
        }}
      />

      <SaleModal 
        isOpen={isSaleModalOpen} 
        onClose={() => setIsSaleModalOpen(false)} 
        onSuccess={() => {
          setRefreshKey(prev => prev + 1);
          console.log('Sale recorded successfully');
        }}
      />

      <ScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={(text) => {
          setSearchQuery(text);
          setIsSearchOpen(true);
        }} 
      />
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
        ${active ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function QuickActions({ user, onAddBatch, onRecordSale, onVerifyStock }: { user: any, onAddBatch: () => void, onRecordSale: () => void, onVerifyStock: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
      >
        <Plus size={18} />
        <span className="hidden sm:inline">Quick Actions</span>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-20 py-2 overflow-hidden animate-in fade-in zoom-in duration-100 origin-top-right">
            <div className="px-4 py-2 border-b border-slate-50">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Common Tasks</p>
            </div>
            
            <QuickActionItem 
              icon={<ShoppingCart size={16} className="text-blue-500" />} 
              label="Record Sale" 
              onClick={() => { onRecordSale(); setIsOpen(false); }} 
            />
            
            {(user.role === 'ADMIN' || user.role === 'PHARMACIST') && (
              <>
                <QuickActionItem 
                  icon={<Layers size={16} className="text-green-500" />} 
                  label="Add New Batch" 
                  onClick={() => { onAddBatch(); setIsOpen(false); }} 
                />
                <QuickActionItem 
                  icon={<FileText size={16} className="text-orange-500" />} 
                  label="Generate Expiry Report" 
                  onClick={() => { console.log('Generate Expiry Report clicked'); setIsOpen(false); }} 
                />
              </>
            )}
            
            <QuickActionItem 
              icon={<Camera size={16} className="text-purple-500" />} 
              label="Verify Stock (QR)" 
              onClick={() => { onVerifyStock(); setIsOpen(false); }} 
            />
            
            <div className="h-px bg-slate-50 my-1"></div>
            
            {(user.role === 'ADMIN' || user.role === 'PHARMACIST') && (
              <QuickActionItem 
                icon={<Zap size={16} className="text-amber-500" />} 
                label="Stock Adjustment" 
                onClick={() => { console.log('Stock Adjustment clicked'); setIsOpen(false); }} 
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function QuickActionItem({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}
