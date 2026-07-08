import { useState, useRef, useEffect } from 'react'
import { db } from './firebase'
import { collection, addDoc, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore'

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pins, setPins] = useState([])
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState([])
  const [conversationId] = useState(() => Date.now().toString())
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    loadPins()
    loadConversations()
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

  const pinMessage = async (msg) => {
    await addDoc(collection(db, 'pins'), {
      content: msg.content,
      role: msg.role,
      createdAt: serverTimestamp()
    })
    loadPins()
  }

  const filteredPins = pins.filter(p =>
    p.content?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredConvos = conversations.filter(c =>
    c.preview?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#0f0f0f', color: '#f0f0f0' }}>
      
      {/* Side Panel */}
      {panelOpen && (
        <div style={{ width: '280px', background: '#1a1a1a', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #333' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search pins & chats..."
              style={{ width: '100%', padding: '8px 12px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', color: '#f0f0f0', fontSize: '14px' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {/* Pins */}
            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📌 Pins ({filteredPins.length})
            </div>
            {filteredPins.map(pin => (
              <div key={pin.id} style={{ padding: '10px', background: '#2a2a2a', borderRadius: '8px', marginBottom: '8px', fontSize: '13px', color: '#ddd', lineHeight: '1.4' }}>
                {pin.content?.slice(0, 120)}{pin.content?.length > 120 ? '...' : ''}
              </div>
            ))}

            {/* Conversations */}
            <div style={{ marginTop: '16px', marginBottom: '8px', fontSize: '11px', color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              💬 Chats ({filteredConvos.length})
            </div>
            {filteredConvos.map(c => (
              <div key={c.id} style={{ padding: '10px', background: '#2a2a2a', borderRadius: '8px', marginBottom: '8px', fontSize: '13px', color: '#ddd' }}>
                {c.preview}...
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '12px', background: '#161616' }}>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            style={{ background: '#2a2a2a', border: 'none', color: '#f0f0f0', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
          >
            {panelOpen ? '◀' : '▶'}
          </button>
          <span style={{ fontWeight: '600', fontSize: '16px' }}>Pinned Chat</span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#555', marginTop: '40px', fontSize: '15px' }}>
              Start a conversation ✨
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.role === 'user' ? '#2563eb' : '#2a2a2a',
                fontSize: '15px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
              </div>
              <button
                onClick={() => pinMessage(msg)}
                style={{ marginTop: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#666', padding: '2px 6px' }}
              >
                📌 pin
              </button>
            </div>
          ))}
          {loading && (
            <div style={{ color: '#888', fontSize: '14px' }}>Claude is thinking...</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #333', background: '#161616', display: 'flex', gap: '8px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Message Claude..."
            style={{ flex: 1, padding: '12px 16px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '12px', color: '#f0f0f0', fontSize: '15px', outline: 'none' }}
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            style={{ padding: '12px 18px', background: '#2563eb', border: 'none', borderRadius: '12px', color: 'white', cursor: 'pointer', fontSize: '16px' }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}