import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, RefreshCw, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { insertScan, markSynced } from '../lib/db';

export default function ScannerScreen() {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle, selected, processing, success
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);

  // 1. Handle Image Selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
        setStatus("selected");
      };
      reader.readAsDataURL(file);
    }
  };

  // 2. Process and Sync
  const captureAndSync = async () => {
    if (!previewUrl) return;
    setStatus("processing");
    
    const scanId = crypto.randomUUID();
    const isOnline = navigator.onLine;

    // Immediately save locally to IndexedDB as PENDING
    await insertScan({
      id: scanId,
      label: "Pending Sync",
      confidence: null,
      image_b64: previewUrl,
      width: 0, // Not strictly needed for file uploads unless parsing dimensions
      height: 0,
    });

    if (isOnline) {
      try {
        // Convert Base64 back to Blob for multipart/form-data upload
        const fetchResponse = await fetch(previewUrl);
        const blob = await fetchResponse.blob();
        
        const formData = new FormData();
        formData.append('image', blob, 'scan.jpg');
        formData.append('scan_id', scanId);

        // Fetch to Django Server
        const res = await fetch('http://127.0.0.1:8000/api/sync/', {
          method: 'POST',
          body: formData
        });
        
        if (!res.ok) throw new Error("Server rejected");
        const data = await res.json();
        
        // Lock the DB record and update UI
        await markSynced(scanId);
        setResult({ text: data.result, conf: data.confidence });

      } catch (e) {
        setResult({ text: "Saved Offline (Pending)", conf: null });
      }
    } else {
      setResult({ text: "Saved Offline (Pending)", conf: null });
    }
    
    setStatus("success");
  };

  const resetScanner = () => {
    setPreviewUrl(null);
    setResult(null);
    setStatus("idle");
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 min-h-[80vh]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card glass w-full max-w-md shadow-2xl"
      >
        <div className="card-body p-4">
          
          {/* Upload Dropzone / Image Preview */}
          <div 
            className={`relative overflow-hidden rounded-2xl bg-neutral aspect-square flex flex-col items-center justify-center border-2 border-dashed transition-colors
              ${status === "idle" ? 'border-slate-600 hover:border-primary cursor-pointer hover:bg-slate-800/50' : 'border-slate-700/50'}`}
            onClick={() => status === "idle" && fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />

            {/* State: Idle (Waiting for Upload) */}
            {status === "idle" && (
              <div className="text-slate-400 flex flex-col items-center pointer-events-none">
                <UploadCloud size={48} className="mb-4 opacity-50 text-primary" />
                <p className="font-semibold tracking-wider text-sm uppercase">Tap to Upload Scan</p>
                <p className="text-xs mt-2 opacity-50">JPEG or PNG</p>
              </div>
            )}

            {/* State: Image Selected Preview */}
            {(status === "selected" || status === "processing" || status === "success") && (
              <img src={previewUrl} alt="Patient Scan" className="absolute inset-0 w-full h-full object-cover" />
            )}

            {/* State: Processing Animation */}
            <AnimatePresence>
              {status === "processing" && (
                <>
                  <motion.div 
                    initial={{ top: 0, opacity: 0 }}
                    animate={{ top: ["0%", "98%", "0%"], opacity: 1 }}
                    transition={{ duration: 2, ease: "linear", repeat: Infinity }}
                    className="absolute left-0 w-full h-1 bg-success shadow-[0_0_15px_rgba(34,197,94,0.8)] z-10"
                  />
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-0">
                    <span className="loading loading-ring loading-lg text-success"></span>
                  </div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Dynamic Controls Area */}
          <div className="mt-4">
            <AnimatePresence mode="wait">
              {status === "success" ? (
                <motion.div 
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="alert alert-success shadow-lg flex-col items-start gap-1"
                >
                  <div className="flex w-full justify-between items-center">
                     <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                       <CheckCircle2 size={20} /> {result.text}
                     </h3>
                     {result.conf && <div className="badge badge-lg bg-emerald-700 text-white border-none">{(result.conf * 100).toFixed(1)}%</div>}
                  </div>
                  <button onClick={resetScanner} className="btn btn-sm btn-ghost w-full mt-2 text-emerald-900 bg-emerald-500/20 hover:bg-emerald-500/40">
                    <RefreshCw size={16} /> Analyze New Patient
                  </button>
                </motion.div>
              ) : (
                <motion.div 
                  key="controls"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="btn btn-neutral flex-1 shadow-md"
                    disabled={status === "processing"}
                  >
                    <ImageIcon size={20} /> Change
                  </button>
                  <button 
                    onClick={captureAndSync} 
                    disabled={status !== "selected"}
                    className="btn btn-primary flex-[2] shadow-lg shadow-primary/30 disabled:opacity-50"
                  >
                    {status === "processing" ? (
                       <span className="loading loading-dots loading-md"></span>
                    ) : (
                      <><UploadCloud size={20} /> Analyze Scan</>
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </motion.div>
    </div>
  );
}