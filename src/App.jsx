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

  const handleContextMenu = useCallback((e) => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (text && text.length > 0) {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, text })
    }
  }, [])

  const renderMessage = (content) => {
    const lines = content.split('\n')
    return lines.map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        return <div key={i} style={{ fontWeight: '600', color: '#fff', marginTop: i > 0 ? '12px' : 0 }}>{line.replace(/\*\*/g, '')}</div>
      }
      if (line.startsWith('- [ ]') || line.startsWith('- [x]')) {
        const done = line.startsWith('- [x]')
        const text = line.replace(/- \[.\] /, '')
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
            <div style={{
              width: '16px', height: '16px', borderRadius: '4px',
              border: done ? 'none' : '1.5px solid #444',
              background: done ? '#c0392b' : 'transparent',
              flexShrink: 0
            }} />
            <span style={{ color: done ? '#666' : '#ddd', textDecoration: done ? 'line-through' : 'none', fontSize: '14px' }}>{text}</span>
          </div>
        )
      }
      if (line.startsWith('- ')) {
        return <div key={i} style={{ padding: '2px 0', color: '#ccc', fontSize: '14px' }}>• {line.slice(2)}</div>
      }
      if (line === '---') {
        return <hr key={i} style={{ border: 'none', borderTop: '1px solid #222', margin: '8px 0' }} />
      }
      if (line === '') return <div key={i} style={{ height: '6px' }} />
      return <div key={i} style={{ color: '#ddd', fontSize: '15px', lineHeight: '1.6' }}>{line.replace(/\*\*/g, '')}</div>
    })
  }

  const filteredPins = pins.filter(p =>
    p.content?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredConvos = conversations.filter(c =>
    c.preview?.toLowerCase().includes(search.toLowerCase())
  )

  const isMobile = window.innerWidth < 768

  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100vw', overflow: 'hidden', background: '#0a0a0a', color: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Context Menu */}
      {contextMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.min(contextMenu.y, window.innerHeight - 100),
            left: Math.min(contextMenu.x, window.innerWidth - 160),
            background: '#1c1c1c',
            border: '1px solid #2a2a2a',
            borderRadius: '10px',
            padding: '4px',
            zIndex: 9999,
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
            minWidth: '150px'
          }}
        >
          <button
            onClick={() => pinMessage(contextMenu.text)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', color: '#f5f5f5', cursor: 'pointer', fontSize: '14px', borderRadius: '7px' }}
            onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ color: '#c0392b' }}>📌</span> Pin
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(contextMenu.text); setContextMenu(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', color: '#f5f5f5', cursor: 'pointer', fontSize: '14px', borderRadius: '7px' }}
            onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span>⎘</span> Copy
          </button>
        </div>
      )}

      {/* Side Panel */}
      {panelOpen && (
        <div style={{
          width: isMobile ? '100vw' : '280px',
          minWidth: isMobile ? '100vw' : '280px',
          maxWidth: isMobile ? '100vw' : '280px',
          background: '#111',
          borderRight: '1px solid #1e1e1e',
          display: 'flex',
          flexDirection: 'column',
          position: isMobile ? 'fixed' : 'relative',
          top: 0, left: 0, bottom: 0,
          zIndex: isMobile ? 100 : 'auto',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontWeight: '600', fontSize: '11px', letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>Workspace</span>
            {isMobile && (
              <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>×</button>
            )}
          </div>

          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ width: '100%', padding: '8px 12px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: '8px', color: '#f5f5f5', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <div style={{ fontSize: '10px', color: '#444', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
              Pins {filteredPins.length > 0 && `(${filteredPins.length})`}
            </div>
            {filteredPins.length === 0 && (
              <div style={{ fontSize: '13px', color: '#333', paddingBottom: '16px' }}>No pins yet</div>
            )}
            {filteredPins.map(pin => (
              <div key={pin.id} style={{ position: 'relative', padding: '10px 28px 10px 12px', background: '#161616', borderRadius: '8px', marginBottom: '6px', borderLeft: '2px solid #c0392b' }}>
                <div style={{ fontSize: '13px', color: '#bbb', lineHeight: '1.5' }}>
                  {pin.content?.slice(0, 120)}{pin.content?.length > 120 ? '...' : ''}
                </div>
                <button onClick={() => deletePin(pin.id)}
                  style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#c0392b'}
                  onMouseLeave={e => e.currentTarget.style.color = '#333'}
                >×</button>
              </div>
            ))}

            <div style={{ fontSize: '10px', color: '#444', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', marginTop: '20px' }}>
              Recent
            </div>
            {filteredConvos.length === 0 && (
              <div style={{ fontSize: '13px', color: '#333' }}>No conversations yet</div>
            )}
            {filteredConvos.map(c => (
              <div key={c.id}
                style={{ padding: '9px 12px', background: '#161616', borderRadius: '8px', marginBottom: '6px', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1e1e1e'}
                onMouseLeave={e => e.currentTarget.style.background = '#161616'}
              >
                <div style={{ fontSize: '13px', color: '#777' }}>{c.preview}...</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', background: '#0a0a0a', flexShrink: 0 }}>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            style={{
              background: panelOpen ? '#1a1a1a' : 'none',
              border: '1px solid #222',
              color: '#999', padding: '6px 12px',
              borderRadius: '8px', cursor: 'pointer',
              fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span style={{ color: '#c0392b' }}>📌</span>
            <span>{pins.length}</span>
          </button>
          <span style={{ fontWeight: '500', fontSize: '15px' }}>Pinned Chat</span>
        </div>

        {/* Messages */}
        <div
          ref={chatRef}
          onContextMenu={handleContextMenu}
          style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div style={{ maxWidth: '700px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#2a2a2a', marginTop: '80px', fontSize: '14px' }}>
                Start a conversation · Right-click to pin
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: isMobile ? '88%' : '75%',
                  padding: '12px 16px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.role === 'user' ? '#1c1c1c' : '#141414',
                  border: `1px solid ${msg.role === 'user' ? '#2a2a2a' : '#1e1e1e'}`,
                  userSelect: 'text'
                }}>
                  {renderMessage(msg.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 16px', background: '#141414', border: '1px solid #1e1e1e', borderRadius: '18px 18px 18px 4px', color: '#444', fontSize: '18px', letterSpacing: '4px' }}>···</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div style={{ padding: isMobile ? '12px 16px' : '14px 20px', borderTop: '1px solid #1a1a1a', background: '#0a0a0a', flexShrink: 0 }}>
          <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
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
                flex: 1, padding: '11px 16px',
                background: '#111', border: '1px solid #222',
                borderRadius: '12px', color: '#f5f5f5',
                fontSize: '15px', outline: 'none', resize: 'none',
                fontFamily: 'inherit', lineHeight: '1.5',
                maxHeight: '120px', overflowY: 'auto'
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
                padding: '11px 16px',
                background: loading ? '#151515' : '#f5f5f5',
                border: 'none', borderRadius: '12px',
                color: loading ? '#444' : '#0a0a0a',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '16px', fontWeight: '600', flexShrink: 0
              }}
            >↑</button>
          </div>
          <div style={{ maxWidth: '700px', margin: '6px auto 0', fontSize: '11px', color: '#2a2a2a', textAlign: 'center' }}>
            Right-click any text to pin · Enter to send
          </div>
        </div>
      </div>
    </div>
  )
}
