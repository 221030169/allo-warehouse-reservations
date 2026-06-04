'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  MapPin, 
  Layers, 
  AlertCircle, 
  ArrowRight, 
  Lock, 
  RefreshCw, 
  ShoppingBag,
  Coins
} from 'lucide-react';

interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  reserved: number;
  available: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  stocks: WarehouseStock[];
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reservation Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [reserveQuantity, setReserveQuantity] = useState<number>(1);
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const fetchProducts = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to load products');
      const data = await res.json();
      setProducts(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError('Could not retrieve product catalog. Please verify database connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenReserveModal = (product: Product) => {
    setSelectedProduct(product);
    setReserveError(null);
    setReserveQuantity(1);
    
    // Auto-select first warehouse with available stock
    const firstAvailable = product.stocks.find(s => s.available > 0);
    if (firstAvailable) {
      setSelectedWarehouseId(firstAvailable.warehouseId);
    } else if (product.stocks.length > 0) {
      setSelectedWarehouseId(product.stocks[0].warehouseId);
    }
  };

  const handleCloseReserveModal = () => {
    if (reserving) return;
    setSelectedProduct(null);
  };

  const handleReserve = async () => {
    if (!selectedProduct || !selectedWarehouseId) return;
    
    setReserving(true);
    setReserveError(null);

    const stockInfo = selectedProduct.stocks.find(s => s.warehouseId === selectedWarehouseId);
    if (stockInfo && reserveQuantity > stockInfo.available) {
      setReserveError(`Cannot reserve more than ${stockInfo.available} available units.`);
      setReserving(false);
      return;
    }

    try {
      // Generate a unique idempotency key for this reservation attempt
      const idempotencyKey = crypto.randomUUID();

      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          productId: selectedProduct.id,
          warehouseId: selectedWarehouseId,
          quantity: reserveQuantity,
        }),
      });

      const data = await response.json();

      if (response.status === 409) {
        // Concurrency or stock conflict error
        setReserveError(data.error || 'Conflict: Stock was taken by another customer.');
      } else if (!response.ok) {
        setReserveError(data.error || 'Failed to create reservation.');
      } else {
        // Redirect to reservation checkout screen
        router.push(`/reservation/${data.id}`);
      }
    } catch (err) {
      console.error(err);
      setReserveError('Network error. Please check your connection.');
    } finally {
      setReserving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Intro Dashboard Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={{ fontFamily: 'var(--font-display)' }}>
            Real-Time Catalog
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Select a product to temporarily reserve stock. Holds expire automatically after 10 minutes.
          </p>
        </div>
        <button
          onClick={() => fetchProducts(true)}
          disabled={loading || refreshing}
          id="refresh-catalog-btn"
          className="self-start flex items-center space-x-2 px-4 py-2 bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-300 font-semibold rounded-xl text-sm transition-all duration-200 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Stock'}</span>
        </button>
      </div>

      {/* Main Error */}
      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-950/40 border border-red-800/40 text-red-200 rounded-2xl">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm">Database Connectivity Issue</h3>
            <p className="text-xs mt-1 text-red-300/80">{error}</p>
          </div>
        </div>
      )}

      {/* Catalog Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-64 rounded-3xl glass-card animate-pulse border border-white/5" />
          ))}
        </div>
      ) : products.length === 0 && !error ? (
        <div className="text-center py-16 glass-card rounded-3xl border border-white/5">
          <ShoppingBag className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-white">No products found</h3>
          <p className="text-sm text-slate-500 mt-1">Run seed script to populate database.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {products.map((product) => {
            const totalAvailable = product.stocks.reduce((acc, s) => acc + s.available, 0);
            return (
              <motion.div
                key={product.id}
                layoutId={`product-${product.id}`}
                className="glass-card glass-card-hover rounded-3xl p-6 flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                        {product.name}
                      </h2>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{product.sku}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-extrabold text-white flex items-center space-x-1 justify-end">
                        <Coins className="w-4 h-4 text-violet-400" />
                        <span>${product.price.toFixed(2)}</span>
                      </div>
                      <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        totalAvailable > 5 
                          ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/30' 
                          : totalAvailable > 0 
                            ? 'bg-amber-950/40 text-amber-400 border border-amber-800/30'
                            : 'bg-red-950/40 text-red-400 border border-red-800/30'
                      }`}>
                        {totalAvailable > 0 ? `${totalAvailable} Available` : 'Out of Stock'}
                      </span>
                    </div>
                  </div>

                  {/* Card Description */}
                  <p className="text-sm text-slate-400 mt-3 line-clamp-2">
                    {product.description || 'No product details provided.'}
                  </p>

                  {/* Warehouse Stock breakdown */}
                  <div className="mt-5 space-y-3.5 pt-4 border-t border-white/5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Warehouse Stock Breakdown</span>
                    </h4>
                    
                    <div className="space-y-2.5">
                      {product.stocks.map((stock) => {
                        const availPercent = stock.quantity > 0 
                          ? (stock.available / stock.quantity) * 100 
                          : 0;

                        return (
                          <div key={stock.warehouseId} className="bg-slate-950/30 rounded-xl p-3 border border-white/5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-300 font-semibold flex items-center space-x-1">
                                <MapPin className="w-3 h-3 text-slate-500" />
                                <span>{stock.warehouseName.split(' (')[0]}</span>
                              </span>
                              <div className="space-x-2">
                                <span className="text-slate-500">Reserved: {stock.reserved}</span>
                                <span className={`font-bold ${stock.available > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {stock.available} / {stock.quantity} left
                                </span>
                              </div>
                            </div>
                            
                            {/* Stock Bar */}
                            <div className="w-full bg-slate-900 rounded-full h-1.5 mt-2 overflow-hidden border border-white/5">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  stock.available > 5 
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                                    : stock.available > 0 
                                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400' 
                                      : 'bg-red-500'
                                }`} 
                                style={{ width: `${availPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6">
                  <button
                    onClick={() => handleOpenReserveModal(product)}
                    disabled={totalAvailable === 0}
                    id={`reserve-btn-${product.id}`}
                    className={`w-full py-3 px-4 font-bold rounded-2xl text-sm flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer ${
                      totalAvailable > 0
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 text-white shadow-lg shadow-violet-600/20 glow-btn glow-violet'
                        : 'bg-slate-900 border border-white/5 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <span>{totalAvailable > 0 ? 'Proceed to Reserve' : 'Temporarily Out of Stock'}</span>
                    {totalAvailable > 0 && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Reservation Drawer/Modal Overlay */}
      <AnimatePresence>
        {selectedProduct && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseReserveModal}
              className="fixed inset-0 bg-slate-950/80 z-50 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg glass-modal rounded-3xl p-6 z-50 shadow-2xl border border-white/10"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                    Reserve Stock
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{selectedProduct.name}</p>
                </div>
                <button 
                  onClick={handleCloseReserveModal} 
                  disabled={reserving}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {reserveError && (
                <div className="flex items-start space-x-2.5 p-3.5 bg-red-950/40 border border-red-800/40 text-red-200 rounded-xl mb-5">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">{reserveError}</p>
                </div>
              )}

              <div className="space-y-4">
                {/* Warehouse Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Warehouse Source</label>
                  <div className="grid grid-cols-1 gap-2.5">
                    {selectedProduct.stocks.map((stock) => {
                      const isOutOfStock = stock.available === 0;
                      const isSelected = selectedWarehouseId === stock.warehouseId;

                      return (
                        <button
                          key={stock.warehouseId}
                          type="button"
                          disabled={isOutOfStock || reserving}
                          onClick={() => {
                            setSelectedWarehouseId(stock.warehouseId);
                            setReserveQuantity(1);
                          }}
                          className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer ${
                            isOutOfStock
                              ? 'bg-slate-950/10 border-white/5 opacity-40 cursor-not-allowed'
                              : isSelected
                                ? 'bg-violet-950/20 border-violet-500/50 shadow-lg shadow-violet-500/5'
                                : 'bg-slate-900/40 border-white/5 hover:bg-slate-900 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                              isSelected ? 'border-violet-400 bg-violet-400/20' : 'border-slate-600'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{stock.warehouseName}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{stock.available} units available</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quantity Stepper */}
                {selectedWarehouseId && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Quantity</label>
                    <div className="flex items-center space-x-3 bg-slate-950/40 p-2.5 border border-white/5 rounded-xl justify-between">
                      <span className="text-xs text-slate-400 pl-2">Units to lock</span>
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          disabled={reserveQuantity <= 1 || reserving}
                          onClick={() => setReserveQuantity(prev => prev - 1)}
                          className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-300 font-bold border border-white/5 disabled:opacity-40 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-12 text-center text-sm font-extrabold text-white">{reserveQuantity}</span>
                        <button
                          type="button"
                          disabled={reserving || reserveQuantity >= (selectedProduct.stocks.find(s => s.warehouseId === selectedWarehouseId)?.available || 1)}
                          onClick={() => setReserveQuantity(prev => prev + 1)}
                          className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-300 font-bold border border-white/5 disabled:opacity-40 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex items-center space-x-3.5">
                <button
                  type="button"
                  onClick={handleCloseReserveModal}
                  disabled={reserving}
                  className="flex-1 py-3 px-4 bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-300 font-semibold rounded-2xl text-sm transition-all duration-200 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReserve}
                  disabled={reserving || !selectedWarehouseId}
                  id="confirm-reservation-btn"
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 text-white font-bold rounded-2xl text-sm flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer disabled:opacity-50 glow-btn glow-violet shadow-lg shadow-violet-600/10"
                >
                  {reserving ? (
                    <>
                      <Lock className="w-4 h-4 animate-pulse" />
                      <span>Locking Stock...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Lock Stock</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
