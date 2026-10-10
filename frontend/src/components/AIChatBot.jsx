/**
 * src/components/AIChatBot.jsx
 * PharmaShield — Interactive AI Drug Consultation Chatbot Widget.
 *
 * Features:
 *   - Free-form conversation about the scanned medicine
 *   - Context-aware using last scan result (drug_name, active_ingredient, status_color)
 *   - Multi-turn conversation with history
 *   - Animated typing indicator, auto-scroll, empathetic Indonesian language
 */
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { aiChat } from '@/lib/aiApi';

const BOT_NAME = 'PharmAI Assistant';

// ─── Bubble Components ────────────────────────────────────────────────────────
function UserBubble({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 text-white px-4 py-2.5 text-sm leading-relaxed shadow-xs">
        {text}
      </div>
    </div>
  );
}

function BotBubble({ text, isTyping = false }) {
  if (isTyping) {
    return (
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          AI
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-neutral-100 border border-slate-200 px-4 py-3 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
        AI
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-neutral-100 border border-slate-200 px-4 py-3 text-sm text-neutral-800 leading-relaxed shadow-xs whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

// ─── Context Pill ─────────────────────────────────────────────────────────────
function ContextPill({ scanContext }) {
  if (!scanContext?.data) return null;
  const { drug_name, status_color } = scanContext.data;
  const emoji = status_color === 'Hijau' ? '🟢' : status_color === 'Merah' ? '🔴' : '🟡';
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-800">
      <span>{emoji}</span>
      <span className="truncate max-w-[16rem]">Konteks: {drug_name}</span>
    </div>
  );
}

// ─── Main Chatbot Widget ──────────────────────────────────────────────────────
export default function AIChatBot({ scanContext, initialQuestion = null }) {
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      content:
        scanContext?.data
          ? `Halo! 👋 Saya siap membantu Anda berkonsultasi tentang **${scanContext.data.drug_name}**.\n\nSilakan tanyakan apa saja — dosis, efek samping, interaksi obat, pantangan, atau hal lain yang ingin Anda ketahui! 💊`
          : `Halo! 👋 Saya **${BOT_NAME}**, asisten konsultasi kesehatan digital PharmaShield.\n\nSilakan scan kemasan obat terlebih dahulu, lalu tanyakan apa saja tentang obat yang Anda temukan! 💊`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Pre-fill input with initial question from suggested questions
  useEffect(() => {
    if (initialQuestion) {
      setInput(initialQuestion);
      inputRef.current?.focus();
    }
  }, [initialQuestion]);

  const sendMessage = useCallback(async (text) => {
    const userText = (text || input).trim();
    if (!userText || isTyping) return;

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setIsTyping(true);

    // Build conversation history for Gemini context (exclude initial greeting)
    const history = messages
      .slice(1) // skip greeting
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', content: m.content }));

    try {
      const res = await aiChat(userText, scanContext?.data || scanContext, history);

      if (res.success) {
        setMessages((prev) => [...prev, { role: 'bot', content: res.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'bot',
            content: res.reply || 'Maaf, tidak dapat memproses pertanyaan Anda. Silakan coba lagi.',
          },
        ]);
        if (res.requires_api_key) {
          setError('AI Chatbot belum dikonfigurasi. Tambahkan GEMINI_API_KEY pada backend/.env.');
        }
      }
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          content: `❌ Terjadi kesalahan: ${err.message}\n\nPastikan backend berjalan dan GEMINI_API_KEY sudah dikonfigurasi.`,
        },
      ]);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, isTyping, messages, scanContext]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'bot',
        content:
          scanContext?.data
            ? `Percakapan baru dimulai. 🔄 Tanyakan apa saja tentang **${scanContext.data.drug_name}**!`
            : `Percakapan baru dimulai. 🔄 Scan kemasan obat terlebih dahulu untuk konsultasi!`,
      },
    ]);
    setError(null);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden h-[560px]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
            AI
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">{BOT_NAME}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] opacity-80">
                {isTyping ? 'Sedang mengetik…' : 'Siap berkonsultasi'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ContextPill scanContext={scanContext} />
          <button
            onClick={clearChat}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white/80"
            title="Mulai percakapan baru"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Messages Area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth">
        {messages.map((msg, idx) =>
          msg.role === 'user' ? (
            <UserBubble key={idx} text={msg.content} />
          ) : (
            <BotBubble key={idx} text={msg.content} />
          )
        )}
        {isTyping && <BotBubble isTyping />}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="border-t border-slate-100 px-3 py-3 bg-neutral-50/70">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanyakan tentang dosis, efek samping, interaksi obat…"
            rows={1}
            disabled={isTyping}
            className="flex-1 resize-none px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all disabled:opacity-60 max-h-28 overflow-y-auto"
            style={{ height: 'auto', minHeight: '42px' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px';
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isTyping}
            className={[
              'flex-shrink-0 p-2.5 rounded-xl transition-all duration-150 shadow-xs',
              input.trim() && !isTyping
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed',
            ].join(' ')}
            aria-label="Kirim pesan"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-neutral-400 mt-1.5 text-center">
          Enter untuk kirim • Shift+Enter untuk baris baru
        </p>
      </div>
    </div>
  );
}
