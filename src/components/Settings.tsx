import { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  User, 
  Bell, 
  Shield, 
  Store, 
  Clock, 
  Database,
  Smartphone,
  Save,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'motion/react';

export default function Settings() {
  const [activeSection, setActiveTab] = useState('pharmacy');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
        <p className="text-slate-500">Configure your pharmacy's operational parameters and account security.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 items-start">
        {/* Sidebar Nav */}
        <div className="bg-white rounded-2xl border border-slate-200 p-2 space-y-1 shadow-sm">
          <SettingsTab active={activeSection === 'pharmacy'} onClick={() => setActiveTab('pharmacy')} icon={<Store size={18} />} label="Pharmacy Profile" />
          <SettingsTab active={activeSection === 'notifications'} onClick={() => setActiveTab('notifications')} icon={<Bell size={18} />} label="Notifications" />
          <SettingsTab active={activeSection === 'security'} onClick={() => setActiveTab('security')} icon={<Shield size={18} />} label="Security & Access" />
          <SettingsTab active={activeSection === 'display'} onClick={() => setActiveTab('display')} icon={<Smartphone size={18} />} label="Display Preferences" />
          <SettingsTab active={activeSection === 'data'} onClick={() => setActiveTab('data')} icon={<Database size={18} />} label="Data & Backups" />
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
          <div className="p-8 flex-1">
            {activeSection === 'pharmacy' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Pharmacy Profile</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SettingField label="Pharmacy Name" defaultValue="MedTrack Central" />
                  <SettingField label="License Number" defaultValue="PH-2026-9901" />
                  <SettingField label="Primary Contact" defaultValue="+91 12345 67890" />
                  <SettingField label="Support Email" defaultValue="help@medtrack.com" />
                </div>
                <div className="space-y-2 mt-4">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Store Address</label>
                   <textarea 
                     className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px]"
                     defaultValue="123 Pharma Lane, Tech City, Sector 5"
                   />
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Notification Preferences</h3>
                <div className="space-y-4">
                   <ToggleSetting label="Browser Push Notifications" description="Receive alerts even when the browser tab is closed." checked={true} />
                   <ToggleSetting label="Critical Low Stock Alerts" description="Immediate notification when units drop below threshold." checked={true} />
                   <ToggleSetting label="Expiry Countdown Emails" description="Weekly summary of medications expiring in the next 30 days." checked={false} />
                   <ToggleSetting label="System Update News" description="Stay informed about new MedTrack features." checked={true} />
                </div>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Security & Access</h3>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-4 mb-6">
                   <Shield className="text-blue-500 shrink-0" size={24} />
                   <div>
                      <p className="text-sm font-bold text-blue-900">Role-Based Access Control Active</p>
                      <p className="text-xs text-blue-700">Individual permissions are managed by the System Administrator.</p>
                   </div>
                </div>
                <div className="space-y-4">
                   <button className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors group flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800">Change Account Password</p>
                        <p className="text-xs text-slate-500">Last changed 42 days ago</p>
                      </div>
                      <Clock size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                   </button>
                   <button className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors group flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800">Two-Factor Authentication (2FA)</p>
                        <p className="text-xs text-red-500 font-bold">Currently Disabled</p>
                      </div>
                      <Smartphone size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                   </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Save Area */}
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
             <div className="flex items-center gap-2">
                {showSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-1.5 text-green-600 text-sm font-bold"
                  >
                    <CheckCircle2 size={16} />
                    Settings saved successfully!
                  </motion.div>
                )}
             </div>
             <button 
               onClick={handleSave}
               disabled={saving}
               className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
             >
               {saving ? <Clock className="animate-spin" size={18} /> : <Save size={18} />}
               {saving ? 'Saving...' : 'Save All Changes'}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
        active ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SettingField({ label, defaultValue }: { label: string, defaultValue: string }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <input 
        type="text" 
        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        defaultValue={defaultValue}
      />
    </div>
  );
}

function ToggleSetting({ label, description, checked }: any) {
  const [isOn, setIsOn] = useState(checked);
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/30">
      <div className="flex-1 mr-4">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
      </div>
      <button 
        onClick={() => setIsOn(!isOn)}
        className={`w-12 h-6 rounded-full relative transition-colors ${isOn ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isOn ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  );
}
