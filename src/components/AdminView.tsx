import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Users, ShoppingBag, MessageSquare, Shield, ShieldCheck, 
  Trash2, Award, CheckCircle2, XCircle, Search, ChevronRight, Send, MapPin, 
  UserX, UserCheck, Eye, Star, Lock, Unlock, Mail, Phone, Zap, Clock, MessageCircle,
  Megaphone, Bell, Radio, CheckCheck, CreditCard, Crown, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, where, orderBy, getDocs, onSnapshot, 
  doc, updateDoc, deleteDoc, addDoc, serverTimestamp, getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface AdminViewProps {
  user: any;
  onBack: () => void;
  setToast: (toast: any) => void;
}

export default function AdminView({ user, onBack, setToast }: AdminViewProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'ads' | 'users' | 'support' | 'broadcast' | 'settings'>('stats');
  
  // Real-time states
  const [ads, setAds] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [supportChats, setSupportChats] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewedPayment, setReviewedPayment] = useState<any | null>(null);

  // Search states
  const [adsSearch, setAdsSearch] = useState('');
  const [usersSearch, setUsersSearch] = useState('');

  // Active Support Chat for Admin
  const [activeSupportChat, setActiveSupportChat] = useState<any | null>(null);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Broadcast states
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'announcement' | 'alert' | 'warning' | 'offer'>('announcement');
  const [broadcastLink, setBroadcastLink] = useState('');
  
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState({ current: 0, total: 0 });
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  // Admin Profile settings (General Manager only)
  const isGeneralManager = user?.email === 'caesar.m2019@gmail.com' || user?.email === 'qaisar.m2019@gmail.com';
  const [adminName, setAdminName] = useState('الدعم الفني والشكاوى 🛠️');
  const [adminPhoto, setAdminPhoto] = useState('https://ui-avatars.com/api/?name=إدارة+الرافدين&background=000&color=fff');
  const [savingAdminProfile, setSavingAdminProfile] = useState(false);

  const handleApprovePayment = async (p: any) => {
    try {
      // 1. Update payment status in Firestore
      await updateDoc(doc(db, 'payments', p.id), {
        status: 'approved',
        approvedAt: serverTimestamp()
      });

      // 2. Turn the Ad status to featured (VIP golden badge) and subscribed (VIP Crown)
      if (p.adId && p.adId !== 'new_ad') {
        const adRef = doc(db, 'ads', p.adId);
        await updateDoc(adRef, {
          isFeatured: true,
          isSubscribed: true,
          featuredUntil: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 Days Promo
        });
      }

      // 3. Dispatch secure in-app and push notify
      await addDoc(collection(db, 'notifications'), {
        userId: p.userId,
        title: '🌟 تمت ترقية إعلانك للمميز والمشترك VIP!',
        message: `تم التحقق من حوالتك المالية بقيمة 1,500 د.ع وتفعيل ميزتي النشر الذهبي المميز ووسام العضو المشترك للإعلان "${p.adTitle}" طوال 30 يوماً بنجاح!`,
        type: 'ad',
        data: { adId: p.adId },
        read: false,
        createdAt: serverTimestamp()
      });

      setToast({
        title: 'تم التفعيل والترويج الذهبي بنجاح! 🎖️',
        body: `تم تمييز الإعلان وتنشيط رصيد الترقية وإرسال تنبيه للمعلن.`,
        type: 'success'
      });
      setReviewedPayment(null);
    } catch (err) {
      console.error(err);
      alert('فشل ترحيل وتأكيد عملية الدفع اليدوية.');
    }
  };

  const handleRejectPayment = async (p: any) => {
    try {
      // 1. Mark payment as rejected
      await updateDoc(doc(db, 'payments', p.id), {
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });

      // 2. Dispatch warning in-app notification
      await addDoc(collection(db, 'notifications'), {
        userId: p.userId,
        title: '⚠️ فشل ترقية الإعلان للمميز',
        message: `لم نتمكن من تفعيل النشر الذهبي لإعلانك "${p.adTitle}". رقم المعاملة غير صحيح أو لم نستلم الحوالة بعد. يرجى التواصل مع الدعم.`,
        type: 'ad',
        data: { adId: p.adId },
        read: false,
        createdAt: serverTimestamp()
      });

      setToast({
        title: 'تم رفض طلب التنشيط 🛑',
        body: 'تم إرجاع الإشعار بالرفض ويتمكن المعلن من مراجعتك عبر الدعم.',
        type: 'warning'
      });
      setReviewedPayment(null);
    } catch (err) {
      console.error(err);
      alert('فشل في رفض وتحديث حالة الإيصال.');
    }
  };

  // Fetch admin support identity dynamically
  useEffect(() => {
    const fetchAdminIdentity = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', 'admin_support'));
        if (snap.exists()) {
          const d = snap.data();
          if (d.displayName) setAdminName(d.displayName);
          if (d.photoURL) setAdminPhoto(d.photoURL);
        }
      } catch (e) {
        console.error("Error loaded admin identity profile:", e);
      }
    };
    fetchAdminIdentity();
  }, []);

  const handleUpdateAdminProfile = async () => {
    if (!isGeneralManager) {
      setToast({
        title: 'عذراً، غير مسموح 🛑',
        body: 'رتبتك لا تسمح بتعديل هوية الإدارة، هذه الصلاحية مخصصة للمدير العام فقط.'
      });
      return;
    }

    if (!adminName.trim()) {
      setToast({ title: 'تنبيه ⚠️', body: 'يرجى كتابة اسم الإدارة.' });
      return;
    }

    setSavingAdminProfile(true);
    try {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', 'admin_support'), {
        uid: 'admin_support',
        displayName: adminName.trim(),
        photoURL: adminPhoto.trim(),
        role: 'support',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      setToast({
        title: 'تم تحديث هوية الإدارة بنجاح ✅',
        body: 'تم ضبط الاسم الجديد والصورة بنجاح لجميع مستخدمي المنصة.'
      });
    } catch (err) {
      console.error("Error saving admin_support identity profile:", err);
      setToast({
        title: 'خطأ في التحديث ⚠️',
        body: 'يرجى مراجعة الصلاحيات أو التأكد من مطابقة حسابك لقوق الحماية.'
      });
    } finally {
      setSavingAdminProfile(false);
    }
  };

  // Load Ads, Users, and Support Chats in real-time
  useEffect(() => {
    setLoading(true);

    // 1. Listen to all advertisements
    const qAds = query(collection(db, 'ads'), orderBy('createdAt', 'desc'));
    const unsubscribeAds = onSnapshot(qAds, (snapshot) => {
      const adsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAds(adsList);
      setLoading(false);
    }, (err) => console.error("Error loaded ads:", err));

    // 2. Listen to all users
    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(usersList);
    }, (err) => console.error("Error loaded users:", err));

    // 3. Listen to support conversations
    const qChats = query(
      collection(db, 'chats'), 
      where('adId', '==', 'support')
    );
    const unsubscribeChats = onSnapshot(qChats, (snapshot) => {
      const supportList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in memory by lastMessageAt to avoid index problems
      supportList.sort((a: any, b: any) => {
        const timeA = a.lastMessageAt?.seconds || 0;
        const timeB = b.lastMessageAt?.seconds || 0;
        return timeB - timeA;
      });
      setSupportChats(supportList);
    }, (err) => console.error("Error loaded support chats:", err));

    // 4. Listen to payments (MasterCard)
    const qPayments = query(collection(db, 'payments'), orderBy('timestamp', 'desc'));
    const unsubscribePayments = onSnapshot(qPayments, (snapshot) => {
      const paymentsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPayments(paymentsList);
    }, (err) => console.error("Error loaded payments:", err));

    return () => {
      unsubscribeAds();
      unsubscribeUsers();
      unsubscribeChats();
      unsubscribePayments();
    };
  }, []);

  // Listen to support messages when an active support chat is selected
  useEffect(() => {
    if (!activeSupportChat) return;

    const qMessages = query(
      collection(db, 'chats', activeSupportChat.id, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribeMessages = onSnapshot(qMessages, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSupportMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    // Clear unread count for admin support
    updateDoc(doc(db, 'chats', activeSupportChat.id), {
      'unreadCount.admin_support': 0
    }).catch(err => console.error("Error clearing support read:", err));

    return () => unsubscribeMessages();
  }, [activeSupportChat]);

  // Handle sending support reply
  const handleSendReply = async () => {
    if (!newMessageText.trim() || !activeSupportChat) return;

    const replyText = newMessageText.trim();
    setNewMessageText('');

    try {
      // Add message to subcollection
      await addDoc(collection(db, 'chats', activeSupportChat.id, 'messages'), {
        senderId: 'admin_support',
        text: replyText,
        read: false,
        createdAt: serverTimestamp()
      });

      // Update parent document
      await updateDoc(doc(db, 'chats', activeSupportChat.id), {
        lastMessage: replyText,
        lastMessageAt: serverTimestamp(),
        'unreadCount.admin_support': 0,
        // Mark as unread for the user side
        [`unreadCount.${getUserId(activeSupportChat)}`]: 1
      });

    } catch (err) {
      console.error("Error sending reply:", err);
      setToast({
        title: 'خطأ ⚠️',
        body: 'فشل إرسال الرد الفني. يرجى التحقق من الشبكة.'
      });
    }
  };

  // Helper to get user's info in support chat
  const getUserId = (chat: any) => {
    return chat.participants.find((p: string) => p !== 'admin_support') || '';
  };

  const getUserData = (userId: string) => {
    return users.find(u => u.id === userId) || { displayName: 'مستخدم الرافدين', photoURL: '' };
  };

  // Actions: Toggle Verified Seller status
  const handleToggleVerify = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isVerified: !currentStatus
      });
      setToast({
        title: 'تم تحديث التوثيق 👑',
        body: `تم ${!currentStatus ? 'توثيق حساب' : 'إلغاء توثيق حساب'} العضو بنجاح.`
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Actions: Toggle Admin Access status
  const handleToggleAdmin = async (userId: string, currentRole: string) => {
    const nextRole = currentRole === 'admin' ? 'member' : 'admin';
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: nextRole
      });
      setToast({
        title: 'تم تعديل الرتبة 🛡️',
        body: nextRole === 'admin' ? 'تمت ترقية العضو بنجاح إلى مدير نظام.' : 'تم سحب رتبة المدير من العضو.'
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Actions: Toggle Blocking user
  const handleToggleBlock = async (userId: string, currentBlocked: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isBlocked: !currentBlocked
      });
      setToast({
        title: !currentBlocked ? 'تم الحظر 🚫' : 'تم إلغاء الحظر ✅',
        body: !currentBlocked ? 'تم تقييد وصول العضو وحظره من النشر.' : 'تم إعادة تنشيط حساب العضو بنجاح.'
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Actions: Delete Ad
  const handleDeleteAd = async (adId: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا الإعلان نهائياً من سوق الرافدين؟')) return;
    try {
      await deleteDoc(doc(db, 'ads', adId));
      setToast({
        title: 'تم الحذف بنجاح🗑️',
        body: 'تم إزالة الإعلان من قواعد البيانات بشكل فوري.'
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Actions: Toggle Featured / Top ad
  const handleToggleFeatured = async (adId: string, currentFeatured: boolean) => {
    try {
      await updateDoc(doc(db, 'ads', adId), {
        isFeatured: !currentFeatured
      });
      setToast({
        title: !currentFeatured ? 'تميز الإعلان ⭐' : 'إزالة التميز 🛑',
        body: !currentFeatured ? 'تم ترقية الإعلان إلى الواجهة المميزة.' : 'تم إلغاء تمييز الإعلان.'
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Actions: Toggle Subscribed status (مشترك)
  const handleToggleSubscribed = async (adId: string, currentSubscribed: boolean) => {
    try {
      await updateDoc(doc(db, 'ads', adId), {
        isSubscribed: !currentSubscribed
      });
      setToast({
        title: !currentSubscribed ? 'ترقية لمشترك 👑' : 'إلغاء الاشتراك 🛑',
        body: !currentSubscribed ? 'تم إضافة العضوية المشتركة للإعلان بنجاح.' : 'تم إلغاء الاشتراك العضوي للإعلان.'
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Actions: Broadcast General Announcement to all Platform Users
  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim()) {
      setToast({ title: 'تنبيه ⚠️', body: 'يرجى كتابة عنوان التنبيه أولاً.' });
      return;
    }
    if (!broadcastMessage.trim()) {
      setToast({ title: 'تنبيه ⚠️', body: 'يرجى كتابة محتوى وتوضيح التعميم أولاً.' });
      return;
    }

    setIsBroadcasting(true);
    setBroadcastSuccess(false);
    
    // Safety check: filter out admin or invalid user IDs if needed, but the demand is to send to ALL registered system users
    const totalUsers = users.length;
    setBroadcastProgress({ current: 0, total: totalUsers });

    try {
      let sentCount = 0;
      
      for (const u of users) {
        if (!u.id) continue;

        const notifData: any = {
          userId: u.id,
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
          type: 'info',
          read: false,
          createdAt: serverTimestamp()
        };

        // Attach optional data map
        const dataPayload: any = {
          broadcastType: broadcastType,
          isGlobal: true,
          timestamp: Date.now().toString()
        };

        if (broadcastLink.trim()) {
          dataPayload.link = broadcastLink.trim();
        }
        notifData.data = dataPayload;

        // Write directly to the DB! Satisfies rules and displays dynamically in each user's notifications panel
        await addDoc(collection(db, 'notifications'), notifData);

        // Optional FCM push notification Integration
        if (u.fcmToken) {
          try {
            await fetch('/api/notifications/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: u.fcmToken,
                title: broadcastTitle.trim(),
                body: broadcastMessage.trim(),
                data: dataPayload
              })
            }).catch(() => {});
          } catch (fcmErr) {
            console.warn(`fcm skipped for user ${u.id}`);
          }
        }

        sentCount++;
        setBroadcastProgress({ current: sentCount, total: totalUsers });
        
        // Brief 40ms pause to ensure smooth animation and stagger queries
        await new Promise(resolve => setTimeout(resolve, 40));
      }

      setBroadcastSuccess(true);
      setToast({
        title: 'بث وطني مكتمل 🚀',
        body: `تم إطلاق التعميم بنجاح ووصل لـ ${totalUsers} بائع ومشتري دفعة واحدة!`
      });

      // Reset form on success
      setBroadcastTitle('');
      setBroadcastMessage('');
      setBroadcastLink('');

    } catch (broadcastError) {
      console.error("Error while broadcast national message:", broadcastError);
      setToast({
        title: 'خطأ أثناء البث ⚠️',
        body: 'فشل إكمال البث العام بسبب مشاكل الصلاحية أو قواعد الاتصال.'
      });
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Filtering lists based on search
  const filteredAds = ads.filter(ad => 
    ad.title.toLowerCase().includes(adsSearch.toLowerCase()) || 
    ad.category.toLowerCase().includes(adsSearch.toLowerCase()) ||
    ad.location?.city?.toLowerCase().includes(adsSearch.toLowerCase())
  );

  const filteredUsers = users.filter(u => 
    (u.displayName || '').toLowerCase().includes(usersSearch.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(usersSearch.toLowerCase()) || 
    (u.whatsappNumber || '').includes(usersSearch)
  );

  // Statistics calculation
  const totalAdsCount = ads.length;
  const activeAdsCount = ads.filter(a => a.status === 'active' || !a.status).length;
  const soldAdsCount = ads.filter(a => a.status === 'sold').length;
  const totalUsersCount = users.length;
  const verifiedUsersCount = users.filter(u => u.isVerified).length;
  const totalBlockedUsersCount = users.filter(u => u.isBlocked).length;
  const openSupportCount = supportChats.length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto px-4 py-6 md:py-10 space-y-8 text-right font-sans"
    >
      {/* Upper Navigation Back Row */}
      <div className="flex items-center justify-between border-b border-brand-border/20 pb-4">
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-orange-50/40 border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
          <span>العودة لصفحة الحساب</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-amber-700 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/25 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            <span>لوحة الإدارة الوطنية 🇮🇶</span>
          </span>
        </div>
      </div>

      {/* Hero Welcome */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-serif font-black text-brand-primary flex items-center gap-2">
          🛡️ مركز التوجيه وإدارة الرافدين
        </h1>
        <p className="text-xs text-brand-secondary opacity-60 font-medium">
          أهلاً ومرحباً بك يا مدير المنصة. من هنا يمكنك إدارة الإعلانات، المستخدمين، وحل شكاوى واستفسارات المواطنين فورياً وبكل نزاهة.
        </p>
      </div>

      {/* Dynamic Tab Switcher */}
      <div className="flex border border-brand-border rounded-2xl p-1 bg-white/50 backdrop-blur-md overflow-x-auto gap-1">
        <button
          onClick={() => { setActiveTab('stats'); setActiveSupportChat(null); }}
          className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
            activeTab === 'stats' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
          }`}
        >
          <BarChart className="w-4 h-4" />
          <span>لوحة الأرقام</span>
        </button>
        <button
          onClick={() => { setActiveTab('ads'); setActiveSupportChat(null); }}
          className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
            activeTab === 'ads' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="relative">
            إدارة الإعلانات
            {ads.length > 0 && (
              <span className="absolute -top-1 -left-4 bg-amber-500 text-white rounded-full text-[8px] w-3 h-3 flex items-center justify-center">{ads.length}</span>
            )}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('users'); setActiveSupportChat(null); }}
          className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
            activeTab === 'users' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>أعضاء المنصة</span>
        </button>
        <button
          onClick={() => { setActiveTab('support'); }}
          className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
            activeTab === 'support' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="relative flex items-center gap-1">
            دعم المشتركين
            {supportChats.some(c => (c.unreadCount?.admin_support || 0) > 0) && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
            )}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('broadcast'); setActiveSupportChat(null); }}
          className={`flex-1 min-w-[110px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
            activeTab === 'broadcast' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>إرسال تعميم عام</span>
        </button>
        <button
          onClick={() => { setActiveTab('settings'); setActiveSupportChat(null); }}
          className={`flex-1 min-w-[110px] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
            activeTab === 'settings' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>رتب وإعدادات الإدارة</span>
        </button>
      </div>

      {/* Loading Block */}
      {loading && (
        <div className="py-20 text-center space-y-3">
          <Zap className="w-10 h-10 text-brand-primary animate-bounce mx-auto" />
          <p className="text-xs text-brand-secondary font-black tracking-widest">تحميل البيانات والمحافظات الوطنية...</p>
        </div>
      )}

      {/* Main Containers */}
      {!loading && (
        <div className="space-y-6">
          
          {/* 1. OVERVIEW TAB */}
          {activeTab === 'stats' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Core Stats Bento */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-brand-border/60 shadow-sm space-y-2">
                  <span className="text-[10px] text-brand-secondary font-bold block">إجمالي الإعلانات</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-serif font-black text-brand-primary">{totalAdsCount}</span>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">نشط</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: `${totalAdsCount > 0 ? (activeAdsCount / totalAdsCount) * 100 : 0}%` }} />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-brand-border/60 shadow-sm space-y-2">
                  <span className="text-[10px] text-brand-secondary font-bold block">مجموع المبيعات</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-serif font-black text-amber-600">{soldAdsCount}</span>
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-bold">مكتمل</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${totalAdsCount > 0 ? (soldAdsCount / totalAdsCount) * 100 : 0}%` }} />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-brand-border/60 shadow-sm space-y-2">
                  <span className="text-[10px] text-brand-secondary font-bold block">أعضاء سوق الرافدين</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-serif font-black text-brand-primary">{totalUsersCount}</span>
                    <span className="text-[9px] text-[#555] bg-gray-100 px-2 py-0.5 rounded-full font-bold">مشترك</span>
                  </div>
                  <p className="text-[9px] text-[#777] font-semibold">{verifiedUsersCount} بائع موثق بالكامل 👑</p>
                </div>

                <div className="bg-[#0b0f1e] p-6 rounded-3xl shadow-md border border-white/5 space-y-2 text-white">
                  <span className="text-[10px] text-slate-400 font-bold block">طلبات الدعم والشكاوى</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-serif font-black text-amber-400">{openSupportCount}</span>
                    <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">تذكرة</span>
                  </div>
                  <p className="text-[9px] text-slate-300 font-bold tracking-tight">قنوات دردشة فنية مباشرة ومتواصلة 📡</p>
                </div>
              </div>

              {/* Graphical distribution and Info Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 p-6 md:p-8 bg-white rounded-3xl border border-brand-border/60 shadow-sm space-y-4">
                  <h3 className="text-md font-serif font-black text-brand-primary flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-500" />
                    <span>إرسال تعميم أو رسالة إلى الدعم</span>
                  </h3>
                  <p className="text-xs text-brand-secondary font-medium leading-relaxed">
                    يمكن للمسؤول متابعة كل تذكرة بشكل مريح. بمجرد قيام المشتري أو البائع بتوجيه استفسار من حسابه الشخصي، تنشأ قناة تواصل وطنية فورية تُمكّنك من الرد وعرض حلول التكنولوجيا العراقية مباشرة.
                  </p>
                  
                  <div className="p-4 bg-orange-50/30 border border-amber-500/10 rounded-2xl flex items-center gap-3">
                    <Award className="w-8 h-8 text-amber-600 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-black text-brand-primary">حقوق الإدارة مكفولة 🛡️</p>
                      <p className="text-[10px] text-brand-secondary opacity-60 font-bold">جميع التعديلات تتم في الوقت الفعلي عبر قواعد بيانات الرافدين الآمنة.</p>
                    </div>
                  </div>
                </div>

                {/* Iraqi provinces status */}
                <div className="p-6 bg-white rounded-3xl border border-brand-border/60 shadow-sm space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-brand-primary opacity-40">دليل التصفح الجغرافي</h3>
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-serif font-black text-brand-primary">بغداد (العاصمة)</span>
                      <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[9px] font-black">{ads.filter(a => a.location?.city === 'بغداد').length} إعلان</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-serif font-black text-[#333]">البصرة (الفيحاء)</span>
                      <span className="bg-slate-100 text-[#444] px-2 py-0.5 rounded-full text-[9px] font-bold">{ads.filter(a => a.location?.city === 'البصرة').length} إعلان</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-serif font-black text-[#333]">الموصل (الحدباء)</span>
                      <span className="bg-slate-100 text-[#444] px-2 py-0.5 rounded-full text-[9px] font-bold">{ads.filter(a => a.location?.city === 'الموصل').length} إعلان</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-serif font-black text-[#333]">أربيل (القلعة)</span>
                      <span className="bg-slate-100 text-[#444] px-2 py-0.5 rounded-full text-[9px] font-bold">{ads.filter(a => a.location?.city === 'أربيل').length} إعلان</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* MasterCard Direct Payments Feed (GM ONLY) */}
              <div className="bg-white p-6 md:p-8 rounded-[32px] border border-brand-border/60 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-amber-600 bg-amber-500/10 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-amber-500/20">
                      💳 نظام معالجة MasterCard المباشر
                    </span>
                    <h3 className="text-xl font-serif font-black text-brand-primary">سجل مبيعات الإعلانات المميزة</h3>
                  </div>
                  <div className="bg-brand-primary text-white px-6 py-3 rounded-2xl flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-amber-300 animate-pulse" />
                    <div>
                      <span className="text-[10px] text-slate-300 block font-bold">الأرباح الـمباشرة للتطبيق</span>
                      <span className="text-lg font-serif font-black text-amber-300">{(payments.length * 1.0).toFixed(2)}$ دولار</span>
                    </div>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-brand-border/80 rounded-2xl opacity-50 space-y-2">
                    <CreditCard className="w-8 h-8 mx-auto text-brand-secondary" />
                    <p className="text-xs font-bold leading-normal">لا توجد عمليات دفع MasterCard مسجلة بعد.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="border-b border-brand-border/60 text-brand-secondary opacity-60">
                          <th className="py-3 font-semibold">المستخدم والبريد الكتروني</th>
                          <th className="py-3 font-semibold">الإعلان المروج</th>
                          <th className="py-3 font-semibold text-center">قناة الدفع والبيانات</th>
                          <th className="py-3 font-semibold text-center">رقم العملية</th>
                          <th className="py-3 font-semibold text-center">المبلغ المستلم</th>
                          <th className="py-3 font-semibold text-left">الإجراء / الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border/45">
                        {payments.map((p: any) => (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-4">
                              <span className="font-bold text-gray-800 block">{p.userEmail || 'حساب مجهول'}</span>
                              <span className="text-[9px] text-gray-400 font-mono">ID: {p.userId || '...'}</span>
                            </td>
                            <td className="py-4 font-bold text-brand-primary">
                              {p.adTitle || 'إعلان تالف/محذوف'}
                            </td>
                            <td className="py-4 text-center">
                              {p.paymentMethod === 'zaincash' ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-[10px] px-2.5 py-1 rounded-full font-bold border border-emerald-100">
                                  <span>زين كاش 📱</span>
                                  <span className="font-mono text-[9px] opacity-85">({p.senderPhone})</span>
                                </span>
                              ) : p.paymentMethod === 'qi' ? (
                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-[10px] px-2.5 py-1 rounded-full font-bold border border-amber-100">
                                  <span>كي كارد 💳</span>
                                  <span className="font-mono text-[9px] opacity-85">({p.senderPhone})</span>
                                </span>
                              ) : p.paymentMethod === 'fastpay' ? (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-800 text-[10px] px-2.5 py-1 rounded-full font-bold border border-rose-100">
                                  <span>فاست باي 💳</span>
                                  <span className="font-mono text-[9px] opacity-85">({p.senderPhone})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-brand-primary/5 text-brand-primary text-[10px] px-2.5 py-1 rounded-full font-bold border border-brand-border/50">
                                  <span>ماستر كارد 💳</span>
                                  <span className="font-mono text-[9px] opacity-85">(•••• {p.cardNumberLast4 || '0086'})</span>
                                </span>
                              )}
                            </td>
                            <td className="py-4 text-center font-mono">
                              <span className="bg-slate-100 text-[#444] px-2.5 py-1 rounded font-mono text-[10px] font-semibold border border-slate-200">
                                {p.transactionId || p.receiptRef || p.id?.slice(0, 8).toUpperCase()}
                              </span>
                            </td>
                            <td className="py-4 text-center font-serif font-black text-amber-700">
                              {p.paymentMethod === 'card' ? `$1.00 USD` : `${p.amount?.toLocaleString()} د.ع`}
                            </td>
                            <td className="py-4 text-left">
                              {p.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[9px] px-2.5 py-1 rounded-full font-bold shadow-sm">
                                  تم التفعيل بنجاح ✓
                                </span>
                              ) : p.status === 'rejected' ? (
                                <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[9px] px-2.5 py-1 rounded-full font-bold">
                                  تم الرفض 🛑
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setReviewedPayment(p)}
                                  className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer animate-pulse"
                                >
                                  مرّاجعة الطلب 🔍
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 2. ADS MANAGEMENT TAB */}
          {activeTab === 'ads' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* Search Header */}
              <div className="relative">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-secondary opacity-40 w-4 h-4 pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="ابحث عن إعلانات تجارية بالاسم، المحافظة أو النوع الداخلي..."
                  value={adsSearch}
                  onChange={(e) => setAdsSearch(e.target.value)}
                  className="w-full bg-white border border-brand-border rounded-2xl pr-11 pl-4 py-3.5 text-xs font-bold outline-none focus:border-brand-primary/20 shadow-sm"
                />
              </div>

              {/* List grid */}
              <div className="space-y-3">
                {filteredAds.length > 0 ? (
                  filteredAds.map((ad) => (
                    <div 
                      key={ad.id}
                      className="bg-white p-4 rounded-2xl border border-brand-border/60 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <img 
                          src={ad.images?.[0] || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=2000'} 
                          alt={ad.title} 
                          className="w-14 h-14 rounded-xl object-cover border border-brand-border shrink-0" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-black text-brand-primary bg-brand-muted px-2 py-0.5 rounded-full">
                              {ad.category}
                            </span>
                            <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              {ad.location?.city || 'بغداد'}
                            </span>
                            {ad.isFeatured && (
                              <span className="text-[9px] font-black text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5 text-yellow-600" />
                                <span>تميز ⭐</span>
                              </span>
                            )}
                            {ad.isSubscribed && (
                              <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5 text-amber-500" />
                                <span>مشترك 👑</span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-black text-brand-primary leading-tight line-clamp-1">{ad.title}</h4>
                          <p className="text-[10px] text-emerald-600 font-bold">السعر: {ad.price.toLocaleString()} د.ع</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                          onClick={() => handleToggleFeatured(ad.id, !!ad.isFeatured)}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1 border transition-all ${
                            ad.isFeatured 
                              ? 'bg-yellow-50 border-yellow-200 text-yellow-600 hover:bg-yellow-100'
                              : 'bg-white border-brand-border text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span>{ad.isFeatured ? 'إلغاء التميز' : 'تمييز الإعلان ⭐'}</span>
                        </button>

                        <button
                          onClick={() => handleToggleSubscribed(ad.id, !!ad.isSubscribed)}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1 border transition-all ${
                            ad.isSubscribed 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-110'
                              : 'bg-white border-brand-border text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
                          }`}
                        >
                          <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>{ad.isSubscribed ? 'إلغاء الاشتراك 👑' : 'ترقية لمشترك 👑'}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteAd(ad.id)}
                          className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-xl text-[10px] font-black flex items-center gap-1 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>إزاله الإعلان</span>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center bg-white rounded-3xl border border-brand-border/60">
                    <ShoppingBag className="w-8 h-8 text-brand-secondary opacity-30 mx-auto mb-2" />
                    <p className="text-xs text-brand-secondary font-black">لم نجد أي إعلانات تطابق بحثك</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 3. PLATFORM USERS TAB */}
          {activeTab === 'users' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="relative">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-secondary opacity-40 w-4 h-4 pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="ابحث عن الأعضاء الكرام بالاسم، البريد الإلكتروني، أو رقم الموبايل..."
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  className="w-full bg-white border border-brand-border rounded-2xl pr-11 pl-4 py-3.5 text-xs font-bold outline-none focus:border-brand-primary/20 shadow-sm"
                />
              </div>

              <div className="space-y-3">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const isUserAdmin = u.role === 'admin';
                    const isUserVerified = !!u.isVerified;
                    const isUserBlocked = !!u.isBlocked;

                    return (
                      <div 
                        key={u.id}
                        className="bg-white p-5 rounded-3xl border border-brand-border/60 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all hover:bg-slate-50/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <img 
                              src={u.photoURL || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200px'} 
                              alt={u.displayName} 
                              className="w-12 h-12 rounded-2xl object-cover border border-brand-border shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            {isUserVerified && (
                              <span className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 border-2 border-white shadow-sm font-black">
                                <Award className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <h4 className="text-xs font-black text-brand-primary flex items-center gap-1.5 flex-wrap">
                              {u.displayName || 'مستخدم جديد'}
                              {isUserAdmin && (
                                <span className="inline-flex items-center gap-0.5 text-[8px] font-black text-white bg-blue-600 px-1.5 py-0.5 rounded-full">
                                  <ShieldCheck className="w-2 h-2" />
                                  مدير نظام
                                </span>
                              )}
                              {isUserBlocked && (
                                <span className="inline-flex items-center gap-0.5 text-[8px] font-black text-white bg-red-600 px-1.5 py-0.5 rounded-full">
                                  محظور 🚫
                                </span>
                              )}
                            </h4>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-brand-secondary opacity-70">
                              <span className="flex items-center gap-1 font-semibold"><Mail className="w-3 h-3" /> {u.email || 'لا يوجد بريد'}</span>
                              {(u.whatsappNumber || u.phoneNumber) && (
                                <span className="flex items-center gap-1 font-semibold"><Phone className="w-3 h-3" /> {u.whatsappNumber || u.phoneNumber}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions for User */}
                        <div className="flex wrap gap-2 items-center justify-end md:self-center">
                          {/* Verify */}
                          <button
                            onClick={() => handleToggleVerify(u.id, isUserVerified)}
                            className={`px-3 py-2 rounded-xl text-[9px] font-black flex items-center gap-1 border transition-all ${
                              isUserVerified 
                                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                                : 'bg-white border-brand-border text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
                            }`}
                          >
                            <Award className="w-3 h-3" />
                            <span>{isUserVerified ? 'إلغاء التوثيق' : 'توثيق الحساب 👑'}</span>
                          </button>

                          {/* Admin toggle */}
                          <button
                            onClick={() => handleToggleAdmin(u.id, u.role)}
                            className={`px-3 py-2 rounded-xl text-[9px] font-black flex items-center gap-1 border transition-all ${
                              isUserAdmin 
                                ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                                : 'bg-white border-brand-border text-brand-secondary hover:bg-brand-muted hover:text-brand-primary'
                            }`}
                          >
                            <Shield className="w-3 h-3" />
                            <span>{isUserAdmin ? 'سحب رتبة مدير' : 'جعل مدير نظام 🛡️'}</span>
                          </button>

                          {/* Block toggle */}
                          <button
                            onClick={() => handleToggleBlock(u.id, isUserBlocked)}
                            className={`px-3 py-2 rounded-xl text-[9px] font-black flex items-center gap-1 border transition-all ${
                              isUserBlocked 
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100'
                            }`}
                          >
                            <UserX className="w-3 h-3" />
                            <span>{isUserBlocked ? 'إلغاء الحظر' : 'حظر العضو 🚫'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-12 text-center bg-white rounded-3xl border border-brand-border/60">
                    <Users className="w-8 h-8 text-brand-secondary opacity-30 mx-auto mb-2" />
                    <p className="text-xs text-brand-secondary font-black">لم يتم العثور على أي كادر أو مشتري</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 4. CUSTOMER SUPPORT PANEL */}
          {activeTab === 'support' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              
              {/* Tickets List Column */}
              <div className="bg-white p-5 rounded-3xl border border-brand-border/60 h-[500px] overflow-y-auto space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary border-b pb-3 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-brand-primary" />
                  <span>محادثات الدعم النشطة</span>
                </h3>

                <div className="space-y-2">
                  {supportChats.length > 0 ? (
                    supportChats.map((chat) => {
                      const userId = getUserId(chat);
                      const contactUser = getUserData(userId);
                      const isSelected = activeSupportChat?.id === chat.id;
                      const hasUnread = (chat.unreadCount?.admin_support || 0) > 0;

                      return (
                        <div 
                          key={chat.id}
                          onClick={() => setActiveSupportChat(chat)}
                          className={`p-3.5 rounded-2xl border text-right cursor-pointer transition-all flex items-center gap-3 ${
                            isSelected 
                              ? 'bg-orange-50/50 border-brand-primary shadow-sm' 
                              : 'bg-white border-brand-border hover:bg-slate-50'
                          }`}
                        >
                          <img 
                            src={contactUser.photoURL || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200px'} 
                            alt={contactUser.displayName} 
                            className="w-10 h-10 rounded-xl object-cover border border-brand-border shrink-0" 
                            referrerPolicy="no-referrer"
                          />
                          
                          <div className="flex-1 space-y-0.5 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-serif font-black text-xs text-brand-primary line-clamp-1">{contactUser.displayName}</span>
                              {hasUnread && (
                                <span className="bg-red-500 text-white rounded-full text-[8px] px-1.5 py-0.5 font-bold animate-pulse">جديد</span>
                              )}
                            </div>
                            <p className="text-[10px] text-brand-secondary opacity-60 font-black line-clamp-1 truncate">{chat.lastMessage}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-20 text-center space-y-2">
                      <Zap className="w-6 h-6 text-brand-secondary opacity-30 mx-auto" />
                      <p className="text-[10px] text-brand-secondary font-black">لا توجد شكاوى أو تذاكر تواصل حالياً</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat messages viewport Column */}
              <div className="md:col-span-2 bg-white rounded-3xl border border-brand-border/60 h-[500px] flex flex-col overflow-hidden">
                {activeSupportChat ? (
                  <>
                    {/* Active Conversation header */}
                    <div className="bg-slate-50 border-b p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img 
                          src={getUserData(getUserId(activeSupportChat)).photoURL || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200px'} 
                          alt="Support User" 
                          className="w-10 h-10 rounded-xl object-cover border border-brand-border shrink-0" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-black text-brand-primary">{getUserData(getUserId(activeSupportChat)).displayName}</h4>
                          <span className="text-[8px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">بوابة الدعم الفني 📶</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setActiveSupportChat(null)}
                        className="text-xs font-bold text-slate-400 hover:text-[#111]"
                      >
                        إغلاق الدردشة
                      </button>
                    </div>

                    {/* Messages flow */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-orange-50/10">
                      {supportMessages.map((msg, idx) => {
                        const isAdminMsg = msg.senderId === 'admin_support';
                        return (
                          <div 
                            key={`${msg.id || idx}`}
                            className={`flex ${isAdminMsg ? 'justify-start' : 'justify-end'}`}
                          >
                            <div className={`max-w-[75%] p-3.5 rounded-2xl relative shadow-sm text-xs font-semibold leading-relaxed ${
                              isAdminMsg 
                                ? 'bg-brand-primary text-white rounded-tr-none' 
                                : 'bg-white border border-brand-border text-[#111] rounded-tl-none'
                            }`}>
                              <p>{msg.text}</p>
                              {msg.createdAt && (
                                <span className="block text-[8px] mt-1 text-left opacity-60 font-black">
                                  {msg.createdAt.toDate ? msg.createdAt.toDate().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input Reply message row */}
                    <div className="p-4 border-t bg-slate-50 flex items-center gap-2">
                      <input 
                        type="text" 
                        placeholder="اكتب ردك التقني الشافي للعضو هنا..."
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSendReply();
                        }}
                        className="flex-1 bg-white border border-brand-border rounded-xl px-4 py-3 text-xs outline-none focus:border-brand-primary shadow-sm"
                      />
                      <button
                        onClick={handleSendReply}
                        className="p-3 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl shadow-md transition-all active:scale-95"
                      >
                        <Send className="w-4 h-4 translate-x-0.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3.5 bg-slate-50/50">
                    <div className="w-16 h-16 rounded-full bg-brand-muted flex items-center justify-center border border-brand-border/40">
                      <Shield className="w-6 h-6 text-brand-primary" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-brand-primary">حدد محادثة لبدء المساعدة</h4>
                      <p className="text-[10px] text-brand-secondary opacity-60 max-w-sm">اختر أحد طلبات الدعم المفتوحة من العمود الجانبي لبدء دردشة حية وثنائية وآمنة بالكامل في الوقت الحقيقي.</p>
                    </div>
                  </div>
                )}
              </div>

            </motion.div>
          )}

          {/* 5. BROADCAST GENERAL ANNOUNCEMENT TAB */}
          {activeTab === 'broadcast' && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-5 gap-8 font-sans text-right"
            >
              {/* Form Input Card (3 Cols on large, 1 Col on small) */}
              <div className="lg:col-span-3 bg-white p-6 md:p-8 rounded-3xl border border-brand-border/60 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="p-3 bg-brand-primary/10 rounded-2xl text-brand-primary">
                    <Megaphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-serif font-black text-lg text-brand-primary">لوحة البث والتعميم الوطني 📡</h3>
                    <p className="text-[10px] text-brand-secondary opacity-60 font-semibold">بث الإعلانات العامة والتنبيهات المباشرة لجميع مستخدمي سوق الرافدين العراقي</p>
                  </div>
                </div>

                {isBroadcasting ? (
                  /* Broadcasting Progress state */
                  <div className="py-12 text-center space-y-6">
                    <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-t-brand-primary border-r-brand-primary rounded-full animate-spin"></div>
                      <Radio className="w-8 h-8 text-brand-primary animate-pulse" />
                    </div>
                    
                    <div className="space-y-2 max-w-sm mx-auto">
                      <h4 className="text-sm font-black text-brand-primary">جاري إطلاق البث العام بنجاح...</h4>
                      <p className="text-[11px] text-brand-secondary font-bold">
                        تم إرسال الإشعار لـ {broadcastProgress.current} من أصل {broadcastProgress.total} مستخدم مسجل
                      </p>
                      
                      {/* Dynamic Progress block */}
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mt-2 border border-slate-200">
                        <motion.div 
                          className="bg-brand-primary h-full rounded-full" 
                          style={{ width: `${broadcastProgress.total > 0 ? (broadcastProgress.current / broadcastProgress.total) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-brand-secondary opacity-50 font-semibold">يرجى الانتظار وعدم إغلاق نافذة لوحة التحكم حتى يكتمل البث.</p>
                    </div>
                  </div>
                ) : broadcastSuccess ? (
                  /* Success State */
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="py-10 text-center space-y-5"
                  >
                    <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                      <CheckCheck className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-md font-serif font-black text-emerald-800">اكتمل إطلاق البث العام بنجاح!</h4>
                      <p className="text-xs text-brand-secondary font-bold">تم توصيل التعميم لجميع المشتركين البالغ عددهم {broadcastProgress.total} مستخدم.</p>
                    </div>
                    
                    <button
                      onClick={() => setBroadcastSuccess(false)}
                      className="px-5 py-2.5 bg-brand-primary text-white text-xs font-black rounded-xl cursor-pointer hover:bg-brand-primary/95 transition-all shadow-sm active:scale-95"
                    >
                      بث وتعميم آخر جديد 📣
                    </button>
                  </motion.div>
                ) : (
                  /* Form View */
                  <div className="space-y-5 text-right">
                    
                    {/* Title */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-brand-primary block">عنوان التعميم / التنبيه 📣</label>
                      <input 
                        type="text" 
                        value={broadcastTitle}
                        onChange={(e) => setBroadcastTitle(e.target.value)}
                        placeholder="مثال: تحديث أمني جديد للمنصة 🛡️، صيانة دورية الليلة..."
                        maxLength={60}
                        className="w-full bg-slate-50 border border-brand-border rounded-xl px-4 py-3 text-xs font-bold outline-none focus:bg-white focus:border-brand-primary transition-all text-right"
                      />
                    </div>

                    {/* Announcement Type Switcher */}
                    <div className="space-y-2">
                      <label className="text-xs font-black text-brand-primary block">نوع وتصنيف التنبيه 🏷️</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                          { id: 'announcement', label: 'إعلان وتحديث', color: 'border-blue-200 bg-blue-50/25 text-blue-700 hover:bg-blue-50' },
                          { id: 'alert', label: 'تحذير وصيانة', color: 'border-red-200 bg-red-50/25 text-red-700 hover:bg-red-50' },
                          { id: 'warning', label: 'إرشاد وتثقيف', color: 'border-amber-200 bg-amber-50/25 text-amber-700 hover:bg-amber-50' },
                          { id: 'offer', label: 'عرض أو مسابقة', color: 'border-emerald-200 bg-emerald-50/25 text-emerald-700 hover:bg-emerald-50' },
                        ].map((item) => {
                          const isSelected = broadcastType === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setBroadcastType(item.id as any)}
                              className={`p-3 rounded-xl border text-center text-[10px] font-black tracking-tight transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                                isSelected 
                                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary ring-2 ring-brand-primary/20 font-black scale-[1.03]'
                                  : item.color
                              }`}
                            >
                              <span>{item.id === 'announcement' ? '📣' : item.id === 'alert' ? '⚠️' : item.id === 'warning' ? '💡' : '🎁'}</span>
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Body message */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-brand-secondary opacity-50 font-bold">{500 - broadcastMessage.length} حرف متبقي</span>
                        <label className="text-xs font-black text-brand-primary block">نص وتفاصيل الرسالة 📝</label>
                      </div>
                      <textarea 
                        rows={4}
                        value={broadcastMessage}
                        onChange={(e) => setBroadcastMessage(e.target.value.substring(0, 500))}
                        placeholder="اكتب التوضيح الكامل هنا للمستخدمين والمواطنين الكرام..."
                        className="w-full bg-slate-50 border border-brand-border rounded-xl px-4 py-3 text-xs font-semibold outline-none focus:bg-white focus:border-brand-primary transition-all text-right resize-none"
                      />
                    </div>

                    {/* Navigation Link (Optional) */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-brand-primary block">رابط خارجي للمتابعة (اختياري) 🔗</label>
                      <input 
                        type="url" 
                        value={broadcastLink}
                        onChange={(e) => setBroadcastLink(e.target.value)}
                        placeholder="مثال: https://souq-rafidain.com/updates"
                        className="w-full bg-slate-50 border border-brand-border rounded-xl px-4 py-3 text-xs font-semibold outline-none focus:bg-white text-left placeholder:text-right"
                      />
                    </div>

                    {/* Broadcast button */}
                    <button
                      onClick={handleSendBroadcast}
                      className="w-full py-4.5 bg-brand-primary hover:bg-brand-primary/95 text-white text-xs font-black rounded-xl tracking-wide flex items-center justify-center gap-1.5 shadow-lg shadow-brand-primary/10 active:scale-98 transition-all cursor-pointer"
                    >
                      <Radio className="w-4 h-4 animate-pulse" />
                      <span>إطلاق البث وتنبيه {users.length} مستخدم على سوق الرافدين 🚀</span>
                    </button>

                  </div>
                )}
              </div>

              {/* Preview Card Drawer (2 Cols) */}
              <div className="lg:col-span-2 space-y-6 text-right">
                
                {/* Visual Preview Guide */}
                <div className="bg-orange-50/20 border border-brand-primary/10 p-5 rounded-3xl space-y-2">
                  <span className="text-[9px] font-black text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full uppercase tracking-tight">مظهر الإشعارات</span>
                  <h4 className="text-xs font-black text-brand-primary">أناقة وجودة المنصة الوطنية 🎨</h4>
                  <p className="text-[10px] text-brand-secondary opacity-70 leading-relaxed">
                    من خلال المعاينة الحية المجاورة، يمكنك الاطلاع على دقة وجودة مظهر التنبيه قبل إرساله لجميع مستخدمي المنصة لضمان أفضل تجربة بصرية.
                  </p>
                </div>

                {/* Mobile Mockup live-review */}
                <div className="bg-slate-900 p-5 rounded-[2.5rem] border-[6px] border-slate-950 shadow-2xl relative overflow-hidden ring-4 ring-slate-800/10">
                  {/* Speaker slot */}
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-16 h-3.5 bg-slate-950 rounded-full z-10"></div>
                  
                  {/* Inner Screen */}
                  <div className="bg-[#fbfcff] rounded-[1.8rem] min-h-[350px] pt-8 p-4 text-right flex flex-col justify-start space-y-4">
                    
                    {/* Fake Header bar */}
                    <div className="flex items-center justify-between text-[8px] font-bold text-slate-400 select-none pb-2 border-b border-slate-100">
                      <span>12:00 م</span>
                      <span>سوق الرافدين 🇮🇶</span>
                    </div>

                    {/* Notification Alert Preview Box */}
                    <div className="space-y-1 text-right">
                      <span className="text-[9px] font-bold text-slate-400 block">معاينة التنبيه الحقيقية</span>
                      
                      <div className="bg-[#fafbff] border border-brand-border p-3.5 rounded-2xl shadow-sm space-y-2 transition-all text-right">
                        {/* Title and Icon */}
                        <div className="flex items-start justify-between gap-2.5">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            broadcastType === 'announcement' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            broadcastType === 'alert' ? 'bg-red-50 text-red-600 border border-red-100' :
                            broadcastType === 'warning' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                            'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          }`}>
                            {broadcastType === 'announcement' ? 'تحديث 📣' :
                             broadcastType === 'alert' ? 'هام جداً ⚠️' :
                             broadcastType === 'warning' ? 'توجيه 💡' :
                             'مكافأة 🎁'}
                          </span>
                          
                          <div className="flex items-center gap-1.5 text-right">
                            <h5 className="text-[11px] font-black text-brand-primary text-wrap line-clamp-1">
                              {broadcastTitle.trim() || 'عنوان التنبيه التجريبي هنا'}
                            </h5>
                            <span className="p-1.5 bg-brand-primary/10 rounded-lg text-brand-primary shrink-0">
                              <Bell className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>

                        {/* Message description */}
                        <p className="text-[10px] text-brand-secondary font-semibold leading-relaxed line-clamp-4 text-right">
                          {broadcastMessage.trim() || 'اكتب نص وتفاصيل التنبيه في الحقل المخصص على اليمين لتتمكن من معاينته مباشرة هنا وبطريقة حية.'}
                        </p>

                        {/* Extra links inside notification */}
                        <div className="flex justify-between items-center text-[8px] border-t border-slate-100/80 pt-2 text-[#777]">
                          <span className="font-semibold">{new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</span>
                          
                          {broadcastLink.trim() && (
                            <span className="text-brand-primary font-bold hover:underline flex items-center gap-0.5">
                              <span>صفحة التوجيه 🔗</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Fake Background elements to simulate active phone screen */}
                    <div className="opacity-20 pointer-events-none space-y-2 mt-4 text-right">
                      <div className="w-full h-8 bg-slate-200 rounded-lg"></div>
                      <div className="w-3/4 h-8 bg-slate-200 rounded-lg"></div>
                    </div>

                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* 6. SETTINGS & PROFILE TAB */}
          {activeTab === 'settings' && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-5 gap-8 font-sans text-right"
            >
              {/* Form Input Card (3 Cols on large, 1 Col on small) */}
              <div className="lg:col-span-3 bg-white p-6 md:p-8 rounded-3xl border border-brand-border/60 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-serif font-black text-lg text-brand-primary">إعدادات هوية ورتب الإدارة 👑</h3>
                    <p className="text-[10px] text-brand-secondary opacity-60 font-semibold">تعديل الاسم والفرص التوجيهية وتعديل صلاحيات مدراء النظام ورتبهم</p>
                  </div>
                </div>

                {/* Role Warning / Indicator Banner */}
                {isGeneralManager ? (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl text-right flex items-start gap-3">
                    <span className="p-1 px-2 bg-emerald-500 text-white rounded-lg text-[9px] font-black shrink-0">رتبتك: مدير عام (Super Admin) 👑</span>
                    <p className="text-[10px] text-emerald-800 leading-relaxed font-bold">
                      أنت تتصفح كمدير عام المنصة الحصري. جميع أدوات إدارة الاسم والصور متاحة لك الآن بالكامل، والتغييرات ستنعكس فوراً على كافة المواطنين والتقارير.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-right flex items-start gap-3">
                    <span className="p-1 px-2 bg-amber-500 text-white rounded-lg text-[9px] font-black shrink-0">رتبتك: مدير نظام اعتيادي 🛡️</span>
                    <p className="text-[10px] text-amber-800 leading-relaxed font-semibold">
                      تنبيه الرتبة: صلاحية تعديل اسم وصورة الإدارة الرسمية مقيدة ومقاديرها الحصرية مخصصة فقط لمؤسس المنصة والمدير العام <strong className="text-brand-primary">qaisar.m2019@gmail.com</strong>. لا يمكنك حفظ أي تعديلات هنا.
                    </p>
                  </div>
                )}

                <div className="space-y-5">
                  {/* Name field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-brand-primary block">اسم الإدارة الرسمي 🏢</label>
                    <input 
                      type="text" 
                      value={adminName}
                      disabled={!isGeneralManager}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="مثال: إدارة سوق الرافدين"
                      className="w-full bg-slate-50 border border-brand-border rounded-xl px-4 py-3 text-xs font-bold outline-none focus:bg-white focus:border-brand-primary transition-all text-right disabled:opacity-70 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Photo URL field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-brand-primary block">رابط صورة/شعار الإدارة 🖼️</label>
                    <input 
                      type="url" 
                      value={adminPhoto}
                      disabled={!isGeneralManager}
                      onChange={(e) => setAdminPhoto(e.target.value)}
                      placeholder="رابط الصورة المباشر..."
                      className="w-full bg-slate-50 border border-brand-border rounded-xl px-4 py-3 text-xs font-bold outline-none focus:bg-white text-left placeholder:text-right disabled:opacity-70 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Avatar Preset helper */}
                  {isGeneralManager && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-brand-secondary opacity-60 font-black block">نماذج وصور رسمية سريعة 🎨 :</span>
                      <div className="flex gap-3 overflow-x-auto pb-1 font-semibold text-[8px]">
                        {[
                          { name: 'درع ذهبي', url: 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?q=80&w=150&auto=format&fit=crop' },
                          { name: 'خريطة العراق', url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?q=80&w=150&auto=format&fit=crop' },
                          { name: 'افتراضي الرافدين', url: 'https://ui-avatars.com/api/?name=إدارة+الرافدين&background=bf9a2e&color=fff&size=128&bold=true' },
                          { name: 'افتراضي الحماية', url: 'https://ui-avatars.com/api/?name=إدارة+الأمن&background=182136&color=fff&size=128&bold=true' },
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setAdminPhoto(preset.url)}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 whitespace-nowrap active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <img src={preset.url} alt="" className="w-4 h-4 rounded-full object-cover animate-none" />
                            <span>{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    disabled={!isGeneralManager || savingAdminProfile}
                    onClick={handleUpdateAdminProfile}
                    className="w-full py-4 bg-brand-primary hover:bg-brand-primary/95 text-white text-xs font-black rounded-xl tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:bg-slate-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-98"
                  >
                    {savingAdminProfile ? (
                      <>
                        <Clock className="w-4 h-4 animate-spin" />
                        <span>جاري الحفظ والتعميم...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>حفظ الهوية وتحديث البوابة العامة 💾</span>
                      </>
                    )}
                  </button>

                </div>
              </div>

              {/* Identity Card Preview */}
              <div className="lg:col-span-2 space-y-6 text-right">
                
                <div className="bg-slate-50 border border-brand-border p-6 rounded-3xl space-y-4 shadow-sm text-center">
                  <span className="text-[9px] font-black text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-full uppercase tracking-tighter self-center">هوية البوابة حالياً</span>
                  
                  {/* Photo view */}
                  <div className="relative w-24 h-24 mx-auto mt-2">
                    <div className="absolute inset-0 bg-brand-primary/10 rounded-2xl animate-ping opacity-25 animate-none"></div>
                    <img 
                      src={adminPhoto || `https://ui-avatars.com/api/?name=إدارة&background=000&color=fff`}
                      alt="Admin avatar"
                      className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-xl mx-auto relative z-10"
                    />
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-md font-serif font-black text-brand-primary">{adminName}</h4>
                    <span className="text-[10px] text-slate-400 font-extrabold tracking-widest block uppercase">Bilingual Support Center</span>
                  </div>

                  <p className="text-[10px] text-brand-secondary opacity-60 leading-relaxed text-right md:text-center">
                    هذا المظهر والاسم يظهر لجميع المستخدمين والمواطنين عند الدخول في تذاكر الدعم والشكاوى والتنازلات في سوق العراق.
                  </p>
                </div>

                <div className="bg-[#1e2638] text-white p-6 rounded-3xl space-y-3 shadow-md text-right">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span className="text-[9px] bg-indigo-500/30 px-2 py-0.5 rounded-md text-indigo-300 font-bold">بوابة الرتب والمستخدمين</span>
                    <h5 className="text-xs font-black text-brand-accent">نظام رتب الإدارة 🛡️</h5>
                  </div>
                  
                  <ul className="text-[10px] space-y-2 text-white/80 leading-relaxed font-semibold">
                    <li className="flex items-center justify-between">
                      <span className="text-emerald-400">كامل الصلاحيات (Super Admin)</span>
                      <strong>1. المدير العام</strong>
                    </li>
                    <li className="flex items-center justify-between opacity-80 border-t border-white/5 pt-2">
                      <span className="text-blue-300">إدارة الإعلانات، المحادثات، تعميم</span>
                      <strong>2. مدير نظام (Admin)</strong>
                    </li>
                    <li className="flex items-center justify-between opacity-60 border-t border-white/5 pt-2">
                      <span className="text-slate-300">نظام تجربة أو دعم فني محدد</span>
                      <strong>3. الدعم والمساعدين</strong>
                    </li>
                  </ul>
                </div>

              </div>
            </motion.div>
          )}

        </div>
      )}

      {/* Manual Transactions Audit & Verification Modal */}
      <AnimatePresence>
        {reviewedPayment && (
          <div id="payment_review_overlay" className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReviewedPayment(null)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="relative bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-brand-border z-10 flex flex-col text-right font-sans"
            >
              {/* Modal header */}
              <div className="bg-brand-primary text-white p-6 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-amber-300 animate-pulse shrink-0" />
                    <div>
                      <h3 className="font-serif font-black text-md">تدقيق الحوالة وتفعيل الترويج</h3>
                      <p className="text-[10px] text-slate-350 font-bold">بوابة التحقق ونقل الحوالة إدارياً</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setReviewedPayment(null)} 
                    className="p-1.5 hover:bg-white/10 rounded-full transition-colors shrink-0 cursor-pointer"
                  >
                    <XCircle className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Modal content */}
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto no-scrollbar">
                
                {/* Ad details */}
                <div className="bg-slate-50 border border-brand-border/60 p-4 rounded-2xl space-y-2">
                  <h4 className="text-[11px] font-black text-brand-secondary uppercase tracking-widest">تفاصيل إعلان العميل</h4>
                  <p className="text-xs font-bold text-brand-primary leading-relaxed">
                    🌟 {reviewedPayment.adTitle || 'عنوان الإعلان مفقود'}
                  </p>
                  <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold pt-1 border-t border-slate-100">
                    <span>صاحب الإعلان:</span>
                    <span>{reviewedPayment.userEmail}</span>
                  </div>
                </div>

                {/* Transfer Info */}
                <div className="border border-brand-border/80 rounded-2xl overflow-hidden text-xs">
                  <div className="bg-gray-100/70 p-3 font-semibold text-brand-primary border-b border-brand-border text-[11px] font-black">
                    معلومات المعاملة والمحفظة
                  </div>
                  <div className="p-3.5 space-y-2.5 bg-white font-semibold">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">بوابة الدفع المحددة:</span>
                      <span className="text-brand-primary font-black">
                        {reviewedPayment.paymentMethod === 'qi' ? 'كي كارد (Qi Card)' : reviewedPayment.paymentMethod === 'zaincash' ? 'زين كاش (Zain Cash)' : 'فاست باي (FastPay)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">رقم محفظة العميل:</span>
                      <span className="font-mono text-gray-800 tracking-wider font-bold">{reviewedPayment.senderPhone}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">رقم الحوالة كود (TXID):</span>
                      <span className="font-mono text-amber-700 bg-amber-500/5 px-2.5 py-1 rounded-md border border-amber-500/10 font-bold tracking-wider">
                        {reviewedPayment.transactionId}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-serif">المبلغ الأصلي المطلوب:</span>
                      <span className="font-serif font-black text-emerald-700">{reviewedPayment.amount?.toLocaleString()} د.ع (~ 1$)</span>
                    </div>
                  </div>
                </div>

                {/* Image attached if any */}
                <div>
                  {reviewedPayment.receiptImage ? (
                    <div className="space-y-1.5 text-center">
                      <span className="text-[10px] text-gray-400 font-bold block text-right">صورة لقطة الشاشة للوصل:</span>
                      <div className="border border-brand-border/70 rounded-2xl overflow-hidden max-h-56 bg-slate-50 relative group">
                        <img 
                          src={reviewedPayment.receiptImage} 
                          alt="Payment Receipt screenshot" 
                          className="w-full h-full object-contain max-h-56 mx-auto" 
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-2xl text-center text-[10px] text-gray-400 font-bold border border-dashed border-gray-200">
                      لا يوجد صورة لوصل التحويل مرفقة مع الطلب. (التحقق يتم من خلال رقم المعاملة المعاد من المحفظة).
                    </div>
                  )}
                </div>

                {/* Warning terms */}
                <div className="p-3 bg-brand-muted/20 border border-brand-border/60 rounded-xl flex items-start gap-2">
                  <Lock className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-gray-500 leading-normal font-semibold">
                    عند إعطاء الموافقة، سيحصل إعلان العميل على الشارة الذهبية ويتم إشعار هاتفه ويظهر إعلانه في صدارة الكاروسيل فوراً.
                  </p>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRejectPayment(reviewedPayment)}
                  className="flex-1 bg-red-50 border border-red-200 text-red-700 py-3 rounded-2xl text-xs font-black hover:bg-red-100/70 transition-all cursor-pointer active:scale-95 text-center"
                >
                  رفض الحوالة 🛑
                </button>
                <button
                  type="button"
                  onClick={() => handleApprovePayment(reviewedPayment)}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl text-xs font-black shadow-md shadow-emerald-500/10 hover:bg-emerald-700 transition-all cursor-pointer active:scale-95 text-center flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>تفعيل فوري 🌟</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
