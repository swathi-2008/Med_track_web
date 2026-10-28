import { useEffect, useRef } from 'react';

export function useStockMonitor() {
  const lastCheckRef = useRef<Set<string>>(new Set());

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const sendBrowserNotification = (title: string, message: string) => {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/favicon.ico' // Default vite icon or app icon
      });
    }
  };

  const checkStockLevels = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const notifications = await res.json();
        const stockAlerts = notifications.filter((n: any) => n.type === 'STOCK');
        
        stockAlerts.forEach((alert: any) => {
          // Only notify if we haven't notified about this specific ID in this session
          if (!lastCheckRef.current.has(alert.id)) {
            sendBrowserNotification(alert.title, alert.message);
            lastCheckRef.current.add(alert.id);
          }
        });
      }
    } catch (err) {
      console.error('Stock monitor check failed:', err);
    }
  };

  useEffect(() => {
    requestPermission();
    
    // Initial check
    checkStockLevels();

    // Set up periodic check every 30 seconds
    const interval = setInterval(checkStockLevels, 30000);
    
    return () => clearInterval(interval);
  }, []);
}
