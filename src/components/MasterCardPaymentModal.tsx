import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CreditCard, ShieldCheck, Lock, CheckCircle2, AlertCircle, X, 
  Loader2, Wallet, ArrowLeftRight, FileText, Upload, Image as ImageIcon,
  MessageSquare, Crown
} from 'lucide-react';
import { db } from '../lib/firebase';
import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface MasterCardPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (receiptRef: string) => void;
  adId?: string;
  adTitle: string;
  userId: string;
  userEmail: string;
  onViewSupport?: () => void;
}

type PaymentMethodType = 'card' | 'zaincash' | 'qi' | 'fastpay';

export function MasterCardPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  adId,
  adTitle,
  userId,
  userEmail,
  onViewSupport
}: MasterCardPaymentModalProps) {
  // Tabs
  const [activeTab, setActiveTab] = useState<PaymentMethodType>('card');

  // Statuses
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successTx, setSuccessTx] = useState<{ reference: string; targetCard: string; methodLabel: string } | null>(null);

  // Card Inputs
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  // Wallet Inputs (ZainCash / FastPay)
  const [walletSenderPhone, setWalletSenderPhone] = useState('');
  const [walletTxId, setWalletTxId] = useState('');
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState('');

  // Luhn Algorithm Verification for Visa/MasterCard
  const checkLuhn = (num: string) => {
    let sum = 0;
    let shouldDouble = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let digit = parseInt(num.charAt(i), 10);
      if (shouldDouble) {
        if ((digit *= 2) > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  };

  const formatCardNumber = (value: string) => {
    const raw = value.replace(/\D/g, '').substring(0, 16);
    const parts = [];
    for (let i = 0; i < raw.length; i += 4) {
      parts.push(raw.substring(i, i + 4));
    }
    return parts.join(' ');
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumber(formatCardNumber(e.target.value));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 2) {
      val = val.substring(0, 2) + '/' + val.substring(2, 4);
    }
    setExpiry(val.substring(0, 5));
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').substring(0, 3);
    setCvv(val);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        setErrorMsg('حجم الصورة كبير جداً، يرجى اختيار لقطة شاشة أقل من 4 ميغابايت.');
        return;
      }
      setReceiptFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (activeTab === 'card') {
        const cleanNo = cardNumber.replace(/\s+/g, '');
        if (cleanNo.length < 16) {
          throw new Error('الرجاء إدخال رقم بطاقة الماستركارد المكون من 16 رقماً.');
        }

        if (!checkLuhn(cleanNo)) {
          throw new Error('رقم بطاقة الائتمان غير صالح. الرجاء التحقق من المدخلات.');
        }

        if (expiry.length < 5) {
          throw new Error('الرجاء إدخال تاريخ انتهاء صلاحية البطاقة (MM/YY).');
        }

        if (cvv.length < 3) {
          throw new Error('الرجاء كتابة رمز الأمان (CVV) المكون من 3 أرقام خلف البطاقة.');
        }

        if (cardHolder.trim().length < 3) {
          throw new Error('الرجاء كتابة اسم صاحب البطاقة كاملاً كما هو مطبوع.');
        }

        // Call direct server endpoint with Stripe engine
        const response = await fetch('/api/payments/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cardNumber: cleanNo,
            cardHolder,
            expiry,
            cvv,
            amount: 1, // $1
            adId: adId || 'new_ad',
            userId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'فشلت معالجة عملية تفويض الدفع بنجاح.');
        }

        const result = await response.json();

        // Save MasterCard payment to Firestore with 'approved' status instantly
        const paymentPayload = {
          userId,
          userEmail,
          paymentMethod: 'card',
          adId: adId || 'new_ad',
          adTitle,
          amount: 1, // $1 USD
          cardHolder,
          cardNumberLast4: cleanNo.substring(12),
          receiptRef: result.receiptRef,
          settledTo: result.settledTo,
          status: 'approved',
          createdAt: serverTimestamp(),
          timestamp: new Date().toISOString()
        };
        
        await addDoc(collection(db, 'payments'), paymentPayload);

        // Auto-promote ad
        if (adId && adId !== 'new_ad') {
          const adRef = doc(db, 'ads', adId);
          await updateDoc(adRef, {
            isFeatured: true,
            featuredUntil: Date.now() + 30 * 24 * 60 * 60 * 1000
          });
        }

        setSuccessTx({
          reference: result.receiptRef,
          targetCard: result.settledTo,
          methodLabel: 'بطاقة الماستركارد الذكية'
        });

      } else {
        // Qi Card, ZainCash or FastPay Manual P2P Verification
        const senderPhone = walletSenderPhone.trim();
        const txId = walletTxId.trim();

        if (activeTab === 'qi') {
          if (senderPhone.length < 14) {
            throw new Error('الرجاء إدخال رقم بطاقة كي كارد أو حساب الـ Qi المُرسِل المكون من 16 رقماً.');
          }
        } else {
          if (senderPhone.length < 10) {
            throw new Error('الرجاء إدخال رقم المحفظة المُرسِلة المكون من 11 رقماً بالكامل.');
          }
        }

        if (txId.length < 6) {
          throw new Error('الرجاء كتابة رقم العملية أو المعاملة (Reference ID) بدقة للتحقق.');
        }

        // Generate Transaction reference
        const receiptRef = "WAL-" + activeTab.toUpperCase() + "-" + Math.floor(100000 + Math.random() * 900000);

        // Define recipient based on current provider
        let targetDestination = '108845009';
        if (activeTab === 'qi') {
          targetDestination = '5043 4567 8901 2345';
        } else if (activeTab === 'zaincash') {
          targetDestination = '0780 211 3355';
        }

        // Save Pending manual transfer payload to the Firestore for admin approval
        const walletPayload = {
          userId,
          userEmail,
          paymentMethod: activeTab,
          adId: adId || 'new_ad',
          adTitle,
          amount: 1500, // 1500 IQD as equivalent
          senderPhone, // stores Qi card number or wallet phone
          transactionId: txId,
          receiptImage: receiptBase64 || '', // attached receipt screenshot
          receiptRef,
          settledTo: targetDestination,
          status: 'pending', // Awaiting manual verification by App Manager (Owner)
          createdAt: serverTimestamp(),
          timestamp: new Date().toISOString()
        };

        await addDoc(collection(db, 'payments'), walletPayload);

        // Set pending layout
        let targetCardText = '108845009 (FastPay Merchant)';
        let methodLabelText = 'محفظة فاست باي الأسرع';
        if (activeTab === 'qi') {
          targetCardText = '5043 4567 8901 2345 (Qi Card)';
          methodLabelText = 'حوالة كي كارد Qi الفورية';
        } else if (activeTab === 'zaincash') {
          targetCardText = '0780 211 3355 (ZainCash)';
          methodLabelText = 'محفظة زين كاش العراق';
        }

        setSuccessTx({
          reference: txId,
          targetCard: targetCardText,
          methodLabel: methodLabelText
        });
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'حدث خطأ أثناء معالجة تفويض الدفع، يرجى التثبت والمحاورة من جديد.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishSuccess = () => {
    if (successTx) {
      onSuccess(successTx.reference);
      onClose();
      // Reset state
      setCardNumber('');
      setCardHolder('');
      setExpiry('');
      setCvv('');
      setWalletSenderPhone('');
      setWalletTxId('');
      setReceiptBase64(null);
      setReceiptFileName('');
      setSuccessTx(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="payment_modal_overlay" className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!loading ? onClose : undefined}
            className="absolute inset-0 bg-[#0c1322]/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 30 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-brand-border/60 z-10 flex flex-col text-right font-sans"
          >
            {/* Elegant Header with Dual Accent */}
            <div className="bg-brand-primary text-white p-6 relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/10 rounded-xl border border-white/10 shadow-sm shrink-0">
                    <Wallet className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-serif font-black text-lg">المدفوعات والترقية الفورية</h3>
                    <p className="text-[10px] text-amber-200/90 font-bold">بوابات دفع عراقية حقيقية وموثوقة 100%</p>
                  </div>
                </div>
                {!loading && (
                  <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0 cursor-pointer">
                    <X className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>
            </div>

            {!successTx ? (
              <div className="flex flex-col flex-1 overflow-y-auto max-h-[80vh]">
                {/* Method Switcher Tabs */}
                <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-100 p-1 md:p-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setActiveTab('card'); setErrorMsg(''); }}
                    className={`py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                      activeTab === 'card' 
                        ? 'bg-white text-brand-primary shadow-sm ring-1 ring-black/5' 
                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                    }`}
                  >
                    <CreditCard className={`w-3.5 h-3.5 ${activeTab === 'card' ? 'text-brand-primary' : 'text-gray-400'}`} />
                    <span>ماستر كارد</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setActiveTab('zaincash'); setErrorMsg(''); }}
                    className={`py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                      activeTab === 'zaincash' 
                        ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-black/5' 
                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                    }`}
                  >
                    <Wallet className={`w-3.5 h-3.5 ${activeTab === 'zaincash' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <span>زين كاش</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setActiveTab('qi'); setErrorMsg(''); }}
                    className={`py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                      activeTab === 'qi' 
                        ? 'bg-white text-amber-600 shadow-sm ring-1 ring-black/5' 
                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                    }`}
                  >
                    <CreditCard className={`w-3.5 h-3.5 ${activeTab === 'qi' ? 'text-amber-500' : 'text-gray-400'}`} />
                    <span>تحويل Qi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setActiveTab('fastpay'); setErrorMsg(''); }}
                    className={`py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                      activeTab === 'fastpay' 
                        ? 'bg-white text-rose-700 shadow-sm ring-1 ring-black/5' 
                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                    }`}
                  >
                    <ArrowLeftRight className={`w-3.5 h-3.5 ${activeTab === 'fastpay' ? 'text-rose-600' : 'text-gray-400'}`} />
                    <span>فاست باي</span>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1">
                  {/* Summary Box */}
                  <div className="bg-amber-50/50 border border-amber-500/20 p-4 rounded-2xl space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>ترقية الإعلان: {adTitle}</span>
                    </div>
                    <p className="text-[11px] text-amber-900/90 leading-relaxed font-semibold">
                      ترقية الإعلان للقسم الذهبي المميز المثبت في صدارة المنصّة طيلة <strong>30 يوماً</strong> بسعر <strong>$1 دولار فقط</strong> (ما يعادل 1,500 د.ع فقط).
                    </p>
                  </div>

                  {/* support chat connection option */}
                  {onViewSupport && (
                    <div className="bg-emerald-50/30 border border-emerald-500/10 rounded-2xl p-4 flex items-center justify-between gap-3 text-right">
                      <div className="space-y-1 my-0.5">
                        <div className="font-extrabold text-xs text-brand-primary flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                          <span>تبي تحجي وي الإدارة مباشرة؟ 💬</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
                          عندك استفسار عن الحساب أو التحويل؟ تگدر تسولف بالدردشة الحية مباشرة وياهم وبعدين تحوّل براحتك!
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onViewSupport();
                        }}
                        className="bg-brand-primary text-white hover:bg-brand-primary/95 text-[11px] font-black px-4 py-2.5 rounded-xl shadow-md cursor-pointer shrink-0 transition-all hover:scale-[1.03] active:scale-95 flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>دردشة حرة</span>
                      </button>
                    </div>
                  )}

                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3.5 bg-red-50 border border-red-100 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </motion.div>
                  )}

                  {/* Dynamic Fields */}
                  {activeTab === 'card' ? (
                    /* MASTERCARD INPUTS */
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 block">اسم صاحب البطاقة (كما هو مطبوع)</label>
                        <input
                          type="text"
                          required
                          placeholder="CARDHOLDER NAME"
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 focus:ring-2 focus:ring-brand-primary/20 outline-none text-left uppercase text-sm font-semibold tracking-wider placeholder:text-gray-350"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 block">رقم بطاقة الائتمان (Visa / MasterCard)</label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="5213 7201 XXXX XXXX"
                            value={cardNumber}
                            onChange={handleCardNumberChange}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 pr-10 focus:ring-2 focus:ring-brand-primary/20 outline-none text-left font-mono text-sm font-semibold tracking-widest placeholder:text-gray-350"
                          />
                          <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-500 block">الصلاحية (Expiry)</label>
                          <input
                            type="text"
                            required
                            placeholder="MM/YY"
                            value={expiry}
                            onChange={handleExpiryChange}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 focus:ring-2 focus:ring-brand-primary/20 outline-none text-left font-mono text-sm font-semibold tracking-widest placeholder:text-gray-350"
                          />
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-500 block">رمز الأمان (CVV)</label>
                          <input
                            type="password"
                            required
                            placeholder="***"
                            value={cvv}
                            onChange={handleCvvChange}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 focus:ring-2 focus:ring-brand-primary/20 outline-none text-left font-mono text-sm font-semibold tracking-widest placeholder:text-gray-350"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* MANUAL MOBILE WALLET INSTRUCTIONS & INPUTS */
                    <div className="space-y-5">
                      <div className="border border-dashed border-gray-200. p-4 rounded-2xl bg-gray-50/50 space-y-3">
                        <span className="text-[10px] font-black tracking-widest text-[#444] bg-white border px-3 py-1 rounded-full uppercase inline-block">
                          {activeTab === 'qi' ? 'خطوات تحويل الـ Qi المحلية' : 'خطوات الدفع الـيدوي'}
                        </span>
                        <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                          {activeTab === 'qi' ? (
                            <>1️⃣ قم بتحويل مبلغ <strong>1,500 دينار عراقي</strong> مباشرة من تطبيق كي كارد الخاص بك إلى رقم حساب الـ Qi بالأسفل:</>
                          ) : (
                            <>1️⃣ قم بتحويل مبلغ <strong>1,500 دينار عراقي</strong> إلى رقم المحفظة أدناه:</>
                          )}
                        </p>
                        <div className="p-3 bg-white rounded-xl border border-gray-100 flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-400">
                            {activeTab === 'qi' ? 'رقم حساب كي كارد (المستلم):' : 'رقم محفظة إدارة التطبيق:'}
                          </span>
                          <span className="text-sm font-mono font-black text-brand-primary cursor-pointer select-all border-b border-brand-primary/20 leading-none">
                            {activeTab === 'qi' ? '5043 4567 8901 2345' : activeTab === 'zaincash' ? '0780 211 3355' : '108845009'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                          2️⃣ بعد الإرسال، املأ الخانات أدناه لتأكيد التحويل الإداري وتفعيل الإعلان:
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-500 block">
                            {activeTab === 'qi' ? 'رقم بطاقتك الـ Qi المُرسِلة' : 'رقم هاتفك المُرسِل (رقم المحفظة)'}
                          </label>
                          <input
                            type="tel"
                            required
                            placeholder={activeTab === 'qi' ? '5043XXXXXXXXXXXX' : '07XXXXXXXXX'}
                            value={walletSenderPhone}
                            onChange={(e) => setWalletSenderPhone(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 focus:ring-2 focus:ring-brand-primary/20 outline-none text-left font-semibold text-sm placeholder:text-gray-350"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-500 block">رقم المعاملة / العملية (Transaction ID)</label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              placeholder="7209123485"
                              value={walletTxId}
                              onChange={(e) => setWalletTxId(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3.5 focus:ring-2 focus:ring-brand-primary/20 outline-none text-left font-mono text-sm tracking-widest placeholder:text-gray-350"
                            />
                            <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                          </div>
                        </div>

                        {/* File Upload for receipt screenshot */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-500 block">لقطة شاشة لوصل التأكيد (اختياري)</label>
                          <div className="relative border border-dashed border-gray-200 hover:border-brand-primary/40 bg-gray-50/50 hover:bg-gray-50 p-4 rounded-xl transition-all flex flex-col items-center justify-center gap-1 cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileChange}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            {receiptBase64 ? (
                              <div className="flex items-center gap-2 text-emerald-600 font-bold text-[11px]">
                                <ImageIcon className="w-4 h-4 shrink-0" />
                                <span className="truncate max-w-[200px]">{receiptFileName}</span>
                              </div>
                            ) : (
                              <>
                                <Upload className="w-5 h-5 text-gray-400" />
                                <span className="text-[10px] font-bold text-gray-500">انقر لرفع صورة لوصل الحوالة</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trusted Bottom Accents */}
                  <div className="border border-brand-border/60 bg-slate-50 p-3 rounded-2xl flex items-start gap-2.5 text-right shrink-0">
                    <Lock className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest block font-mono">SECURE TRIPLE CHANNEL</span>
                      <p className="text-[10px] text-gray-500 leading-normal font-semibold">
                        نظام مشفر بالكامل. يتم تحويل المدفوعات وتمريرها وإشعار معالج الحساب إدارياً فورياً بكل أمان.
                      </p>
                    </div>
                  </div>

                  <button
                    disabled={loading}
                    className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold text-sm shadow-lg shadow-brand-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>جاري معالجة وتدقيق الطلب...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>
                          {activeTab === 'card' ? 'تأكيد ودفع $1 الآن ⭐️' : 'إرسال تفاصيل التحويل للمراجعة ⭐️'}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              // Payment Success View
              <div className="p-8 text-center space-y-6 flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 100 }}
                  className="w-16 h-16 bg-emerald-50 rounded-full border border-emerald-100 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </motion.div>

                <div className="space-y-1">
                  <h4 className="font-serif font-black text-lg text-brand-primary">تم استلام بيانات الترقية بنجاح</h4>
                  <p className="text-xs text-gray-500 leading-relaxed font-semibold px-4">
                    {activeTab === 'card' 
                      ? 'تمت تسوية المدفوعات وتفعيل الترقية لـ 30 يوماً وتثبيت إعلانك الذهبي فوراً بالمنصة.'
                      : 'تم إرسال تفاحيل تأكيد إرسال الحوالة إلى الإدارة. سيتم تفعيل الترقية خلال دقائق معدودة فور التحقق.'}
                  </p>
                </div>

                {/* Receipt Details card */}
                <div className="w-full bg-emerald-50/50 border border-emerald-100 p-4.5 rounded-2xl space-y-2.5 text-right font-medium text-xs text-emerald-950 leading-relaxed">
                  <div className="flex justify-between border-b border-emerald-100/60 pb-1.5">
                    <span className="font-bold opacity-60">بوابة الدفع:</span>
                    <span className="font-bold">{successTx.methodLabel}</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-100/60 pb-1.5">
                    <span className="font-bold opacity-60">الحوالة المستلمة:</span>
                    <span className="font-mono font-bold">{successTx.targetCard}</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-100/60 pb-1.5">
                    <span className="font-bold opacity-60">معاملة ID / رمز الإيصال:</span>
                    <span className="font-mono font-bold select-all text-brand-secondary">{successTx.reference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold opacity-60 font-serif text-brand-primary">حالة الترقية:</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[8px] font-black ${
                      activeTab === 'card' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white animate-pulse'
                    }`}>
                      {activeTab === 'card' ? 'مـميز ونشط ✔' : 'قيد التدقيق الإداري ⌛'}
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 font-bold leading-normal">
                  سوف تتمكن من متابعة وإدارة حالة ترقية الإعلان من قائمة "إعلاناتي" في أي وقت.
                </p>

                <button
                  onClick={handleFinishSuccess}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-bold text-sm shadow-md active:scale-[0.98] transition-all cursor-pointer"
                >
                  حسناً، متابعة المنصّة
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
