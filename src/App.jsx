import { useState, useRef, useEffect, useCallback } from 'react'
import { db } from './firebase'
import { collection, addDoc, getDocs, orderBy, query, serverTimestamp, deleteDoc, doc } from 'firebase/firestore'

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pins, setPins] = useState([])
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState([])
  const [conversationId] = useState(() => Date.now().toString())
  const [selectedText, setSelectedText] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const bottomRef = useRef(null)
  const chatRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    loadPins()
    loadConversations()
  }, [])

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const loadPins = async () => {
    const q = query(collection(db, 'pins'), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    setPins(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  const loadConversations = async () => {
    const q = query(collection(db, 'conversations'), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()
      const assistantMsg = { role: 'assistant', content: data.content }
      const finalMessages = [...newMessages, assistantMsg]
      setMessages(finalMessages)

      await addDoc(collection(db, 'conversations'), {
        conversationId,
        messages: finalMessages,
        preview: input.slice(0, 60),
        createdAt: serverTimestamp()
      })
      loadConversations()
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const pinMessage = async (content) => {
    await addDoc(collection(db, 'pins'), {
      content,
      createdAt: serverTimestamp()
    })
    loadPins()
    setContextMenu(null)
  }

  const deletePin = async (id) => {
    await deleteDoc(doc(db, 'pins', id))
    loadPins()
  }

  const handleMouseUp = useCallback((e) => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (text && text.length > 0) {
      setSelectedText(text)
      setContextMenu({ x: e.clientX, y: e.clientY, text })
    }
  }, [])

  const filteredPins = pins.filter(p =>
    p.content?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredConvos = conversations.filter(c =>
    c.preview?.toLowerCase().includes(search.toLowerCase())
  )

  const isMobile = window.innerWidth < 768

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#0a0a0a', color: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', position: 'relative' }}>

      {/* Context Menu */}
      {contextMenu && (
        <div style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '8px',
          padding: '4px',
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }}>
          <button
            onClick={() => pinMessage(contextMenu.text)}
            style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'none', border: 'none', color: '#f5f5f5', cursor: 'pointer', fontSize: '14px', textAlign: 'left', borderRadius: '6px' }}
            onMouseEnter={e => e.target.style.background = '#2a2a2a'}
            onMouseLeave={e => e.target.style.background = 'none'}
          >
            📌 Pin this
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(contextMenu.text); setContextMenu(null) }}
            style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'none', border: 'none', color: '#f5f5f5', cursor: 'pointer', fontSize: '14px', textAlign: 'left', borderRadius: '6px' }}
            onMouseEnter={e => e.target.style.background = '#2a2a2a'}
            onMouseLeave={e => e.target.style.background = 'none'}
          >
            Copy
          </button>
        </div>
      )}

      {/* Side Panel */}
      {(panelOpen) && (
        <div style={{
          width: isMobile ? '100%' : '300px',
          background: '#111',
          borderRight: isMobile ? 'none' : '1px solid #222',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: isMobile ? 'fixed' : 'relative',
          top: 0, left: 0, bottom: 0,
          zIndex: isMobile ? 100 : 'auto'
        }}>
          {/* Panel Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: '600', fontSize: '14px', letterSpacing: '0.05em', color: '#999' }}>WORKSPACE</span>
            {isMobile && (
              <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '20px' }}>×</button>
            )}
          </div>

          {/* Search */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #222' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ width: '100%', padding: '8px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#f5f5f5', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {/* Pins Section */}
            <div style={{ marginBottom: '4px', fontSize: '11px', color: '#666', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Pins
            </div>
            {filteredPins.length === 0 && (
              <div style={{ fontSize: '13px', color: '#444', padding: '8px 0 16px' }}>No pins yet</div>
            )}
            {filteredPins.map(pin => (
              <div key={pin.id} style={{ position: 'relative', padding: '10px 12px', background: '#1a1a1a', borderRadius: '6px', marginBottom: '6px', borderLeft: '2px solid #c0392b', group: 'true' }}>
                <div style={{ fontSize: '13px', color: '#ddd', lineHeight: '1.5', paddingRight: '20px' }}>
                  {pin.content?.slice(0, 150)}{pin.content?.length > 150 ? '...' : ''}
                </div>
                <button
                  onClick={() => deletePin(pin.id)}
                  style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                  onMouseEnter={e => e.target.style.color = '#c0392b'}
                  onMouseLeave={e => e.target.style.color = '#444'}
                >×</button>
              </div>
            ))}

            {/* Recent Conversations */}
            <div style={{ marginTop: '20px', marginBottom: '4px', fontSize: '11px', color: '#666', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Recent
            </div>
            {filteredConvos.length === 0 && (
              <div style={{ fontSize: '13px', color: '#444', padding: '8px 0' }}>No conversations yet</div>
            )}
            {filteredConvos.map(c => (
              <div key={c.id} style={{ padding: '10px 12px', background: '#1a1a1a', borderRadius: '6px', marginBottom: '6px', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#222'}
                onMouseLeave={e => e.currentTarget.style.background = '#1a1a1a'}
              >
                <div style={{ fontSize: '13px', color: '#999' }}>{c.preview}...</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: panelOpen && !isMobile ? 'calc(100% - 300px)' : '100%' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', gap: '12px', background: '#0a0a0a' }}>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            style={{ background: 'none', border: '1px solid #222', color: '#999', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#444'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#222'}
          >
            <span style={{ color: '#c0392b', fontSize: '16px' }}>📌</span>
            <span>{pins.length}</span>
          </button>
          <span style={{ fontWeight: '500', fontSize: '15px', color: '#f5f5f5' }}>Pinned Chat</span>
        </div>

        {/* Messages */}
        <div ref={chatRef} onMouseUp={handleMouseUp} style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#333', marginTop: '80px', fontSize: '15px' }}>
              Start a conversation
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: isMobile ? '85%' : '70%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? '#1a1a1a' : '#141414',
                border: '1px solid #222',
                fontSize: '15px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                color: '#f0f0f0',
                userSelect: 'text'
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#555', fontSize: '14px' }}>
              <span>···</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: isMobile ? '12px 16px' : '16px 24px', borderTop: '1px solid #1a1a1a', background: '#0a0a0a' }}>
          <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Message..."
              rows={1}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: '#111',
                border: '1px solid #222',
                borderRadius: '12px',
                color: '#f5f5f5',
                fontSize: '15px',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.5',
                maxHeight: '120px',
                overflowY: 'auto'
              }}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              style={{
                padding: '12px 16px',
                background: loading ? '#1a1a1a' : '#f5f5f5',
                border: 'none',
                borderRadius: '12px',
                color: loading ? '#555' : '#0a0a0a',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                flexShrink: 0
              }}
            >↑</button>
          </div>
          <div style={{ maxWidth: '760px', margin: '8px auto 0', fontSize: '11px', color: '#333', textAlign: 'center' }}>
            Select any text to pin it
          </div>
        </div>
      </div>
    </div>
  )
}
