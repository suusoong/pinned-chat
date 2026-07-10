import { useState, useRef, useEffect, useCallback } from 'react'
import { db } from './firebase'
import { collection, addDoc, getDocs, orderBy, query, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore'

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pins, setPins] = useState([])
  const [todos, setTodos] = useState([])
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState([])
  const [conversationId, setConversationId] = useState(() => Date.now().toString())
  const [contextMenu, setContextMenu] = useState(null)
  const [highlightedMsg, setHighlightedMsg] = useState(null)
  const bottomRef = useRef(null)
  const chatRef = useRef(null)
  const msgRefs = useRef({})
  const conversationDocId = useRef(null)
  const textareaRef = useRef(null)
  const isComposing = useRef(false)
  const longPressTimer = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    loadPins()
    loadTodos()
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

  const loadTodos = async () => {
    const q = query(collection(db, 'todos'), orderBy('createdAt', 'asc'))
    const snap = await getDocs(q)
    setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  const loadConversations = async () => {
    const q = query(collection(db, 'conversations'), orderBy('updatedAt', 'desc'))
    const snap = await getDocs(q)
    setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  const loadConversation = (convo) => {
    setMessages(convo.messages || [])
    setConversationId(convo.conversationId)
    conversationDocId.current = convo.id
    if (window.innerWidth < 768) setPanelOpen(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const newConversation = () => {
    setMessages([])
    setConversationId(Date.now().toString())
    conversationDocId.current = null
  }

  const extractAndSaveTodos = async (text) => {
    const todoMatch = text.match(/<todo>([\s\S]*?)<\/todo>/)
    if (!todoMatch) return
    const todoText = todoMatch[1]
    const lines = todoText.split('\n').filter(l => l.trim().startsWith('-'))
    const today = new Date().toISOString().split('T')[0]
    for (const line of lines) {
      const clean = line.replace(/^-\s*/, '').trim()
      if (clean && clean.length > 1 && clean.length < 100) {
        await addDoc(collection(db, 'todos'), {
          text: clean, done: false, date: today,
          createdAt: serverTimestamp()
        })
      }
    }
    await loadTodos()
    if (!panelOpen) setPanelOpen(true)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading || isComposing.current) return
    const currentInput = input
    const userMsg = { role: 'user', content: currentInput }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.value = ''
      textareaRef.current.style.height = 'auto'
    }
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()
      const rawContent = data.content
      const displayContent = rawContent.replace(/<todo>[\s\S]*?<\/todo>/g, '').trim()
      const assistantMsg = { role: 'assistant', content: displayContent }
      const finalMessages = [...newMessages, assistantMsg]
      setMessages(finalMessages)

      await extractAndSaveTodos(rawContent)

      if (!conversationDocId.current) {
        const docRef = await addDoc(collection(db, 'conversations'), {
          conversationId,
          messages: finalMessages,
          preview: currentInput.slice(0, 60),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
        conversationDocId.current = docRef.id
      } else {
        await updateDoc(doc(db, 'conversations', conversationDocId.current), {
          messages: finalMessages,
          updatedAt: serverTimestamp()
        })
      }
      loadConversations()
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const pinMessage = async (content, msgIndex) => {
    await addDoc(collection(db, 'pins'), {
      content, msgIndex, conversationId,
      createdAt: serverTimestamp()
    })
    loadPins()
    setContextMenu(null)
  }

  const addTodoManual = async (content) => {
    const clean = content.replace(/\*\*/g, '').replace(/^[-*\d.]+\s*/, '').trim().slice(0, 80)
    if (!clean) return
    const today = new Date().toISOString().split('T')[0]
    await addDoc(collection(db, 'todos'), {
      text: clean, done: false, date: today,
      createdAt: serverTimestamp()
    })
    loadTodos()
    setContextMenu(null)
    if (!panelOpen) setPanelOpen(true)
  }

  const toggleTodo = async (id, done) => {
    await updateDoc(doc(db, 'todos', id), { done: !done })
    loadTodos()
  }

  const deleteTodo = async (id) => {
    await deleteDoc(doc(db, 'todos', id))
    loadTodos()
  }

  const deletePin = async (id) => {
    await deleteDoc(doc(db, 'pins', id))
    loadPins()
  }

  const scrollToMessage = (msgIndex) => {
    const el = msgRefs.current[msgIndex]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMsg(msgIndex)
      setTimeout(() => setHighlightedMsg(null), 2000)
    }
    if (window.innerWidth < 768) setPanelOpen(false)
  }

  const handleContextMenu = useCallback((e, msgIndex) => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (text && text.length > 0) {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, text, msgIndex })
    }
  }, [])

  const handleTouchStart = useCallback((e, msgIndex) => {
    longPressTimer.current = setTimeout(() => {
      const sel = window.getSelection()
      const text = sel?.toString().trim()
      const touch = e.touches[0]
      if (text && text.length > 0) {
        setContextMenu({ x: touch.clientX, y: touch.clientY, text, msgIndex })
      }
    }, 600)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }, [])

  const renderMessage = (content) => {
    const lines = content.split('\n')
    return lines.map((line, i) => {
      if (line === '---') return <hr key={i} style={{ border: 'none', borderTop: '1px solid #222', margin: '8px 0' }} />
      if (line === '') return <div key={i} style={{ height: '5px' }} />
      const isHeader = /^\*\*[^*]+\*\*$/.test(line.trim())
      if (isHeader) return <div key={i} style={{ fontWeight: '600', color: '#eee', marginTop: i > 0 ? '10px' : 0, fontSize: '14px' }}>{line.replace(/\*\*/g, '')}</div>
      if (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### ')) {
        const text = line.replace(/^#+\s/, '')
        return <div key={i} style={{ fontWeight: '600', color: '#eee', marginTop: i > 0 ? '10px' : 0, fontSize: '14px' }}>{text}</div>
      }
      if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ color: '#ccc', fontSize: '14px', padding: '2px 0', lineHeight: '1.6' }}>• {line.slice(2)}</div>
      if (/^\d+\.\s/.test(line)) return <div key={i} style={{ color: '#ccc', fontSize: '14px', padding: '2px 0' }}>{line}</div>
      const html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      return <div key={i} style={{ color: '#ddd', fontSize: '15px', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: html }} />
    })
  }

  const todosByDate = todos.reduce((acc, todo) => {
    const date = todo.date || 'earlier'
    if (!acc[date]) acc[date] = []
    acc[date].push(todo)
    return acc
  }, {})

  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'earlier') return 'Earlier'
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    if (dateStr === today) return 'Today'
    if (dateStr === yesterday) return 'Yesterday'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const filteredPins = pins.filter(p => p.content?.toLowerCase().includes(search.toLowerCase()))
  const filteredConvos = conversations.filter(c => c.preview?.toLowerCase().includes(search.toLowerCase()))
  const isMobile = window.innerWidth < 768

  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100vw', overflow: 'hidden', background: '#0a0a0a', color: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {contextMenu && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'fixed',
          top: Math.min(contextMenu.y, window.innerHeight - 150),
          left: Math.min(contextMenu.x, window.innerWidth - 180),
          background: '#1c1c1c', border: '1px solid #2a2a2a',
          borderRadius: '10px', padding: '4px', zIndex: 9999,
          boxShadow: '0 8px 30px rgba(0,0,0,0.7)', minWidth: '170px'
        }}>
          {[
            { icon: '📌', label: 'Pin', color: '#c0392b', action: () => pinMessage(contextMenu.text, contextMenu.msgIndex) },
            { icon: '✅', label: 'Add to Todo', action: () => addTodoManual(contextMenu.text) },
            { icon: '⎘', label: 'Copy', action: () => { navigator.clipboard.writeText(contextMenu.text); setContextMenu(null) } }
          ].map(({ icon, label, color, action }) => (
            <button key={label} onClick={action}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', color: '#f5f5f5', cursor: 'pointer', fontSize: '14px', borderRadius: '7px', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={color ? { color } : {}}>{icon}</span> {label}
            </button>
          ))}
        </div>
      )}

      {panelOpen && (
        <div style={{
          width: isMobile ? '100vw' : '280px', minWidth: isMobile ? '100vw' : '280px',
          background: '#0f0f0f', borderRight: '1px solid #1a1a1a',
          display: 'flex', flexDirection: 'column',
          position: isMobile ? 'fixed' : 'relative',
          top: 0, left: 0, bottom: 0,
          zIndex: isMobile ? 100 : 'auto', overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontWeight: '600', fontSize: '11px', letterSpacing: '0.1em', color: '#444', textTransform: 'uppercase' }}>Workspace</span>
            {isMobile && <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '22px' }}>×</button>}
          </div>

          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              style={{ width: '100%', padding: '8px 12px', background: '#161616', border: '1px solid #222', borderRadius: '8px', color: '#f5f5f5', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {Object.keys(todosByDate).sort((a, b) => b.localeCompare(a)).map(date => {
              const dateTodos = todosByDate[date].filter(t => t.text?.toLowerCase().includes(search.toLowerCase()))
              if (dateTodos.length === 0) return null
              const pending = dateTodos.filter(t => !t.done)
              const done = dateTodos.filter(t => t.done)
              return (
                <div key={date} style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '10px', color: '#444', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formatDate(date)}</span>
                    {pending.length > 0 && <span style={{ color: '#333' }}>{pending.length} left</span>}
                  </div>
                  {pending.map(todo => (
                    <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '8px', marginBottom: '2px' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#161616'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div onClick={() => toggleTodo(todo.id, todo.done)}
                        style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid #333', flexShrink: 0, cursor: 'pointer' }} />
                      <span style={{ fontSize: '13px', color: '#bbb', flex: 1, lineHeight: '1.4' }}>{todo.text}</span>
                      <button onClick={() => deleteTodo(todo.id)} style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: '16px', padding: 0, flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#c0392b'}
                        onMouseLeave={e => e.currentTarget.style.color = '#2a2a2a'}>×</button>
                    </div>
                  ))}
                  {done.map(todo => (
                    <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '8px', marginBottom: '2px', opacity: 0.5 }}>
                      <div onClick={() => toggleTodo(todo.id, todo.done)}
                        style={{ width: '16px', height: '16px', borderRadius: '4px', background: '#c0392b', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'white', fontSize: '10px' }}>✓</span>
                      </div>
                      <span style={{ fontSize: '13px', color: '#555', flex: 1, textDecoration: 'line-through' }}>{todo.text}</span>
                      <button onClick={() => deleteTodo(todo.id)} style={{ background: 'none', border: 'none', color: '#222', cursor: 'pointer', fontSize: '16px', padding: 0, flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#c0392b'}
                        onMouseLeave={e => e.currentTarget.style.color = '#222'}>×</button>
                    </div>
                  ))}
                </div>
              )
            })}

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', color: '#444', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                Pins {filteredPins.length > 0 && `(${filteredPins.length})`}
              </div>
              {filteredPins.length === 0 && <div style={{ fontSize: '13px', color: '#2a2a2a', paddingBottom: '8px' }}>No pins yet</div>}
              {filteredPins.map(pin => (
                <div key={pin.id} onClick={() => pin.msgIndex !== undefined && scrollToMessage(pin.msgIndex)}
                  style={{ position: 'relative', padding: '10px 28px 10px 12px', background: '#161616', borderRadius: '8px', marginBottom: '6px', borderLeft: '2px solid #c0392b', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1c1c1c'}
                  onMouseLeave={e => e.currentTarget.style.background = '#161616'}>
                  <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.5' }}>
                    {pin.content?.slice(0, 100)}{pin.content?.length > 100 ? '...' : ''}
                  </div>
                  <button onClick={e => { e.stopPropagation(); deletePin(pin.id) }}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: '16px', padding: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#c0392b'}
                    onMouseLeave={e => e.currentTarget.style.color = '#2a2a2a'}>×</button>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: '10px', color: '#444', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Recent</div>
              {filteredConvos.length === 0 && <div style={{ fontSize: '13px', color: '#2a2a2a' }}>No conversations yet</div>}
              {filteredConvos.map(c => (
                <div key={c.id} onClick={() => loadConversation(c)}
                  style={{ padding: '9px 12px', background: '#161616', borderRadius: '8px', marginBottom: '6px', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1c1c1c'}
                  onMouseLeave={e => e.currentTarget.style.background = '#161616'}>
                  <div style={{ fontSize: '13px', color: '#666' }}>{c.preview}...</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', background: '#0a0a0a', flexShrink: 0 }}>
          <button onClick={() => setPanelOpen(!panelOpen)}
            style={{ background: panelOpen ? '#161616' : 'none', border: '1px solid #1e1e1e', color: '#888', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#c0392b' }}>📌</span>
            <span>{pins.length}</span>
          </button>
          <span style={{ fontWeight: '500', fontSize: '15px', flex: 1 }}>Pinned Chat</span>
          <button onClick={newConversation}
            style={{ background: 'none', border: '1px solid #1e1e1e', color: '#666', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#333'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#1e1e1e'}>
            + New
          </button>
        </div>

        <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px 20px' }}>
          <div style={{ maxWidth: '700px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#252525', marginTop: '80px', fontSize: '14px' }}>
                Start a conversation
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} ref={el => msgRefs.current[i] = el}
                onContextMenu={e => handleContextMenu(e, i)}
                onTouchStart={e => handleTouchStart(e, i)}
                onTouchEnd={handleTouchEnd}
                style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '4px' }}>
                <div style={{
                  maxWidth: isMobile ? '88%' : '75%',
                  padding: '12px 16px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: highlightedMsg === i ? '#1a1500' : (msg.role === 'user' ? '#1c1c1c' : '#141414'),
                  border: `1px solid ${highlightedMsg === i ? '#c0392b66' : (msg.role === 'user' ? '#2a2a2a' : '#1e1e1e')}`,
                  transition: 'background 0.3s, border-color 0.3s',
                  userSelect: 'text'
                }}>
                  {renderMessage(msg.content)}
                </div>
                <div style={{ display: 'flex', gap: '4px', paddingLeft: msg.role === 'user' ? 0 : '4px', paddingRight: msg.role === 'user' ? '4px' : 0 }}>
                  <button
                    onClick={() => pinMessage(msg.content, i)}
                    title="Pin"
                    style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: '13px', padding: '3px 6px', borderRadius: '4px', lineHeight: 1 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#c0392b'}
                    onMouseLeave={e => e.currentTarget.style.color = '#2a2a2a'}
                  >📌</button>
                  <button
                    onClick={() => addTodoManual(msg.content)}
                    title="Add to Todo"
                    style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: '13px', padding: '3px 6px', borderRadius: '4px', lineHeight: 1 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#888'}
                    onMouseLeave={e => e.currentTarget.style.color = '#2a2a2a'}
                  >✅</button>
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 16px', background: '#141414', border: '1px solid #1e1e1e', borderRadius: '18px 18px 18px 4px', color: '#333', fontSize: '18px', letterSpacing: '4px' }}>···</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div style={{ padding: isMobile ? '12px 16px' : '14px 20px', borderTop: '1px solid #1a1a1a', background: '#0a0a0a', flexShrink: 0 }}>
          <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onCompositionStart={() => { isComposing.current = true }}
              onCompositionEnd={() => { isComposing.current = false }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !isComposing.current) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Message..." rows={1}
              style={{ flex: 1, padding: '11px 16px', background: '#111', border: '1px solid #1e1e1e', borderRadius: '12px', color: '#f5f5f5', fontSize: '15px', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: '1.5', maxHeight: '120px', overflowY: 'auto' }}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
            />
            <button onClick={sendMessage} disabled={loading}
              style={{ padding: '11px 16px', background: loading ? '#151515' : '#f5f5f5', border: 'none', borderRadius: '12px', color: loading ? '#333' : '#0a0a0a', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px', fontWeight: '600', flexShrink: 0 }}>↑</button>
          </div>
          <div style={{ maxWidth: '700px', margin: '6px auto 0', fontSize: '11px', color: '#222', textAlign: 'center' }}>
            📌 · ✅ to pin or add todo
          </div>
        </div>
      </div>
    </div>
  )
}