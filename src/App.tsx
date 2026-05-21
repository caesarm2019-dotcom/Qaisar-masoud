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
  Play, Mic, CircleDollarSign, PhoneCall, TrendingDown, Zap, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User as FirebaseUser, sendEmailVerification,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile
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
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getApiUrl = (path: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const isCapacitor = origin.startsWith('capacitor://') || 
                      (origin.startsWith('http://localhost') && !origin.includes(':3000')) ||
                      origin.includes('192.168.') ||
                      (window as any).Capacitor;
  
  if (isCapacitor) {
    return `https://ais-pre-wlrbpf7khax3bie5zbm3fy-24605880583.europe-west2.run.app${path}`;
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
  { id: 'electronics', label: 'إلكترونيات', icon: '' },
  { id: 'cars', label: 'سيارات', icon: '' },
  { id: 'furniture', label: 'أثاث', icon: '' },
  { id: 'fashion', label: 'ملابس', icon: '' },
  { id: 'realestate', label: 'عقارات', icon: '' },
  { id: 'services', label: 'خدمات', icon: '' },
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
  const [view, setView] = useState<'home' | 'details' | 'create' | 'profile' | 'sellerProfile' | 'chats' | 'chatroom' | 'myAds' | 'notifications' | 'blocks' | 'favorites'>('home');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);

  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
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
          
          if ('vibrate' in navigator) navigator.vibrate(50);
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
        if (messaging) {
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
            console.error('Notification error:', error);
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
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const handleLogin = () => {
    setShowLoginModal(true);
  };

  const loginWithGoogle = async () => {
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
      }

      setToast({
        title: errorTitle,
        body: errorMessage
      });
      setTimeout(() => setToast(null), 5000);
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
  }, [activeCategory]);

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

    // Check if chat already exists
    const chatsRef = collection(db, 'chats');
    const q = query(
      chatsRef, 
      where('participants', 'array-contains', user.uid),
      where('adId', '==', ad.id)
    );
    const snap = await getDocs(q);
    
    let chat: Conversation;
    if (!snap.empty) {
      chat = { id: snap.docs[0].id, ...snap.docs[0].data() } as Conversation;
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
    <div className="min-h-screen pb-20 flex flex-col w-full bg-white relative overflow-x-hidden">
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
            />
          )}

          {view === 'create' && (
            <CreateAdView 
              user={user} 
              onClose={() => setView('home')} 
              onSuccess={() => setView('home')} 
              createNotification={createNotification}
            />
          )}

          {view === 'details' && selectedAd && (
            <AdDetailsView 
              ad={selectedAd} 
              onBack={() => setView('home')} 
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
                  setView('profile');
                } else {
                  setView('details');
                }
              }}
              onAdClick={showAdDetails}
              onStartChat={(ad: Ad) => startChat(ad)}
              currentUser={user}
            />
          )}


          {view === 'myAds' && user && (
            <MyAdsView 
              user={user}
              onBack={() => setView('profile')}
              onAdClick={showAdDetails}
              createNotification={createNotification}
            />
          )}

          {view === 'favorites' && user && (
            <FavoritesView 
              favorites={favorites}
              onBack={() => setView('home')}
              onAdClick={showAdDetails}
              onToggleFavorite={toggleFavorite}
            />
          )}

          {view === 'notifications' && user && (
            <NotificationsView 
              onBack={() => setView('profile')} 
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
              onBack={() => setView('profile')} 
            />
          )}

          {view === 'profile' && user && (
            <ProfileView 
              user={user} 
              profile={profile}
              blockedUsers={blockedUsers}
              unreadNotifications={unreadNotifications}
              onLogout={handleLogout}
              onBack={() => setView('home')}
              onViewMyAds={() => setView('myAds')}
              onViewNotifications={() => setView('notifications')}
              onViewBlocked={() => setView('blocks')}
              onViewFavorites={() => setView('favorites')}
              showInstallButton={showInstallButton}
              onInstall={handleInstallClick}
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
              onBack={() => setView('chats')}
              blockedUsers={blockedUsers}
              createNotification={createNotification}
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
            className="fixed top-20 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm"
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً (الأقصى 2 ميجابايت)');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      performSendMessage('', base64String);
    };
    reader.readAsDataURL(file);
  };
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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
        
        // Smarter optimistic clearing: only clear ones that have been "recognized" by the server
        setOptimisticMessages(prev => prev.filter(om => 
          !msgs.some(m => m.text === om.text && m.senderId === om.senderId)
        ));
        
        // Scroll to bottom
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 150);
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
      isOptimistic: true
    };
    setOptimisticMessages(prev => [...prev, optimisticMsg]);
    
    setSending(true);
    if (type === 'text') setNewMessage('');
    
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 10);

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
            createdAt: serverTimestamp()
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
            text, 
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
    const text = newMessage;
    setNewMessage('');
    await performSendMessage(text);
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
    return [...messages, ...optimisticMessages].sort((a,b) => {
       const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
       const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
       return tA - tB;
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
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5 no-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed opacity-[0.98]">
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
                      "max-w-[85%] relative cursor-grab active:cursor-grabbing",
                      isMe ? "chat-gradient-me text-white shadow-sm" : "chat-gradient-other border border-brand-border/50 text-brand-primary shadow-sm",
                      "px-4 py-2.5 transition-all duration-300",
                      isMe 
                        ? cn("rounded-[20px]", !isNextMe && "rounded-bl-none", isPrevMe && "rounded-tl-[8px]")
                        : cn("rounded-[20px]", !isNextMe && "rounded-br-none", isPrevMe && "rounded-tr-[8px]")
                    )}
                  >
                    
                    <div className={cn(
                      "flex flex-col gap-2",
                      isMe ? "items-start" : "items-end"
                    )}>
                      {msg.type === 'voice' && msg.audioUrl && (
                        <div className="flex items-center gap-3 py-2 px-1 min-w-[200px]">
                          <button 
                             onClick={(e) => {
                               const audio = new Audio(msg.audioUrl);
                               audio.play();
                             }}
                             className={cn(
                               "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                               isMe ? "bg-white/20 hover:bg-white/30" : "bg-brand-primary/10 hover:bg-brand-primary/20"
                             )}
                          >
                             <Play className="w-5 h-5 fill-current" />
                          </button>
                          <div className="flex-1 space-y-1">
                             <div className="flex gap-0.5 h-6 items-center">
                                {[...Array(12)].map((_, i) => (
                                   <div key={i} className={cn("w-1 rounded-full", isMe ? "bg-white/40" : "bg-brand-primary/20")} style={{ height: `${Math.random() * 100}%`, minHeight: '4px' }} />
                                ))}
                             </div>
                             <p className="text-[9px] font-black opacity-60">0:12</p>
                          </div>
                          <Mic className="w-4 h-4 opacity-40" />
                        </div>
                      )}

                      {msg.type === 'offer' && (
                        <div className={cn(
                          "p-4 rounded-2xl w-full min-w-[200px] space-y-3",
                          isMe ? "bg-white/10" : "bg-brand-bg border border-brand-border"
                        )}>
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
  favorites, toggleFavorite
}: any) {
  const [quickViewAd, setQuickViewAd] = useState<Ad | null>(null);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="mesh-bg min-h-screen"
    >
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
      <section className="relative pt-12 pb-20 px-6 overflow-hidden">
        <div className="max-w-6xl mx-auto relative z-10 space-y-12">
          <div className="flex flex-col items-center text-center space-y-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/5 border border-brand-primary/10 text-[9px] font-black uppercase tracking-[0.3em] text-brand-primary/60"
            >
              <Sparkles className="w-3 h-3" />
              الجيل الجديد من البيع والشراء
            </motion.div>
            
            <h2 className="text-5xl lg:text-8xl font-serif font-black tracking-tighter text-brand-primary leading-[1.1] max-w-4xl">
               سوق <span className="italic underline decoration-brand-primary/10 transition-all hover:decoration-brand-primary/40 cursor-default">الرافدين</span> يعيد صياغة التميز.
            </h2>
            
            <p className="text-brand-secondary font-medium max-w-lg leading-relaxed text-sm lg:text-base opacity-70">
              منصة عراقية تجمع بين الحداثة والبساطة. ابحث عن نوادرك، أو اعرض ما تملك بأناقة تليق بك.
            </p>

            <div className="relative w-full max-w-2xl mx-auto group">
              <div className="absolute inset-0 bg-brand-primary/5 blur-3xl rounded-full scale-110 opacity-50 group-focus-within:opacity-100 transition-opacity" />
              <div className="relative glass rounded-[32px] p-2 flex items-center gap-2 shadow-elite transition-all focus-within:shadow-2xl">
                <Search className="mr-6 text-brand-secondary w-5 h-5 opacity-40 group-focus-within:opacity-100 transition-opacity" />
                <input 
                  type="text" 
                  placeholder="ابحث عن هاتف، سيارة، أو أثاث فاخر..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none py-4 pr-2 pl-4 text-lg font-medium focus:ring-0 outline-none placeholder:text-brand-secondary/40"
                />
                <button className="bg-brand-primary text-white p-4 rounded-2xl shadow-xl shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-all">
                  <ArrowRight className="w-6 h-6 rotate-180" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-3">
             <div className="relative">
               <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-primary opacity-40 pointer-events-none" />
               <select 
                 value={activeCity || 'الكل'}
                 onChange={(e) => setActiveCity(e.target.value)}
                 className="appearance-none bg-white/50 backdrop-blur-md border border-brand-border pr-10 pl-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-tighter text-brand-primary outline-none focus:border-brand-primary/20 transition-all cursor-pointer hover:bg-white"
               >
                 {CITIES.map(city => (
                   <option key={city} value={city}>{city === 'الكل' ? 'كل العراق' : city}</option>
                 ))}
               </select>
             </div>
             
             <div className="h-8 w-[1px] bg-brand-border mx-2 hidden md:block" />
             <FilterBadge label="جديد" active={activeCondition === 'new'} onClick={() => setActiveCondition(activeCondition === 'new' ? null : 'new')} icon={<CheckCircle2 className="w-3 h-3" />} />
             <FilterBadge label="الأعلى سعراً" active={sortBy === 'price_desc'} onClick={() => setSortBy(sortBy === 'price_desc' ? 'newest' : 'price_desc')} icon={<Star className="w-3 h-3" />} />
          </div>
        </div>

        {/* Decorative Mesh Elements */}
        <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-brand-accent/30 blur-[120px] rounded-full -mr-[20vw] -mt-[10vw]" />
        <div className="absolute bottom-0 left-0 w-[30vw] h-[30vw] bg-brand-accent/20 blur-[100px] rounded-full -ml-[15vw] -mb-[10vw]" />
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
                  "flex items-center justify-center px-6 py-3.5 rounded-full transition-all duration-300 border text-xs font-black uppercase tracking-widest min-w-[100px]",
                  activeCategory === cat.id 
                    ? "bg-brand-primary text-white border-brand-primary shadow-lg scale-105" 
                    : "bg-white text-brand-primary border-brand-border hover:border-brand-primary/40 hover:bg-brand-muted"
                )}
              >
                <span>{cat.label}</span>
                {activeCategory === cat.id && (
                  <span className="mr-1.5 opacity-80 text-[10px]">←</span>
                )}
                {activeCategory === cat.id && (
                  <div className="absolute inset-0 bg-white/10 pointer-events-none" />
                )}
              </motion.button>
            ))}
          </div>
        </div>

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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-20">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="bg-white rounded-[48px] border border-brand-border p-2 transition-all">
                    <div className="aspect-[4/5] bg-brand-muted animate-pulse rounded-[40px]" />
                    <div className="p-6 space-y-4">
                      <div className="space-y-2">
                        <div className="h-2 w-12 bg-brand-muted animate-pulse rounded-full" />
                        <div className="h-6 w-34 bg-brand-muted animate-pulse rounded-full" />
                      </div>
                      <div className="pt-4 border-t border-brand-border/60 flex items-center justify-between">
                         <div className="space-y-2">
                           <div className="h-2 w-8 bg-brand-muted animate-pulse rounded-full" />
                           <div className="h-6 w-24 bg-brand-muted animate-pulse rounded-full" />
                         </div>
                         <div className="w-10 h-10 bg-brand-muted animate-pulse rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : ads.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-20">
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

function CreateAdView({ user, onClose, onSuccess, createNotification }: any) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: 'electronics',
    condition: 'excellent',
    whatsappNumber: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [catAiLoading, setCatAiLoading] = useState(false);
  const [descAiLoading, setDescAiLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

      const adData: Omit<Ad, 'id'> = {
        title: formData.title,
        description: formData.description,
        price: Number(formData.price),
        category: formData.category,
        condition: formData.condition,
        images: finalImages,
        location: { lat: 33.3152, lng: 44.3661, city: 'بغداد' },
        sellerId: user.uid,
        sellerName: user.displayName || 'بائع',
        contactMethod: 'whatsapp',
        whatsappNumber: formData.whatsappNumber,
        createdAt: serverTimestamp(),
        status: 'active'
      };

      const adDocRef = await addDoc(collection(db, 'ads'), adData);
      
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
            'منتج جديد يهمك!',
            `تمت إضافة إعلان جديد في فئة ${CATEGORIES.find(c => c.id === formData.category)?.label}: "${formData.title}"`,
            'ad',
            { adId: adDocRef.id }
          ).catch(() => {});
        }
      });

      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ads');
    } finally {
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

        {!user?.emailVerified && (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-3xl flex items-center gap-3">
            <AlertCircle className="text-amber-600 w-5 h-5 shrink-0" />
            <p className="text-[11px] text-amber-900 font-bold">يرجى توثيق بريدك الإلكتروني من صفحة الحساب لتتمكن من نشر الإعلانات.</p>
          </div>
        )}

        <button 
          disabled={submitting || !user?.emailVerified}
          className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-brand-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
          نشر الإعلان
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
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

    const formatted = validateAndFormatEmail(emailOrPhone);
    if (!formatted) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني أو رقم الهاتف!');
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

        onClose();
      }
    } catch (error: any) {
      console.error("Auth process error:", error);
      let arabicErrMsg = 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          arabicErrMsg = 'هذا الحساب (أو رقم الهاتف) مسجل بالفعل! جرب تسجيل الدخول.';
          break;
        case 'auth/weak-password':
          arabicErrMsg = 'كلمة المرور ضعيفة جداً! يجب أن تكون 6 خانات على الأقل.';
          break;
        case 'auth/invalid-email':
          arabicErrMsg = 'البريد أو الهاتف غير صالح!';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          arabicErrMsg = 'بيانات الدخول غير صحيحة! يرجى التأكد من البريد/الهاتف وكلمة المرور.';
          break;
        case 'auth/too-many-requests':
          arabicErrMsg = 'لقد حاولت تسجيل الدخول عدة مرات بشكل خاطئ! تم حظرك مؤقتاً، يرجى إعادة المحاولة لاحقاً.';
          break;
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
          <div className="flex bg-brand-muted p-1 rounded-2xl mb-6">
            <button
              onClick={() => { setActiveTab('login'); setErrorMsg(''); }}
              className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
                activeTab === 'login' 
                  ? 'bg-white text-brand-primary shadow-sm' 
                  : 'text-brand-secondary/70 hover:text-brand-primary'
              }`}
            >
              تسجيل الدخول
            </button>
            <button
              onClick={() => { setActiveTab('register'); setErrorMsg(''); }}
              className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
                activeTab === 'register' 
                  ? 'bg-white text-brand-primary shadow-sm' 
                  : 'text-brand-secondary/70 hover:text-brand-primary'
              }`}
            >
              إنشاء حساب جديد
            </button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-100 text-red-600 rounded-2xl p-4 text-xs font-bold mb-4 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
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
              <label className="text-xs font-black text-brand-primary">رقم الهاتف العراقي أو البريد الإلكتروني</label>
              <input 
                type="text"
                required
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder="مثال: 07701234567 أو mail@example.com"
                className="w-full bg-brand-muted border-none p-4 rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all text-right ltr"
              />
            </div>

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
                <span>{activeTab === 'login' ? 'دخول سريع' : 'إنشاء حسابي مجاناً'}</span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-brand-border/60" />
            </div>
            <span className="relative px-4 text-[10px] font-black tracking-widest uppercase bg-white text-brand-secondary/50">أو</span>
          </div>

          {/* Social Sign In (For Web Users) */}
          <button
            onClick={onGoogleLogin}
            type="button"
            className="w-full py-4 border-2 border-brand-border hover:bg-brand-muted hover:border-brand-primary/30 transition-all rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.98]"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.53 14.98 1 12 1 7.35 1 3.28 3.67 1.13 7.58l3.92 3.04C5.99 7.42 8.79 5.04 12 5.04z" />
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.12 2.73-2.38 3.58l3.7 2.87c2.16-1.99 3.71-4.92 3.71-8.6z" />
              <path fill="#FBBC05" d="M5.05 10.62a7.12 7.12 0 0 1 0 2.76l-3.92 3.04A11.96 11.96 0 0 1 1.13 7.58l3.92 3.04z" />
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.7-2.87c-1.03.69-2.35 1.1-4.26 1.1-3.21 0-6.01-2.38-6.95-5.58H1.13v3.13C3.28 20.33 7.35 23 12 23z" />
            </svg>
            <span className="text-sm font-bold text-gray-700">دخول بواسطة Google</span>
          </button>
          
          <p className="text-[10px] text-center text-brand-secondary/40 mt-5 leading-normal">
            إذا كنت تستخدم هاتف أندرويد وتواجه مشكلة في Google، يرجى ملء الخانات بالأعلى كحساب جديد للتسجيل الفوري داخل التطبيق دون أي متصفح خارجي!
          </p>
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
      className="bg-brand-bg min-h-screen pb-40"
    >
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
      <section className="relative h-[65vh] lg:h-[80vh] w-full overflow-hidden group touch-none">
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
        <div className="absolute top-8 left-8 right-8 flex justify-between items-center z-50">
           <button onClick={onBack} className="w-12 h-12 bg-white/20 backdrop-blur-2xl border border-white/20 rounded-full text-white hover:bg-white/40 transition-all active:scale-90 shadow-xl flex items-center justify-center font-black">
              <span className="font-serif font-black text-sm leading-none">→</span>
           </button>
           <div className="flex gap-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowBlockConfirm(true); }}
                disabled={isBlocking}
                className={cn(
                  "p-4 bg-white/20 backdrop-blur-2xl border border-white/20 rounded-full text-white hover:bg-red-500 transition-all active:scale-90 shadow-xl",
                  isBlocked && "bg-red-600 border-red-600"
                )}
              >
                {isBlocking ? <Loader2 className="w-6 h-6 animate-spin" /> : <Ban className="w-6 h-6" />}
              </button>
              <button onClick={onToggleFavorite} className="p-4 bg-white/20 backdrop-blur-2xl border border-white/20 rounded-full text-white hover:bg-white/40 transition-all shadow-xl">
                 <Heart className={cn("w-6 h-6 transition-colors", isFavorited ? "fill-red-500 text-red-500" : "")} />
              </button>
              <button onClick={() => setIsShareModalOpen(true)} className="p-4 bg-white/20 backdrop-blur-2xl border border-white/20 rounded-full text-white hover:bg-white/40 transition-all shadow-xl">
                 <Share2 className="w-6 h-6" />
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
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-3 z-50 overflow-x-auto no-scrollbar max-w-[90vw] p-2 glass rounded-[32px]">
           {images.map((img: string, idx: number) => (
             <button 
               key={`thumb-${idx}`}
               onClick={() => setCurrentImageIndex(idx)}
               className={cn(
                 "w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all shrink-0",
                 currentImageIndex === idx ? "border-white scale-110 shadow-2xl" : "border-transparent opacity-40 hover:opacity-100"
               )}
             >
               <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
             </button>
           ))}
        </div>
      </section>

      {/* Content Section - Editorial Layout */}
      <div className="max-w-7xl mx-auto px-6 -mt-16 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-8 space-y-16">
          {/* Header Info */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
               <span className="px-4 py-1.5 rounded-full bg-brand-primary text-white text-[10px] font-black uppercase tracking-[0.2em]">{ad.category}</span>
               <div className="flex items-center gap-2 text-[10px] font-bold text-brand-secondary opacity-40 uppercase tracking-widest">
                  <MapPin className="w-3 h-3" />
                  {ad.location.city}
               </div>
            </div>
            <h1 className="text-5xl lg:text-7xl font-serif font-black text-brand-primary leading-[1.1]">{ad.title}</h1>
            
            <div className="flex items-baseline gap-4">
               <p className="text-4xl font-bold text-brand-primary">
                 {ad.price.toLocaleString()} <span className="text-lg opacity-30">د.ع</span>
               </p>
               {ad.condition === 'new' && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">جديد تماماً</span>}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-30 border-b border-brand-border pb-4">عن هذا المنتج</h3>
            <div className="prose prose-stone max-w-none">
               <p className="text-xl lg:text-2xl text-brand-secondary leading-relaxed font-medium">
                 {ad.description}
               </p>
            </div>
          </div>

          <PriceChart price={ad.price} />

          {/* Location / Safety */}
          <div className="p-10 rounded-[48px] bg-brand-accent/50 border border-brand-border space-y-8">
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
              <div className="p-8 rounded-[48px] bg-white border border-brand-border shadow-elite space-y-8">
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
                          className="w-full bg-brand-primary text-white py-5 rounded-[32px] font-bold text-lg shadow-2xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group"
                        >
                          <MessageSquare className="w-5 h-5 group-hover:animate-bounce" />
                          دردشة فورية
                        </button>
                        
                        <div className="grid grid-cols-2 gap-4">
                          {ad.phoneNumber && (
                             <a 
                              href={`tel:${ad.phoneNumber}`}
                              className="bg-brand-muted text-brand-primary py-5 rounded-[32px] font-bold text-sm shadow-sm hover:bg-brand-primary hover:text-white transition-all flex flex-col items-center justify-center gap-2"
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
                              className="bg-emerald-50 text-emerald-600 py-5 rounded-[32px] font-bold text-sm shadow-sm hover:bg-emerald-500 hover:text-white transition-all flex flex-col items-center justify-center gap-2"
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

function SellerProfileView({ userId, onBack, onAdClick, onStartChat, currentUser }: any) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
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

      } catch (e) {
        console.error("Error fetching seller profile:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

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
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-tr from-brand-primary to-brand-muted rounded-full opacity-20 blur group-hover:opacity-40 transition duration-500"></div>
            <div className="relative w-32 h-32 bg-brand-muted border-4 border-white rounded-full overflow-hidden shadow-2xl">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
              ) : (
                <img src={`https://ui-avatars.com/api/?name=${profile?.displayName}&background=51513d&color=fff`} className="w-full h-full" alt="" />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-serif font-bold text-brand-primary">{profile?.displayName}</h1>
            <div className="flex items-center justify-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary opacity-40">
                {profile?.isVerified ? 'بائع موثوق' : 'بائع نشط'}
              </span>
              {profile?.isVerified && (
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-50" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
            <div className="bg-white p-6 rounded-3xl border border-brand-border shadow-sm text-center">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-1">الإعلانات النشطة</p>
              <p className="text-xl font-serif font-bold text-brand-primary">{ads.length}</p>
            </div>
          </div>
        </div>

        <div className="space-y-12">
          <div className="space-y-8">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] border-b border-brand-border pb-4">إعلانات البائع</h3>
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
            <div className="text-center py-20 opacity-30">
              <ShoppingBag className="w-8 h-8 mx-auto mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest">لا توجد إعلانات نشطة</p>
            </div>
          )}
        </div>
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
  user, profile, onLogout, onBack, onViewMyAds, onViewNotifications, unreadNotifications, onViewBlocked, blockedUsers, onViewFavorites, 
  showInstallButton, onInstall 
}: any) {
  const [editing, setEditing] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
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
      setEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const markVerified = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), { isVerified: true });
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
        <MenuButton 
          onClick={onViewNotifications} 
          icon={<Bell className={cn(unreadNotifications > 0 && "text-red-500 fill-red-500")} />} 
          label="التنبيهات" 
          badge={unreadNotifications > 0 ? unreadNotifications : undefined}
        />
        <MenuButton onClick={onViewMyAds} icon={<ShoppingBag />} label="إعلاناتي" />
        <MenuButton onClick={onViewFavorites} icon={<Heart />} label="المفضلة" />
        <MenuButton 
          onClick={onViewBlocked}
          icon={<Ban className="text-brand-secondary" />} 
          label="المستخدمين المحظورين" 
          badge={blockedUsers?.length > 0 ? blockedUsers.length : undefined}
        />
        <MenuButton 
          onClick={() => alert('سوق الرافدين - النسخة الاحترافية 2.1')}
          icon={<AlertCircle />} 
          label="حول التطبيق" 
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
    </motion.div>
  );
}

function MyAdsView({ user, onBack, onAdClick, createNotification }: any) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const [showConfirm, setShowConfirm] = useState(false);
  const [adToDelete, setAdToDelete] = useState<string | null>(null);

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
                
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold",
                    ad.status === 'active' ? "bg-green-50 text-green-600" : 
                    ad.status === 'sold' ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-400"
                  )}>
                    {ad.status === 'active' ? 'نشط' : ad.status === 'sold' ? 'تم البيع' : 'محذوف'}
                  </span>
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
        "group cursor-pointer flex flex-col h-full bg-white rounded-[48px] border hover:shadow-elite p-2 transition-all duration-700",
        ad.isFeatured ? "border-brand-primary border-2 shadow-[0_0_40px_rgba(0,0,0,0.05)] ring-4 ring-brand-primary/5" : "border-brand-border hover:border-brand-primary/10"
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[40px] grainy">
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
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-primary opacity-30">{ad.category}</p>
          <h3 className="font-serif font-black text-xl leading-tight line-clamp-2 text-brand-primary group-hover:text-brand-primary/80 transition-colors">{ad.title}</h3>
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
        "flex flex-col items-center justify-center transition-all relative px-4 py-2 group rounded-xl",
        active ? "text-brand-primary font-black" : "text-brand-secondary opacity-60 hover:opacity-100"
      )}
    >
      <span className="text-[11px] uppercase tracking-wider transition-all font-black">{label}</span>
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


