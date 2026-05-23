/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, User, Home, MessageSquare, MapPin, 
  Filter, Heart, Share2, Phone, Star, Camera, Bell,
  CheckCircle2, AlertCircle, Loader2, Sparkles, X,
  ChevronLeft, ChevronRight, ShoppingBag, Check, CheckCheck, Maximize, Image as ImageIcon,
  Settings, Calendar, Save, Copy, ExternalLink, LogOut, Ban,
  ArrowRight, HeartOff, MoreVertical, Send, MessageCircle, Smile,
  Play, Pause, Mic, CircleDollarSign, PhoneCall, TrendingDown, Zap, Activity,
  Shield, Award, Terminal, Users, Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User as FirebaseUser, sendEmailVerification,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail
} from 'firebase/auth';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { 
  collection, query, where, orderBy, getDocs, addDoc, 
  serverTimestamp, updateDoc, doc, getDoc, onSnapshot, limit, setDoc, deleteDoc,
  runTransaction, increment, writeBatch, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, messaging, getToken, onMessage } from './lib/firebase';
import AdminView from './components/AdminView';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LocalNotifications } from '@capacitor/local-notifications';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const isCapacitorPlatform = () => {
  return typeof window !== 'undefined' && (window as any).Capacitor;
};

async function requestNativeNotificationPermission() {
  if (isCapacitorPlatform()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
      // Ensure a louder ringing and high-importance notification channel is registered on Android
      await LocalNotifications.createChannel({
        id: 'default',
        name: 'Default SouqIraq Channel',
        description: 'Loud background sound and vibration for direct notifications and messages',
        importance: 5, // Android IMPORTANCE_HIGH (Rings/Sounds and displays banner)
        visibility: 1, // PUBLIC
        sound: 'default',
        vibration: true
      });
    } catch (e) {
      console.log('Capacitor local notification permissions not requested or supported:', e);
    }
  } else if (typeof window !== 'undefined' && "Notification" in window) {
    try {
      await Notification.requestPermission();
    } catch (e) {
      console.log('Web Notification permissions request not allowed in this iframe/environment:', e);
    }
  } else {
    console.log('Notification API is not supported in this browser.');
  }
}

async function triggerNativeNotification(title: string, body: string, type?: string) {
  // 1. Handle Capacitor / Native Android APK Background Notification
  if (isCapacitorPlatform()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: title,
              body: body,
              id: Math.floor(Math.random() * 1000000),
              schedule: { at: new Date(Date.now() + 50) },
              sound: 'default', // Ensures standard system sound plays (rings)
              channelId: 'default', // Binds to high-importance custom ringing channel
              attachments: [],
              actionTypeId: "",
              extra: { type: type || 'direct' }
            }
          ]
        });
        return;
      }
    } catch (e) {
      console.log("Capacitor native notification fell back safely", e);
    }
  }

  // 2. Handle HTML5 PWA ServiceWorker (Highly robust for PWA/Mobile Chrome/WebView Background)
  if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "granted") {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration) {
          registration.showNotification(title, {
            body: body,
            icon: 'https://www.image2url.com/r2/default/images/1779571651731-ef0505ca-d444-480b-a9f9-11fb7fbd8317.png',
            tag: type || 'direct',
            renotify: true,
            vibrate: [100, 50, 100],
            badge: 'https://www.image2url.com/r2/default/images/1779571651731-ef0505ca-d444-480b-a9f9-11fb7fbd8317.png',
            data: { url: window.location.origin }
          } as any);
          return;
        }
      } catch (swErr) {
        console.log("ServiceWorker background notification skipped or unsupported here:", swErr);
      }
    }

    // 3. Fallback to standard local Notification UI
    try {
      const notif = new Notification(title, {
        body: body,
        icon: 'https://www.image2url.com/r2/default/images/1779571651731-ef0505ca-d444-480b-a9f9-11fb7fbd8317.png',
        tag: type || 'direct',
        renotify: true
      } as any);
      notif.onclick = () => {
        window.focus();
      };
    } catch (e) {
      console.log("Standard native notification skipped or blocked in this context", e);
    }
  }
}

const getApiUrl = (path: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  
  // Cache the origin if it's a real web URL (neither capacitor scheme nor localhost)
  if (typeof window !== 'undefined' && origin && origin.startsWith('http') && !origin.includes('localhost:')) {
    try {
      localStorage.setItem('cached_api_origin', origin);
    } catch (e) {}
  }

  const isCap = origin.startsWith('capacitor://') || 
                (origin.startsWith('http://localhost') && !origin.includes(':3000')) ||
                origin.includes('192.168.') ||
                (window as any).Capacitor;

  if (isCap) {
    let savedOrigin = '';
    try {
      savedOrigin = localStorage.getItem('cached_api_origin') || '';
    } catch (e) {}
    
    // Fallback to the live pre-production domain if no cached origin is available
    const base = savedOrigin || 'https://ais-pre-wlrbpf7khax3bie5zbm3fy-24605880583.europe-west2.run.app';
    return `${base}${path}`;
  }
  return path;
};

// --- Types ---
import { Ad, UserProfile, Conversation, Message } from './types';

// --- Components ---

// --- Helper Functions ---

async function compressImage(base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
  });
}

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174.66, ctx.currentTime); // D6
    
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    
    gain2.gain.setValueAtTime(0.04, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc1.start();
    osc2.start();
    
    osc1.stop(ctx.currentTime + 0.5);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}

function ScreenHeader({ title, subtitle, onBack, action }: { title: string; subtitle?: string; onBack?: () => void; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-border/40">
      <div className="flex items-center gap-3">
        {onBack && (
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={onBack} 
            className="p-2 bg-brand-muted hover:bg-brand-border/40 border border-brand-border/60 rounded-xl text-brand-primary transition-all duration-300 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        )}
        <div className="text-right">
          <h2 className="text-xl font-serif font-bold text-brand-primary tracking-tight leading-none">{title}</h2>
          {subtitle && <p className="text-[10px] text-brand-secondary opacity-60 font-medium tracking-wide mt-1.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Toggle({ enabled, onChange, label, description, icon: Icon }: any) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-brand-border/40 last:border-0">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
          enabled ? "bg-brand-primary/10 text-brand-primary" : "bg-brand-muted text-brand-secondary opacity-30"
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-right">
          <h4 className="text-sm font-bold text-brand-primary">{label}</h4>
          {description && <p className="text-[10px] text-brand-secondary opacity-60 leading-tight mt-0.5">{description}</p>}
        </div>
      </div>
      <button 
        type="button"
        onClick={() => onChange(!enabled)}
        className={cn(
          "w-12 h-6 rounded-full transition-all relative p-1 shrink-0",
          enabled ? "bg-brand-primary" : "bg-brand-muted"
        )}
      >
        <motion.div 
          animate={{ x: enabled ? 24 : 0 }}
          className="w-4 h-4 bg-white rounded-full shadow-md"
        />
      </button>
    </div>
  );
}

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, children, confirmText = "تأكيد", cancelText = "إلغاء", isDestructive = false, type = "danger" }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl space-y-6"
      >
        <div className="space-y-2 text-center">
          <h3 className="text-xl font-serif font-bold text-brand-primary">{title}</h3>
          {message && <p className="text-sm text-brand-secondary leading-relaxed">{message}</p>}
        </div>
        
        {children}

        <div className="flex flex-col gap-2 pt-4">
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={cn(
              "w-full py-4 rounded-2xl font-bold transition-all active:scale-95",
              type === "info" ? "bg-brand-primary text-white" : "bg-red-500 text-white shadow-lg shadow-red-500/20"
            )}
          >
            {confirmText}
          </button>
          <button 
            onClick={onClose}
            className="w-full py-4 rounded-2xl font-bold text-brand-secondary hover:bg-brand-muted transition-all"
          >
            {cancelText}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const CATEGORIES = [
  { id: 'electronics', label: 'إلكترونيات', icon: '📱' },
  { id: 'cars', label: 'سيارات', icon: '🚗' },
  { id: 'furniture', label: 'أثاث', icon: '🛋️' },
  { id: 'fashion', label: 'ملابس وأناقة', icon: '✨' },
  { id: 'realestate', label: 'عقارات', icon: '🏢' },
  { id: 'services', label: 'خدمات وأعمال', icon: '💼' },
];

const CITIES = ['الكل', 'بغداد', 'البصرة', 'الموصل', 'أربيل', 'النجف', 'كربلاء', 'كركوك', 'الناصرية', 'السليمانية'];

const SORT_OPTIONS = [
  { id: 'newest', label: 'الأحدث أولاً' },
  { id: 'price_asc', label: 'السعر: من الأقل' },
  { id: 'price_desc', label: 'السعر: من الأعلى' },
];

const CONDITIONS = [
  { id: 'new', label: 'جديد' },
  { id: 'excellent', label: 'مستعمل كأنه جديد' },
  { id: 'good', label: 'مستعمل بحالة جيدة' },
  { id: 'fair', label: 'مستعمل مقبول' },
];

// --- Caching for Chat List ---
const userCache: Record<string, any> = {};
const adCache: Record<string, any> = {};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'home' | 'details' | 'create' | 'profile' | 'sellerProfile' | 'chats' | 'chatroom' | 'myAds' | 'notifications' | 'blocks' | 'favorites' | 'about' | 'admin'>('home');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [appInitializing, setAppInitializing] = useState(true);

  const isPopStateRef = useRef(false);

  // Keep navigation details in a ref to bypass closure stumbles in Capacitor back-button callback
  const navStateRef = useRef({ view, selectedAd, viewingProfileId, activeChat });
  useEffect(() => {
    navStateRef.current = { view, selectedAd, viewingProfileId, activeChat };
  }, [view, selectedAd, viewingProfileId, activeChat]);

  // Handle Capacitor app-level Back Button specifically for Android APK/AAB installation
  useEffect(() => {
    let active = true;
    let listenerHandle: any = null;

    const setupCapacitorBack = async () => {
      const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor;
      if (!isCapacitor) return;

      try {
        const { App } = await import('@capacitor/app');
        if (!active) return;

        listenerHandle = await App.addListener('backButton', () => {
          const state = navStateRef.current;
          
          // Check if we are at the homepage with no details/chat modules overlaid
          const isAtHomeBase = state.view === 'home' && 
                               !state.selectedAd && 
                               !state.viewingProfileId && 
                               !state.activeChat;

          if (isAtHomeBase) {
            // Safe system exit if they press Back while fully at Home Screen
            App.exitApp();
          } else {
            // Naturally bubble back inside history states
            window.history.back();
          }
        });
      } catch (err) {
        console.error("Capacitor BackButton Listener initialization error:", err);
      }
    };

    setupCapacitorBack();

    return () => {
      active = false;
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, []);

  // Helper to go back natively or fallback to standard state transition
  const goBack = (defaultView: 'home' | 'details' | 'create' | 'profile' | 'sellerProfile' | 'chats' | 'chatroom' | 'myAds' | 'notifications' | 'blocks' | 'favorites' | 'admin' = 'home') => {
    if (typeof window !== 'undefined' && window.history.state && window.history.length > 1) {
      window.history.back();
    } else {
      setView(defaultView);
      if (defaultView === 'home') {
        setSelectedAd(null);
        setViewingProfileId(null);
        setActiveChat(null);
      }
    }
  };

  // Synchronize dynamic browser URL/state history to prevent hard-exits 
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({
        view: 'home',
        selectedAd: null,
        viewingProfileId: null,
        activeChat: null
      }, '');
    }
  }, []);

  // Ask for notification permission automatically on first app load (first open)
  useEffect(() => {
    const checkAndPromptNotifications = async () => {
      if (typeof window === 'undefined') return;
      
      const hasPrompted = localStorage.getItem('souqiraq_notif_prompted');
      if (!hasPrompted) {
        // Trigger notification permission dialog from the browser/OS System overlay
        await requestNativeNotificationPermission();
        localStorage.setItem('souqiraq_notif_prompted', 'true');
      }
    };
    
    // Tiny delay to allow initial components to fully mount and paint
    const timer = setTimeout(() => {
      checkAndPromptNotifications();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // If the state change is from a back/forward browser action, don't write to history
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }

    const currentHistoryState = window.history.state;
    const isDuplicate = currentHistoryState && 
      currentHistoryState.view === view &&
      (currentHistoryState.selectedAd?.id === selectedAd?.id) &&
      currentHistoryState.viewingProfileId === viewingProfileId &&
      (currentHistoryState.activeChat?.id === activeChat?.id);

    if (isDuplicate) return;

    // Build plain, serializable state backups (removing complex dates/class methods from Firestore)
    const safeSelectedAd = selectedAd ? {
      id: selectedAd.id,
      title: selectedAd.title,
      description: selectedAd.description,
      price: selectedAd.price,
      category: selectedAd.category,
      condition: selectedAd.condition,
      images: selectedAd.images,
      location: selectedAd.location,
      sellerId: selectedAd.sellerId,
      sellerName: selectedAd.sellerName,
      contactMethod: selectedAd.contactMethod,
      whatsappNumber: selectedAd.whatsappNumber,
      status: selectedAd.status,
      isFeatured: selectedAd.isFeatured,
      watchers: selectedAd.watchers
    } : null;

    const safeActiveChat = activeChat ? {
      id: activeChat.id,
      participants: activeChat.participants,
      adId: activeChat.adId,
      adTitle: activeChat.adTitle,
      adImage: activeChat.adImage,
      lastMessage: activeChat.lastMessage,
      unreadCount: activeChat.unreadCount,
      typing: activeChat.typing,
      otherUser: activeChat.otherUser
    } : null;

    window.history.pushState({
      view,
      selectedAd: safeSelectedAd,
      viewingProfileId,
      activeChat: safeActiveChat
    }, '');
  }, [view, selectedAd, viewingProfileId, activeChat]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state) {
        isPopStateRef.current = true;
        if (state.view) setView(state.view);
        setSelectedAd(state.selectedAd);
        setViewingProfileId(state.viewingProfileId);
        setActiveChat(state.activeChat);
      } else {
        // Fallback to initial home
        isPopStateRef.current = true;
        setView('home');
        setSelectedAd(null);
        setViewingProfileId(null);
        setActiveChat(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    // Fail-safe auto timeout to ensure the loading screen fades out after 3.5 seconds max
    const failSafeTimer = setTimeout(() => {
      setAppInitializing(false);
    }, 3500);

    const minTimer = setTimeout(() => {
      if (!loading) {
        setAppInitializing(false);
      }
    }, 2500);

    return () => {
      clearTimeout(failSafeTimer);
      clearTimeout(minTimer);
    };
  }, [loading]);

  useEffect(() => {
    if (!loading) {
      const waitTimer = setTimeout(() => {
        setAppInitializing(false);
      }, 700);
      return () => clearTimeout(waitTimer);
    }
  }, [loading]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeCondition, setActiveCondition] = useState<string | null>(null);
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc'>('newest');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallButton(false);
    }
  };

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [toast, setToast] = useState<{ title: string; body: string; type?: string; data?: any } | null>(null);
  const [lastNotificationId, setLastNotificationId] = useState<string | null>(null);

  // Helper for notifications
  const createNotification = async (userId: string, title: string, message: string, type: string, data: any = {}) => {
    try {
      const recipientSnap = await getDoc(doc(db, 'users', userId));
      if (!recipientSnap.exists()) return;
      
      const recipientData = recipientSnap.data() as UserProfile;
      const prefs = recipientData.notificationPrefs || {
        newListings: true,
        priceDrops: true,
        messages: true,
        offers: true
      };

      // Map internal types to preferences
      let shouldNotify = true;
      if (type === 'chat' && !prefs.messages) shouldNotify = false;
      if (type === 'offer' && !prefs.offers) shouldNotify = false;
      if (type === 'ad' && !prefs.newListings) shouldNotify = false;
      if (type === 'price' && !prefs.priceDrops) shouldNotify = false;
      if (type === 'comment' && !prefs.messages) shouldNotify = false; // Group comments with messages
      if (type === 'sale' && !prefs.messages) shouldNotify = false; // Group sale news with general messages

      if (!shouldNotify) {
        console.log(`Notification of type ${type} suppressed for user ${userId} by preferences.`);
        return;
      }

      // 1. Create In-App Notification
      await addDoc(collection(db, 'notifications'), {
        userId,
        title,
        message,
        type,
        data,
        read: false,
        createdAt: serverTimestamp()
      });

      // 2. Send Push Notification if token exists
      if (recipientData.fcmToken) {
        try {
          await fetch(getApiUrl('/api/notifications/send'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: recipientData.fcmToken,
              title,
              body: message,
              data
            })
          });
        } catch (pushErr) {
          console.warn('Push notification delivery skipped or not configured in this environment:', pushErr);
        }
      }
    } catch (e) {
      console.error('Error creating notification:', e);
    }
  };

  // Monitor blocked users
  useEffect(() => {
    if (!user) {
      setBlockedUsers([]);
      return;
    }
    const q = collection(db, 'users', user.uid, 'blocks');
    return onSnapshot(q, (snapshot) => {
      setBlockedUsers(snapshot.docs.map(doc => doc.id));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/blocks`);
    });
  }, [user]);

  // Monitor favorites
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    const q = collection(db, 'users', user.uid, 'favorites');
    return onSnapshot(q, (snapshot) => {
      setFavorites(snapshot.docs.map(doc => doc.data().adId));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/favorites`);
    });
  }, [user]);

  const toggleFavorite = async (adId: string) => {
    if (!user) {
      // Prompt login or similar
      return;
    }
    const isFavorited = favorites.includes(adId);
    const favRef = doc(db, 'users', user.uid, 'favorites', adId);
    const adRef = doc(db, 'ads', adId);

    try {
      if (isFavorited) {
        await deleteDoc(favRef);
        await updateDoc(adRef, {
          watchers: arrayRemove(user.uid)
        });
      } else {
        await setDoc(favRef, {
          adId,
          createdAt: serverTimestamp()
        });
        await updateDoc(adRef, {
          watchers: arrayUnion(user.uid)
        });
      }
    } catch (e) {
      handleFirestoreError(e, isFavorited ? OperationType.DELETE : OperationType.WRITE, `users/${user.uid}/favorites/${adId}`);
    }
  };

  // Monitor unread notifications and show toast
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', user.uid), 
      where('read', '==', false),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadNotifications(snapshot.size);
      
      if (!snapshot.empty) {
        const notif = snapshot.docs[0];
        const data = notif.data();
        
        // Prevent showing toast for old notifications on mount
        if (!lastNotificationId) {
          setLastNotificationId(notif.id);
          return;
        }

        if (notif.id !== lastNotificationId) {
          setLastNotificationId(notif.id);
          
          // Don't show toast if user is already in the specific chat
          if (data.type === 'chat' && view === 'chatroom' && activeChat?.id === data.data?.chatId) {
            return;
          }

          setToast({ 
            title: data.title, 
            body: data.message, 
            type: data.type,
            data: data.data 
          });
          setTimeout(() => setToast(null), 6000);
          
          playNotificationSound();
          triggerNativeNotification(data.title, data.message, data.type);
          if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });
    return () => unsubscribe();
  }, [user, view, activeChat?.id, lastNotificationId]);

  // Monitor chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }
    const q = query(
      collection(db, 'chats'), 
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc')
    );
    
    return onSnapshot(q, async (snapshot) => {
      const chatList = await Promise.all(snapshot.docs.map(async (chatDoc) => {
        const data = chatDoc.data() as Conversation;
        const otherUserId = data.participants.find(p => p !== user.uid);
        let otherUser = { displayName: 'مستخدم', photoURL: '' };
        let adImage = '';
        
        const fetchData = async () => {
          if (otherUserId) {
            if (userCache[otherUserId]) {
              otherUser = userCache[otherUserId];
            } else {
              const userSnap = await getDoc(doc(db, 'users', otherUserId));
              if (userSnap.exists()) {
                const userData = userSnap.data();
                otherUser = { displayName: userData.displayName, photoURL: userData.photoURL };
                userCache[otherUserId] = otherUser;
              }
            }
          }
          
          if (data.adId) {
            if (adCache[data.adId]) {
              adImage = adCache[data.adId];
            } else {
              const adSnap = await getDoc(doc(db, 'ads', data.adId));
              if (adSnap.exists()) {
                adImage = adSnap.data().images?.[0] || '';
                adCache[data.adId] = adImage;
              }
            }
          }
        };

        await fetchData();
        
        return { id: chatDoc.id, ...data, otherUser, adImage } as Conversation;
      }));
      setChats(chatList);

      const totalUnread = snapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        return acc + (data.unreadCount?.[user.uid] || 0);
      }, 0);
      setUnreadMessagesCount(totalUnread);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });
  }, [user]);

  // --- Auth & Profile ---
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const newProfile = {
            displayName: u.displayName || 'مستخدم جديد',
            photoURL: u.photoURL || '',
            email: u.email || '',
            createdAt: serverTimestamp(),
            notificationPrefs: {
              newListings: true,
              priceDrops: true,
              messages: true,
              offers: true
            },
            favoriteCategories: []
          };
          await setDoc(userRef, newProfile);
          setProfile(newProfile as any);
        } else {
          const data = userSnap.data();
          let needsUpdate = false;
          if (!data.notificationPrefs) {
            data.notificationPrefs = {
              newListings: true,
              priceDrops: true,
              messages: true,
              offers: true
            };
            needsUpdate = true;
          }
          if (!data.favoriteCategories) {
            data.favoriteCategories = [];
            needsUpdate = true;
          }
          if (needsUpdate) {
            await updateDoc(userRef, { 
              notificationPrefs: data.notificationPrefs,
              favoriteCategories: data.favoriteCategories 
            });
          }
          setProfile(data as UserProfile);
        }

        // --- FCM Registration ---
        if (messaging && typeof window !== 'undefined' && 'Notification' in window) {
          try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              const token = await getToken(messaging, {
                vapidKey: (import.meta as any).env.VITE_VAPID_KEY
              });
              if (token) {
                await updateDoc(userRef, { fcmToken: token });
                console.log('FCM Token registered');
              }
            }
          } catch (error) {
            console.log('Notification registration did not run because of environment restrictions:', error);
          }
        }
      } else {
        setProfile(null);
      }
    });
  }, []);

  // Listen for foreground messages
  useEffect(() => {
    if (messaging) {
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground message received:', payload);
        if (payload.notification) {
          setToast({ 
            title: payload.notification.title || 'إشعار جديد', 
            body: payload.notification.body || '' 
          });
          setTimeout(() => setToast(null), 5000);
          playNotificationSound();
          triggerNativeNotification(payload.notification.title || 'إشعار جديد', payload.notification.body || '');
          if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const handleLogin = () => {
    setShowLoginModal(true);
  };

  const loginWithGoogle = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const userAgentLower = userAgent.toLowerCase();
    
    // Comprehensive check for APKs, embedded WebViews, Capacitor, Cordova, and non-standard browser environments
    const isCapacitorOrWebView = 
      origin.startsWith('capacitor://') || 
      origin.startsWith('https://localhost') || 
      (origin.startsWith('http://localhost') && !origin.includes(':3000')) ||
      origin.includes('192.168.') ||
      (window as any).Capacitor ||
      (window as any).cordova ||
      (typeof window !== 'undefined' && window.location.protocol === 'file:') ||
      userAgentLower.includes('wv') ||
      userAgentLower.includes('webview') ||
      (userAgentLower.includes('android') && userAgentLower.includes('version/')) ||
      // FBAN/FBAV are Facebook app webviews which also block popups
      userAgentLower.includes('fban') ||
      userAgentLower.includes('fbav');

    if (isCapacitorOrWebView) {
      setToast({
        title: 'تنويّه هام لمستخدمي التطبيق المحمول 📱',
        body: 'جوجل تمنع تسجيل الدخول العادي بـ Google داخل تطبيقات الـ APK ما لم يتم تفعيل Google Sign-In الأصلي وربط بصمة الـ SHA-1 لتوقيع تطبيقك بـ Firebase Console. يرجى استخدام البريد الإلكتروني/الهاتف أو النقر على "دخول فوري بحساب تجريبي" بالأسفل للاستخدام المباشر.'
      });
      setTimeout(() => setToast(null), 12000);
      throw new Error('CAPACITOR_GOOGLE_AUTH_BLOCKED');
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      await signInWithPopup(auth, provider);
      setShowLoginModal(false);
    } catch (error: any) {
      console.error('Login failed', error);
      
      let errorMessage = 'حدث خطأ غير متوقع أثناء تسجيل الدخول.';
      let errorTitle = 'خطأ في تسجيل الدخول';

      if (error.code === 'auth/popup-closed-by-user') {
        errorTitle = 'فشل تسجيل الدخول';
        errorMessage = 'تم إغلاق نافذة تسجيل الدخول قبل اكتمال العملية. يرجى المحاولة مرة أخرى.';
      } else if (error.code === 'auth/cancelled-by-user') {
        errorTitle = 'تم الإلغاء';
        errorMessage = 'تم إلغاء عملية تسجيل الدخول.';
      } else if (error.code === 'auth/popup-blocked') {
        errorTitle = 'تم حظر النافذة المنبثقة';
        errorMessage = 'قام المتصفح بحظر نافذة تسجيل الدخول. يرجى السماح بالنوافذ المنبثقة (Popups) لهذا الموقع.';
      } else if (error.code === 'auth/operation-not-supported-in-this-environment' || error.message?.includes('not supported')) {
        errorTitle = 'البيئة غير مدعومة';
        errorMessage = 'لا يمكن فتح نافذة Google المنبثقة داخل التطبيق. يرجى استخدام الدخول المباشر بالبريد أو رقم الهاتف.';
      }

      setToast({
        title: errorTitle,
        body: errorMessage
      });
      setTimeout(() => setToast(null), 5000);
      throw error;
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => {
    signOut(auth);
    setShowLogoutConfirm(false);
    setView('home');
  };

  // --- Data Fetching ---
  useEffect(() => {
    setLoading(true);
    let q = query(collection(db, 'ads'), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(20));
    
    if (activeCategory) {
      q = query(collection(db, 'ads'), where('status', '==', 'active'), where('category', '==', activeCategory), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const adsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Ad[];
      setAds(adsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ads');
    });

    return () => unsubscribe();
  }, [activeCategory, refreshCounter]);

  const handleRefresh = async () => {
    setLoading(true);
    setRefreshCounter(prev => prev + 1);
    // Wait minimum 1200ms for premium pull animation display integrity
    await new Promise(resolve => setTimeout(resolve, 1200));
  };

  const filteredAds = useMemo(() => {
    let result = ads.filter(ad => {
      const matchesSearch = ad.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           ad.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCondition = activeCondition ? ad.condition === activeCondition : true;
      const matchesCity = activeCity && activeCity !== 'الكل' ? ad.location.city === activeCity : true;
      const notBlocked = !user || !blockedUsers.includes(ad.sellerId);
      return matchesSearch && matchesCondition && matchesCity && notBlocked;
    });

    // Sorting
    return [...result].sort((a, b) => {
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      // Default to newest
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }, [ads, searchQuery, activeCondition, activeCity, sortBy, blockedUsers, user]);

  const filteredChats = useMemo(() => {
    if (!user) return [];
    return chats.filter(chat => {
      const otherId = chat.participants.find((p: string) => p !== user.uid);
      return !blockedUsers.includes(otherId);
    });
  }, [chats, blockedUsers, user]);

  // --- View Helpers ---
  const showAdDetails = (ad: Ad) => {
    setSelectedAd(ad);
    setView('details');
  };

  const startChat = async (ad: Ad) => {
    if (!user) {
      handleLogin();
      return;
    }
    if (user.uid === ad.sellerId) return;

    try {
      // Check if chat already exists by querying chats where user is participant,
      // then filtering by adId in-memory to bypass Firebase composite index rules.
      const chatsRef = collection(db, 'chats');
      const q = query(
        chatsRef, 
        where('participants', 'array-contains', user.uid)
      );
      const snap = await getDocs(q);
      
      const existingDoc = snap.docs.find(doc => doc.data().adId === ad.id);
      
      let chat: Conversation;
      if (existingDoc) {
        chat = { id: existingDoc.id, ...existingDoc.data() } as Conversation;
      } else {
        const newChat: Omit<Conversation, 'id'> = {
          participants: [user.uid, ad.sellerId],
          adId: ad.id,
          adTitle: ad.title,
          lastMessage: 'بدء المحادثة',
          lastMessageAt: serverTimestamp(),
          unreadCount: {
            [user.uid]: 0,
            [ad.sellerId]: 0
          },
        };
        const docRef = await addDoc(collection(db, 'chats'), newChat);
        chat = { id: docRef.id, ...newChat } as Conversation;
      }
      
      setActiveChat(chat);
      setView('chatroom');
    } catch (error) {
      console.error("Error creating/navigating to chat:", error);
      alert("عذراً، حدث خطأ أثناء فتح المحادثة. الرجاء المحاولة مجدداً.");
    }
  };

  const startSupportChat = async () => {
    if (!user) {
      handleLogin();
      return;
    }
    try {
      const chatsRef = collection(db, 'chats');
      const q = query(
        chatsRef, 
        where('participants', 'array-contains', user.uid)
      );
      const snap = await getDocs(q);
      
      const existingDoc = snap.docs.find(doc => {
        const data = doc.data();
        return data.adId === 'support' && data.participants.includes('admin_support');
      });
      
      let chat: Conversation;
      if (existingDoc) {
        chat = { id: existingDoc.id, ...existingDoc.data() } as Conversation;
      } else {
        const newChat: Omit<Conversation, 'id'> = {
          participants: [user.uid, 'admin_support'],
          adId: 'support',
          adTitle: 'الدعم الفني والشكاوى 🛠️',
          lastMessage: 'أهلاً بك في الدعم الفني لسوق الرافدين 🇮🇶. تفضل بطرح سؤالك!',
          lastMessageAt: serverTimestamp(),
          unreadCount: {
            [user.uid]: 0,
            'admin_support': 1
          },
        };
        const docRef = await addDoc(collection(db, 'chats'), newChat);
        chat = { id: docRef.id, ...newChat } as Conversation;
        
        await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
          senderId: 'admin_support',
          text: 'أهلاً بك في الدعم الفني لسوق الرافدين 🇮🇶. نحن هنا لمساعدتك والإجابة على استفساراتك وحل أي مشكلة تواجهها. تفضل بطرح سؤالك!',
          read: false,
          createdAt: serverTimestamp()
        });
      }
      
      setActiveChat(chat);
      setView('chatroom');
    } catch (error) {
      console.error("Error starting support chat:", error);
      alert("عذراً، حدث خطأ أثناء فتح الدعم. الرجاء المحاولة مجدداً.");
    }
  };

  const markAsSold = async () => {
    if (!selectedAd || !user || selectedAd.sellerId !== user.uid) return;
    try {
      await updateDoc(doc(db, 'ads', selectedAd.id), { status: 'sold' });
      setSelectedAd({ ...selectedAd, status: 'sold' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ads/${selectedAd.id}`);
    }
  };

  // --- UI Renderers ---
  return (
    <>
      <AnimatePresence>
        {appInitializing && (
          <motion.div
            key="app-loading-screensplash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
            className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-gradient-to-b from-[#0d1527] via-[#080d1a] to-[#04060d] text-white p-6 select-none"
          >
            <div className="flex flex-col items-center max-w-sm w-full text-center space-y-7">
              {/* Dynamic Floating Golden Logo Icon */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [0.9, 1.05, 1], opacity: 1 }}
                transition={{ duration: 1.6, ease: "easeOut", times: [0, 0.6, 1] }}
                className="relative"
              >
                <div className="absolute inset-0 bg-yellow-500/15 blur-3xl rounded-full w-36 h-36 animate-pulse mx-auto -translate-y-4" />
                <div className="w-24 h-24 bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 p-[2px] rounded-3xl shadow-3xl shadow-amber-500/10">
                  <div className="w-full h-full bg-[#090e1f] rounded-[22px] flex items-center justify-center">
                    <Sparkles className="w-12 h-12 text-yellow-400 animate-pulse" />
                  </div>
                </div>
              </motion.div>

              {/* Title & Slogan */}
              <div className="space-y-3.5">
                <motion.h2 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.8 }}
                  className="text-4xl lg:text-5xl font-serif font-black tracking-widest bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent"
                >
                  سوق الرافدين
                </motion.h2>
                
                <motion.p
                  initial={{ y: 15, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.55, duration: 0.8 }}
                  className="text-xs font-serif text-[#94a3b8] tracking-[0.3em] uppercase leading-relaxed font-bold"
                >
                  بوابتك الرقمية للبيع والشراء الفوري 🛒
                </motion.p>
              </div>

              {/* Indefinite progress line loader */}
              <div className="w-48 h-[2.5px] bg-white/10 rounded-full overflow-hidden relative mt-2">
                <motion.div 
                  initial={{ left: '-100%' }}
                  animate={{ left: '100%' }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-amber-400 to-transparent"
                />
              </div>

              {/* Secure footer text */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                transition={{ delay: 1.1, duration: 1 }}
                className="text-[9px] font-sans tracking-[0.2em] opacity-40 uppercase pt-20"
              >
                سياسة البيانات آمنة ومحمية 100% 🇮🇶
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen pb-20 flex flex-col w-full bg-brand-bg relative overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-brand-border px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black flex items-center justify-center rounded-sm">
              <span className="text-white text-sm font-serif font-black">ر</span>
            </div>
            <h1 className="text-lg font-black tracking-tighter text-black uppercase">الرافدين</h1>
          </div>
          
          <div className="flex-1" />

          {user && (
            <button 
              onClick={() => setView('notifications')}
              className="px-3 py-1.5 mr-2 text-[10px] font-black uppercase tracking-widest text-[#111] hover:bg-brand-muted rounded-md relative transition-all"
            >
              الإشعارات {unreadNotifications > 0 && `(${unreadNotifications})`}
            </button>
          )}

          {user ? (
            <button 
              onClick={() => setView('profile')}
              className="w-10 h-10 rounded-full overflow-hidden border border-brand-border shrink-0 hover:border-brand-primary transition-colors"
            >
              {profile?.photoURL || user.photoURL ? (
                <img src={profile?.photoURL || user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                  <User className="text-gray-400 w-5 h-5" />
                </div>
              )}
            </button>
          ) : (
            <button 
              onClick={handleLogin}
              className="text-sm font-medium bg-brand-primary text-white px-4 py-2 rounded-full hover:bg-brand-primary/90 transition-colors"
            >
              دخول
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <HomeView 
              activeCategory={activeCategory} 
              setActiveCategory={setActiveCategory}
              activeCondition={activeCondition}
              setActiveCondition={setActiveCondition}
              activeCity={activeCity}
              setActiveCity={setActiveCity}
              sortBy={sortBy}
              setSortBy={setSortBy}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              ads={filteredAds}
              loading={loading}
              onAdClick={showAdDetails}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              onRefresh={handleRefresh}
              setView={setView}
            />
          )}

          {view === 'create' && (
            <CreateAdView 
              user={user} 
              onClose={() => goBack('home')} 
              onSuccess={() => goBack('home')} 
              createNotification={createNotification}
              onViewSupport={startSupportChat}
            />
          )}

          {view === 'details' && selectedAd && (
            <AdDetailsView 
              ad={selectedAd} 
              onBack={() => goBack('home')} 
              onStartChat={() => startChat(selectedAd)}
              currentUser={user}
              profile={profile}
              blockedUsers={blockedUsers}
              createNotification={createNotification}
              isFavorited={favorites.includes(selectedAd.id)}
              onToggleFavorite={() => toggleFavorite(selectedAd.id)}
              onViewProfile={(sellerId: string) => {
                setViewingProfileId(sellerId);
                setView('sellerProfile');
              }}
            />
          )}

          {view === 'sellerProfile' && viewingProfileId && (
            <SellerProfileView 
              userId={viewingProfileId}
              onBack={() => {
                if (viewingProfileId === user?.uid) {
                  goBack('profile');
                } else {
                  goBack('details');
                }
              }}
              onAdClick={showAdDetails}
              onStartChat={(ad: Ad) => startChat(ad)}
              currentUser={user}
              onLogin={handleLogin}
              createNotification={createNotification}
            />
          )}


          {view === 'myAds' && user && (
            <MyAdsView 
              user={user}
              onBack={() => goBack('profile')}
              onAdClick={showAdDetails}
              createNotification={createNotification}
              onViewSupport={startSupportChat}
            />
          )}

          {view === 'favorites' && user && (
            <FavoritesView 
              favorites={favorites}
              onBack={() => goBack('home')}
              onAdClick={showAdDetails}
              onToggleFavorite={toggleFavorite}
            />
          )}

          {view === 'notifications' && user && (
            <NotificationsView 
              onBack={() => goBack('profile')} 
              onNavigate={(v: any, data: any) => {
                if (v === 'chatroom') {
                  const chat = chats.find(c => c.id === data);
                  if (chat) {
                    setActiveChat(chat);
                    setView('chatroom');
                  }
                }
              }}
            />
          )}

          {view === 'blocks' && user && (
            <BlockedUsersView 
              user={user} 
              blockedUsers={blockedUsers}
              onBack={() => goBack('profile')} 
            />
          )}

          {view === 'profile' && user && (
            <ProfileView 
              user={user} 
              profile={profile}
              setProfile={setProfile}
              setUser={setUser}
              blockedUsers={blockedUsers}
              unreadNotifications={unreadNotifications}
              onLogout={handleLogout}
              onBack={() => goBack('home')}
              onViewMyAds={() => setView('myAds')}
              onViewNotifications={() => setView('notifications')}
              onViewBlocked={() => setView('blocks')}
              onViewFavorites={() => setView('favorites')}
              showInstallButton={showInstallButton}
              onInstall={handleInstallClick}
              setToast={setToast}
              onViewAbout={() => setView('about')}
              onViewAdmin={() => setView('admin')}
              onViewSupport={startSupportChat}
            />
          )}

          {view === 'chats' && user && (
            <ChatListView 
              user={user}
              onChatSelect={(chat: Conversation) => {
                setActiveChat(chat);
                setView('chatroom');
              }}
              chats={filteredChats}
            />
          )}

          {view === 'chatroom' && user && activeChat && (
            <ChatRoomView 
              user={user}
              chat={activeChat}
              onBack={() => goBack('chats')}
              blockedUsers={blockedUsers}
              createNotification={createNotification}
            />
          )}

          {view === 'about' && (
            <AboutUsView 
              onBack={() => goBack('profile')} 
            />
          )}

          {view === 'admin' && user && (
            <AdminView 
              user={user} 
              onBack={() => goBack('profile')} 
              setToast={setToast}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Bar */}
          <nav className="fixed bottom-0 left-0 right-0 w-full bg-white/90 backdrop-blur-xl border-t border-brand-border py-4 px-6 flex justify-center items-center z-40 lg:px-20 lg:py-6 shadow-sm">
        <div className="flex justify-between items-center w-full max-w-md lg:max-w-xl mx-auto">
          <NavButton active={view === 'home'} onClick={() => setView('home')} icon={<Home />} label="الرئيسية" />
          <div className="relative">
            <NavButton active={view === 'chats'} onClick={() => user ? setView('chats') : handleLogin()} icon={<MessageSquare />} label="الرسائل" />
            {unreadMessagesCount > 0 && (
              <span className="absolute top-0 right-1/2 translate-x-4 w-5 h-5 bg-black text-white text-[10px] flex items-center justify-center rounded-full font-bold border-2 border-white shadow-sm z-50 pointer-events-none animate-bounce">
                {unreadMessagesCount > 9 ? '+9' : unreadMessagesCount}
              </span>
            )}
          </div>
          <motion.button 
            onClick={() => user ? setView('create') : handleLogin()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-5 py-2 bg-brand-primary text-white rounded-xl flex items-center justify-center gap-1 shadow-sm transition-all font-black text-[11px] uppercase tracking-wider"
          >
            <span>+ إعلان</span>
          </motion.button>
          <div className="relative">
            <NavButton active={view === 'profile'} onClick={() => user ? setView('profile') : handleLogin()} icon={<User />} label="حسابي" />
            {unreadNotifications > 0 && (
              <span className="absolute top-0 right-1/2 translate-x-4 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold border-2 border-white shadow-sm z-50 pointer-events-none animate-pulse">
                {unreadNotifications > 9 ? '+9' : unreadNotifications}
              </span>
            )}
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {showLogoutConfirm && (
          <LogoutConfirmModal 
            isOpen={showLogoutConfirm}
            onClose={() => setShowLogoutConfirm(false)}
            onConfirm={confirmLogout}
          />
        )}
        {showLoginModal && (
          <AuthModal 
            isOpen={showLoginModal}
            onClose={() => setShowLoginModal(false)}
            onGoogleLogin={loginWithGoogle}
          />
        )}
      </AnimatePresence>

      {/* Foreground Notification Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-20 left-1/2 z-[200] w-[calc(100%-2rem)] max-w-sm"
          >
            <div 
              onClick={() => {
                if (toast.type === 'chat' && toast.data?.chatId) {
                  const chat = chats.find(c => c.id === toast.data.chatId);
                  if (chat) {
                    setActiveChat(chat);
                    setView('chatroom');
                  }
                } else {
                  setView('notifications');
                }
                setToast(null);
              }}
              className="bg-white border-2 border-brand-primary p-4 rounded-[24px] shadow-2xl flex items-start gap-3 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                toast.type === 'chat' ? "bg-emerald-500/10" : 
                toast.type === 'offer' ? "bg-amber-500/10" : 
                toast.type === 'sale' ? "bg-blue-500/10" : "bg-brand-primary/10"
              )}>
                {toast.type === 'chat' ? <MessageSquare className="w-5 h-5 text-emerald-500" /> :
                 toast.type === 'offer' ? <CircleDollarSign className="w-5 h-5 text-amber-500" /> :
                 toast.type === 'sale' ? <ShoppingBag className="w-5 h-5 text-blue-500" /> :
                 <Bell className="w-5 h-5 text-brand-primary" />}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-brand-primary">{toast.title}</h4>
                <p className="text-xs text-brand-secondary line-clamp-2">{toast.body}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setToast(null); }} className="p-1 text-brand-secondary hover:bg-brand-muted rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}

// --- Chat Subviews ---

function ChatListView({ user, onChatSelect, chats }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mesh-bg min-h-screen px-6 pt-12 pb-24"
    >
      <div className="flex items-center justify-between mb-12">
        <div>
          <h2 className="text-4xl font-serif font-black text-brand-primary">الرسائل</h2>
          <p className="text-xs text-brand-secondary opacity-50 font-bold uppercase tracking-widest mt-1">المحادثات النشطة</p>
        </div>
        <div className="w-12 h-12 bg-white/50 backdrop-blur-xl border border-brand-border rounded-2xl flex items-center justify-center">
          <MessageCircle className="w-6 h-6 text-brand-primary" />
        </div>
      </div>
      
      {chats.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {chats.map((chat: any) => (
            <motion.button 
              key={chat.id}
              whileHover={{ x: -4, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onChatSelect(chat)}
              className="w-full flex items-center gap-5 bg-white p-5 rounded-[32px] border border-brand-border shadow-sm hover:shadow-brand-primary/10 transition-all text-right group relative"
            >
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-[22px] bg-brand-muted overflow-hidden border border-brand-border shadow-inner-grow">
                  {chat.otherUser?.photoURL ? (
                    <img src={chat.otherUser.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-brand-primary/5">
                      <User className="text-brand-primary/40 w-8 h-8" />
                    </div>
                  )}
                </div>
                {chat.adImage && (
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl border-2 border-white overflow-hidden shadow-lg rotate-6 group-hover:rotate-0 transition-transform duration-500">
                    <img src={chat.adImage} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-serif font-black text-brand-primary truncate">{chat.otherUser?.displayName}</span>
                    {(chat.unreadCount?.[user.uid] || 0) > 0 && (
                      <span className="w-2 h-2 bg-black rounded-full shadow-sm animate-pulse" />
                    )}
                  </div>
                  <span className="text-[9px] font-black text-brand-secondary opacity-40 uppercase tracking-tighter">
                    {chat.lastMessageAt?.toDate ? chat.lastMessageAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                  </span>
                </div>
                <p className={cn(
                  "text-sm truncate mb-2 leading-relaxed transition-colors",
                  chat.typing?.[chat.participants.find((p: string) => p !== user.uid) || ''] 
                    ? "text-emerald-600 font-bold"
                    : (chat.unreadCount?.[user.uid] || 0) > 0 ? "text-brand-primary font-bold" : "text-brand-secondary/70"
                )}>
                  {chat.typing?.[chat.participants.find((p: string) => p !== user.uid) || ''] ? (
                    <span className="flex items-center gap-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      يكتب الآن...
                    </span>
                  ) : chat.lastMessage}
                </p>
                <div className="flex items-center gap-1.5 opacity-40">
                  <ShoppingBag className="w-3 h-3 text-brand-primary" />
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-tighter truncate">{chat.adTitle}</p>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-2">
                <ChevronLeft className="w-5 h-5 text-brand-border group-hover:text-brand-primary transition-colors" />
                {(chat.unreadCount?.[user.uid] || 0) > 0 && (
                  <span className="px-2 py-0.5 bg-black text-white text-[10px] rounded-full font-black">
                    {chat.unreadCount[user.uid]}
                  </span>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-40 text-center opacity-30 grayscale">
          <div className="w-24 h-24 bg-brand-muted rounded-[40px] flex items-center justify-center mb-8">
            <MessageSquare className="w-10 h-10 text-brand-primary" />
          </div>
          <h3 className="text-xl font-serif font-bold text-brand-primary">لا توجد محادثات</h3>
          <p className="text-xs font-bold uppercase tracking-widest mt-2">ابدأ التسوق وتواصل مع البائعين</p>
        </div>
      )}
    </motion.div>
  );
}

function VoiceMessagePlayer({ audioUrl, isMe }: { audioUrl: string, isMe: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState('0:00');
  const [currentTime, setCurrentTime] = useState('0:00');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime('0:00');
    };
    
    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
        
        const curMins = Math.floor(audio.currentTime / 60);
        const curSecs = String(Math.floor(audio.currentTime % 60)).padStart(2, '0');
        setCurrentTime(`${curMins}:${curSecs}`);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        const mins = Math.floor(audio.duration / 60);
        const secs = String(Math.floor(audio.duration % 60)).padStart(2, '0');
        setDuration(`${mins}:${secs}`);
      }
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.pause();
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      document.querySelectorAll('audio').forEach(el => {
        if (el !== audioRef.current) el.pause();
      });
      audioRef.current.play().catch(e => console.error(e));
    }
  };

  return (
    <div className="flex items-center gap-3 py-1.5 px-1 min-w-[220px]">
      <button 
        type="button"
        onClick={togglePlay}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-none active:scale-90 shrink-0 bg-white/20 hover:bg-white/30 text-white"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-white" />
        ) : (
          <Play className="w-4 h-4 translate-x-0.5 text-white" />
        )}
      </button>
      
      <div className="flex-1 space-y-1">
        <div className="relative h-1 w-full bg-white/15 rounded-full overflow-hidden">
          <div 
            className="absolute top-0 bottom-0 left-0 transition-all duration-100 bg-white" 
            style={{ width: `${progress}%` }} 
          />
        </div>
        <div className="flex items-center justify-between text-[9px] font-bold text-white/70">
          <span>{isPlaying ? currentTime : duration}</span>
          <Mic className="w-3 h-3 opacity-60" />
        </div>
      </div>
    </div>
  );
}

function ChatRoomView({ user, chat, onBack, blockedUsers, createNotification }: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<any[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showOfferInput, setShowOfferInput] = useState(false);
  const [offerValue, setOfferValue] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          performSendMessage('رسالة صوتية', undefined, 'voice', base64Audio);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Recording error:', err);
      alert('يرجى السماح بالوصول إلى الميكروفون');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const handleSendOffer = () => {
    if (!offerValue || isNaN(Number(offerValue))) return;
    performSendMessage(`عرض شراء بقيمة ${Number(offerValue).toLocaleString()} د.ع`, undefined, 'offer', undefined, Number(offerValue));
    setShowOfferInput(false);
    setOfferValue('');
  };

  const handleOfferAction = async (messageId: string, status: 'accepted' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'chats', chat.id, 'messages', messageId), {
        offerStatus: status
      });
      const actionText = status === 'accepted' ? 'تم قبول العرض' : 'تم رفض العرض';
      performSendMessage(actionText);
    } catch (e) { console.error(e); }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً (الأقصى 2 ميجابايت)');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPendingImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
    if (force || isAtBottom) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  };
  const typingTimeoutRef = useRef<any>(null);

  const otherUserId = chat.participants.find((p: string) => p !== user.uid);
  const isBlocked = blockedUsers?.includes(otherUserId);
  const [isBlocking, setIsBlocking] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  const toggleBlockUser = async () => {
    if (!user || !otherUserId) return;
    
    setIsBlocking(true);
    try {
      const blockRef = doc(db, 'users', user.uid, 'blocks', otherUserId);
      if (isBlocked) {
        await deleteDoc(blockRef);
      } else {
        await setDoc(blockRef, {
          blockedUserId: otherUserId,
          createdAt: serverTimestamp()
        });
        onBack();
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/blocks/${otherUserId}`);
    } finally {
      setIsBlocking(false);
    }
  };

  useEffect(() => {
    // Reset unread counts for current user when entering chat
    const chatRef = doc(db, 'chats', chat.id);
    updateDoc(chatRef, {
      [`unreadCount.${user.uid}`]: 0
    }).catch(() => {});

    // Listen for typing status
    const unsubscribe = onSnapshot(chatRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const otherId = chat.participants.find((p: string) => p !== user.uid);
        if (otherId && data.typing) {
          setIsOtherTyping(!!data.typing[otherId]);
        }
      }
    });

    return () => {
      unsubscribe();
      // Set typing to false when leaving
      updateDoc(chatRef, {
        [`typing.${user.uid}`]: false
      }).catch(() => {});
    };
  }, [chat.id, user.uid]);

  // Optimized Mark as Read
  useEffect(() => {
    const unreadFromOther = messages.filter(m => m.senderId !== user.uid && !m.read);
    if (unreadFromOther.length > 0) {
      const markBatch = async () => {
        try {
          const batch = writeBatch(db);
          unreadFromOther.forEach(msg => {
            const msgRef = doc(db, 'chats', chat.id, 'messages', msg.id);
            batch.update(msgRef, { read: true });
          });
          await batch.commit();
        } catch (e) {
          console.error("Batch read status update failed", e);
        }
      };
      markBatch();
    }
  }, [messages, chat.id, user.uid]);

  useEffect(() => {
    const q = query(
        collection(db, 'chats', chat.id, 'messages'),
        orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[];
        setMessages(msgs);
        
        // Smarter optimistic clearing: only clear ones that have been "recognized" by the server via localId
        setOptimisticMessages(prev => prev.filter(om => 
          !msgs.some(m => m.localId === om.localId)
        ));
        
        // Scroll to bottom
        scrollToBottom();
    }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/messages`);
    });
    return () => unsubscribe();
  }, [chat.id]);

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    
    if (!isTyping) {
      setIsTyping(true);
      updateDoc(doc(db, 'chats', chat.id), {
        [`typing.${user.uid}`]: true
      }).catch(() => {});
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      updateDoc(doc(db, 'chats', chat.id), {
        [`typing.${user.uid}`]: false
      }).catch(() => {});
    }, 3000);
  };

  const performSendMessage = async (text: string, imageUrl?: string, type: 'text' | 'image' | 'voice' | 'offer' = 'text', audioUrl?: string, offerAmount?: number) => {
    if ((!text.trim() && !imageUrl && !audioUrl && !offerAmount) || sending || isBlocked) return;
    
    const otherUserId = chat.participants.find((p: string) => p !== user.uid);

    // Optimistic Update
    const tempId = Math.random().toString(36).substring(7);
    const optimisticMsg = {
      id: tempId,
      senderId: user.uid,
      text: text || '',
      imageUrl: imageUrl || null,
      audioUrl: audioUrl || null,
      type,
      offerAmount: offerAmount || null,
      offerStatus: type === 'offer' ? 'pending' : null,
      read: false,
      createdAt: { toDate: () => new Date() },
      isOptimistic: true,
      localId: tempId,
      localTimestamp: Date.now()
    };
    setOptimisticMessages(prev => [...prev, optimisticMsg]);
    
    setSending(true);
    if (type === 'text') setNewMessage('');
    
    // Smooth, responsive, instant scroll call
    scrollToBottom(true);

    try {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        const chatRef = doc(db, 'chats', chat.id);
        
        await updateDoc(chatRef, {
          [`typing.${user.uid}`]: false
        }).catch(() => {});
        
        const messagesCol = collection(db, 'chats', chat.id, 'messages');
        const messageData: any = {
            senderId: user.uid,
            text: text || '',
            imageUrl: imageUrl || null,
            audioUrl: audioUrl || null,
            type,
            read: false,
            createdAt: serverTimestamp(),
            localId: tempId,
            localTimestamp: Date.now()
        };

        if (type === 'offer') {
          messageData.offerAmount = offerAmount;
          messageData.offerStatus = 'pending';
        }

        await addDoc(messagesCol, messageData);

        let lastMsgDisplay = text;
        if (type === 'image') lastMsgDisplay = '📷 صورة';
        if (type === 'voice') lastMsgDisplay = '🎤 رسالة صوتية';
        if (type === 'offer') lastMsgDisplay = '💰 عرض شراء';

        await updateDoc(chatRef, {
            lastMessage: lastMsgDisplay,
            lastMessageAt: serverTimestamp(),
            [`unreadCount.${otherUserId}`]: increment(1)
        });

        if (otherUserId) {
          await createNotification(
            otherUserId, 
            type === 'offer' ? `عرض جديد من ${user.displayName}` : `مراسلة من ${user.displayName}`, 
            text || lastMsgDisplay, 
            type === 'offer' ? 'offer' : 'chat', 
            { chatId: chat.id }
          ).catch(() => {});
        }
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `chats/${chat.id}/messages`);
        setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
        setSending(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !pendingImage) return;

    const text = newMessage;
    const img = pendingImage;
    
    setNewMessage('');
    setPendingImage(null);

    await performSendMessage(text, img || undefined, img ? 'image' : 'text');
  };

  const quickReplies = [
    "سلام عليكم",
    "نعم متوفر",
    "كم السعر؟",
    "تم",
    "وين المكان؟",
    "ممكن صور أكثر؟",
    "متى أقدر أشوفه؟"
  ];

  const allMessages = useMemo(() => {
    return [...messages, ...optimisticMessages].sort((a, b) => {
      const getTimestamp = (msg: any) => {
        if (msg.createdAt) {
          if (typeof msg.createdAt.toDate === 'function') {
            return msg.createdAt.toDate().getTime();
          }
          if (msg.createdAt instanceof Date) {
            return msg.createdAt.getTime();
          }
          if (typeof msg.createdAt === 'number') {
            return msg.createdAt;
          }
          const parsed = new Date(msg.createdAt).getTime();
          if (!isNaN(parsed)) return parsed;
        }
        if (msg.localTimestamp) {
          return msg.localTimestamp;
        }
        return Date.now();
      };
      return getTimestamp(a) - getTimestamp(b);
    });
  }, [messages, optimisticMessages]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 1.02 }}
      className="fixed inset-0 z-50 bg-[#fafafa] flex flex-col md:max-w-2xl md:mx-auto md:border-x md:border-brand-border md:shadow-2xl"
    >
      {/* Chat Header - Premium Glassy Feel */}
      <div className="bg-white/90 backdrop-blur-3xl p-4 border-b border-brand-border flex items-center justify-between sticky top-0 z-10 shadow-sm grainy">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={onBack} className="p-2.5 bg-brand-muted hover:bg-brand-primary/10 rounded-xl text-brand-primary transition-all active:scale-90 shadow-sm flex items-center justify-center font-black">
            <span className="font-serif font-black text-xs leading-none">→</span>
          </button>
          
          <div className="relative group shrink-0">
            <div className="w-11 h-11 rounded-[16px] overflow-hidden border border-white shadow-lg bg-brand-muted transition-transform group-hover:scale-105">
              <img 
                src={chat.otherUser?.photoURL || `https://ui-avatars.com/api/?name=${chat.otherUser?.displayName}&background=000&color=fff`} 
                alt="" 
                className="w-full h-full object-cover"
              />
            </div>
            {isOtherTyping && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-lg border-2 border-white animate-bounce shadow-md flex items-center justify-center">
                 <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-serif font-black text-brand-primary truncate">{chat.otherUser?.displayName}</h3>
            <div className="flex items-center gap-1.5">
              {isOtherTyping ? (
                <div className="flex items-center gap-1">
                   <span className="text-[9px] text-emerald-600 font-black tracking-tighter uppercase">يكتب...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                   <div className="w-4 h-4 rounded-md overflow-hidden bg-brand-muted border border-brand-border shrink-0 opacity-60">
                      {chat.adImage ? (
                        <img src={chat.adImage} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <ShoppingBag className="w-full h-full p-1 text-brand-primary opacity-30" />
                      )}
                   </div>
                   <p className="text-[9px] text-brand-secondary font-black truncate opacity-40 uppercase tracking-widest">{chat.adTitle}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setShowBlockConfirm(true)}
            disabled={isBlocking}
            className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all active:scale-95 shadow-sm"
          >
            {isBlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <ConfirmModal 
        isOpen={showBlockConfirm}
        onClose={() => setShowBlockConfirm(false)}
        onConfirm={toggleBlockUser}
        title={isBlocked ? "إلغاء الحظر" : "حظر المستخدم"}
        message={isBlocked ? "هل تريد إلغاء حظر هذا المستخدم؟" : "هل أنت متأكد أنك تريد حظر هذا المستخدم؟ لن تظهر لك رسائله ولن تتمكن من مراسلته."}
        confirmText={isBlocked ? "إلغاء الحظر" : "حظر المستخدم"}
        isDestructive={!isBlocked}
      />

      {/* Messages Area - Visual Rhythm and Spacing */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1.5 no-scrollbar bg-[#f5f4ef] bg-fixed relative opacity-[0.98]">
        {isBlocked && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-50/80 backdrop-blur-sm border border-red-100 rounded-2xl flex items-center justify-center gap-3 mb-6"
          >
            <Ban className="w-4 h-4 text-red-500" />
            <p className="text-xs text-red-600 font-bold">لقد قمت بحظر هذا المستخدم. لن تتمكن من المراسلة.</p>
          </motion.div>
        )}

        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center py-20 opacity-20 grayscale">
            <div className="w-20 h-20 bg-brand-muted rounded-[32px] flex items-center justify-center mb-6">
              <MessageCircle className="w-8 h-8 text-brand-primary" />
            </div>
            <h4 className="text-lg font-serif font-bold text-brand-primary">ابدأ المحادثة الآن</h4>
            <p className="text-[10px] font-black uppercase tracking-widest mt-2 text-brand-primary">كن أول من يرسل رسالة</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {allMessages.map((msg, idx) => {
            const isMe = msg.senderId === user.uid;
            const isNextMe = allMessages[idx + 1]?.senderId === msg.senderId;
            const isPrevMe = allMessages[idx - 1]?.senderId === msg.senderId;
            
            const showTime = idx === 0 || 
                             (msg.createdAt?.toDate && allMessages[idx-1].createdAt?.toDate && 
                              msg.createdAt.toDate().getTime() - allMessages[idx-1].createdAt.toDate().getTime() > 300000);

            return (
              <React.Fragment key={msg.id}>
                {showTime && (
                  <div className="w-full flex justify-center my-6">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-secondary/40 bg-white/40 backdrop-blur-sm px-4 py-1.5 rounded-full border border-brand-border/40">
                       {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleDateString('ar-IQ', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                )}
                
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ 
                    type: 'spring', 
                    damping: 30, 
                    stiffness: 400,
                    delay: Math.min(idx * 0.05, 0.5) 
                  }}
                  className={cn(
                    "flex flex-col group relative",
                    isMe ? "items-start" : "items-end",
                    isNextMe ? "mb-0.5" : "mb-4"
                  )}
                >
                  {/* Swipe to reply indicator */}
                  <div className={cn(
                    "absolute top-1/2 -translate-y-1/2 opacity-0 transition-opacity flex items-center gap-2 pointer-events-none",
                    isMe ? "right-full mr-4" : "left-full ml-4",
                    "group-active:opacity-100"
                  )}>
                     <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-brand-primary" />
                     </div>
                  </div>

                  <motion.div 
                    drag="x"
                    dragConstraints={{ left: isMe ? 0 : -80, right: isMe ? 80 : 0 }}
                    dragElastic={0.1}
                    dragSnapToOrigin
                    onDragEnd={(_, info) => {
                      if (Math.abs(info.offset.x) > 60) {
                        setNewMessage(`الرد على: ${msg.text.substring(0, 20)}... `);
                        const input = document.querySelector('textarea');
                        if (input) input.focus();
                      }
                    }}
                    className={cn(
                      "max-w-[80%] relative cursor-grab active:cursor-grabbing text-white shadow-[0_3px_12px_-4px_rgba(0,0,0,0.18)] border-none",
                      isMe ? "bg-[#111111]" : "bg-[#27272a]",
                      "px-3.5 py-1.5 transition-all duration-300",
                      isMe 
                        ? cn("rounded-[22px]", !isNextMe && "rounded-bl-[4px]", isPrevMe && "rounded-tl-[10px]")
                        : cn("rounded-[22px]", !isNextMe && "rounded-br-[4px]", isPrevMe && "rounded-tr-[10px]")
                    )}
                  >
                    
                    <div className={cn(
                      "flex flex-col gap-2",
                      isMe ? "items-start" : "items-end"
                    )}>
                      {msg.type === 'voice' && msg.audioUrl && (
                        <VoiceMessagePlayer audioUrl={msg.audioUrl} isMe={isMe} />
                      )}

                      {msg.type === 'offer' && (
                        <div className="p-4 rounded-2xl w-full min-w-[200px] space-y-3 bg-white/10 border border-white/10 text-white">
                           <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-60">عرض شراء</span>
                              <div className={cn(
                                "text-[9px] font-bold px-2 py-0.5 rounded-full",
                                msg.offerStatus === 'accepted' ? "bg-emerald-500 text-white" :
                                msg.offerStatus === 'rejected' ? "bg-red-500 text-white" : "bg-brand-primary text-white"
                              )}>
                                {msg.offerStatus === 'pending' ? 'قيد الانتظار' : msg.offerStatus === 'accepted' ? 'مقبول' : 'مرفوض'}
                              </div>
                           </div>
                           <h4 className="text-lg font-serif font-black">{msg.offerAmount?.toLocaleString()} د.ع</h4>
                           {!isMe && msg.offerStatus === 'pending' && (
                             <div className="flex gap-2 pt-2">
                                <button 
                                  onClick={() => handleOfferAction(msg.id, 'accepted')}
                                  className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                                >
                                  قبول
                                </button>
                                <button 
                                  onClick={() => handleOfferAction(msg.id, 'rejected')}
                                  className="flex-1 bg-red-500 text-white py-2 rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                                >
                                  رفض
                                </button>
                             </div>
                           )}
                        </div>
                      )}

                      {msg.imageUrl && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => window.open(msg.imageUrl, '_blank')}
                          className="rounded-xl overflow-hidden border border-white/20 shadow-inner group/img relative"
                        >
                          <img src={msg.imageUrl} alt="Chat attachment" className="max-w-[200px] h-auto object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center">
                            <Maximize className="w-5 h-5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                          </div>
                        </motion.button>
                      )}
                      
                      {msg.text && (
                        <p className="text-xs lg:text-sm leading-relaxed font-medium whitespace-pre-wrap">
                          {msg.text}
                        </p>
                      )}
                    </div>

                    <div className={cn(
                      "flex items-center gap-1 mt-1.5 transition-all duration-300",
                      isMe ? "justify-end" : "justify-start",
                      "opacity-0 scale-90 group-hover:opacity-60 group-hover:scale-100"
                    )}>
                      <span className="text-[8px] font-bold">
                        {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {isMe && (
                        <div className="flex">
                          {msg.read ? (
                            <CheckCheck className="w-2.5 h-2.5 text-emerald-300" />
                          ) : (
                            <Check className="w-2.5 h-2.5 text-white/40" />
                          )}
                        </div>
                      )}
                    </div>

                    {msg.isOptimistic && (
                      <div className="absolute -left-7 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-3.5 h-3.5 text-brand-primary animate-spin opacity-20" />
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              </React.Fragment>
            );
          })}
        </AnimatePresence>
        
        {isOtherTyping && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="flex items-start gap-2 max-w-[85%] self-end mb-4"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white shadow-md bg-brand-muted shrink-0">
              <img 
                src={chat.otherUser?.photoURL || `https://ui-avatars.com/api/?name=${chat.otherUser?.displayName}&background=000&color=fff`} 
                alt="" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="bg-white/80 backdrop-blur-md border border-brand-border/40 text-brand-primary px-4 py-2.5 rounded-[20px] rounded-br-none flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 bg-brand-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-brand-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-brand-primary/60 rounded-full animate-bounce" />
            </div>
          </motion.div>
        )}

        <div ref={scrollRef} className="h-4" />
      </div>

      {/* Quick Replies */}
      <div className="bg-white/95 backdrop-blur-3xl border-t border-brand-border/30 grainy">
        <div className="flex gap-2 overflow-x-auto p-4 no-scrollbar">
          {quickReplies.map((reply, i) => (
            <motion.button
              key={`reply-${i}`}
              whileHover={{ scale: 1.05, backgroundColor: '#000', color: '#fff' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => performSendMessage(reply)}
              className="whitespace-nowrap px-4 py-2 rounded-full border border-brand-border/60 text-[10px] font-black uppercase tracking-tighter bg-white/50 text-brand-primary transition-all shadow-sm"
            >
              {reply}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Input Dock - Floating Appearance */}
      <div className={cn(
        "p-4 bg-white/95 backdrop-blur-3xl border-t border-brand-border relative z-20 grainy transition-opacity",
        isBlocked && "opacity-50 pointer-events-none"
      )}>
        {showEmojiPicker && (
          <div className="absolute bottom-full left-4 z-50 mb-2 shadow-2xl rounded-3xl overflow-hidden border border-brand-border">
            <EmojiPicker 
              onEmojiClick={onEmojiClick} 
              autoFocusSearch={false}
              theme={'light' as any}
              width={300}
              height={400}
            />
          </div>
        )}

        {pendingImage && (
          <motion.div 
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="mb-4 p-3 bg-brand-muted border border-brand-border rounded-2xl flex items-center justify-between gap-4 relative"
          >
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-white shadow-md bg-white">
                <img src={pendingImage} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-brand-primary tracking-wider block">صورة جاهزة للإرسال</span>
                <span className="text-[9px] text-brand-secondary opacity-60">اكتب تعليقاً في حقل النص أو أرسل مباشرة</span>
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => setPendingImage(null)}
              className="w-7 h-7 bg-white hover:bg-red-50 text-red-500 rounded-full border border-brand-border/40 flex items-center justify-center transition-all shadow-sm active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        
        <form onSubmit={sendMessage} className="flex gap-3 items-end max-w-4xl mx-auto">
          <div className="flex-1 relative group flex items-center">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleFileChange}
            />
            {isRecording ? (
              <div className="absolute left-2 inset-y-2 right-12 bg-white/95 backdrop-blur-xl rounded-full z-20 flex items-center px-4 justify-between animate-pulse border border-red-100 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                  <span className="text-[10px] font-black text-red-500 tracking-widest">{Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}</span>
                </div>
                <button type="button" onClick={stopRecording} className="text-[10px] font-black text-brand-primary uppercase underline underline-offset-4">إلغاء</button>
              </div>
            ) : null}

            <div className="absolute left-2 flex gap-1 z-10">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 flex items-center justify-center text-brand-secondary/40 hover:text-brand-primary transition-colors bg-white/50 rounded-full border border-brand-border/20"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={cn(
                  "w-8 h-8 flex items-center justify-center transition-all bg-white/50 rounded-full border border-brand-border/20",
                  isRecording ? "text-red-500 scale-125 bg-red-50 border-red-200" : "text-brand-secondary/40 hover:text-brand-primary"
                )}
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>

            <textarea 
              rows={1}
              disabled={isBlocked || sending}
              placeholder={isBlocked ? "لا يمكنك المراسلة (محظور)" : "اكتب رسالة..."}
              value={newMessage}
              onFocus={() => setShowEmojiPicker(false)}
              onChange={(e: any) => {
                handleTyping(e);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(e as any);
                }
              }}
              className="w-full bg-brand-bg border border-brand-border/60 rounded-[22px] pl-20 pr-24 py-3 text-xs lg:text-sm focus:ring-4 focus:ring-brand-primary/5 focus:bg-white focus:border-brand-primary/30 outline-none transition-all resize-none max-h-32 min-h-[44px] leading-relaxed shadow-inner"
            />
            <div className="absolute right-3 bottom-1.5 flex items-center gap-1">
               <button 
                  type="button"
                  onClick={() => setShowOfferInput(!showOfferInput)}
                  className={cn(
                    "p-2 text-brand-secondary/30 hover:text-brand-primary transition-all hover:scale-110 active:scale-90",
                    showOfferInput && "text-brand-primary scale-110"
                  )}
               >
                  <CircleDollarSign className="w-5 h-5" />
               </button>
               <button 
                  type="button" 
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={cn(
                    "p-2 text-brand-secondary/30 hover:text-brand-primary transition-all hover:scale-110 active:scale-90",
                    showEmojiPicker && "text-brand-primary scale-110"
                  )}
                >
                  <Smile className="w-5 h-5" />
               </button>
            </div>
          </div>
          
          <motion.button 
            type="submit"
            whileHover={!isBlocked ? { scale: 1.05 } : {}}
            whileTap={!isBlocked ? { scale: 0.95 } : {}}
            disabled={(!newMessage.trim() && !isRecording) || sending || isBlocked}
            className={cn(
              "w-11 h-11 bg-brand-primary text-white rounded-[16px] flex items-center justify-center shadow-md disabled:grayscale disabled:opacity-20 disabled:scale-100 transition-all group shrink-0",
              isBlocked && "bg-brand-muted text-brand-secondary cursor-not-allowed"
            )}
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 translate-x-0.5 -translate-y-0.5 group-hover:rotate-12 group-hover:scale-110 transition-transform" />
            )}
          </motion.button>
        </form>

        {showOfferInput && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-brand-primary/5 border border-brand-primary/10 rounded-2xl flex items-center gap-3"
          >
            <div className="flex-1">
              <p className="text-[9px] font-black text-brand-primary uppercase tracking-widest mb-1">تقديم عرض شراء</p>
              <input 
                type="number" 
                placeholder="أدخل المبلغ (د.ع)" 
                value={offerValue}
                onChange={(e) => setOfferValue(e.target.value)}
                className="w-full bg-white border border-brand-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
              />
            </div>
            <button 
              onClick={handleSendOffer}
              className="px-6 h-10 bg-brand-primary text-white text-xs font-bold rounded-xl mt-4 shrink-0 transition-transform active:scale-95"
            >
              إرسال العرض
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// --- Subviews ---

function HomeView({ 
  activeCategory, setActiveCategory, 
  activeCondition, setActiveCondition,
  activeCity, setActiveCity,
  sortBy, setSortBy,
  searchQuery, setSearchQuery, ads, loading, onAdClick,
  favorites, toggleFavorite, onRefresh, setView
}: any) {
  const [quickViewAd, setQuickViewAd] = useState<Ad | null>(null);

  const featuredAds = useMemo(() => {
    return (ads || []).filter((ad: any) => ad.isFeatured && ad.status === 'active');
  }, [ads]);

  // --- Pull-To-Refresh System ---
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && !refreshing && !loading) {
      touchStartRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current === null || !isPullingRef.current) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartRef.current;
    if (deltaY > 0) {
      const resistance = 0.35;
      const distance = Math.min(deltaY * resistance, 110);
      setPullDistance(distance);
      if (distance > 10 && e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    touchStartRef.current = null;
    if (pullDistance >= 60) {
      setRefreshing(true);
      setPullDistance(55);
      try {
        if (onRefresh) {
          await onRefresh();
        }
      } catch (err) {
        console.error("Refresh failed:", err);
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (window.scrollY === 0 && !refreshing && !loading) {
      touchStartRef.current = e.clientY;
      isPullingRef.current = true;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (touchStartRef.current === null || !isPullingRef.current) return;
    const deltaY = e.clientY - touchStartRef.current;
    if (deltaY > 0) {
      const resistance = 0.35;
      const distance = Math.min(deltaY * resistance, 110);
      setPullDistance(distance);
    }
  };

  const handleMouseUp = () => {
    handleTouchEnd();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mesh-bg min-h-screen relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (isPullingRef.current) {
          isPullingRef.current = false;
          touchStartRef.current = null;
          setPullDistance(0);
        }
      }}
    >
      {/* Pull To Refresh Ambient Header Indicator Overlay */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-[100] transition-all duration-150 ease-out"
        style={{ 
          transform: `translateY(${pullDistance - 50}px)`, 
          opacity: pullDistance > 10 ? Math.min(pullDistance / 50, 1) : 0 
        }}
      >
        <div className="bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-full border border-brand-border/60 shadow-elite flex items-center gap-2.5">
          {refreshing || loading ? (
            <>
              <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />
              <span className="text-[10px] font-black text-brand-primary tracking-tight font-serif">جاري تحديث سوق الرافدين...</span>
            </>
          ) : (
            <>
              <ChevronLeft 
                className="w-4 h-4 text-brand-primary transition-transform duration-200" 
                style={{ transform: `rotate(${pullDistance >= 60 ? -90 : 90}deg)` }} 
              />
              <span className="text-[10px] font-black text-brand-primary tracking-tight font-serif">
                {pullDistance >= 60 ? "أفلت لتحديث الإعلانات الآن" : "اسحب للأسفل لتحديث الإعلانات اليومية"}
              </span>
            </>
          )}
        </div>
      </div>
      <QuickViewModal 
        ad={quickViewAd}
        isOpen={!!quickViewAd}
        onClose={() => setQuickViewAd(null)}
        onDetails={() => {
          onAdClick(quickViewAd);
          setQuickViewAd(null);
        }}
        isFavorited={quickViewAd ? favorites.includes(quickViewAd.id) : false}
        onToggleFavorite={(e: any) => {
          e.stopPropagation();
          if (quickViewAd) toggleFavorite(quickViewAd.id);
        }}
      />
      {/* Creative Hero Section */}
      <section className="relative pt-8 pb-10 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10 space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/5 border border-brand-primary/10 text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary/60"
            >
              <Sparkles className="w-3 h-3 text-brand-primary/60" />
              منصة البيع والشراء العصرية المبتكرة
            </motion.div>
            
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-serif font-black tracking-tight text-brand-primary leading-tight max-w-3xl">
               سوق <span className="italic underline decoration-brand-primary/10 transition-all hover:decoration-brand-primary/30 cursor-default">الرافدين</span> للأثاث والأجهزة وكل شيء
            </h2>
            
            <p className="text-brand-secondary/70 font-medium max-w-md leading-relaxed text-xs sm:text-sm">
              الخيار الأول في العراق لتسوق الإعلانات المبوبة بكل سلاسة وموثوقية في بيئة هادئة ومميزة.
            </p>

            <div className="relative w-full max-w-lg mx-auto group mt-2">
              <div className="absolute inset-0 bg-brand-primary/5 blur-2xl rounded-full scale-105 opacity-40 group-focus-within:opacity-80 transition-opacity" />
              <div className="relative bg-white/80 backdrop-blur-md border border-brand-border rounded-xl p-1.5 flex items-center gap-1.5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] transition-all focus-within:border-brand-primary/20">
                <Search className="mr-3 text-brand-secondary w-4 h-4 opacity-40 shrink-0" />
                <input 
                  type="text" 
                  placeholder="ابحث عن هاتف، سيارة، أو أثاث..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none py-2 pr-1 pl-3 text-xs sm:text-sm font-medium focus:ring-0 outline-none placeholder:text-brand-secondary/40 text-right text-brand-primary"
                />
                <button className="bg-brand-primary text-white p-2 rounded-lg hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer">
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-3 mt-4">
             <div className="relative">
               <MapPin className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3 h-3 text-brand-primary opacity-40 pointer-events-none" />
               <select 
                 value={activeCity || 'الكل'}
                 onChange={(e) => setActiveCity(e.target.value)}
                 className="appearance-none bg-white border border-brand-border pr-8 pl-5 py-1.5 sm:py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter text-brand-primary outline-none focus:border-brand-primary/20 transition-all cursor-pointer hover:bg-brand-muted"
               >
                 {CITIES.map(city => (
                   <option key={city} value={city}>{city === 'الكل' ? 'كل العراق' : city}</option>
                 ))}
               </select>
             </div>
             
             <div className="h-6 w-[1px] bg-brand-border mx-1 hidden sm:block" />
             <FilterBadge label="جديد" active={activeCondition === 'new'} onClick={() => setActiveCondition(activeCondition === 'new' ? null : 'new')} icon={<CheckCircle2 className="w-3 h-3" />} />
             <FilterBadge label="الأعلى سعراً" active={sortBy === 'price_desc'} onClick={() => setSortBy(sortBy === 'price_desc' ? 'newest' : 'price_desc')} icon={<Star className="w-3 h-3" />} />
          </div>
        </div>

        {/* Decorative Mesh Elements */}
        <div className="absolute top-0 right-0 w-[30vh] h-[30vh] bg-brand-accent/20 blur-[100px] rounded-full -mr-[15vh] -mt-[5vh] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[20vh] h-[20vh] bg-brand-accent/15 blur-[80px] rounded-full -ml-[10vh] -mb-[5vh] pointer-events-none" />
      </section>

      <div className="max-w-7xl mx-auto space-y-24 px-6 pb-32">
        {/* Horizontal Scroll Categories */}
        <div className="relative group">
          <div className="flex items-center justify-between mb-8">
             <h3 className="text-xs font-black uppercase tracking-[0.4em] text-brand-primary opacity-30">الفئات المختارة</h3>
             <div className="h-[1px] flex-1 mx-8 bg-brand-border" />
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 -mx-6 px-6">
            {CATEGORIES.map((cat, idx) => (
              <motion.button
                key={cat.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={cn(
                  "flex items-center justify-center gap-2 px-6 py-3.5 rounded-full transition-all duration-300 border text-xs font-black uppercase tracking-widest min-w-[100px]",
                  activeCategory === cat.id 
                    ? "bg-brand-primary text-white border-brand-primary shadow-lg scale-105" 
                    : "bg-white text-brand-primary border-brand-border hover:border-brand-primary/40 hover:bg-brand-muted"
                )}
              >
                <span className="text-sm select-none">{cat.icon}</span>
                <span>{cat.label}</span>
                {activeCategory === cat.id && (
                  <span className="mr-1 opacity-80 text-[10px]">←</span>
                )}
                {activeCategory === cat.id && (
                  <div className="absolute inset-0 bg-white/10 pointer-events-none" />
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Spotlight VIP Carousel Section */}
        {featuredAds.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                  👑 منصة التميز الذهبية
                </span>
                <h3 className="text-2xl font-serif font-black text-brand-primary">عروض مميزة وحصرية</h3>
              </div>
              <div className="h-[1px] flex-1 mx-8 bg-amber-200/50" />
            </div>

            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-6 -mx-6 px-6">
              {featuredAds.map((ad: any, idx: number) => (
                <motion.div
                  key={`spotlight-${ad.id}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className="w-[280px] sm:w-[320px] shrink-0"
                  onClick={() => onAdClick(ad)}
                >
                  <div className="group cursor-pointer bg-gradient-to-br from-amber-50/80 to-amber-100/30 rounded-3xl p-3 border border-amber-500/30 hover:shadow-elite transition-all duration-500 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-300 via-amber-500 to-amber-300 animate-shimmer" />
                    <div className="relative aspect-[4/3] rounded-2xl overflow-hidden grainy mb-3">
                      <img
                        src={ad.images[0]}
                        alt={ad.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 right-3 bg-amber-500 text-white px-2.5 py-1 rounded-full shadow-md text-[9px] font-black flex items-center gap-1 border border-amber-400">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>مميز جداً</span>
                      </div>
                      <div className="absolute bottom-3 right-3 bg-black/60 text-white px-2.5 py-1 rounded-full text-[9px] font-semibold">
                        {ad.location.city}
                      </div>
                    </div>
                    <div className="space-y-1 p-1">
                      <h4 className="font-bold text-sm text-gray-800 line-clamp-1 group-hover:text-amber-700 transition-colors">
                        {ad.title}
                      </h4>
                      <p className="text-amber-700 font-serif font-black text-sm">
                        {ad.price.toLocaleString()} د.ع
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Ads Grid with Section Title */}
        <div className="space-y-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-2">
              <h3 className="text-4xl font-serif font-black text-brand-primary">اكتشف التميز.</h3>
              <p className="text-xs text-brand-secondary opacity-40 font-bold uppercase tracking-[0.2em]">أحدث العروض الحصرية في بغداد وكل العراق</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex bg-brand-accent/50 p-1 rounded-2xl border border-brand-border">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSortBy(opt.id as any)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all",
                      sortBy === opt.id ? "bg-white text-brand-primary shadow-sm" : "text-brand-secondary opacity-40 hover:opacity-100"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="bg-white rounded-[32px] border border-brand-border/60 p-2 transition-all shadow-sm">
                    <div className="aspect-[4/5] bg-brand-muted animate-pulse rounded-[24px]" />
                    <div className="p-4 space-y-4">
                      <div className="space-y-2">
                        <div className="h-2 w-12 bg-brand-muted animate-pulse rounded-full" />
                        <div className="h-5 w-32 bg-brand-muted animate-pulse rounded-full" />
                      </div>
                      <div className="pt-4 border-t border-brand-border/30 flex items-center justify-between">
                         <div className="space-y-2">
                           <div className="h-2 w-8 bg-brand-muted animate-pulse rounded-full" />
                           <div className="h-5 w-20 bg-brand-muted animate-pulse rounded-full" />
                         </div>
                         <div className="w-8 h-8 bg-brand-muted animate-pulse rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : ads.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
                {ads.map((ad: Ad, idx: number) => (
                  <motion.div
                    key={`home-ad-${ad.id}`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setQuickViewAd(ad);
                    }}
                    onMouseEnter={() => {
                      // Optional: Show preview on hover with delay
                    }}
                  >
                    <AdCard 
                      ad={ad} 
                      onClick={() => onAdClick(ad)} 
                      isFavorited={favorites.includes(ad.id)}
                      onToggleFavorite={() => toggleFavorite(ad.id)}
                      onQuickView={() => setQuickViewAd(ad)}
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-40 text-center space-y-6">
                <div className="w-24 h-24 bg-brand-muted rounded-full flex items-center justify-center mx-auto">
                   <ShoppingBag className="w-8 h-8 text-brand-secondary opacity-20" />
                </div>
                <div className="space-y-1">
                  <p className="text-xl font-serif font-black text-brand-primary">لم نجد أي نتائج</p>
                  <p className="text-xs text-brand-secondary opacity-40 font-bold uppercase tracking-widest">جرب البحث بكلمات أخرى أو تغيير الفلاتر</p>
                </div>
                <button onClick={() => { setActiveCategory(null); setSearchQuery(''); setActiveCity('الكل'); }} className="text-xs font-bold underline underline-offset-8 text-brand-primary">إعادة تعيين الكل</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Premium Iraq Market Footer - Extremely Elegant & Clean */}
      <footer className="w-full mt-24 border-t border-brand-border/30 pt-10 pb-12 text-center relative z-10">
        <div className="max-w-4xl mx-auto px-6 space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
            </div>
            <span className="text-sm font-serif font-black text-brand-primary">سوق الرافدين 🇮🇶</span>
          </div>
          <p className="text-[11px] text-[#777] font-semibold leading-relaxed max-w-lg mx-auto">
            منصة وطنية شاملة وآمنة لشراء وبيع السيارات والمحركات والعقارات والسلع والأجهزة بموثوقية تامة وتواصل فوري متطور.
          </p>
          <div className="flex items-center justify-center gap-4 text-[9px] text-brand-secondary font-black tracking-wider">
            <span className="bg-emerald-50 text-emerald-600 border border-emerald-100/60 px-2 py-0.5 rounded-full">● تواصل مشفر</span>
            <span className="bg-blue-50 text-blue-600 border border-blue-100/60 px-2 py-0.5 rounded-full">● خادم وطني سريع</span>
          </div>
          <p className="text-[10px] text-brand-secondary opacity-40 font-bold tracking-widest pt-2">
            جميع الحقوق محفوظة © ٢٠٢٦ سوق الرافدين للتكنولوجيا والحلول البرمجية
          </p>
        </div>
      </footer>
    </motion.div>
  );
}

function FilterBadge({ label, active, onClick, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-tighter transition-all border",
        active 
          ? "bg-brand-primary text-white border-brand-primary shadow-lg shadow-brand-primary/20" 
          : "bg-white/50 backdrop-blur-md text-brand-secondary border-brand-border hover:border-brand-primary/20"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function CreateAdView({ user, onClose, onSuccess, createNotification, onViewSupport }: any) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: 'electronics',
    condition: 'excellent',
    whatsappNumber: '',
    city: 'بغداد',
  });
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [catAiLoading, setCatAiLoading] = useState(false);
  const [descAiLoading, setDescAiLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // MasterCard Promotion States
  const [isFeaturedChoice, setIsFeaturedChoice] = useState(false);

  const generateAiImage = async () => {
    if (!formData.title) {
      alert('يرجى إدخال عنوان الإعلان أولاً لتوليد صورة مناسبة له!');
      return;
    }
    setImageGenerating(true);
    try {
      const res = await fetch(getApiUrl('/api/ai/generate-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: formData.title,
          category: formData.category
        })
      });
      if (!res.ok) throw new Error('فشل في توليد الصورة');
      const data = await res.json();
      if (data.imageUrl) {
        setImages(prev => [...prev, data.imageUrl]);
      } else {
        alert('لم يتم توليد الصورة بشكل صحيح');
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء توليد الصورة بالذكاء الاصطناعي');
    } finally {
      setImageGenerating(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result as string, 1024, 1024, 0.7);
        setImages((prev) => [...prev, compressed]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    try {
      let finalImages = [...images];
      if (finalImages.length === 0) {
        // Automatically generate a premium image using the AI backend
        try {
          const res = await fetch(getApiUrl('/api/ai/generate-image'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: formData.title,
              category: formData.category
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.imageUrl) {
              finalImages.push(data.imageUrl);
            }
          }
        } catch (apiErr) {
          console.error("Auto image generation background error:", apiErr);
        }
      }

      if (finalImages.length === 0) {
        finalImages.push('https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=2000&auto=format&fit=crop');
      }

      // Coordinates map for Iraqi cities to make them display beautifully on maps
      const cityCoords: Record<string, { lat: number, lng: number }> = {
        'بغداد': { lat: 33.3152, lng: 44.3661 },
        'البصرة': { lat: 30.5081, lng: 47.7835 },
        'الموصل': { lat: 36.3489, lng: 43.1577 },
        'أربيل': { lat: 36.1901, lng: 44.0089 },
        'النجف': { lat: 31.9961, lng: 44.3312 },
        'كربلاء': { lat: 32.6160, lng: 44.0249 },
        'كركوك': { lat: 35.4681, lng: 44.3922 },
        'الناصرية': { lat: 31.0578, lng: 46.2573 },
        'السليمانية': { lat: 35.5618, lng: 45.4373 }
      };
      const selectedCityCoords = cityCoords[formData.city] || { lat: 33.3152, lng: 44.3661 };

      const adData: Omit<Ad, 'id'> = {
        title: formData.title,
        description: formData.description,
        price: Number(formData.price),
        category: formData.category,
        condition: formData.condition,
        images: finalImages,
        location: { lat: selectedCityCoords.lat, lng: selectedCityCoords.lng, city: formData.city },
        sellerId: user.uid,
        sellerName: user.displayName || 'بائع',
        contactMethod: 'whatsapp',
        whatsappNumber: formData.whatsappNumber,
        createdAt: serverTimestamp(),
        status: 'active',
        isFeatured: isFeaturedChoice
      };

      const finalAdData = {
        ...adData,
        ...(isFeaturedChoice ? { 
          isFeatured: true,
          featuredUntil: Date.now() + 30 * 24 * 60 * 60 * 1000 
        } : {})
      };

      const adDocRef = await addDoc(collection(db, 'ads'), finalAdData);
      
      // Notify users interested in this category
      const interestedUsersQuery = query(
        collection(db, 'users'),
        where('favoriteCategories', 'array-contains', formData.category),
        limit(20)
      );
      const usersSnap = await getDocs(interestedUsersQuery);
      usersSnap.forEach(async (userDoc) => {
        if (userDoc.id !== user.uid) {
          await createNotification(
            userDoc.id,
            isFeaturedChoice ? 'منتج جديد يهمك مميز! 🌟' : 'منتج جديد يهمك!',
            isFeaturedChoice 
              ? `تمت إضافة إعلان مميز جديد في فئة ${CATEGORIES.find(c => c.id === formData.category)?.label}: "${formData.title}"`
              : `تمت إضافة إعلان جديد في فئة ${CATEGORIES.find(c => c.id === formData.category)?.label}: "${formData.title}"`,
            'ad',
            { adId: adDocRef.id }
          ).catch(() => {});
        }
      });

      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ads');
      setSubmitting(false);
    }
  };

  const getAiSuggestion = async () => {
    if (!formData.title) return;
    setAiLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/ai/suggest-price'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemTitle: formData.title,
          category: formData.category,
          condition: formData.condition,
          itemDescription: formData.description
        })
      });
      const data = await res.json();
      setAiSuggestion(data);
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const getAiCategorySuggestion = async () => {
    if (!formData.title) return;
    setCatAiLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/ai/suggest-category'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemTitle: formData.title,
          itemDescription: formData.description,
          categories: CATEGORIES
        })
      });
      const data = await res.json();
      if (data.categoryId) {
        setFormData(prev => ({ ...prev, category: data.categoryId }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCatAiLoading(false);
    }
  };

  const getAiDescriptionSuggestion = async () => {
    if (!formData.title) return;
    setDescAiLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/ai/suggest-description'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemTitle: formData.title,
          category: formData.category,
          condition: formData.condition,
          itemDescription: formData.description
        })
      });
      const data = await res.json();
      if (data.description) {
        setFormData(prev => ({ ...prev, description: data.description }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDescAiLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="p-6 bg-white min-h-screen lg:pb-32"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-800">إضافة إعلان جديد</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload Section */}
          <div className="space-y-4">
            <label className="text-sm font-bold text-brand-secondary">صور المنتج</label>
            <div className="flex flex-wrap gap-3">
              {images.map((img, idx) => (
                <div key={`up-img-${idx}`} className="relative w-24 h-24 rounded-xl overflow-hidden border border-brand-border shadow-sm group">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button 
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-xl border-2 border-dashed border-brand-border flex flex-col items-center justify-center gap-1 text-brand-secondary hover:bg-brand-muted transition-colors"
              >
                <span className="text-xl">📸</span>
                <span className="text-[10px] font-bold">أضف صور</span>
              </button>

              <button 
                type="button"
                onClick={generateAiImage}
                disabled={imageGenerating}
                className="w-24 h-24 rounded-xl border-2 border-dashed border-brand-primary/40 bg-brand-primary/5 text-brand-primary hover:bg-brand-primary/10 transition-colors disabled:opacity-50 flex flex-col items-center justify-center gap-1"
              >
                {imageGenerating ? (
                  <span className="text-[10px] font-black animate-pulse text-brand-primary">جاري التوليد...</span>
                ) : (
                  <>
                    <span className="text-xl">✨</span>
                    <span className="text-[10px] font-black uppercase tracking-wider">صورة ذكاء</span>
                  </>
                )}
              </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleImageChange}
              multiple
              accept="image/*"
              className="hidden"
            />
            <p className="text-[10px] text-brand-secondary opacity-60">يمكنك رفع صور أو الضغط على "صورة ذكاء" لتوليد صورة حقيقية متميزة بالإستعانة بالذكاء الاصطناعي للبائع بناءً على العنوان والعرض.</p>
          </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-brand-secondary">عنوان الإعلان</label>
          <input 
            type="text" 
            placeholder="مثال: آيفون 13 برو ماكس نظيف جداً"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full bg-brand-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-brand-primary/20 transition-all outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-brand-secondary">السعر (دينار)</label>
            <input 
              type="number" 
              placeholder="0"
              required
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="w-full bg-brand-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-brand-primary/20 outline-none"
            />
          </div>
          <div className="flex items-end pb-1">
            <button 
              type="button"
              onClick={getAiSuggestion}
              disabled={!formData.title || aiLoading}
              className="flex items-center gap-2 text-brand-primary bg-brand-primary/10 px-3 py-4 rounded-2xl font-bold w-full justify-center disabled:opacity-50 transition-all border border-brand-primary/20"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              سعر مقترح
            </button>
          </div>
        </div>

        {aiSuggestion && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-[#fdf8f0] p-5 rounded-3xl border border-[#ede3d1] shadow-sm"
          >
            <div className="flex items-center gap-2 text-[#8c6d31] font-bold text-sm mb-2">
              <Sparkles className="w-4 h-4" />
              مساعد التسعير الذكي
            </div>
            <p className="text-xl font-bold text-[#8c6d31] mb-2 font-serif">
              {aiSuggestion.minPrice.toLocaleString()} - {aiSuggestion.maxPrice.toLocaleString()} دينار
            </p>
            <p className="text-[11px] text-[#8c6d31] leading-relaxed opacity-80">{aiSuggestion.reasoning}</p>
          </motion.div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-gray-700">القسم</label>
            <button 
              type="button"
              onClick={getAiCategorySuggestion}
              disabled={!formData.title || catAiLoading}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter text-brand-primary bg-brand-primary/5 px-3 py-1.5 rounded-full hover:bg-brand-primary/10 transition-all disabled:opacity-30"
            >
              {catAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              تصنيف ذكي
            </button>
          </div>
          <select 
            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 focus:ring-2 focus:ring-brand-primary"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          >
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">الحالة</label>
          <select 
            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 focus:ring-2 focus:ring-brand-primary"
            value={formData.condition}
            onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
          >
            {CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">المحافظة</label>
          <select 
            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 focus:ring-2 focus:ring-brand-primary"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          >
            {CITIES.filter(c => c !== 'الكل').map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-gray-700">وصف الغرض</label>
            <button 
              type="button"
              onClick={getAiDescriptionSuggestion}
              disabled={!formData.title || descAiLoading}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter text-brand-primary bg-brand-primary/5 px-3 py-1.5 rounded-full hover:bg-brand-primary/10 transition-all disabled:opacity-30"
            >
              {descAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 animate-pulse text-yellow-500 fill-yellow-500" />}
              صياغة الوصف بالذكاء الاصطناعي 🌟
            </button>
          </div>
          <textarea 
            rows={5}
            placeholder="اكتب بضع كلمات بسيطة ودع الذكاء الاصطناعي يصيغها بلهجة عراقية ممتعة وجذابة للزبائن!"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 focus:ring-2 focus:ring-brand-primary font-medium text-sm leading-relaxed"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">رقم الواتساب</label>
          <input 
            type="tel" 
            placeholder="07XXXXXXXX"
            value={formData.whatsappNumber}
            onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 focus:ring-2 focus:ring-brand-primary"
          />
        </div>

        {/* Promotion selector inside creation form */}
        <div className="space-y-3 pt-6 border-t border-brand-border/30">
          <label className="text-sm font-bold text-gray-700 block">نوع ترويج النشر المطلوب</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setIsFeaturedChoice(false)}
              className={cn(
                "p-4 rounded-2xl border text-right transition-all flex flex-col gap-1.5 cursor-pointer relative",
                !isFeaturedChoice 
                  ? "border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/10" 
                  : "border-brand-border bg-white"
              )}
            >
              <span className="font-bold text-sm text-brand-primary">نشر عادي (مجاني)</span>
              <span className="text-[10px] text-gray-500 leading-normal">ينشر فوراً في القوائم العادية بموثوقية كاملة.</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFeaturedChoice(true)}
              className={cn(
                "p-4 rounded-2xl border text-right transition-all flex flex-col gap-1.5 cursor-pointer relative overflow-hidden group",
                isFeaturedChoice 
                  ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/10" 
                  : "border-brand-border bg-white hover:border-amber-300"
              )}
            >
              {isFeaturedChoice && (
                <span className="absolute top-1 left-1 bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded">مميز ⭐️</span>
              )}
              <span className="font-bold text-sm text-amber-700 flex items-center gap-1">
                نشر مميز (⭐️ مجاني وحصري)
              </span>
              <span className="text-[10px] text-amber-900/80 leading-relaxed font-semibold">
                يثبت ببطاقة ذهبية أعلى الواجهة لمد تواصلك وزيادة نسبة الرؤية والمبيعات بـ 10 أضعاف.
              </span>
            </button>
          </div>
        </div>

        {!user?.emailVerified && (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-3xl flex items-center gap-3">
            <AlertCircle className="text-amber-600 w-5 h-5 shrink-0" />
            <p className="text-[11px] text-amber-900 font-bold">يرجى توثيق بريدك الإلكتروني من صفحة الحساب لتتمكن من نشر الإعلانات.</p>
          </div>
        )}

        <button 
          disabled={submitting || !user?.emailVerified}
          className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-brand-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
          {isFeaturedChoice ? 'نشر الإعلان المميز مجاناً ⭐' : 'نشر الإعلان العادي مجاناً'}
        </button>
      </form>
      </div>
    </motion.div>
  );
}

function ShareModal({ isOpen, onClose, ad }: { isOpen: boolean, onClose: () => void, ad: any }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/ad/${ad.id}`;
  const shareText = `تحقق من هذا الإعلان على سوق العراق: ${ad.title}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'سوق العراق',
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md bg-white rounded-t-[40px] sm:rounded-[40px] overflow-hidden shadow-2xl"
      >
        <div className="w-12 h-1.5 bg-brand-muted rounded-full mx-auto mt-4 mb-2 sm:hidden" />
        
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-2xl font-serif font-bold text-brand-primary">مشاركة الإعلان</h3>
              <p className="text-xs text-brand-secondary opacity-60">اختر المنصة لمشاركة هذا الإعلان</p>
            </div>
            <button onClick={onClose} className="p-3 bg-brand-muted text-brand-secondary rounded-2xl hover:bg-brand-primary/10 hover:text-brand-primary transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-gradient-to-br from-brand-muted to-white rounded-3xl p-5 mb-10 flex flex-col gap-5 border border-brand-border shadow-sm overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-brand-primary/5 rounded-full -mr-20 -mt-20 blur-3xl transition-all group-hover:bg-brand-primary/10" />
            
            <div className="flex gap-5 relative z-10">
              <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-md transform group-hover:scale-105 transition-transform duration-500">
                <img src={ad.images?.[0]} alt={ad.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="flex flex-col justify-center overflow-hidden flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                  <p className="text-[10px] font-black tracking-[0.2em] text-brand-primary/60 uppercase">سوق العراق</p>
                </div>
                <h4 className="font-serif font-bold text-brand-primary truncate text-xl mb-1">{ad.title}</h4>
                <p className="text-brand-primary font-black text-lg">{ad.price.toLocaleString()} <span className="text-[10px] opacity-40">د.ع</span></p>
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-2 pt-4 border-t border-brand-border/30 relative z-10">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-brand-secondary opacity-40" />
                <span className="text-xs font-bold text-brand-secondary/60">{ad.location.city}</span>
              </div>
              <div className="flex items-center gap-1.5 grayscale opacity-30">
                <div className="w-4 h-4 bg-brand-primary rounded-full" />
                <span className="text-[9px] font-black text-brand-primary uppercase tracking-widest">IRAQ MARKET</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5 mb-4">
            <button 
              onClick={handleCopy}
              className="flex flex-col items-center gap-4 p-5 bg-brand-muted rounded-[32px] hover:bg-brand-primary/5 transition-all group relative overflow-hidden"
            >
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all">
                {copied ? <Check className="w-7 h-7 text-green-500" /> : <Copy className="w-7 h-7 text-brand-primary" />}
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-brand-secondary">{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
              {copied && <motion.div layoutId="sparkle" className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full" />}
            </button>

            <a 
              href={`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-4 p-5 bg-brand-muted rounded-[32px] hover:bg-brand-primary/5 transition-all group"
            >
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:-rotate-3 transition-all text-[#25D366]">
                <MessageSquare className="w-7 h-7 fill-current" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-brand-secondary">واتساب</span>
            </a>

            <a 
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-4 p-5 bg-brand-muted rounded-[32px] hover:bg-brand-primary/5 transition-all group"
            >
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all text-[#1877F2]">
                 <Share2 className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-brand-secondary">فيسبوك</span>
            </a>

            <button 
              onClick={handleNativeShare}
              className="flex flex-col items-center gap-4 p-5 bg-brand-muted rounded-[32px] hover:bg-brand-primary/5 transition-all group"
            >
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:-rotate-3 transition-all">
                <ExternalLink className="w-7 h-7 text-brand-primary" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-brand-secondary">المزيد</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function LogoutConfirmModal({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-white rounded-[40px] p-8 w-full max-w-sm shadow-2xl overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-full -mr-16 -mt-16 blur-2xl" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-6 transform -rotate-6">
            <LogOut className="w-10 h-10 text-red-500" />
          </div>
          
          <h3 className="text-2xl font-serif font-bold text-brand-primary mb-3">تسجيل الخروج</h3>
          <p className="text-brand-secondary opacity-70 mb-8 leading-relaxed">
            هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟
          </p>
          
          <div className="flex flex-col w-full gap-3">
            <button 
              onClick={onConfirm}
              className="w-full py-4 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20"
            >
              تسجيل الخروج
            </button>
            <button 
              onClick={onClose}
              className="w-full py-4 bg-brand-muted text-brand-secondary font-bold rounded-2xl hover:bg-brand-muted/80 transition-all"
            >
              إلغاء
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function AuthModal({ isOpen, onClose, onGoogleLogin }: { isOpen: boolean, onClose: () => void, onGoogleLogin: () => void }) {
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const validateAndFormatEmail = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (trimmed.includes('@')) {
      return trimmed;
    }
    // Clean all non-digits to test if it is a phone number
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 7) {
      return `${digits}@souqiraq.com`;
    }
    return trimmed;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const formatted = validateAndFormatEmail(emailOrPhone);
    if (!formatted) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني أو رقم الهاتف!');
      return;
    }

    if (activeTab === 'forgot') {
      if (formatted.endsWith('@souqiraq.com')) {
        setErrorMsg('الاستعادة متاحة فقط للحسابات المسجلة ببريد إلكتروني حقيقي.');
        return;
      }
      setLoading(true);
      try {
        await sendPasswordResetEmail(auth, formatted);
        setSuccessMsg('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح! فضلاً تحقق من صندوق الوارد أو البريد المزعج (Spam).');
      } catch (err: any) {
        console.error("Password reset error:", err);
        let arabicErrMsg = 'فشل إرسال رابط إعادة التعيين. يرجى التحقق من البريد الإلكتروني المدخل.';
        if (err.code === 'auth/user-not-found') {
          arabicErrMsg = 'عذراً، البريد الإلكتروني غير مسجل في تطبيقنا.';
        } else if (err.code === 'auth/invalid-email') {
          arabicErrMsg = 'صيغة البريد الإلكتروني غير صحيحة.';
        }
        setErrorMsg(arabicErrMsg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (password.length < 6) {
      setErrorMsg('يجب أن تكون كلمة المرور 6 خانات أو أكثر!');
      return;
    }
    if (activeTab === 'register' && !name.trim()) {
      setErrorMsg('يرجى إدخال اسمك الكريم!');
      return;
    }

    setLoading(true);

    try {
      if (activeTab === 'login') {
        await signInWithEmailAndPassword(auth, formatted, password);
        onClose();
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, formatted, password);
        // Set user profile display name
        await updateProfile(userCredential.user, {
          displayName: name.trim()
        });
        
        // Let's create user profile in dynamic firestore
        try {
          const userRef = doc(db, 'users', userCredential.user.uid);
          await setDoc(userRef, {
            displayName: name.trim(),
            email: formatted,
            createdAt: serverTimestamp(),
            uid: userCredential.user.uid,
            rating: 5,
            reviewsCount: 0,
            verifiedSeller: false,
            notificationPrefs: {
              newListings: true,
              priceDrops: true,
              messages: true,
              offers: true
            }
          }, { merge: true });
        } catch (fsErr) {
          console.error("Failed to write profile doc:", fsErr);
        }

        // Send confirmation email if it is a real email registered
        if (formatted && !formatted.endsWith('@souqiraq.com')) {
          try {
            await sendEmailVerification(userCredential.user);
          } catch (verifErr) {
            console.error("Defensive verification email fail on signup:", verifErr);
          }
        }

        onClose();
      }
    } catch (error: any) {
      console.error("Auth process error:", error);
      let arabicErrMsg = 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
      
      const code = (error?.code || '').toLowerCase();
      const rawMessage = (error?.message || '').toLowerCase();
      
      if (
        code === 'auth/email-already-in-use' || 
        rawMessage.includes('email-already-in-use')
      ) {
        arabicErrMsg = 'هذا الحساب (أو رقم الهاتف) مسجل بالفعل في تطبيقنا! جرب تسجيل الدخول بدلاً من إنشاء حساب جديد.';
      } else if (
        code === 'auth/invalid-credential' || 
        code === 'auth/wrong-password' || 
        code === 'auth/user-not-found' || 
        rawMessage.includes('invalid-credential') || 
        rawMessage.includes('wrong-password') || 
        rawMessage.includes('user-not-found')
      ) {
        arabicErrMsg = 'بيانات الدخول غير صحيحة! يرجى التأكد من البريد الإلكتروني (أو رقم الهاتف) وكلمة المرور بشكل صحيح.';
      } else if (
        code === 'auth/weak-password' || 
        rawMessage.includes('weak-password')
      ) {
        arabicErrMsg = 'كلمة المرور ضعيفة جداً! يجب أن تكون 6 خانات على الأقل.';
      } else if (
        code === 'auth/invalid-email' || 
        rawMessage.includes('invalid-email')
      ) {
        arabicErrMsg = 'صيغة البريد الإلكتروني أو الهاتف غير صالحة!';
      } else if (
        code === 'auth/too-many-requests' || 
        rawMessage.includes('too-many-requests')
      ) {
        arabicErrMsg = 'لقد حاولت تسجيل الدخول عدة مرات بشكل خاطئ! تم حظرك مؤقتاً لحماية الحساب، يرجى إعادة المحاولة لاحقاً.';
      } else if (rawMessage.includes('network-request-failed')) {
        arabicErrMsg = 'فشل الاتصال بالشبكة! يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
      }

      setErrorMsg(arabicErrMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full -mr-16 -mt-16 blur-2xl animate-pulse" />
        
        <div className="relative z-10 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-serif font-black text-brand-primary">سوق العراق</h3>
            <button 
              onClick={onClose} 
              className="w-8 h-8 rounded-full bg-brand-muted flex items-center justify-center hover:bg-brand-muted/80 text-brand-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Subtitle */}
          <p className="text-sm text-brand-secondary/60 mb-6 leading-relaxed text-right">
            أهلاً بك في منصة التجارة العراقية الأرقى! تواصل مع الباعة والمشترين بكل سهولة وأمان.
          </p>

          {/* Tabs */}
          {activeTab === 'forgot' ? (
            <div className="flex items-center gap-2 mb-6 flex-row-reverse justify-between w-full">
              <span className="text-sm font-black text-brand-primary">إعادة تعيين كلمة المرور</span>
              <button
                type="button"
                onClick={() => { setActiveTab('login'); setErrorMsg(''); setSuccessMsg(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-muted hover:bg-brand-muted/80 rounded-xl transition-all text-xs font-bold text-brand-primary"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>العودة للدخول</span>
              </button>
            </div>
          ) : (
            <div className="flex bg-brand-muted p-1 rounded-2xl mb-6">
              <button
                onClick={() => { setActiveTab('login'); setErrorMsg(''); setSuccessMsg(''); }}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
                  activeTab === 'login' 
                    ? 'bg-white text-brand-primary shadow-sm' 
                    : 'text-brand-secondary/70 hover:text-brand-primary'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                onClick={() => { setActiveTab('register'); setErrorMsg(''); setSuccessMsg(''); }}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
                  activeTab === 'register' 
                    ? 'bg-white text-brand-primary shadow-sm' 
                    : 'text-brand-secondary/70 hover:text-brand-primary'
                }`}
              >
                إنشاء حساب جديد
              </button>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-100 text-red-600 rounded-2xl p-4 text-xs font-bold mb-4 flex flex-col gap-2 text-right"
            >
              <div className="flex items-center gap-2 flex-row-reverse">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMsg}</span>
              </div>
              {errorMsg.includes('مسجل بالفعل') && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="mt-1 w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>🔑 الانتقال لتسجيل الدخول بدلاً من ذلك</span>
                </button>
              )}
            </motion.div>
          )}

          {/* Success Message */}
          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl p-4 text-xs font-bold mb-4 flex items-center gap-2 flex-row-reverse text-right"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-right">
            {activeTab === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-black text-brand-primary">الاسم الكريم</label>
                <input 
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: أبو محمد البغدادي"
                  className="w-full bg-brand-muted border-none p-4 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all text-right"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-black text-brand-primary">
                {activeTab === 'forgot' ? 'البريد الإلكتروني للتهيئة' : 'رقم الهاتف العراقي أو البريد الإلكتروني'}
              </label>
              <input 
                type="text"
                required
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder={activeTab === 'forgot' ? "mail@example.com" : "مثال: 07701234567 أو mail@example.com"}
                className="w-full bg-brand-muted border-none p-4 rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all text-right ltr"
              />
            </div>

            {activeTab !== 'forgot' && (
              <div className="space-y-1.5">
                <label className="text-xs font-black text-brand-primary">كلمة المرور</label>
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-brand-muted border-none p-4 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all text-right ltr"
                />
              </div>
            )}

            {activeTab === 'login' && (
              <div className="text-left mt-1">
                <button 
                  type="button"
                  onClick={() => { setActiveTab('forgot'); setErrorMsg(''); setSuccessMsg(''); }}
                  className="text-xs font-bold text-brand-primary/80 hover:text-brand-primary underline transition-colors"
                >
                  نسيت كلمة المرور؟ اضغط هنا للاستعادة
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-brand-primary text-white font-black rounded-2xl hover:bg-brand-primary/95 transition-all active:scale-[0.98] shadow-lg shadow-brand-primary/10 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري المعالجة...</span>
                </>
              ) : (
                <span>
                  {activeTab === 'login' 
                    ? 'دخول سريع' 
                    : activeTab === 'register' 
                      ? 'إنشاء حسابي مجاناً' 
                      : 'إرسال رابط استعادة كلمة المرور'
                  }
                </span>
              )}
            </button>
          </form>


        </div>
      </motion.div>
    </div>
  );
}

function FullScreenGallery({ images, initialIndex, onClose }: { images: string[], initialIndex: number, onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [dragY, setDragY] = useState(0);

  const nextImage = () => setIndex((prev) => (prev + 1) % images.length);
  const prevImage = () => setIndex((prev) => (prev - 1 + images.length) % images.length);

  // Reset zoom when image changes
  useEffect(() => {
    setScale(1);
  }, [index]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center select-none touch-none"
    >
      <motion.div 
        className="absolute inset-0 bg-black"
        style={{ opacity: 1 - Math.abs(dragY) / 400 }}
      />

      <div className="absolute top-8 left-8 flex gap-4 z-50">
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="p-4 bg-white/10 backdrop-blur-xl border border-white/10 rounded-full text-white hover:bg-white/20 transition-all shadow-2xl"
        >
          <X className="w-8 h-8" />
        </motion.button>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="px-6 py-3 bg-white/10 backdrop-blur-xl border border-white/10 rounded-full text-white font-black text-sm tracking-widest uppercase shadow-2xl"
        >
          {index + 1} / {images.length}
        </motion.div>
        <div className="flex gap-2 p-1 bg-white/5 backdrop-blur-sm rounded-full border border-white/5 overflow-hidden">
          {images.map((_, i) => (
            <motion.div 
              key={i} 
              animate={{ 
                width: i === index ? 32 : 8,
                backgroundColor: i === index ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.1)"
              }}
              className="h-1.5 rounded-full transition-all duration-500"
            />
          ))}
        </div>
      </div>

      {images.length > 1 && (
        <div className="hidden md:contents">
          <motion.button 
            whileHover={{ scale: 1.1, x: 5 }}
            whileTap={{ scale: 0.9 }}
            onClick={prevImage}
            className="absolute right-8 w-14 h-14 bg-white/5 hover:bg-white/10 rounded-full text-white transition-all z-50 flex items-center justify-center font-black"
          >
            <span className="text-2xl font-serif font-black leading-none">→</span>
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.1, x: -5 }}
            whileTap={{ scale: 0.9 }}
            onClick={nextImage}
            className="absolute left-8 w-14 h-14 bg-white/5 hover:bg-white/10 rounded-full text-white transition-all z-50 flex items-center justify-center font-black"
          >
            <span className="text-2xl font-serif font-black leading-none">←</span>
          </motion.button>
        </div>
      )}

      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={index}
            drag={scale === 1 ? true : false}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.8}
            onDrag={(e, info) => {
              if (scale === 1) setDragY(info.offset.y);
            }}
            onDragEnd={(_, info) => {
              setDragY(0);
              const swipeX = info.offset.x;
              const swipeY = info.offset.y;
              const velocityX = info.velocity.x;
              const velocityY = info.velocity.y;

              if (Math.abs(swipeY) > 200 || Math.abs(velocityY) > 500) {
                onClose();
              } else if (swipeX > 100 || velocityX > 500) {
                prevImage();
              } else if (swipeX < -100 || velocityX < -500) {
                nextImage();
              }
            }}
            initial={{ opacity: 0, x: 100, scale: 0.9, rotate: 5 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, x: -100, scale: 0.9, rotate: -5 }}
            transition={{ 
              type: "spring", 
              damping: 25, 
              stiffness: 150,
              mass: 0.8
            }}
            className="w-full h-full flex items-center justify-center relative p-4 md:p-20"
          >
            <motion.img
              src={images[index]}
              alt={`Gallery image ${index + 1}`}
              animate={{ 
                scale,
                y: dragY
              }}
              onClick={() => setScale(scale === 1 ? 2.5 : 1)}
              className={cn(
                "max-w-full max-h-full object-contain shadow-[0_50px_100px_rgba(0,0,0,0.5)] transition-all duration-500 cursor-zoom-in rounded-2xl",
                scale > 1 && "cursor-zoom-out"
              )}
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function AdDetailsView({ ad, onBack, onStartChat, currentUser, profile, blockedUsers, createNotification, isFavorited, onToggleFavorite, onViewProfile }: any) {
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMarkingSold, setIsMarkingSold] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState(ad.price.toString());
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);

  // Touch handlers for swipe-to-back with visual swipe feedback
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    setSwipeOffset(0);
    setSwipeDirection(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent default or track movement only if horizontal
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    
    const diffX = touchEndX.current - touchStartX.current;
    const diffY = touchEndY.current - touchStartY.current;

    if (Math.abs(diffX) > 15 && Math.abs(diffY) < 45) {
      setSwipeOffset(Math.abs(diffX));
      setSwipeDirection(diffX > 0 ? 'right' : 'left');
    } else if (Math.abs(diffY) > 45) {
      // Cancel active swipe animation on strong vertical scroll
      setSwipeOffset(0);
      setSwipeDirection(null);
    }
  };

  const handleTouchEnd = () => {
    const diffX = touchEndX.current - touchStartX.current;
    const diffY = touchEndY.current - touchStartY.current;

    setSwipeOffset(0);
    setSwipeDirection(null);

    // Swipe exit triggered if largely horizontal swipe of 120px in either direction
    if (Math.abs(diffX) > 120 && Math.abs(diffY) < 70) {
      onBack();
    }
  };

  const isBlocked = blockedUsers?.includes(ad.sellerId);

  useEffect(() => {
    const fetchSeller = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', ad.sellerId));
        if (snap.exists()) {
          setSellerProfile(snap.data());
        }
      } catch (e) { console.error("Error fetching seller:", e); }
    };
    fetchSeller();
  }, [ad.sellerId]);

  const images = ad.images && ad.images.length > 0 ? ad.images : ['https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=2000&auto=format&fit=crop'];

  const toggleBlockUser = async () => {
    if (!currentUser || ad.sellerId === currentUser.uid) return;
    
    setIsBlocking(true);
    try {
      const blockRef = doc(db, 'users', currentUser.uid, 'blocks', ad.sellerId);
      if (isBlocked) {
        await deleteDoc(blockRef);
      } else {
        await setDoc(blockRef, {
          blockedUserId: ad.sellerId,
          createdAt: serverTimestamp()
        });
        onBack();
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}/blocks/${ad.sellerId}`);
    } finally {
      setIsBlocking(false);
    }
  };

  const handleUpdatePrice = async () => {
    if (!currentUser || ad.sellerId !== currentUser.uid || isUpdatingPrice) return;
    const priceVal = Number(newPrice);
    if (isNaN(priceVal) || priceVal <= 0) return;

    setIsUpdatingPrice(true);
    try {
      const oldPrice = ad.price;
      await updateDoc(doc(db, 'ads', ad.id), { price: priceVal });
      
      // If price dropped, notify interested users
      if (priceVal < oldPrice && ad.watchers && ad.watchers.length > 0) {
        // Notify users who have this ad in their favorites
        for (const watcherId of ad.watchers) {
          if (watcherId !== currentUser.uid) {
            await createNotification(
              watcherId,
              'انخفاض السعر!',
              `لقد انخفض سعر "${ad.title}" من ${oldPrice.toLocaleString()} إلى ${priceVal.toLocaleString()} د.ع!`,
              'price',
              { adId: ad.id }
            ).catch(() => {});
          }
        }
      }
      setIsEditingPrice(false);
      // We rely on parent to update the ad object or refreshing the view
      ad.price = priceVal; // Optimistic update for local UI
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ads/${ad.id}`);
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const handleMarkAsSold = async () => {
    if (!currentUser || ad.sellerId !== currentUser.uid) return;
    setIsMarkingSold(true);
    try {
      await updateDoc(doc(db, 'ads', ad.id), { status: 'sold' });
      
      // Notify potential buyers (those who chatted about this ad)
      const chatsQuery = query(collection(db, 'chats'), where('adId', '==', ad.id));
      const chatSnap = await getDocs(chatsQuery);
      chatSnap.forEach(async (chatDoc) => {
        const chatData = chatDoc.data();
        const recipientId = chatData.participants.find((p: string) => p !== currentUser?.uid);
        if (recipientId) {
          await createNotification(
            recipientId,
            'تم بيع المنتج!',
            `لقد تم بيع "${ad.title}" الذي كنت مهتماً به.`,
            'sale',
            { adId: ad.id }
          );
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ads/${ad.id}`);
    } finally {
      setIsMarkingSold(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="bg-brand-bg min-h-screen pb-40 select-none relative"
    >
      {/* Interactive System-like Back Swipe Visual Indicator */}
      {swipeDirection && swipeOffset > 15 && (
        <div 
          className={cn(
            "fixed top-1/2 -translate-y-1/2 z-[99999] pointer-events-none transition-transform duration-75 flex items-center justify-center",
            swipeDirection === 'right' ? "left-4" : "right-4"
          )}
          style={{
            transform: `translateY(-50%) translateX(${swipeDirection === 'right' ? Math.min(swipeOffset * 0.35 - 30, 25) : -Math.min(swipeOffset * 0.35 - 30, 25)}px) scale(${Math.min(0.6 + swipeOffset / 110, 1.3)})`,
            opacity: Math.min(swipeOffset / 90, 0.95),
          }}
        >
          <div className={cn(
            "flex items-center gap-2.5 px-4.5 py-3 rounded-full text-white shadow-2xl border backdrop-blur-xl transition-all duration-300",
            swipeOffset >= 120 
              ? "bg-gradient-to-r from-amber-400 to-yellow-500 border-yellow-400 text-[#090e1f] scale-105" 
              : "bg-brand-primary/90 border-white/25 text-white"
          )}>
            {swipeDirection === 'right' ? (
              <ChevronRight className={cn("w-5 h-5", swipeOffset >= 120 ? "animate-ping text-[#090e1f]" : "animate-pulse")} />
            ) : (
              <ChevronLeft className={cn("w-5 h-5", swipeOffset >= 120 ? "animate-ping text-[#090e1f]" : "animate-pulse")} />
            )}
            <span className="text-[11px] font-black tracking-widest text-[#090e1f] uppercase">
              {swipeOffset >= 120 ? "أفلت للعودة" : "اسحب للعودة"}
            </span>
          </div>
        </div>
      )}

      {/* Swipe back gesture helper pill */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: [0, 0.8, 0.8, 0], y: 0 }}
          transition={{ delay: 1, duration: 4.5, times: [0, 0.1, 0.9, 1] }}
          className="flex items-center gap-2 px-4.5 py-2.5 bg-black/75 backdrop-blur-md rounded-full text-white text-[10px] font-bold tracking-wider text-center shadow-2xl border border-white/15"
        >
          <span className="animate-pulse text-yellow-400">⚡</span>
          <span>اسحب لليمين أو اليسار للعودة السريعة</span>
          <span className="animate-pulse text-yellow-400">⚡</span>
        </motion.div>
      </div>

      <AnimatePresence>
        {isFullscreen && (
          <FullScreenGallery 
            images={images} 
            initialIndex={currentImageIndex} 
            onClose={() => setIsFullscreen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Immersive Gallery Header */}
      <section className="relative h-[45vh] sm:h-[60vh] lg:h-[80vh] w-full overflow-hidden group touch-none">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.img 
            key={currentImageIndex}
            src={images[currentImageIndex]} 
            alt={ad.title} 
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={(_, info) => {
              if (info.offset.x > 100) {
                setCurrentImageIndex(prev => (prev - 1 + images.length) % images.length);
              } else if (info.offset.x < -100) {
                setCurrentImageIndex(prev => (prev + 1) % images.length);
              }
            }}
            initial={{ opacity: 0, x: 20, scale: 1.1 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.9 }}
            transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
            className="w-full h-full object-cover cursor-zoom-in"
            referrerPolicy="no-referrer"
            onClick={() => setIsFullscreen(true)}
          />
        </AnimatePresence>
        
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-brand-bg" />

        {/* Floating Controls */}
        <div className="absolute top-4 left-4 right-4 sm:top-8 sm:left-8 sm:right-8 flex justify-between items-center z-50">
           <button onClick={onBack} className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-2xl border border-white/20 rounded-full text-white hover:bg-white/40 transition-all active:scale-90 shadow-xl flex items-center justify-center font-black">
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
           </button>
           <div className="flex gap-2 sm:gap-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowBlockConfirm(true); }}
                disabled={isBlocking}
                className={cn(
                  "p-2.5 sm:p-4 bg-white/20 backdrop-blur-2xl border border-white/20 rounded-full text-white hover:bg-red-500 transition-all active:scale-90 shadow-xl",
                  isBlocked && "bg-red-600 border-red-600"
                )}
              >
                {isBlocking ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <Ban className="w-5 h-5 sm:w-6 sm:h-6" />}
              </button>
              <button onClick={onToggleFavorite} className="p-2.5 sm:p-4 bg-white/20 backdrop-blur-2xl border border-white/20 rounded-full text-white hover:bg-white/40 transition-all shadow-xl">
                 <Heart className={cn("w-5 h-5 sm:w-6 sm:h-6 transition-colors", isFavorited ? "fill-red-500 text-red-500" : "")} />
              </button>
              <button onClick={() => setIsShareModalOpen(true)} className="p-2.5 sm:p-4 bg-white/20 backdrop-blur-2xl border border-white/20 rounded-full text-white hover:bg-white/40 transition-all shadow-xl">
                 <Share2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
           </div>
        </div>

        <ConfirmModal 
          isOpen={showBlockConfirm}
          onClose={() => setShowBlockConfirm(false)}
          onConfirm={toggleBlockUser}
          title={isBlocked ? "إلغاء الحظر" : "حظر المستخدم"}
          message={isBlocked ? "هل تريد إلغاء حظر هذا المستخدم؟" : "هل أنت متأكد أنك تريد حظر هذا المستخدم؟ لن تظهر إعلاناته لك ولن تتمكن من مراسلته."}
          confirmText={isBlocked ? "إلغاء الحظر" : "حظر المستخدم"}
          isDestructive={!isBlocked}
        />

        {/* Thumbnails Navigator */}
        <div className="absolute bottom-4 sm:bottom-12 left-1/2 -translate-x-1/2 flex gap-2 sm:gap-3 z-50 overflow-x-auto no-scrollbar max-w-[90vw] p-1.5 sm:p-2 glass rounded-2xl sm:rounded-[32px]">
           {images.map((img: string, idx: number) => (
             <button 
               key={`thumb-${idx}`}
               onClick={() => setCurrentImageIndex(idx)}
               className={cn(
                 "w-11 h-11 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl overflow-hidden border-2 transition-all shrink-0",
                 currentImageIndex === idx ? "border-white scale-105 sm:scale-110 shadow-2xl" : "border-transparent opacity-40 hover:opacity-100"
               )}
             >
               <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
             </button>
           ))}
        </div>
      </section>

      {/* Content Section - Editorial Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 -mt-6 sm:-mt-10 lg:-mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
        <div className="lg:col-span-8 space-y-8 sm:space-y-12 lg:space-y-16">
          {/* Header Info */}
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center gap-3">
               <span className="px-3 py-1 rounded-full bg-brand-primary text-white text-[9px] font-black uppercase tracking-[0.15em]">{ad.category}</span>
               <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-secondary opacity-50 uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5" />
                  {ad.location.city}
               </div>
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-7xl font-serif font-black text-brand-primary leading-tight">{ad.title}</h1>
            
            <div className="flex items-baseline gap-3">
               <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-primary">
                 {ad.price.toLocaleString()} <span className="text-sm opacity-40">د.ع</span>
               </p>
               {ad.condition === 'new' && <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">جديد تماماً</span>}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-4 sm:space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.25em] opacity-45 border-b border-brand-border pb-3">عن هذا المنتج</h3>
            <div className="prose prose-stone max-w-none">
               <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-brand-secondary leading-relaxed font-normal">
                 {ad.description}
               </p>
            </div>
          </div>

          <PriceChart price={ad.price} />

          {/* Location / Safety */}
          <div className="p-5 sm:p-8 rounded-3xl sm:rounded-[36px] bg-brand-accent/50 border border-brand-border space-y-4 sm:space-y-6">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                   <AlertCircle className="w-6 h-6 text-brand-primary" />
                </div>
                <div>
                   <h4 className="font-bold text-lg">نصيحة الأمان</h4>
                   <p className="text-xs text-brand-secondary">تأكد دائماً من معاينة المنتج في مكان عام قبل الدفع.</p>
                </div>
             </div>
          </div>
        </div>

        {/* Sidebar - Seller & Actions */}
        <div className="lg:col-span-4 space-y-8">
           <div className="sticky top-32 space-y-8">
              <div className="p-5 sm:p-8 rounded-3xl sm:rounded-[40px] bg-white border border-brand-border shadow-elite space-y-6 sm:space-y-8">
                 <div className="flex items-center gap-4 border-b border-brand-border pb-8">
                    <div className="w-20 h-20 rounded-3xl overflow-hidden border border-brand-border bg-brand-muted shrink-0 shadow-inner-glow">
                       <img 
                        src={sellerProfile?.photoURL || `https://ui-avatars.com/api/?name=${ad.sellerName}&background=000&color=fff`} 
                        alt="" 
                        className="w-full h-full object-cover"
                       />
                    </div>
                    <div>
                       <p className="text-[10px] font-black uppercase tracking-widest text-brand-secondary opacity-40 mb-1">البائع</p>
                       <h4 className="text-xl font-serif font-black text-brand-primary line-clamp-1 flex items-center gap-1.5">
                         {ad.sellerName}
                         <CheckCircle2 className="w-4 h-4 text-blue-500 fill-blue-50" />
                       </h4>
                       <button onClick={() => onViewProfile(ad.sellerId)} className="text-[10px] font-bold text-brand-primary underline underline-offset-4 hover:opacity-60 transition-opacity">مشاهدة الملف الشخصي</button>
                    </div>
                 </div>

                 <div className="space-y-4">
                    {ad.status === 'active' ? (
                       <>
                        <button 
                          onClick={onStartChat}
                          className="relative w-full overflow-hidden bg-gradient-to-r from-brand-primary via-[#1c2954] to-brand-primary text-white py-4.5 sm:py-5.5 rounded-2xl sm:rounded-[32px] font-black text-base sm:text-lg shadow-xl shadow-brand-primary/20 hover:shadow-2xl hover:shadow-brand-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 group"
                        >
                          {/* Decorative inner light effect */}
                          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                          <div className="absolute -inset-y-2 -right-4 w-12 bg-white/10 skew-x-12 translate-x-[-400px] group-hover:translate-x-[600px] transition-transform duration-1000 ease-out pointer-events-none" />
                          
                          <div className="relative flex items-center gap-3 w-full">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/10 sm:bg-white/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <MessageSquare className="w-4.5 h-4.5 text-white animate-pulse" />
                            </div>
                            <div className="text-right flex flex-col justify-center leading-none">
                              <span className="text-sm sm:text-base font-serif font-black">دردشة فورية آمنة</span>
                              <span className="text-[9px] sm:text-[10px] opacity-75 font-sans block mt-1">تواصل مباشرة ومجاناً داخل التطبيق</span>
                            </div>
                            <span className="mr-auto bg-white/20 text-white text-[9px] px-2.5 py-0.5 rounded-full font-sans tracking-wide">متصل ⚡</span>
                          </div>
                        </button>
                        
                        <div className="grid grid-cols-2 gap-4">
                          {ad.phoneNumber && (
                             <a 
                              href={`tel:${ad.phoneNumber}`}
                              className="bg-brand-muted text-brand-primary py-3.5 sm:py-5 px-3 rounded-2xl sm:rounded-[32px] font-bold text-xs sm:text-sm shadow-sm hover:bg-brand-primary hover:text-white transition-all flex flex-col items-center justify-center gap-1.5"
                             >
                               <PhoneCall className="w-5 h-5" />
                               اتصال مباشر
                             </a>
                          )}
                          {ad.whatsappNumber && (
                             <a 
                              href={`https://wa.me/${ad.whatsappNumber.replace(/^0/, '964').replace(/\s/g, '')}?text=مرحباً، أنا مهتم بمنتجك: ${ad.title}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-emerald-50 text-emerald-600 py-3.5 sm:py-5 px-3 rounded-2xl sm:rounded-[32px] font-bold text-xs sm:text-sm shadow-sm hover:bg-emerald-500 hover:text-white transition-all flex flex-col items-center justify-center gap-1.5"
                             >
                               <Phone className="w-5 h-5" />
                               واتساب
                             </a>
                          )}
                        </div>
                       </>
                    ) : (
                       <div className="bg-brand-muted p-6 rounded-3xl text-center border border-brand-border">
                          <p className="font-black text-brand-secondary opacity-40 uppercase tracking-[0.2em]">هذا المنتج مباع</p>
                       </div>
                    )}
                 </div>
              </div>

              {currentUser && currentUser.uid === ad.sellerId && ad.status === 'active' && (
                <div className="space-y-4">
                  {isEditingPrice ? (
                    <div className="p-4 bg-brand-muted rounded-3xl border border-brand-border space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand-primary opacity-40">تعديل السعر</p>
                      <input 
                        type="number"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        className="w-full bg-white border border-brand-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20"
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={handleUpdatePrice}
                          disabled={isUpdatingPrice}
                          className="flex-1 bg-brand-primary text-white py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          {isUpdatingPrice ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          حفظ
                        </button>
                        <button 
                          onClick={() => setIsEditingPrice(false)}
                          className="flex-1 bg-white border border-brand-border text-brand-secondary py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsEditingPrice(true)}
                      className="w-full bg-white border border-brand-border text-brand-primary py-4 rounded-[32px] font-bold text-sm hover:bg-brand-muted transition-all flex items-center justify-center gap-2"
                    >
                      <TrendingDown className="w-4 h-4" />
                      تعديل السعر
                    </button>
                  )}

                  <button 
                    onClick={handleMarkAsSold}
                    disabled={isMarkingSold}
                    className="w-full bg-white border-2 border-dashed border-brand-border text-brand-secondary py-5 rounded-[32px] font-bold hover:border-brand-primary hover:text-brand-primary transition-all flex items-center justify-center gap-2"
                  >
                    {isMarkingSold ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    تغيير حالة المنتج إلى (مباع)
                  </button>
                </div>
              )}
           </div>
        </div>
      </div>

      <AnimatePresence>
        {isShareModalOpen && (
          <ShareModal 
            isOpen={isShareModalOpen} 
            onClose={() => setIsShareModalOpen(false)} 
            ad={ad} 
          />
        )}
      </AnimatePresence>

      {/* Mobile Sticky Actions Bar for Android/iOS scale precision */}
      {ad.status === 'active' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-brand-border/60 p-4 pb-safe shadow-[0_-12px_40px_rgba(0,0,0,0.08)] flex items-center justify-between gap-4 lg:hidden">
          <div className="flex flex-col text-right">
            <span className="text-[9px] font-black uppercase tracking-wider opacity-50">السعر</span>
            <span className="text-xl font-bold text-[#090e1f]">
              {ad.price.toLocaleString()} <span className="text-xs font-normal opacity-50">د.ع</span>
            </span>
          </div>
          
          <div className="flex gap-2.5 flex-1 max-w-[70%] justify-end">
            <button 
              onClick={onStartChat}
              className="relative overflow-hidden flex-1 bg-gradient-to-r from-brand-primary to-[#1a233d] text-white py-3 px-4.5 rounded-2xl font-black text-sm shadow-lg shadow-brand-primary/10 active:scale-[0.96] transition-all flex items-center justify-center gap-2 group"
            >
              <div className="absolute -inset-y-2 -right-4 w-6 bg-white/10 skew-x-12 translate-x-[-150px] group-hover:translate-x-[300px] transition-transform duration-700 ease-out pointer-events-none" />
              <MessageSquare className="w-4.5 h-4.5 shrink-0 animate-pulse text-white" />
              <span className="font-serif">دردشة فورية</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
            </button>
            
            {ad.phoneNumber && (
              <a 
                href={`tel:${ad.phoneNumber}`}
                className="p-3 bg-brand-muted text-brand-primary rounded-xl font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1"
                title="اتصال مباشر"
              >
                <PhoneCall className="w-4 h-4 shrink-0" />
              </a>
            )}
            
            {ad.whatsappNumber && (
              <a 
                href={`https://wa.me/${ad.whatsappNumber.replace(/^0/, '964').replace(/\s/g, '')}?text=مرحباً، أنا مهتم بمنتجك: ${ad.title}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1"
                title="واتساب"
              >
                <Phone className="w-4 h-4 shrink-0" />
              </a>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function QuickViewModal({ ad, isOpen, onClose, onDetails, onToggleFavorite, isFavorited }: any) {
  if (!ad) return null;
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white rounded-[48px] overflow-hidden max-w-4xl w-full shadow-2xl relative z-10 grid grid-cols-1 md:grid-cols-2"
          >
            <div className="relative aspect-[4/5] md:aspect-auto h-full grainy bg-brand-muted">
              <img src={ad.images[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute top-6 right-6">
                <span className="glass px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-brand-primary">{ad.category}</span>
              </div>
              <button 
                onClick={onToggleFavorite}
                className="absolute bottom-6 left-6 p-4 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl hover:scale-110 active:scale-90 transition-all"
              >
                <Heart className={cn("w-6 h-6", isFavorited ? "fill-red-500 text-red-500" : "text-brand-primary")} />
              </button>
            </div>
            
            <div className="p-10 flex flex-col space-y-8">
              <div className="space-y-4">
                <h3 className="text-3xl font-serif font-black text-brand-primary leading-tight">{ad.title}</h3>
                <p className="text-brand-secondary line-clamp-3 text-sm leading-relaxed opacity-70">{ad.description}</p>
              </div>
              
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-brand-primary">{ad.price.toLocaleString()}</span>
                <span className="text-xs font-black opacity-30 uppercase tracking-widest">د.ع</span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-y border-brand-border py-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-muted rounded-xl"><MapPin className="w-4 h-4 text-brand-secondary" /></div>
                  <span className="text-xs font-bold text-brand-primary">{ad.location.city}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-muted rounded-xl"><Star className="w-4 h-4 text-brand-secondary" /></div>
                  <span className="text-xs font-bold text-brand-primary">{ad.condition === 'new' ? 'جديد' : 'مستعمل'}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={onDetails}
                  className="flex-1 bg-brand-primary text-white py-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-brand-primary/20"
                >
                  التفاصيل الكاملة
                </button>
                <button 
                  onClick={onClose}
                  className="px-6 bg-brand-muted text-brand-primary rounded-2xl font-bold hover:bg-brand-border transition-all"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function CommentSection({ adId, sellerId, adTitle, currentUser, profile, createNotification }: any) {
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'ads', adId, 'comments'), orderBy('createdAt', 'desc'), limit(10));
    return onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `ads/${adId}/comments`);
    });
  }, [adId]);

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || submitting) return;
    setSubmitting(true);
    try {
      const text = newComment;
      setNewComment('');
      await addDoc(collection(db, 'ads', adId, 'comments'), {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'مستخدم',
        userPhoto: profile?.photoURL || currentUser.photoURL || '',
        text,
        createdAt: serverTimestamp()
      });

      // Notify Seller
      if (currentUser.uid !== sellerId) {
        await createNotification(
          sellerId,
          'تعليق جديد على إعلانك',
          `${currentUser.displayName} علّق على "${adTitle}": ${text}`,
          'comment',
          { adId }
        );
      }
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      {currentUser && (
        <form onSubmit={postComment} className="flex gap-2">
          <input 
            type="text" 
            placeholder="أضف تعليقاً..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="flex-1 bg-white border border-brand-border rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20"
          />
          <button 
            type="submit"
            disabled={!newComment.trim() || submitting}
            className="p-3 bg-brand-primary text-white rounded-2xl disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
          </button>
        </form>
      )}
      <div className="space-y-3">
        {comments.map(c => (
          <div key={`cmt-${c.id}`} className="bg-white p-4 rounded-2xl border border-brand-border text-sm flex gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-brand-border bg-brand-muted">
              {c.userPhoto ? (
                <img src={c.userPhoto} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-4 h-4 text-brand-secondary opacity-40" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-[#444432]">{c.userName}</span>
                <span className="text-[10px] text-brand-secondary">
                  {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : '...'}
                </span>
              </div>
              <p className="text-[#6b6b5d]">{c.text}</p>
            </div>
          </div>
        ))}
        {comments.length === 0 && <p className="text-center text-xs text-brand-secondary opacity-50 py-4">لا توجد تعليقات بعد</p>}
      </div>
    </div>
  );
}

function SellerProfileView({ userId, onBack, onAdClick, onStartChat, currentUser, onLogin, createNotification }: any) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ads' | 'reviews'>('ads');

  // Review Form state
  const [userRating, setUserRating] = useState(5);
  const [commentText, setCommentText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchProfileAndData = async () => {
    try {
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists()) {
        setProfile(userSnap.data() as UserProfile);
      }

      const adsQuery = query(
        collection(db, 'ads'),
        where('sellerId', '==', userId),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc')
      );
      const adsSnap = await getDocs(adsQuery);
      setAds(adsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ad)));

      // Load Reviews defensively to handle index building time latency
      let fetchedReviews: any[] = [];
      try {
        const reviewsQuery = query(
          collection(db, 'users', userId, 'reviews'),
          orderBy('createdAt', 'desc')
        );
        const reviewsSnap = await getDocs(reviewsQuery);
        fetchedReviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn("Index is probably building. Querying without order and sorting manually.");
        try {
          const reviewsSnap = await getDocs(collection(db, 'users', userId, 'reviews'));
          fetchedReviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          // sort in-memory
          fetchedReviews.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });
        } catch (innerErr) {
          console.error("Error loaded fallback reviews:", innerErr);
        }
      }
      setReviews(fetchedReviews);

    } catch (e) {
      console.error("Error fetching seller profile details:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchProfileAndData();
  }, [userId]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 5.0;
    const total = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    return parseFloat((total / reviews.length).toFixed(1));
  }, [reviews]);

  const ratingDistribution = useMemo(() => {
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => {
      const star = Math.round(r.rating || 0);
      if (star >= 1 && star <= 5) {
        dist[star as keyof typeof dist] += 1;
      }
    });
    return dist;
  }, [reviews]);

  const hasReviewedAlready = useMemo(() => {
    if (!currentUser) return false;
    return reviews.some(r => r.reviewerId === currentUser.uid);
  }, [reviews, currentUser]);

  const handlePostReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      if (onLogin) onLogin();
      return;
    }
    if (currentUser.uid === userId) {
      setFormError("لا يمكنك تقييم حسابك الشخصي!");
      return;
    }
    if (!commentText.trim()) {
      setFormError("الرجاء كتابة تعليق لوصف معاملتك مع البائع.");
      return;
    }

    setSubmittingReview(true);
    setFormError(null);

    try {
      const reviewPayload = {
        reviewerId: currentUser.uid,
        reviewerName: currentUser.displayName || 'مشتري الرافدين',
        reviewerPhoto: currentUser.photoURL || '',
        rating: userRating,
        comment: commentText.trim(),
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'users', userId, 'reviews'), reviewPayload);

      // Notify the seller dynamically
      if (createNotification) {
        const starEmoji = "⭐".repeat(userRating);
        await createNotification(
          userId,
          'تقييم جديد في ملفك الشخصي  ',
          `أضاف ${currentUser.displayName || 'مشتري'} تقييماً جديداً بـ ${userRating} نجوم: "${commentText.trim().substring(0, 40)}..."`,
          'info'
        );
      }

      // Smooth local state injection/reload for latency-free update
      setCommentText('');
      setUserRating(5);
      
      // Reload reviews and profile metadata
      await fetchProfileAndData();
    } catch (error) {
      console.error("Error posting seller review:", error);
      setFormError("عذراً، لم نتمكن من نشر التقييم حالياً. يرجى المحاولة لاحقاً.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const getRatingLabel = (stars: number) => {
    if (stars === 5) return "ممتاز جداً";
    if (stars === 4) return "جيد جداً";
    if (stars === 3) return "متوسط";
    if (stars === 2) return "مقبول";
    return "سيء";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-brand-bg min-h-screen pb-24"
    >
      <div className="bg-white border-b border-brand-border p-4 sticky top-0 z-30 flex items-center gap-4">
        <button onClick={onBack} className="p-3 bg-brand-muted rounded-2xl text-brand-primary">
          <ChevronRight className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-serif font-bold text-brand-primary">
          ملف البائع
        </h2>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-12">
        {/* Profile Card Summary Header */}
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-tr from-brand-primary to-brand-muted rounded-full opacity-25 blur group-hover:opacity-40 transition duration-500"></div>
            <div className="relative w-32 h-32 bg-brand-muted border-4 border-white rounded-full overflow-hidden shadow-2xl">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
              ) : (
                <img src={`https://ui-avatars.com/api/?name=${profile?.displayName}&background=51513d&color=fff`} className="w-full h-full" alt="" />
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-3xl font-serif font-bold text-brand-primary">{profile?.displayName}</h1>
              {profile?.isVerified && (
                <CheckCircle2 className="w-6 h-6 text-blue-500 fill-blue-50" />
              )}
            </div>
            
            <div className="flex items-center justify-center gap-4 text-xs font-semibold">
              <span className="bg-brand-primary/10 text-brand-primary px-3 py-1.5 rounded-full">
                {profile?.isVerified ? '✓ بائع موثق' : 'بائع نشط'}
              </span>
              
              {/* Star rating summary trigger */}
              <div className="flex items-center gap-1.5 text-amber-500 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200/50">
                <Star className="w-4 h-4 fill-amber-500" />
                <span className="font-bold text-amber-600">{averageRating}</span>
                <span className="text-[#a4a496]">({reviews.length} تقييم)</span>
              </div>
            </div>
          </div>

          {/* Core Info Bento Grid */}
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
            <div className="bg-white p-5 rounded-3xl border border-brand-border/60 shadow-sm text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-secondary/70 mb-1 font-mono">الإعلانات النشطة</p>
              <p className="text-2xl font-serif font-bold text-brand-primary">{ads.length}</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-brand-border/60 shadow-sm text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-secondary/70 mb-1 font-mono">التقييم العام</p>
              <p className="text-2xl font-serif font-bold text-amber-500">
                {reviews.length > 0 ? averageRating : 'جديد'}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="border-b border-brand-border flex items-center justify-center gap-4">
          <button 
            type="button"
            onClick={() => setActiveTab('ads')}
            className={`pb-4 px-6 text-sm font-bold transition-all relative ${activeTab === 'ads' ? 'text-brand-primary' : 'text-brand-secondary/60'}`}
          >
            إعلانات البائع ({ads.length})
            {activeTab === 'ads' && (
              <motion.div layoutId="seller_tab_line" className="absolute bottom-0 left-0 right-0 h-1 bg-brand-primary rounded-full" />
            )}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('reviews')}
            className={`pb-4 px-6 text-sm font-bold transition-all relative ${activeTab === 'reviews' ? 'text-brand-primary' : 'text-brand-secondary/60'}`}
          >
            آراء وتقييمات المشترين ({reviews.length})
            {activeTab === 'reviews' && (
              <motion.div layoutId="seller_tab_line" className="absolute bottom-0 left-0 right-0 h-1 bg-brand-primary rounded-full" />
            )}
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="space-y-8">
          {activeTab === 'ads' ? (
            <div className="space-y-8">
              {ads.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {ads.map(ad => (
                    <AdCard 
                      key={`seller-ad-${ad.id}`} 
                      ad={ad} 
                      onClick={() => onAdClick(ad)}
                      hideFavorite={true}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-24 bg-white rounded-[32px] border border-brand-border/60 shadow-sm p-10">
                  <ShoppingBag className="w-10 h-10 text-brand-secondary/40 mx-auto mb-4" />
                  <p className="text-sm font-bold text-brand-secondary">لا توجد إعلانات نشطة حالياً لهذا البائع</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              
              {/* Star Rating Breakdown Stats - Left Column */}
              <div className="md:col-span-4 bg-white p-6 rounded-[32px] border border-brand-border/60 shadow-sm space-y-6">
                <div className="text-center">
                  <span className="text-5xl font-serif font-black text-brand-primary leading-none">{averageRating}</span>
                  <p className="text-xs font-bold text-brand-secondary mt-1">من أصل 5 نجوم</p>
                  
                  {/* Rating Stars Graphic */}
                  <div className="flex justify-center gap-1 mt-3">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star 
                        key={`sum-star-${s}`} 
                        className={`w-4 h-4 ${s <= Math.round(averageRating) ? 'text-amber-500 fill-amber-500' : 'text-brand-border/80'}`} 
                      />
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-brand-secondary opacity-60 mt-2">{reviews.length} تقييم مكتوب</p>
                </div>

                <div className="space-y-2.5 pt-4 border-t border-brand-border/50">
                  {[5, 4, 3, 2, 1].map((starNum) => {
                    const count = ratingDistribution[starNum as keyof typeof ratingDistribution] || 0;
                    const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                    return (
                      <div key={`dist-row-${starNum}`} className="flex items-center gap-2 text-xs">
                        <span className="w-3 font-mono font-bold text-brand-secondary">{starNum}</span>
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                        <div className="flex-1 h-2 bg-brand-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-amber-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-6 text-left font-mono text-brand-secondary/60">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Review Form and Reviews List - Right Column */}
              <div className="md:col-span-8 space-y-8">
                
                {/* Adding Review Form */}
                {currentUser && currentUser.uid !== userId && !hasReviewedAlready ? (
                  <form onSubmit={handlePostReview} className="bg-white p-6 rounded-[32px] border border-brand-border/60 shadow-sm space-y-6">
                    <div>
                      <h4 className="font-serif font-bold text-lg text-brand-primary mb-1">قيّم تجربتك مع هذا البائع</h4>
                      <p className="text-xs text-brand-secondary leading-relaxed">أثبتت المراجعات تزايد ثقة وحضارة المجتمع في التبادل التجاري داخل العراق.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-brand-secondary opacity-80 block">التقييم المقترح</label>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-1.5 bg-brand-muted p-2.5 rounded-2xl border border-brand-border/40">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button 
                              type="button"
                              key={`input-star-${s}`}
                              onClick={() => setUserRating(s)}
                              className="focus:outline-none transition-transform active:scale-90"
                            >
                              <Star className={`w-6 h-6 ${s <= userRating ? 'text-amber-500 fill-amber-500' : 'text-brand-secondary/30'}`} />
                            </button>
                          ))}
                        </div>
                        <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-xl">
                          {getRatingLabel(userRating)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-brand-secondary opacity-80 block">تفاصيل المراجعة</label>
                      <textarea 
                        rows={3} 
                        placeholder="اكتب عن أمانة البائع وسرعة الرد وجودة السلعة..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        className="w-full bg-brand-bg border border-brand-border/80 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder:text-brand-secondary/40"
                      />
                    </div>

                    {formError && (
                      <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-2xl border border-red-200">
                        {formError}
                      </div>
                    )}

                    <button 
                      type="submit"
                      disabled={submittingReview}
                      className="w-full py-4 bg-brand-primary text-white font-bold rounded-2xl shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submittingReview ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>نشر التقييم الرسمي</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : hasReviewedAlready ? (
                  <div className="bg-emerald-50/50 p-5 rounded-[24px] border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-50 shrink-0" />
                    <span>قد قمت بتقييم هذا البائع مسبقاً. شكراً لمساهمتك البناءة في تطوير مجتمع سوق الرافدين التجاري!</span>
                  </div>
                ) : currentUser?.uid === userId ? (
                  <div className="bg-brand-muted p-5 rounded-[24px] border border-brand-border/60 text-brand-secondary text-xs font-semibold flex items-center gap-3">
                    <User className="w-5 h-5 text-brand-primary shrink-0" />
                    <span>هذا هو ملفك الشخصي كمعلن. يمكنك متابعة تقييمات المشترين على سلعتك هنا.</span>
                  </div>
                ) : (
                  <div className="bg-amber-50/50 p-5 rounded-[24px] border border-amber-200 text-amber-800 text-xs font-semibold flex flex-col md:flex-row items-center justify-between gap-4">
                    <span className="text-right">يرجى تسجيل الدخول أولاً لتتمكن من إضافة تقييم ومراجعة للبائع.</span>
                    <button 
                      onClick={() => onLogin && onLogin()}
                      className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      تسجيل الدخول
                    </button>
                  </div>
                )}

                {/* Reviews List */}
                <div className="space-y-4">
                  <h4 className="font-serif font-bold text-lg text-brand-primary border-b border-brand-border/60 pb-3">المراجعات المؤكدة ({reviews.length})</h4>
                  
                  {reviews.length > 0 ? (
                    <div className="space-y-4">
                      {reviews.map((r, i) => (
                        <div key={`review-card-${r.id || i}`} className="bg-white p-5 rounded-[24px] border border-brand-border/60 shadow-sm space-y-3.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full overflow-hidden border border-brand-border shrink-0 bg-brand-muted">
                                {r.reviewerPhoto ? (
                                  <img src={r.reviewerPhoto} alt={r.reviewerName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <User className="w-4 h-4 text-brand-secondary opacity-40" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <h5 className="font-bold text-sm text-[#444432]">{r.reviewerName}</h5>
                                <span className="text-[10px] text-brand-secondary font-medium block">
                                  {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : 'قبل قليل'}
                                </span>
                              </div>
                            </div>

                            {/* Review Star Count */}
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star 
                                  key={`rev-${r.id}-${s}`} 
                                  className={`w-3.5 h-3.5 ${s <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-brand-border/50'}`} 
                                />
                              ))}
                            </div>
                          </div>

                          <p className="text-sm text-[#6b6b5d] leading-relaxed pr-1">{r.comment}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-white rounded-[32px] border border-brand-border/60 shadow-sm p-10">
                      <Star className="w-9 h-9 text-brand-secondary/40 mx-auto mb-4" />
                      <p className="text-sm font-bold text-brand-secondary">لا توجد آراء للمشترين حتى الآن. كن أول من يضيف تقييماً!</p>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function VerificationModal({ isOpen, onClose, onVerified }: any) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 2000));
    setStep(2);
    setLoading(false);
    onVerified();
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[40px] p-10 max-w-sm w-full shadow-2xl text-center space-y-8"
      >
        {step === 1 ? (
          <>
            <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-blue-500" />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-serif font-bold text-brand-primary">توثيق الحساب</h3>
              <p className="text-sm text-brand-secondary leading-relaxed">احصل على علامة التوثيق الزرقاء لزيادة الثقة في إعلاناتك وجذب المزيد من المشترين.</p>
            </div>
            <div className="space-y-3 pt-4">
              <button 
                onClick={handleVerify}
                disabled={loading}
                className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-brand-primary/20 flex items-center justify-center"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'ابدأ التوثيق الآن'}
              </button>
              <button onClick={onClose} className="w-full py-4 text-brand-secondary font-bold text-sm">إلغاء</button>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto">
              <Sparkles className="w-10 h-10 text-emerald-500" />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-serif font-bold text-brand-primary">تهانينا!</h3>
              <p className="text-sm text-brand-secondary leading-relaxed">تم توثيق حسابك بنجاح. ستظهر علامة التوثيق الآن في ملفك الشخصي وإعلاناتك.</p>
            </div>
            <button onClick={onClose} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/20">رائع</button>
          </>
        )}
      </motion.div>
    </div>
  );
}

function ProfileView({ 
  user, profile, setProfile, setUser, onLogout, onBack, onViewMyAds, onViewNotifications, unreadNotifications, onViewBlocked, blockedUsers, onViewFavorites, 
  showInstallButton, onInstall, setToast, onViewAbout, onViewAdmin, onViewSupport
}: any) {
  const [permissionStatus, setPermissionStatus] = useState<string>(
    typeof window !== 'undefined' && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [audioCheckText, setAudioCheckText] = useState('تجربة نغمة الإشارة 🔔');
  const [vibCheckText, setVibCheckText] = useState('تجربة الاهتزاز 📱');

  const [checkingVerif, setCheckingVerif] = useState(false);

  const isAdmin = user?.email === 'qaisar.m2019@gmail.com';

  const checkEmailVerificationStatus = async () => {
    if (!user) return;
    setCheckingVerif(true);
    try {
      await auth.currentUser?.reload();
      const updatedUser = auth.currentUser;
      if (updatedUser) {
        if (setUser) {
          setUser({ ...updatedUser });
        }
        if (updatedUser.emailVerified) {
          setToast({
            title: 'تم تأكيد الحساب بنجاح 🎉',
            body: 'تهانينا! تم التحقق من بريدك الإلكتروني وتأكيد حسابك بنجاح.'
          });
          setTimeout(() => setToast(null), 5000);
        } else {
          setToast({
            title: 'لم يتم التأكيد بعد ⏳',
            body: 'يرجى فتح رابط التأكيد المرسل في بريدك الإلكتروني والضغط على الزر للتحديث.'
          });
          setTimeout(() => setToast(null), 4000);
        }
      }
    } catch (err: any) {
      console.error("Verification check failed:", err);
    } finally {
      setCheckingVerif(false);
    }
  };

  // Automatically check verification status every 4 seconds when the user hasn't verified yet
  useEffect(() => {
    if (!user || user.emailVerified || (user.email && user.email.endsWith('@souqiraq.com'))) return;

    const interval = setInterval(async () => {
      try {
        await auth.currentUser?.reload();
        const updatedUser = auth.currentUser;
        if (updatedUser && updatedUser.emailVerified) {
          if (setUser) {
            setUser({ ...updatedUser });
          }
          setToast({
            title: 'تم تأكيد الحساب بنجاح 🎉',
            body: 'تهانينا! تم التحقق من بريدك الإلكتروني تلقائياً.'
          });
          setTimeout(() => setToast(null), 5000);
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Auto background verification check failed:", err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [user?.emailVerified, user?.uid, setUser]);

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !("Notification" in window)) return;
    try {
      const res = await Notification.requestPermission();
      setPermissionStatus(res);
    } catch (err) {
      console.log('Notification permission request not available:', err);
    }
  };

  const [editing, setEditing] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [myAdsCount, setMyAdsCount] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || '',
    photoURL: profile?.photoURL || user.photoURL || '',
    whatsappNumber: profile?.whatsappNumber || '',
    phoneNumber: profile?.phoneNumber || '',
    address: profile?.address || '',
    birthDate: profile?.birthDate || '',
    notificationPrefs: profile?.notificationPrefs || {
      newListings: true,
      priceDrops: true,
      messages: true,
      offers: true
    },
    favoriteCategories: profile?.favoriteCategories || []
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        displayName: profile.displayName || '',
        photoURL: profile.photoURL || user.photoURL || '',
        whatsappNumber: profile.whatsappNumber || '',
        phoneNumber: profile.phoneNumber || '',
        address: profile.address || '',
        birthDate: profile.birthDate || '',
        notificationPrefs: profile.notificationPrefs || {
          newListings: true,
          priceDrops: true,
          messages: true,
          offers: true
        },
        favoriteCategories: profile.favoriteCategories || []
      });
    }
  }, [profile, user.photoURL]);

  useEffect(() => {
    const q = query(collection(db, 'ads'), where('sellerId', '==', user.uid));
    getDocs(q).then(snap => setMyAdsCount(snap.size));
  }, [user.uid]);

  const handleSave = async () => {
    if (!formData.displayName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), formData);
      if (setProfile) {
        setProfile((prev: any) => ({ ...prev, ...formData }));
      }
      setEditing(false);
      setToast({
        title: 'تم حفظ التعديلات بنجاح ✨',
        body: 'تم تحديث بيانات ملفك الشخصي بنجاح في قاعدة البيانات.'
      });
      setTimeout(() => setToast(null), 4000);
    } catch (error: any) {
      console.error("Profile save failed:", error);
      setToast({
        title: 'فشل حفظ التعديلات ⚠️',
        body: error?.message?.includes('permission') || error?.message?.includes('Permission')
          ? 'عذراً، انتهت الصلاحية أو أن البيانات المدخلة غير مدعومة. يرجى التحقق من صحة البيانات.'
          : 'حدث خطأ أثناء الاتصال بقاعدة البيانات. يرجى التحقق من الإنترنت وإعادة المحاولة.'
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const markVerified = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), { isVerified: true });
      if (setProfile) {
        setProfile((prev: any) => prev ? { ...prev, isVerified: true } : null);
      }
    } catch (e) { console.error(e); }
  };

  const handleSendVerification = async () => {
    if (!user) return;
    setVerifying(true);
    try {
      await sendEmailVerification(user);
      setLinkSent(true);
      setTimeout(() => setLinkSent(false), 5000);
    } catch (error) {
      console.error('Error sending verification email:', error);
    } finally {
      setVerifying(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result as string, 400, 400, 0.6);
      setFormData({ ...formData, photoURL: compressed });
    };
    reader.readAsDataURL(file);
  };

  if (editing) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="p-6 bg-brand-bg min-h-screen"
      >
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => setEditing(false)} className="p-3 bg-white border border-brand-border rounded-xl">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-serif font-bold text-brand-primary">تعديل الملف</h2>
          <button 
            disabled={saving}
            onClick={handleSave} 
            className="p-3 bg-brand-primary text-white rounded-xl shadow-lg shadow-brand-primary/20"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col items-center mb-8">
            <div className="relative group">
              <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-brand-primary/10 shadow-xl bg-brand-muted">
                {formData.photoURL ? (
                  <img src={formData.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-10 h-10 text-brand-secondary opacity-20" />
                  </div>
                )}
              </div>
              <label 
                htmlFor="photo-upload" 
                className="absolute bottom-0 right-0 w-10 h-10 bg-brand-primary text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 active:scale-95 transition-all border-4 border-white"
              >
                <Camera className="w-5 h-5" />
                <input 
                  id="photo-upload" 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePhotoChange} 
                  className="hidden" 
                />
              </label>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-primary opacity-40 mt-4">تغيير الصورة الشخصية</p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-brand-border space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-brand-primary opacity-40 block mb-2">الاسم الكامل</label>
              <input 
                type="text"
                value={formData.displayName}
                onChange={e => setFormData({...formData, displayName: e.target.value})}
                className="w-full bg-brand-bg border-none rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/10"
                placeholder="أدخل اسمك..."
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-brand-primary opacity-40 block mb-2">رقم الهاتف</label>
              <div className="flex bg-brand-bg rounded-2xl px-4 items-center">
                <Phone className="w-4 h-4 text-brand-secondary opacity-40" />
                <input 
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
                  className="flex-1 bg-transparent border-none px-3 py-3 outline-none"
                  placeholder="07xxxxxxxx"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-brand-primary opacity-40 block mb-2">رقم الواتساب</label>
              <div className="flex bg-brand-bg rounded-2xl px-4 items-center">
                <MessageSquare className="w-4 h-4 text-brand-secondary opacity-40" />
                <input 
                  type="tel"
                  value={formData.whatsappNumber}
                  onChange={e => setFormData({...formData, whatsappNumber: e.target.value})}
                  className="flex-1 bg-transparent border-none px-3 py-3 outline-none"
                  placeholder="07xxxxxxxx"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-brand-primary opacity-40 block mb-2">العنوان</label>
              <div className="flex bg-brand-bg rounded-2xl px-4 items-center">
                <MapPin className="w-4 h-4 text-brand-secondary opacity-40" />
                <input 
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  className="flex-1 bg-transparent border-none px-3 py-3 outline-none"
                  placeholder="المدينة، الحي..."
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-brand-primary opacity-40 block mb-2">تاريخ الميلاد</label>
              <div className="flex bg-brand-bg rounded-2xl px-4 items-center">
                <Calendar className="w-4 h-4 text-brand-secondary opacity-40" />
                <input 
                  type="date"
                  value={formData.birthDate}
                  onChange={e => setFormData({...formData, birthDate: e.target.value})}
                  className="flex-1 bg-transparent border-none px-3 py-3 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-brand-border space-y-2">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-brand-primary opacity-40 mb-4 border-b border-brand-border/40 pb-4">إعدادات الإشعارات</h3>
            
            <Toggle 
              label="القوائم الجديدة" 
              description="تلقي إشعارات عند إضافة منتجات جديدة في فئاتك المفضلة"
              icon={Sparkles}
              enabled={formData.notificationPrefs.newListings}
              onChange={(val: boolean) => setFormData({
                ...formData, 
                notificationPrefs: { ...formData.notificationPrefs, newListings: val }
              })}
            />
            
            <Toggle 
              label="تخفيضات الأسعار" 
              description="تلقي إشعارات عندما ينخفض سعر منتج في مفضلاتك"
              icon={TrendingDown}
              enabled={formData.notificationPrefs.priceDrops}
              onChange={(val: boolean) => setFormData({
                ...formData, 
                notificationPrefs: { ...formData.notificationPrefs, priceDrops: val }
              })}
            />

            <Toggle 
              label="الرسائل الجديدة" 
              description="إشعارات فورية عند استلام رسالة جديدة"
              icon={MessageSquare}
              enabled={formData.notificationPrefs.messages}
              onChange={(val: boolean) => setFormData({
                ...formData, 
                notificationPrefs: { ...formData.notificationPrefs, messages: val }
              })}
            />

            <Toggle 
              label="عروض الشراء" 
              description="تلقي إشعارات عند استلام عرض شراء جديد على منتجاتك"
              icon={CircleDollarSign}
              enabled={formData.notificationPrefs.offers}
              onChange={(val: boolean) => setFormData({
                ...formData, 
                notificationPrefs: { ...formData.notificationPrefs, offers: val }
              })}
            />
          </div>

          <div className="bg-white p-6 rounded-3xl border border-brand-border space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-brand-primary opacity-40 border-b border-brand-border/40 pb-4">الفئات المفضلة</h3>
            <div className="grid grid-cols-2 gap-3">
               {CATEGORIES.map(cat => {
                 const isFavorite = formData.favoriteCategories.includes(cat.id);
                 return (
                   <button 
                     key={cat.id}
                     type="button"
                     onClick={() => {
                       const newCats = isFavorite 
                         ? formData.favoriteCategories.filter(id => id !== cat.id)
                         : [...formData.favoriteCategories, cat.id];
                       setFormData({ ...formData, favoriteCategories: newCats });
                     }}
                     className={cn(
                       "flex items-center gap-3 p-4 rounded-2xl border transition-all text-right",
                       isFavorite 
                         ? "bg-brand-primary/5 border-brand-primary text-brand-primary shadow-sm" 
                         : "bg-brand-bg border-transparent text-brand-secondary opacity-60 hover:opacity-100"
                     )}
                   >
                     <span className="text-[10px] font-black uppercase tracking-widest">{cat.label}</span>
                     {isFavorite && <span className="mr-auto font-bold text-xs">✓</span>}
                   </button>
                 );
               })}
            </div>
            <p className="text-[10px] text-brand-secondary opacity-40 text-center leading-relaxed">سنقوم بإشعارك عند توفر منتجات جديدة في هذه الفئات إذا قمت بتفعيل "القوائم الجديدة"</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="p-6 bg-brand-bg min-h-screen"
    >
      <div className="flex items-center justify-between mb-10">
        <button onClick={onBack} className="p-3 bg-white border border-brand-border rounded-xl shadow-sm text-brand-primary active:scale-95 transition-all">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-serif font-bold text-brand-primary">الملف الشخصي</h2>
        <button onClick={() => setEditing(true)} className="p-3 bg-white border border-brand-border rounded-xl shadow-sm text-brand-primary active:scale-95 transition-all">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col items-center text-center mb-10">
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-xl bg-gray-100">
            {profile?.photoURL || user.photoURL ? (
              <img src={profile?.photoURL || user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-8 h-8 text-gray-400" />
              </div>
            )}
          </div>
          {user.emailVerified ? (
            <div className="absolute bottom-1 right-1 w-7 h-7 bg-green-500 rounded-full border-2 border-white flex items-center justify-center text-white shadow-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="absolute bottom-1 right-1 w-7 h-7 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center text-white shadow-lg">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-2xl font-serif font-black text-brand-primary">{profile?.displayName || user.displayName}</h3>
          {profile?.isVerified ? (
            <div className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100 shadow-sm">
               <CheckCircle2 className="w-3.5 h-3.5 fill-blue-500 text-white" />
               <span className="text-[10px] font-black uppercase tracking-wider">موثق</span>
            </div>
          ) : (
            <button 
              onClick={() => setShowVerifyModal(true)}
              className="flex items-center gap-1.5 bg-brand-primary/5 text-brand-primary px-3 py-1 rounded-full border border-brand-primary/10 hover:bg-brand-primary/10 transition-all group"
            >
               <Sparkles className="w-3.5 h-3.5 group-hover:animate-pulse" />
               <span className="text-[10px] font-black uppercase tracking-wider">توثيق الحساب</span>
            </button>
          )}
        </div>
        <p className="text-brand-secondary text-xs opacity-60 mb-6">{user.email}</p>

        {(profile?.phoneNumber || profile?.address) && (
          <div className="flex flex-col gap-2 mb-6 text-brand-secondary text-xs opacity-80">
            {profile.phoneNumber && <span className="flex items-center gap-1 justify-center"><Phone className="w-3 h-3" /> {profile.phoneNumber}</span>}
            {profile.address && <span className="flex items-center gap-1 justify-center"><MapPin className="w-3 h-3" /> {profile.address}</span>}
          </div>
        )}

        <div className="flex gap-4 w-full px-4 justify-center">
          <div className="bg-white p-5 rounded-3xl border border-brand-border shadow-sm w-full max-w-xs">
            <p className="text-[9px] font-black uppercase tracking-widest text-brand-primary opacity-40 mb-1">إعلاناتك</p>
            <p className="font-serif font-bold text-xl text-brand-primary">{myAdsCount}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 max-w-lg mx-auto w-full">
        {/* Verification Email Card for Real Accounts */}
        {!user.emailVerified && user.email && !user.email.endsWith('@souqiraq.com') && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 text-right w-full mb-2 shadow-sm">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-amber-200/40 justify-start flex-row-reverse">
              <AlertCircle className="w-4 h-4 text-amber-600 animate-pulse" />
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-800">تأكيد البريد الإلكتروني معلق ⏳</h4>
            </div>
            <p className="text-[11px] text-amber-700/90 leading-relaxed mb-4">
              أهلاً بك! بريدك الإلكتروني غير مؤكد حالياً. يرجى تأكيد بريدك لتفعيل حسابك بالكامل وحماية خصوصية بياناتك في المنصة. انقر أدناه لإرسال رابط التفعيل إلى بريدك الإلكتروني.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={verifying || linkSent}
                onClick={handleSendVerification}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-sm",
                  linkSent 
                    ? "bg-emerald-500 text-white" 
                    : "bg-amber-600 text-white hover:bg-amber-700 active:scale-95"
                )}
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الإرسال الآن...</span>
                  </>
                ) : linkSent ? (
                  <span>✓ تم إرسال الرابط! تفقد بريدك الوارد 📩</span>
                ) : (
                  <span>أرسل رابط تفعيل البريد الإلكتروني الآن</span>
                )}
              </button>

              <button
                type="button"
                disabled={checkingVerif}
                onClick={checkEmailVerificationStatus}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-brand-muted/50 border border-brand-border/80 text-brand-primary rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
              >
                {checkingVerif ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                    <span>جاري التحقق من التأكيد...</span>
                  </>
                ) : (
                  <span>تحديث حالة التأكيد (تحقق يدوي) 🔄</span>
                )}
              </button>
            </div>
          </div>
        )}



        <MenuButton 
          onClick={onViewNotifications} 
          icon={<Bell className={cn(unreadNotifications > 0 && "text-red-500 fill-red-500")} />} 
          label="التنبيهات" 
          badge={unreadNotifications > 0 ? unreadNotifications : undefined}
        />
        <MenuButton onClick={onViewMyAds} icon={<ShoppingBag />} label="إعلاناتي" />
        <MenuButton onClick={onViewFavorites} icon={<Heart />} label="المفضلة" />
        
        <MenuButton 
          onClick={onViewSupport} 
          icon={<MessageSquare className="text-blue-500" />} 
          label="مركز المساعدة والدعم الفني 💬" 
        />

        {isAdmin && (
          <MenuButton 
            onClick={onViewAdmin} 
            icon={<Shield className="text-amber-600 animate-pulse" />} 
            label="لوحة إدارة سوق الرافدين 🛡️" 
          />
        )}

        <MenuButton 
          onClick={onViewBlocked}
          icon={<Ban className="text-brand-secondary" />} 
          label="المستخدمين المحظورين" 
          badge={blockedUsers?.length > 0 ? blockedUsers.length : undefined}
        />
        
        <MenuButton 
          onClick={onViewAbout}
          icon={<Users className="text-amber-500" />} 
          label="من نحن 🇮🇶" 
        />



        {showInstallButton && (
          <button 
            onClick={onInstall}
            className="w-full flex items-center justify-between p-4 bg-brand-primary text-white rounded-2xl shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all my-2"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg"><ShoppingBag className="w-5 h-5" /></div>
              <span className="font-bold">تثبيت التطبيق على الجهاز</span>
            </div>
            <ArrowRight className="w-5 h-5 translate-x-2" />
          </button>
        )}
      </div>

      <button 
        onClick={onLogout}
        className="mx-auto block text-red-500 font-black uppercase tracking-[0.2em] text-[10px] bg-red-50 px-8 py-4 rounded-full mt-12 mb-8 hover:bg-red-100 transition-colors active:scale-95"
      >
        تسجيل الخروج من الحساب
      </button>

      <VerificationModal 
        isOpen={showVerifyModal} 
        onClose={() => setShowVerifyModal(false)}
        onVerified={markVerified}
      />

      {/* Luxurious About Modal representing custom Iraqi development */}
      <AnimatePresence>
        {showAboutModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAboutModal(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="relative bg-[#090e1f] text-white rounded-[40px] p-8 w-full max-w-md shadow-3xl border border-white/10 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
              <div className="absolute top-0 left-0 w-36 h-36 bg-blue-500/5 rounded-full -ml-16 -mt-16 blur-2xl pointer-events-none" />

              <div className="relative z-10 space-y-6 text-right">
                {/* Header branding */}
                <div className="flex items-center gap-4 border-b border-white/10 pb-5">
                  <div className="w-14 h-14 bg-amber-500/10 border border-amber-400/20 rounded-2xl flex items-center justify-center shrink-0">
                    <Sparkles className="w-7 h-7 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-serif font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-l from-amber-400 to-yellow-200">سوق الرافدين الفاخر</h3>
                    <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase">الإصدار المحسن الزمردي v2.5</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs font-bold text-slate-300 leading-relaxed">
                  <p>
                    مرحباً بك في النسخة الاحترافية الأفخم والأسرع من سوق الرافدين، البوابة الكبرى للتبادل والصفقات الحية السريعة في العراق.
                  </p>

                  <div className="bg-white/[0.03] border border-white/5 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-400 text-[11px]">سوق العراق للتطوير</span>
                      <span className="text-slate-400 text-[10px]">البرمجة والتصميم:</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-400 text-[11px]">نخبة مهندسينا المحليين 🇮🇶</span>
                      <span className="text-slate-400 text-[10px]">كادر العمل:</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white text-[11px]">بغداد، العراق (خوادم مستقرة)</span>
                      <span className="text-slate-400 text-[10px]">الاستضافة والشبكة:</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-blue-400 text-[10px]">مراسلة حيّة، تسجيل صوتي، إشعارات فورية</span>
                      <span className="text-slate-400 text-[10px]">التحسينات المضافة:</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed border-t border-white/5 pt-4">
                    تمت هندسة هذا النظام وبرمجته ليعمل بأعلى سرعة استجابة على أجهزة أندرويد وآيفون، مع حماية تامة للبيانات وتشفير متكامل لقنوات اللقاء التجاري.
                  </p>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => setShowAboutModal(false)}
                    className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-sm rounded-2xl transition-all shadow-xl shadow-amber-500/10 active:scale-95 text-center"
                  >
                    إغلاق وبدء الاستخدام
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MyAdsView({ user, onBack, onAdClick, createNotification, onViewSupport }: any) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const [showConfirm, setShowConfirm] = useState(false);
  const [adToDelete, setAdToDelete] = useState<string | null>(null);

  const handlePromoteClick = async (ad: Ad) => {
    try {
      await updateDoc(doc(db, 'ads', ad.id), {
        isFeatured: true,
        featuredUntil: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 Days Promo
      });
      alert('تمت ترقية إعلانك ونشره في فئة الإعلانات المميزة العصرية مجاناً وبنجاح! ⭐');
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء ترقية الإعلان للمميز.');
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, 'ads'), 
      where('sellerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    
    return onSnapshot(q, (snap) => {
      setAds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ad)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ads');
    });
  }, [user.uid]);

  const handleDeleteClick = (adId: string) => {
    setAdToDelete(adId);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!adToDelete) return;
    try {
      // First, delete comments subcollection (client-side cleanup)
      const commentsRef = collection(db, 'ads', adToDelete, 'comments');
      const commentsSnap = await getDocs(commentsRef);
      const batchDeletePromises = commentsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(batchDeletePromises);

      // Finally, delete the ad document
      await deleteDoc(doc(db, 'ads', adToDelete));
    } catch (e) { 
      handleFirestoreError(e, OperationType.DELETE, `ads/${adToDelete}`);
    } finally {
      setShowConfirm(false);
      setAdToDelete(null);
    }
  };

  const markSold = async (adId: string) => {
    try {
      const adRef = doc(db, 'ads', adId);
      const adSnap = await getDoc(adRef);
      if (!adSnap.exists()) return;
      
      const adData = adSnap.data() as Ad;
      await updateDoc(adRef, { status: 'sold' });

      // Notify watchers
      if (adData.watchers && adData.watchers.length > 0) {
        for (const watcherId of adData.watchers) {
          if (watcherId !== user.uid) {
            await createNotification(
              watcherId,
              'تم بيع إعلان تتابعه',
              `تم بيع "${adData.title}". المسح من المفضلة؟`,
              'sale',
              { adId }
            );
          }
        }
      }
    } catch (e) { console.error(e); }
  };

  const repostAd = async (adId: string) => {
    try {
      await updateDoc(doc(db, 'ads', adId), { 
        createdAt: serverTimestamp(),
        status: 'active' 
      });
    } catch (e) { 
      handleFirestoreError(e, OperationType.UPDATE, `ads/${adId}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6 bg-brand-bg min-h-screen"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-3 bg-white border border-brand-border rounded-2xl text-brand-primary">
          <ChevronRight className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-serif font-bold text-[#444432]">إعلاناتي</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-brand-primary" /></div>
      ) : ads.length > 0 ? (
        <div className="space-y-6">
          {ads.map(ad => (
            <div key={`myad-${ad.id}`} className="bg-white p-4 rounded-[32px] border border-brand-border shadow-sm flex gap-4 overflow-hidden group">
              <div 
                className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 bg-brand-muted cursor-pointer"
                onClick={() => onAdClick(ad)}
              >
                <img src={ad.images[0]} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0 py-1">
                <h3 className="font-bold text-[#444432] truncate">{ad.title}</h3>
                <p className="text-brand-primary font-bold">{ad.price.toLocaleString()} د.ع</p>
                
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold",
                    ad.status === 'active' ? "bg-green-50 text-green-600" : 
                    ad.status === 'sold' ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-400"
                  )}>
                    {ad.status === 'active' ? 'نشط' : ad.status === 'sold' ? 'تم البيع' : 'محذوف'}
                  </span>
                  {ad.isFeatured ? (
                    <span className="text-[10px] bg-amber-500 text-white font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                      ★ مميز ونشط
                    </span>
                  ) : ad.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => handlePromoteClick(ad)}
                      className="text-[10px] font-bold text-amber-700 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-0.5"
                    >
                      ⭐ ترقية للمميز (مجاناً)
                    </button>
                  ) : null}
                  <span className="text-[10px] text-brand-secondary opacity-60">
                    {ad.createdAt?.toDate ? ad.createdAt.toDate().toLocaleDateString() : '...'}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col gap-2 justify-center">
                {ad.status === 'active' && (
                  <>
                    <button 
                      onClick={() => repostAd(ad.id)}
                      className="p-2 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary/20 transition-all active:scale-95"
                      title="تجديد الإعلان"
                    >
                      <Sparkles className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => markSold(ad.id)}
                      className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-all active:scale-95"
                      title="تحديد كمباع"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                  </>
                )}
                {ad.status !== 'deleted' && (
                  <button 
                    onClick={() => handleDeleteClick(ad.id)}
                    className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors transition-all active:scale-95"
                    title="حذف الإعلان"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          <ConfirmDialog 
            isOpen={showConfirm}
            title="حذف الإعلان"
            message="هل أنت متأكد أنك تريد حذف هذا الإعلان؟ لا يمكن التراجع عن هذا الإجراء."
            onConfirm={confirmDelete}
            onCancel={() => {
              setShowConfirm(false);
              setAdToDelete(null);
            }}
          />
        </div>
      ) : (
        <div className="text-center py-20 opacity-50">
          <ShoppingBag className="w-12 h-12 mx-auto mb-4" />
          <p>ليس لديك إعلانات منشورة</p>
        </div>
      )}
    </motion.div>
  );
}

function FavoritesView({ favorites, onBack, onAdClick, onToggleFavorite }: any) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (favorites.length === 0) {
      setAds([]);
      setLoading(false);
      return;
    }

    const fetchFavorites = async () => {
      setLoading(true);
      try {
        const fetchedAds: Ad[] = [];
        const uniqueIds = Array.from(new Set<string>(favorites.slice(0, 50)));
        for (const adId of uniqueIds) {
          const snap = await getDoc(doc(db, 'ads', adId));
          if (snap.exists()) {
            fetchedAds.push({ id: snap.id, ...snap.data() } as Ad);
          }
        }
        setAds(fetchedAds);
      } catch (e) {
        console.error("Error fetching favorites:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, [favorites]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6 bg-brand-bg min-h-screen"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-3 bg-white border border-brand-border rounded-2xl text-brand-primary">
          <ChevronRight className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-serif font-bold text-[#444432]">المفضلة</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-brand-primary" /></div>
      ) : ads.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
          {ads.map(ad => (
            <AdCard 
              key={`fav-ad-${ad.id}`} 
              ad={ad} 
              onClick={() => onAdClick(ad)} 
              isFavorited={true}
              onToggleFavorite={() => onToggleFavorite(ad.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 opacity-50">
          <Heart className="w-12 h-12 mx-auto mb-4" />
          <p>لا توجد إعلانات في المفضلة</p>
        </div>
      )}
    </motion.div>
  );
}

function PriceChart({ price }: { price: number }) {
  const data = [
    { name: '1', val: price * 1.15 },
    { name: '2', val: price * 1.08 },
    { name: '3', val: price * 1.02 },
    { name: '4', val: price * 0.95 },
    { name: '5', val: price * 0.98 },
    { name: '6', val: price },
  ];

  return (
    <div className="space-y-6">
      <div className="h-64 w-full mt-12 bg-white rounded-[48px] p-8 border border-brand-border/40 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">تحليل الأسعار بالذكاء الاصطناعي</h4>
        </div>
        
        <div className="flex flex-col mb-8">
          <span className="text-3xl font-serif font-black text-brand-primary">ثبات السعر</span>
          <p className="text-xs text-brand-secondary opacity-60 mt-1">يُنصح بالشراء الآن بناءً على استقرار السعر</p>
        </div>

        <div className="h-24 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#000" stopOpacity={0.05}/>
                  <stop offset="95%" stopColor="#000" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#f0f0f0" />
              <Area type="monotone" dataKey="val" stroke="#000" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" animationDuration={2000} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
         <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl text-center">
            <TrendingDown className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">سعر ممتاز</p>
         </div>
         <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl text-center">
            <Zap className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">موصى به</p>
         </div>
         <div className="p-6 bg-white border border-brand-border rounded-3xl text-center">
            <Activity className="w-6 h-6 text-brand-primary opacity-30 mx-auto mb-2" />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-30">طلب عالي</p>
         </div>
      </div>
    </div>
  );
}

// --- Atomic Components ---

function AdCard({ ad, onClick, isFavorited, onToggleFavorite, hideFavorite, onQuickView }: { 
  ad: Ad, 
  onClick: () => void, 
  isFavorited?: boolean, 
  onToggleFavorite?: (e: React.MouseEvent) => void,
  hideFavorite?: boolean,
  onQuickView?: () => void
}) {
  return (
    <motion.div 
      whileHover={{ y: -8 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "group cursor-pointer flex flex-col h-full bg-white rounded-3xl lg:rounded-[48px] border hover:shadow-elite p-2 transition-all duration-700",
        ad.isFeatured ? "border-brand-primary border-2 shadow-[0_0_40px_rgba(0,0,0,0.05)] ring-4 ring-brand-primary/5" : "border-brand-border hover:border-brand-primary/10"
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] lg:rounded-[40px] grainy">
        {ad.isFeatured && (
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-primary to-transparent z-10 animate-shimmer" />
        )}
        <img 
          src={ad.images[0]} 
          alt={ad.title} 
          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
          referrerPolicy="no-referrer"
        />
        
        {/* Elite Overlay on Hover */}
        <div className="absolute inset-0 bg-brand-primary/0 group-hover:bg-brand-primary/5 transition-colors duration-500" />
        
        {/* Quick View Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onQuickView?.();
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 glass rounded-full opacity-0 group-hover:opacity-100 hover:bg-white scale-90 group-hover:scale-100 transition-all duration-500 shadow-2xl"
        >
          <Search className="w-6 h-6 text-brand-primary" />
        </button>
        
        {/* Status Tags */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
           {ad.status === 'sold' && (
             <div className="glass px-3 py-1.5 rounded-full shadow-lg">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary">مباع</span>
             </div>
           )}
           {ad.condition === 'new' && (
             <div className="bg-brand-primary text-white px-3 py-1.5 rounded-full shadow-lg shadow-brand-primary/20">
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">جديد</span>
             </div>
           )}
           {ad.isFeatured && (
             <div className="bg-brand-accent text-brand-primary px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1 border border-brand-primary/10">
                <Sparkles className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">مميز</span>
             </div>
           )}
           {ad.isSubscribed && (
             <div className="bg-emerald-600 text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1 border border-emerald-500/10">
                <Crown className="w-3 h-3 text-amber-300 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">مشترك 👑</span>
             </div>
           )}
        </div>

        {!hideFavorite && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.(e);
            }}
            className="absolute bottom-4 left-4 p-4 rounded-[24px] glass shadow-lg transition-all hover:bg-white hover:scale-110 active:scale-90"
          >
            <Heart className={cn("w-4 h-4 transition-colors", isFavorited ? "fill-red-500 text-red-500" : "text-brand-primary")} />
          </button>
        )}

        {/* Location small badge */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 glass px-4 py-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500">
           <MapPin className="w-3 h-3 text-brand-primary" />
           <span className="text-[9px] font-black text-brand-primary uppercase tracking-tighter">{ad.location.city}</span>
        </div>
      </div>

      <div className="flex flex-col flex-1 p-6 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-amber-700 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 shadow-sm">
              {CATEGORIES.find(c => c.id === ad.category)?.label || ad.category}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-brand-secondary opacity-70">
              <MapPin className="w-3 h-3 text-brand-primary" />
              {ad.location?.city || 'بغداد'}
            </span>
          </div>
          <h3 className="font-serif font-black text-lg leading-tight line-clamp-2 text-brand-primary group-hover:text-amber-600 transition-colors pt-1.5">{ad.title}</h3>
        </div>
        
        <div className="flex-1" />

        <div className="pt-4 border-t border-brand-border/60 flex items-end justify-between">
          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-tighter text-brand-secondary opacity-40">السعر</span>
            <p className="text-xl font-bold text-brand-primary">
              {ad.price.toLocaleString()} <span className="text-[10px] font-black opacity-30">د.ع</span>
            </p>
          </div>
          
          <div className="w-10 h-10 rounded-full border border-brand-border flex items-center justify-center opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-500">
             <ArrowRight className="w-4 h-4 text-brand-primary" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function NavButton({ icon, label, active, onClick }: any) {
  return (
    <motion.button 
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "flex flex-col items-center justify-center gap-1 transition-all relative px-3 py-1 group rounded-xl min-w-[64px]",
        active ? "text-brand-primary font-black" : "text-brand-secondary opacity-60 hover:opacity-100"
      )}
    >
      <div className={cn(
        "w-5 h-5 flex items-center justify-center transition-colors",
        active ? "text-brand-primary" : "text-brand-secondary opacity-50 group-hover:opacity-100"
      )}>
        {icon}
      </div>
      <span className="text-[10px] uppercase tracking-wider transition-all font-black">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-pill" 
          className="absolute -bottom-1 w-1.5 h-1.5 bg-brand-primary rounded-full" 
        />
      )}
    </motion.button>
  );
}

function NotificationsView({ onBack, onNavigate }: { onBack: () => void, onNavigate: (view: any, data: any) => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubscribe();
  }, [user]);

  const handleNotificationClick = async (n: any) => {
    // Mark as read specifically when clicked
    if (!n.read) {
      await updateDoc(doc(db, 'notifications', n.id), { read: true });
    }
    
    // Navigation logic based on notification type
    if (n.type === 'chat' && n.data?.chatId) {
      onNavigate('chatroom', n.data.chatId);
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      await updateDoc(doc(db, 'notifications', n.id), { read: true });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mesh-bg min-h-screen px-6 pt-12 pb-24"
    >
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-white border border-brand-border rounded-xl shadow-sm text-brand-primary active:scale-95 transition-all">
            <ChevronRight className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-4xl font-serif font-black text-brand-primary">التنبيهات</h2>
            <p className="text-xs text-brand-secondary opacity-50 font-bold uppercase tracking-widest mt-1">آخر التحديثات</p>
          </div>
        </div>
        {notifications.some(n => !n.read) && (
          <button 
            onClick={markAllRead}
            className="text-[10px] font-black text-brand-primary uppercase tracking-tighter bg-white px-3 py-1.5 rounded-full border border-brand-border shadow-sm active:scale-95 transition-all"
          >
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary opacity-20" />
          <p className="text-[10px] font-black text-brand-secondary opacity-30 uppercase tracking-[0.2em]">جاري التحميل</p>
        </div>
      ) : notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map(n => (
            <motion.button 
              key={`notif-${n.id}`} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => handleNotificationClick(n)}
              className={cn(
                "w-full p-5 rounded-[28px] border transition-all text-right group flex items-start gap-5 relative",
                n.read 
                  ? "bg-white/40 border-brand-border/30 opacity-60" 
                  : "bg-white border-brand-primary/10 shadow-sm shadow-brand-primary/5"
              )}
            >
              {!n.read && (
                <div className="absolute top-6 left-6 w-2 h-2 bg-brand-primary rounded-full shadow-lg shadow-brand-primary/40 animate-pulse" />
              )}
              
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-colors",
                n.read ? "bg-brand-muted border-brand-border/50" : "bg-brand-primary/5 border-brand-primary/10"
              )}>
                {n.type === 'chat' ? (
                  <MessageSquare className={cn("w-6 h-6", n.read ? "text-brand-secondary/40" : "text-brand-primary")} />
                ) : n.type === 'sale' ? (
                  <ShoppingBag className={cn("w-6 h-6", n.read ? "text-brand-secondary/40" : "text-brand-primary")} />
                ) : (
                  <Bell className={cn("w-6 h-6", n.read ? "text-brand-secondary/40" : "text-brand-primary")} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className={cn(
                  "text-base font-serif font-black mb-1 transition-colors",
                  n.read ? "text-brand-primary/60" : "text-brand-primary"
                )}>{n.title}</h4>
                <p className="text-sm text-brand-secondary/70 leading-relaxed mb-3 line-clamp-2">{n.message}</p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-brand-secondary opacity-30" />
                  <span className="text-[9px] font-black text-brand-primary/40 uppercase tracking-tighter">
                    {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'short' }) : '...'}
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-40 text-center opacity-30 grayscale">
          <div className="w-24 h-24 bg-brand-muted rounded-[40px] flex items-center justify-center mb-8">
            <Bell className="w-10 h-10 text-brand-primary" />
          </div>
          <h3 className="text-xl font-serif font-bold text-brand-primary">لا توجد تنبيهات</h3>
          <p className="text-xs font-bold uppercase tracking-widest mt-2">سنخبرك هنا عند حدوث شيء جديد</p>
        </div>
      )}
    </motion.div>
  );
}

function MenuButton({ icon, label, onClick, badge }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 bg-white border border-brand-border rounded-2xl hover:bg-brand-muted transition-all active:scale-[0.98]">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-brand-muted rounded-xl flex items-center justify-center text-brand-primary relative">
          {icon && React.isValidElement(icon) ? React.cloneElement(icon as any, { className: "w-5 h-5" }) : icon}
          {badge && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold border-2 border-white">
              {badge}
            </span>
          )}
        </div>
        <span className="font-bold text-sm text-brand-primary">{label}</span>
      </div>
      <ChevronLeft className="w-4 h-4 text-brand-secondary opacity-40" />
    </button>
  );
}

function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }: { isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl space-y-6"
      >
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-[#444432]">{title}</h3>
          <p className="text-sm text-brand-secondary leading-relaxed">{message}</p>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={onConfirm}
            className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20 active:scale-[0.98]"
          >
            تأكيد الحذف
          </button>
          <button 
            onClick={onCancel}
            className="w-full py-4 bg-brand-bg text-[#444432] rounded-2xl font-bold hover:bg-brand-muted transition-colors active:scale-[0.98]"
          >
            إلغاء
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function BlockedUsersView({ user, blockedUsers, onBack }: any) {
  const [blockedProfiles, setBlockedProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userToUnblock, setUserToUnblock] = useState<any | null>(null);

  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const profiles = await Promise.all(blockedUsers.map(async (uid: string) => {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            return { id: uid, ...snap.data() };
          }
          return { id: uid, displayName: 'مستخدم محظور' };
        }));
        setBlockedProfiles(profiles);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    if (blockedUsers?.length > 0) {
      fetchProfiles();
    } else {
      setBlockedProfiles([]);
      setLoading(false);
    }
  }, [blockedUsers]);

  const unblockUser = async () => {
    if (!user || !userToUnblock) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'blocks', userToUnblock.id));
      setUserToUnblock(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/blocks/${userToUnblock.id}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6 bg-brand-bg min-h-screen"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 hover:bg-brand-muted rounded-full">
          <ChevronRight className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-serif font-bold text-[#444432]">المستخدمين المحظورين</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
      ) : blockedProfiles.length === 0 ? (
        <div className="text-center py-20 opacity-50 bg-white rounded-3xl border border-brand-border">
          <Ban className="w-12 h-12 mx-auto mb-4" />
          <p>قائمة الحظر فارغة</p>
        </div>
      ) : (
        <div className="space-y-4">
          {blockedProfiles.map((p: any) => (
            <div key={`blocked-${p.id}`} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-brand-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-brand-muted shrink-0">
                  <img src={p.photoURL || `https://ui-avatars.com/api/?name=${p.displayName}&background=5A5A40&color=fff`} alt="" />
                </div>
                <span className="font-bold">{p.displayName}</span>
              </div>
              <button 
                onClick={() => setUserToUnblock(p)}
                className="text-xs font-bold text-red-500 bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 transition-colors"
              >
                إلغاء الحظر
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal 
        isOpen={!!userToUnblock}
        onClose={() => setUserToUnblock(null)}
        onConfirm={unblockUser}
        title="إلغاء الحظر"
        message={`هل تريد إلغاء حظر "${userToUnblock?.displayName}"؟`}
        confirmText="إلغاء الحظر"
      />
    </motion.div>
  );
}

function AboutUsView({ onBack }: { onBack: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto px-4 py-8 md:py-16 space-y-12 text-right relative bg-[#fcfbfa] rounded-[32px] border border-brand-border/40 my-8 shadow-sm"
    >
      {/* Upper ambient card background glow */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-amber-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-20 left-10 w-60 h-60 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />

      {/* Header section with clean Display Typography */}
      <div className="space-y-4">
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-brand-muted border border-brand-border/60 text-brand-primary rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
          <span>الرجوع للرئيسية</span>
        </button>

        <div className="pt-4 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-black text-amber-700">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>منصتنا الوطنية الأولى</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-serif font-black tracking-tight text-[#111] leading-tight flex items-center gap-3">
            سوق الرافدن
          </h1>
          <p className="text-sm md:text-base font-serif text-[#666] tracking-wide">
            نبني جسور التبادل التجاري داخل المحافظات ببرمجة وطنية خالصة 🇮🇶
          </p>
        </div>
      </div>

      {/* Main Core Identity Card (Bento Style) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 p-6 md:p-8 bg-white rounded-3xl border border-brand-border/60 shadow-sm space-y-4">
          <h2 className="text-lg font-serif font-bold text-[#111]">رؤيتنا ورسالتنا</h2>
          <p className="text-xs md:text-sm text-[#444] font-medium leading-relaxed">
            تأسس <strong>سوق الرافدين</strong> ليكون البوابة الإلكترونية الوطنية الكبرى التي تجمع ملايين البائعين والمشترين من زاخو إلى البصرة في بيئة تجارية آمنة، سريعة، ومصممة خصيصاً لتناسب احتياجات ومحافظات بلدنا الحبيب. نوفر حلاً تقنياً متطوراً للتداول اليومي للسيارات، العقارات، الأجهزة الذكية، والسلع النادرة بكل سهولة ويسر.
          </p>
          <div className="flex gap-4 pt-4 border-t border-brand-border/40">
            <div>
              <span className="block text-2xl font-serif font-black text-brand-primary">+٥٠ ألف</span>
              <span className="text-[10px] text-brand-secondary font-bold">إعلان متداول</span>
            </div>
            <div className="h-10 w-[1px] bg-brand-border" />
            <div>
              <span className="block text-2xl font-serif font-black text-brand-primary">١٠٠%</span>
              <span className="text-[10px] text-brand-secondary font-bold">هوية عراقية</span>
            </div>
          </div>
        </div>

        <div className="p-6 bg-[#0a0f1d] text-white rounded-3xl border border-white/5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-serif font-bold text-amber-400">تواصل فوري آمن</h3>
            <p className="text-[11px] text-slate-300 font-bold leading-relaxed">
              تقنيات متقدمة للمراسلة النصية، التسجيلات الصوتية، وإرسال عروض الأسعار بصورة فورية مع إشعارات دفع ذكية للبث المباشر.
            </p>
          </div>
          <div className="text-[10px] text-slate-400 font-black pt-4 border-t border-white/5 flex items-center justify-between">
            <span>سرعة الخادم العراقي</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>

      {/* National Developer Recognition */}
      <div className="p-6 md:p-8 bg-gradient-to-br from-amber-50/50 to-orange-50/25 rounded-3xl border border-amber-200/50 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
            <Award className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-serif font-black text-[#111]">الهوية البرمجية والتطوير الوطني</h3>
            <p className="text-[11px] text-brand-secondary font-semibold">بأعلى المعايير والحلول التقنية المبتكرة</p>
          </div>
        </div>

        <div className="space-y-4 text-xs md:text-sm text-[#333] font-medium leading-relaxed">
          <p>
            تفتخر منصة <strong>سوق الرافدين</strong> بأنها بُنيت وطُوّرت بالكامل داخل حدود الوطن الحبيب بواسطة المهندسين الوطنيين في <span className="text-amber-700 font-black">سوق العراق للحلول البرمجية</span>. تمت هندسة قواعد البيانات وهيكلية النظام من الصفر لضمان الأمان الفائق، والسرعة الخاطفة مع حماية بيانات ومعلومات المستخدمين العراقيين الكرام.
          </p>
        </div>

        {/* License Box */}
        <div className="p-4 bg-white/70 rounded-2xl border border-amber-200/50 space-y-2">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-black">
            <Terminal className="w-3.5 h-3.5 text-amber-600" />
            <span>سلامة وحماية الإبداع البرمجي</span>
          </div>
          <p className="text-[11px] text-[#444] font-medium leading-relaxed">
            الرمز البرمجي الأصلي، التصاميم البصرية، ومحركات تصفية البيانات محمية بالكامل ومسجلة بموجب القوانين النافذة لحماية الإبداع وحقوق الملكية الفكرية والبرمجية العراقية لعام ٢٠٢٦. يمنع منعاً باتاً استنساخ البنية التحتية أو السيرفرات دون إذن كتابي رسمي.
          </p>
        </div>
      </div>

      {/* Safety & Trust Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-serif font-bold text-[#111]">أركان الأمان والثقة في المنصة</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-white rounded-2xl border border-brand-border/60 shadow-sm flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/5 flex items-center justify-center shrink-0 border border-blue-500/10 text-blue-600">
              <Shield className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-right">
              <h4 className="text-xs font-serif font-black text-[#111]">مراجعة وتدقيق الإعلانات</h4>
              <p className="text-[11px] text-[#555] font-semibold leading-relaxed">نراجع كل منتج وإعلان يدوياً وبدقة عالية لمنع ومكافحة محاولات النصب وضمان جودة المعروضات دائماً.</p>
            </div>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-brand-border/60 shadow-sm flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/5 flex items-center justify-center shrink-0 border border-emerald-500/10 text-emerald-600">
              <Users className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-right">
              <h4 className="text-xs font-serif font-black text-[#111]">نظام تقييم موثق وبناء</h4>
              <p className="text-[11px] text-[#555] font-semibold leading-relaxed">يتيح نظامنا تبادل تقييمات حقيقية للمشترين والبائعين لبناء مجتمع مالي وتجاري عراقي متراحم وقوي.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer block inside page */}
      <div className="pt-8 border-t border-brand-border/60 text-center space-y-2">
        <p className="text-[10px] text-brand-secondary font-bold">سوق الرافدين - الإصدار الذهبي الفاخر ٢٠٢٦</p>
        <p className="text-[9px] text-brand-secondary opacity-40">صنع بحب وبرمجة مخلصة من شباب العراق العظيم 🇮🇶</p>
      </div>
    </motion.div>
  );
}


