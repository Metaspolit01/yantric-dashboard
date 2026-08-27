"use client";

import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, TrendingDown, ArrowUpRight, Loader2, CheckCircle2, AlertCircle,
  Smartphone, Copy, ShieldCheck, Clock, ArrowLeft, ExternalLink, Gift,
} from "lucide-react";
import { CREDIT_PACKAGES } from "@/lib/credit-packages";

interface UpiPayment {
  paymentId: string;
  amountPaise: number;
  credits: number;
  upiId: string;
  upiPayeeName: string;
  upiDeepLink: string;
  qrValue: string;
  note: string;
  status: string;
}

interface Props {
  initialCredits: number;
  initialPlan: string;
  initialTransactions: any[];
}

export default function CreditsClient({ initialCredits, initialPlan, initialTransactions }: Props) {
  const [credits, setCredits] = useState(initialCredits);
  const [plan] = useState(initialPlan);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [payment, setPayment] = useState<UpiPayment | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [utr, setUtr] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!payment) { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [payment]);

  const checkPaymentStatus = useCallback(async () => {
    if (!payment) return;
    try {
      const res = await fetch(`/api/credits/payment/${payment.paymentId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.payment?.status === "paid") {
          setPayment(null);
          setSuccess(`${data.payment.credits} credits added to your account!`);
          setCredits((c) => c + data.payment.credits);
          const txRes = await fetch("/api/credits");
          if (txRes.ok) {
            const txData = await txRes.json();
            if (txData.transactions) setTransactions(txData.transactions);
          }
        }
      }
    } catch { /* ignore polling errors */ }
  }, [payment]);

  useEffect(() => {
    if (!payment) return;
    const interval = setInterval(checkPaymentStatus, 5000);
    return () => clearInterval(interval);
  }, [payment, checkPaymentStatus]);

  const handleBuyCredits = async (packageId: string) => {
    setError("");
    setSuccess("");
    setCreatingOrder(true);
    setSelectedPackage(packageId);

    try {
      const res = await fetch("/api/credits/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create payment order.");
        setCreatingOrder(false);
        return;
      }

      // Free trial is granted instantly
      if (data.freeTrial) {
        setCredits(data.newBalance);
        setSuccess(data.message);
        setCreatingOrder(false);
        const txRes = await fetch("/api/credits");
        if (txRes.ok) {
          const txData = await txRes.json();
          if (txData.transactions) setTransactions(txData.transactions);
        }
        return;
      }

      // Paid package - show payment UI with QR code
      setPayment(data);
      setUtr("");
      setCreatingOrder(false);
    } catch (err) {
      console.error("Buy credits error:", err);
      setError("Connection error. Please try again.");
      setCreatingOrder(false);
    }
  };

  const handleVerifyUtr = async () => {
    if (!payment) return;
    setError("");
    setSuccess("");
    setVerifying(true);

    try {
      const res = await fetch("/api/credits/verify-utr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.paymentId, utr }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to verify payment.");
        setVerifying(false);
        return;
      }
      setCredits(data.newBalance);
      setPayment(null);
      setUtr("");
      setSuccess(data.message || `${data.creditsAdded} credits added to your account!`);
      const txRes = await fetch("/api/credits");
      if (txRes.ok) {
        const txData = await txRes.json();
        if (txData.transactions) setTransactions(txData.transactions);
      }
      setVerifying(false);
    } catch (err) {
      console.error("Verify UTR error:", err);
      setError("Connection error. Please try again.");
      setVerifying(false);
    }
  };

  const copyUpiId = () => {
    if (payment) {
      navigator.clipboard.writeText(payment.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const creditsUsed = transactions.filter((t: any) => t.amount < 0).reduce((s: number, t: any) => s + Math.abs(t.amount), 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">Credits</h1>
        <p className="text-white/40 text-sm mt-0.5">1 credit = 1 minute of voice conversation</p>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm flex items-center gap-2"
          >
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Balance card */}
      <div className="relative glass-card rounded-2xl p-6 overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#7C3AED] opacity-[0.08] rounded-full blur-[60px]" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-[#9d61ff]" />
            <span className="text-sm text-white/50">Available Balance</span>
            <span className="text-[10px] bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full text-white/30 capitalize">{plan} plan</span>
          </div>
          <div className="font-display font-bold text-5xl text-white mb-1">{credits.toLocaleString()}</div>
          <p className="text-white/35 text-sm">credits remaining · {creditsUsed.toLocaleString()} used total</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {payment ? (
          <motion.div
            key="payment-flow"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-card rounded-2xl p-6 space-y-6"
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setPayment(null); setUtr(""); setError(""); }}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to packages
              </button>
              <div className="flex items-center gap-1.5 text-xs text-white/30">
                <Clock className="w-3.5 h-3.5" /> {formatTime(elapsed)} elapsed
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/20">
              <div>
                <div className="text-xs text-white/40 uppercase tracking-wider">Purchasing</div>
                <div className="font-display font-bold text-2xl text-white">{payment.credits.toLocaleString()} credits</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/40 uppercase tracking-wider">Amount</div>
                <div className="font-display font-bold text-2xl text-[#9d61ff]">₹{(payment.amountPaise / 100).toLocaleString()}</div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-4 rounded-2xl shadow-lg">
                <QRCodeSVG value={payment.qrValue} size={180} level="M" includeMargin={false} />
              </div>
              <p className="text-xs text-white/40 text-center max-w-xs">
                Scan this QR code with any UPI app (Google Pay, PhonePe, Paytm, BHIM) to pay
              </p>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-white/40 uppercase tracking-wider">Pay to UPI ID</div>
                <div className="text-sm font-mono text-white truncate">{payment.upiId}</div>
              </div>
              <button
                onClick={copyUpiId}
                className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] transition-all shrink-0"
                title="Copy UPI ID"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <a href={payment.upiDeepLink} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              <Smartphone className="w-4 h-4" />
              Open UPI App
            </a>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-xs text-white/30 uppercase tracking-wider">After payment</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5 block">
                  Enter UTR / Transaction Reference Number
                </label>
                <input
                  type="text"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.replace(/\D/g, ""))}
                  placeholder="12-digit UTR from your UPI app"
                  maxLength={22}
                  className="yantric-input text-center text-lg font-mono tracking-wider"
                />
                <p className="text-xs text-white/30 mt-1.5">
                  Find the UTR in your UPI app&apos;s transaction details. It&apos;s a 12-digit number.
                </p>
              </div>

              <button
                onClick={handleVerifyUtr}
                disabled={verifying || utr.length < 10}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3"
              >
                {verifying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verifying payment…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4" /> Verify & Add Credits</>
                )}
              </button>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-white/40 leading-relaxed">
                Each UTR can only be used once. Your payment is verified securely and credits are
                added instantly. If you face any issues, contact us at{" "}
                <a href="mailto:hello@yantric.ai" className="text-[#9d61ff] hover:underline">hello@yantric.ai</a>
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="packages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2 className="font-display font-semibold text-white mb-4 flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-[#9d61ff]" />
              Buy Credits via UPI
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {CREDIT_PACKAGES.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-2xl p-5 border transition-all flex flex-col ${
                    p.popular
                      ? "border-[#7C3AED]/30 bg-[#7C3AED]/10"
                      : "border-white/[0.07] bg-white/[0.02]"
                  } ${creatingOrder && selectedPackage === p.id ? "opacity-50 pointer-events-none" : "cursor-pointer hover:border-[#7C3AED]/40"}`}
                  onClick={() => !creatingOrder && handleBuyCredits(p.id)}
                >
                  {p.popular && (
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#9d61ff] mb-2">Most Popular</div>
                  )}
                  {p.isFree && (
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1">
                      <Gift className="w-3 h-3" /> Free
                    </div>
                  )}
                  <div className="font-display font-bold text-white text-lg">{p.name}</div>
                  <div className="text-2xl font-display font-bold text-white mt-1">{p.credits.toLocaleString()}</div>
                  <div className="text-xs text-white/40 mb-1">credits</div>
                  <div className={`text-lg font-display font-bold mb-1 ${p.isFree ? "text-emerald-400" : "text-[#9d61ff]"}`}>
                    {p.priceDisplay}
                  </div>
                  <div className="text-xs text-white/30 mb-1">{p.pricePerMin}</div>
                  {p.bonus && <div className="text-xs text-white/30 mb-4">{p.bonus}</div>}
                  <button
                    disabled={creatingOrder}
                    className={`${p.popular ? "btn-primary" : "btn-ghost"} w-full text-sm py-2 flex items-center justify-center gap-2 mt-auto`}
                  >
                    {creatingOrder && selectedPackage === p.id ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                    ) : p.isFree ? (
                      <>Claim Free Credits</>
                    ) : (
                      <>Pay via UPI <ExternalLink className="w-3.5 h-3.5" /></>
                    )}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-white/25 mt-3">
              Pay instantly using any UPI app — Google Pay, PhonePe, Paytm, or BHIM. Credits are added
              to your account immediately after UTR verification.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction history */}
      <div className="glass-card rounded-2xl">
        <div className="px-5 py-4 border-b border-white/[0.05]">
          <h2 className="font-display font-semibold text-white flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[#9d61ff]" />
            Transaction History
          </h2>
        </div>
        {transactions.length === 0 ? (
          <div className="text-center py-10 text-white/30 text-sm">
            No transactions yet. Buy credits to get started.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.amount > 0 ? "bg-green-500/10" : "bg-[#7C3AED]/10"}`}>
                  <Zap className={`w-3.5 h-3.5 ${tx.amount > 0 ? "text-green-400" : "text-[#9d61ff]"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/80 truncate">{tx.description}</div>
                  <div className="text-xs text-white/30">{new Date(tx.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
                <div className={`text-sm font-semibold shrink-0 ${tx.amount > 0 ? "text-green-400" : "text-white/60"}`}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
