'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { 
  Lock, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ArrowLeft, 
  AlertCircle, 
  CreditCard,
  Building,
  Package,
  Layers
} from 'lucide-react';

interface Reservation {
  id: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export default function ReservationCheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const [percentLeft, setPercentLeft] = useState<number>(100);
  
  // Action states
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchReservation = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reservations/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Reservation not found');
        throw new Error('Failed to retrieve reservation');
      }
      const data = await res.json();
      setReservation(data);
      setError(null);
      
      // Calculate remaining seconds
      calculateRemaining(data.expiresAt, data.status);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while loading checkout.');
    } finally {
      setLoading(false);
    }
  };

  const calculateRemaining = (expiresAtStr: string, status: string) => {
    if (status !== 'PENDING') {
      setTimeLeft(0);
      setPercentLeft(0);
      return;
    }

    const expiresAt = new Date(expiresAtStr).getTime();
    const now = new Date().getTime();
    const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
    
    setTimeLeft(diff);
    // Calculate percentage based on 10 minutes (600 seconds)
    const initialDuration = 600; 
    setPercentLeft(Math.max(0, Math.min(100, (diff / initialDuration) * 100)));
  };

  useEffect(() => {
    fetchReservation();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  // Tick the countdown timer every second
  useEffect(() => {
    if (loading || !reservation || reservation.status !== 'PENDING') return;

    timerRef.current = setInterval(() => {
      const expiresAt = new Date(reservation.expiresAt).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      
      setTimeLeft(diff);
      const initialDuration = 600;
      setPercentLeft(Math.max(0, Math.min(100, (diff / initialDuration) * 100)));

      if (diff <= 0) {
        // Expiry reached!
        setReservation(prev => prev ? { ...prev, status: 'RELEASED' } : null);
        setActionError('Reservation has expired. Stock has been returned to catalog.');
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, reservation]);

  const handleConfirm = async () => {
    if (!reservation) return;
    setConfirming(true);
    setActionError(null);

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
        }
      });

      const data = await res.json();

      if (res.status === 410) {
        // Reservation expired/released
        setReservation(prev => prev ? { ...prev, status: 'RELEASED' } : null);
        setActionError(data.error || 'This reservation has expired. Stock returned to warehouse.');
      } else if (!res.ok) {
        setActionError(data.error || 'Failed to confirm purchase. Please try again.');
      } else {
        // Successful confirmation
        setReservation(prev => prev ? { ...prev, status: 'CONFIRMED' } : null);
        
        // Trigger confetti!
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });
      }
    } catch (err) {
      console.error(err);
      setActionError('Network error. Check your connection and try again.');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;
    setCancelling(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error || 'Failed to cancel reservation.');
      } else {
        setReservation(prev => prev ? { ...prev, status: 'RELEASED' } : null);
      }
    } catch (err) {
      console.error(err);
      setActionError('Network error. Failed to cancel reservation.');
    } finally {
      setCancelling(false);
    }
  };

  // Helper to format remaining time MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Circular timer constants
  const radius = 60;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentLeft / 100) * circumference;

  // Determine timer color based on time left
  const getTimerColor = () => {
    if (timeLeft > 120) return 'text-violet-500'; // > 2 min
    if (timeLeft > 30) return 'text-amber-500 animate-pulse'; // > 30s
    return 'text-red-500 animate-pulse'; // <= 30s
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Verifying Stock Hold Status...</p>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-6">
        <div className="w-16 h-16 bg-red-950/40 border border-red-800/40 rounded-3xl flex items-center justify-center mx-auto text-red-400">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Checkout Error
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">{error || 'Unable to load checkout.'}</p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-300 font-semibold rounded-2xl text-sm transition-all duration-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Catalog</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/')}
        disabled={confirming || cancelling}
        id="back-to-catalog-btn"
        className="flex items-center space-x-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Catalog</span>
      </button>

      {/* Main Reservation Card */}
      <div className="glass-card rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
        
        {/* Banner Status Header */}
        <div className={`p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
          reservation.status === 'CONFIRMED'
            ? 'bg-emerald-950/20'
            : reservation.status === 'RELEASED'
              ? 'bg-red-950/10'
              : 'bg-slate-950/30'
        }`}>
          <div className="flex items-center space-x-3.5">
            {reservation.status === 'PENDING' && (
              <div className="w-12 h-12 rounded-2xl bg-violet-950/40 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
            )}
            {reservation.status === 'CONFIRMED' && (
              <div className="w-12 h-12 rounded-2xl bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-6 h-6" />
              </div>
            )}
            {reservation.status === 'RELEASED' && (
              <div className="w-12 h-12 rounded-2xl bg-red-950/40 border border-red-500/20 flex items-center justify-center text-red-400">
                <XCircle className="w-6 h-6" />
              </div>
            )}
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Hold ID: #{reservation.id.slice(0, 8)}</span>
              <h2 className="text-xl font-extrabold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {reservation.status === 'PENDING' && 'Complete Checkout'}
                {reservation.status === 'CONFIRMED' && 'Purchase Completed'}
                {reservation.status === 'RELEASED' && (timeLeft <= 0 ? 'Hold Expired' : 'Hold Cancelled')}
              </h2>
            </div>
          </div>

          <div>
            <span className={`inline-block font-bold text-xs px-3.5 py-1.5 rounded-full border ${
              reservation.status === 'PENDING'
                ? 'bg-violet-950/40 text-violet-400 border-violet-500/20'
                : reservation.status === 'CONFIRMED'
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20'
                  : 'bg-slate-900 text-slate-500 border-white/5'
            }`}>
              {reservation.status}
            </span>
          </div>
        </div>

        {/* Error Notification Banner */}
        {actionError && (
          <div className="p-4 bg-red-950/40 border-b border-red-800/40 text-red-200 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed font-semibold">{actionError}</p>
          </div>
        )}

        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Left / Info details */}
          <div className="md:col-span-3 space-y-6">
            
            {/* Reservation Summary */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                <Package className="w-4 h-4" />
                <span>Reservation Details</span>
              </h3>

              <div className="space-y-3 bg-slate-950/30 p-4 border border-white/5 rounded-2xl">
                <div className="flex justify-between items-center text-sm py-1">
                  <span className="text-slate-400">Product name</span>
                  <span className="text-white font-bold">{reservation.productName}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-t border-white/5">
                  <span className="text-slate-400">Reserved stock source</span>
                  <span className="text-white font-semibold flex items-center space-x-1">
                    <Building className="w-3.5 h-3.5 text-slate-500" />
                    <span>{reservation.warehouseName}</span>
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-t border-white/5">
                  <span className="text-slate-400">Reserved quantity</span>
                  <span className="text-white font-extrabold px-2.5 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-xs">
                    {reservation.quantity} {reservation.quantity === 1 ? 'Unit' : 'Units'}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Summary details */}
            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                <CreditCard className="w-4 h-4" />
                <span>Simulate Order Payment</span>
              </h3>
              
              <div className="bg-slate-950/30 rounded-2xl p-4 border border-white/5 text-xs text-slate-400 leading-relaxed space-y-2">
                <p>
                  To complete this take-home flow, click <strong className="text-white">"Confirm Purchase"</strong>. This will simulate a webhook payment completion.
                </p>
                <p>
                  If you wish to test stock restoration, click <strong className="text-white">"Cancel Reservation"</strong> or let the countdown expire.
                </p>
              </div>
            </div>
          </div>

          {/* Right / Countdown Timer & CTAs */}
          <div className="md:col-span-2 flex flex-col justify-between items-center bg-slate-950/20 p-6 border border-white/5 rounded-2xl">
            
            {/* Countdown Clock Display */}
            <div className="flex flex-col items-center py-4 space-y-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reserved Stock Timer</span>
              
              {reservation.status === 'PENDING' ? (
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="circle-timer w-36 h-36">
                    {/* Background circle */}
                    <circle
                      className="text-slate-900"
                      strokeWidth={stroke}
                      stroke="currentColor"
                      fill="transparent"
                      r={normalizedRadius}
                      cx={radius + stroke}
                      cy={radius + stroke}
                    />
                    {/* Foreground countdown circle */}
                    <circle
                      className={getTimerColor()}
                      strokeDasharray={circumference + ' ' + circumference}
                      style={{ strokeDashoffset }}
                      strokeWidth={stroke}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      r={normalizedRadius}
                      cx={radius + stroke}
                      cy={radius + stroke}
                    />
                  </svg>
                  
                  {/* Numeric representation inside */}
                  <div className="absolute flex flex-col items-center">
                    <span className="text-2xl font-extrabold text-white tracking-wider font-mono">
                      {formatTime(timeLeft)}
                    </span>
                    <span className="text-[9px] text-slate-500 font-bold tracking-wider uppercase mt-0.5">
                      remaining
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-36 h-36 rounded-full bg-slate-950/60 border border-white/5 flex flex-col items-center justify-center">
                  {reservation.status === 'CONFIRMED' ? (
                    <>
                      <CheckCircle className="w-10 h-10 text-emerald-400 mb-1" />
                      <span className="text-xs text-slate-400 font-bold">SAVED</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-10 h-10 text-red-500 mb-1" />
                      <span className="text-xs text-slate-400 font-bold">RELEASED</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Actions Panel */}
            <div className="w-full space-y-2.5 mt-6">
              {reservation.status === 'PENDING' && (
                <>
                  <button
                    onClick={handleConfirm}
                    disabled={confirming || cancelling || timeLeft <= 0}
                    id="confirm-checkout-btn"
                    className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 text-white font-bold rounded-xl text-sm flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer disabled:opacity-40 shadow-lg shadow-violet-600/10 glow-btn glow-violet"
                  >
                    <span>{confirming ? 'Authorizing Payment...' : 'Confirm Purchase'}</span>
                  </button>
                  
                  <button
                    onClick={handleCancel}
                    disabled={confirming || cancelling}
                    id="cancel-checkout-btn"
                    className="w-full py-3 px-4 bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-300 font-semibold rounded-xl text-sm transition-all duration-200 cursor-pointer disabled:opacity-40"
                  >
                    <span>{cancelling ? 'Releasing Stock...' : 'Cancel Reservation'}</span>
                  </button>
                </>
              )}

              {reservation.status !== 'PENDING' && (
                <button
                  onClick={() => router.push('/')}
                  className="w-full py-3 px-4 bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-300 font-semibold rounded-xl text-sm transition-all duration-200 cursor-pointer"
                >
                  <span>Return to Catalog</span>
                </button>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
