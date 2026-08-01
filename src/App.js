import React, { useState, useEffect, useRef } from 'react';
import { HubConnectionBuilder } from '@microsoft/signalr';

const BACKEND_URL = "https://chatbackend20260722112055-ephrhjg2g0ffbvd4.eastus-01.azurewebsites.net";

function App() {
  const [connection, setConnection] = useState(null);
  const [chat, setChat] = useState([]);
  const [user, setUser] = useState(() => sessionStorage.getItem('chatUsername') || '');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('Genel');
  const [activeTab, setActiveTab] = useState('rooms');
  const [activeUsers, setActiveUsers] = useState([]); // [{connectionId, username}]

  // en güncel username'i bağlantı callback'leri içinde okuyabilmek için ref
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // 1. Bağlantıyı kur ve geçmişi çek (tek seferlik)
  useEffect(() => {
    const newConnection = new HubConnectionBuilder()
      .withUrl(`${BACKEND_URL}/chatHub`)
      .withAutomaticReconnect()
      .build();

    setConnection(newConnection);

    fetch(`${BACKEND_URL}/api/Messages`)
      .then(res => res.json())
      .then(data => {
        const formatted = data.map(m => ({
          id: m.id,
          room: m.room,
          user: m.username,
          targetUsername: m.targetUsername,
          message: m.content,
          isPrivate: m.isPrivate
        }));
        setChat(formatted);
      })
      .catch(err => console.error("Geçmiş mesajlar çekilemedi:", err));
  }, []);

  // 2. Dinleyicileri kur, bağlantıyı başlat
  useEffect(() => {
    if (!connection) return;

    connection.on('ReceiveGroupMessage', (room, receivedUser, receivedMessage, id) => {
      setChat(prev => [...prev, { id, room, user: receivedUser, message: receivedMessage, isPrivate: false }]);
    });

    connection.on('ReceivePrivateMessage', (senderUsername, targetUsername, receivedMessage, id) => {
      setChat(prev => [...prev, { id, user: senderUsername, targetUsername, message: receivedMessage, isPrivate: true }]);
    });

    connection.on('UserList', (users) => {
      setActiveUsers(users);
    });

    connection.start()
      .then(() => {
        connection.invoke("JoinRoom", "Genel").catch(err => console.error(err));
        connection.invoke("JoinRoom", "Yazılım").catch(err => console.error(err));
        if (userRef.current.trim()) {
          connection.invoke("RegisterUser", userRef.current).catch(err => console.error(err));
        }
      })
      .catch(error => console.error('Bağlantı hatası: ', error));

    const handleUnload = () => connection.stop();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      connection.off('ReceiveGroupMessage');
      connection.off('ReceivePrivateMessage');
      connection.off('UserList');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  const handleUsernameChange = (e) => {
    setUser(e.target.value);
  };

  const handleUsernameBlur = () => {
    sessionStorage.setItem('chatUsername', user);
    if (connection && connection.state === "Connected" && user.trim()) {
      connection.invoke("RegisterUser", user).catch(err => console.error("RegisterUser hatası:", err));
    }
  };

  const handleSend = async () => {
    if (!user.trim() || !message.trim()) {
      alert("Lütfen adınızı ve mesajınızı yazın!");
      return;
    }

    if (connection && connection.state === "Connected") {
      try {
        if (target === "Genel" || target === "Yazılım") {
          await connection.invoke("SendMessageToGroup", target, user, message);
        } else {
          const targetUser = activeUsers.find(u => u.username === target);
          await connection.invoke(
            "SendPrivateMessage",
            targetUser ? targetUser.connectionId : "",
            target,
            user,
            message
          );
        }
        setMessage('');
      } catch (e) {
        console.error("Mesaj gönderim hatası: ", e);
      }
    } else {
      alert("Bağlantı henüz hazır değil!");
    }
  };

  const handleDelete = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/Messages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setChat(prev => prev.filter(m => m.id !== id));
      }
    } catch (e) {
      console.error("Silme hatası:", e);
    }
  };

  // Sohbette görünen kişiler: aktif bağlı kullanıcılar + geçmişte özel mesajlaşılmış herkes
  const knownPrivateUsernames = Array.from(new Set(
    chat
      .filter(m => m.isPrivate)
      .flatMap(m => [m.user, m.targetUsername])
      .filter(name => name && name !== user)
  ));

  const peopleList = Array.from(new Set([
    ...activeUsers.map(u => u.username).filter(Boolean),
    ...knownPrivateUsernames
  ])).filter(name => name !== user);

  const filteredChat = chat.filter(msg => {
    if (target === "Genel" || target === "Yazılım") {
      return !msg.isPrivate && msg.room === target;
    } else {
      return msg.isPrivate && (
        (msg.user === user && msg.targetUsername === target) ||
        (msg.user === target && msg.targetUsername === user)
      );
    }
  });

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <h2 style={styles.sidebarTitle}>💬 Staj Chat</h2>

        <div style={styles.tabContainer}>
          <button
            style={{ ...styles.tabBtn, borderBottom: activeTab === 'rooms' ? '2px solid #6366f1' : 'none' }}
            onClick={() => setActiveTab('rooms')}
          >
            Kanallar
          </button>
          <button
            style={{ ...styles.tabBtn, borderBottom: activeTab === 'users' ? '2px solid #6366f1' : 'none' }}
            onClick={() => setActiveTab('users')}
          >
            Kişiler ({peopleList.length})
          </button>
        </div>

        {activeTab === 'rooms' ? (
          <div style={styles.list}>
            {['Genel', 'Yazılım'].map(room => (
              <div
                key={room}
                style={{ ...styles.listItem, backgroundColor: target === room ? '#3730a3' : 'transparent' }}
                onClick={() => setTarget(room)}
              >
                # {room}
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.list}>
            {peopleList.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '12px', padding: '10px' }}>
                Henüz kimseyle özel mesajlaşmadınız ya da aktif başka kullanıcı yok
              </p>
            ) : (
              peopleList.map(name => (
                <div
                  key={name}
                  style={{ ...styles.listItem, backgroundColor: target === name ? '#3730a3' : 'transparent' }}
                  onClick={() => setTarget(name)}
                >
                  👤 {name}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div style={styles.chatArea}>
        <div style={styles.chatHeader}>
          <h3>
            Aktif Sohbet:{' '}
            <span style={{ color: '#818cf8' }}>
              {target === 'Genel' || target === 'Yazılım' ? `#${target}` : `👤 Özel (${target})`}
            </span>
          </h3>
        </div>

        <div style={styles.messagesContainer}>
          {filteredChat.map((msg, index) => {
            const isMe = msg.user === user;
            return (
              <div key={msg.id ?? index} style={{ ...styles.messageRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...styles.bubble, backgroundColor: isMe ? '#4f46e5' : '#334155', position: 'relative' }}>
                  <div style={styles.messageUser}>
                    {msg.user} {msg.isPrivate && <span style={{ color: '#f87171' }}>(Özel)</span>}
                  </div>
                  <div>{msg.message}</div>
                  {msg.id && (
                    <button onClick={() => handleDelete(msg.id)} style={styles.deleteBtn} title="Mesajı sil">
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.inputArea}>
          <input
            type="text"
            placeholder="Adınız..."
            value={user}
            onChange={handleUsernameChange}
            onBlur={handleUsernameBlur}
            style={styles.userNameInput}
          />
          <input
            type="text"
            placeholder={`${target} odasına yazın...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={styles.messageInput}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />
          <button onClick={handleSend} style={styles.sendButton}>Gönder</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' },
  sidebar: { width: '260px', backgroundColor: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' },
  sidebarTitle: { padding: '20px', fontSize: '20px', borderBottom: '1px solid #334155', margin: 0 },
  tabContainer: { display: 'flex', borderBottom: '1px solid #334155' },
  tabBtn: { flex: 1, backgroundColor: 'transparent', border: 'none', color: '#f8fafc', padding: '12px', cursor: 'pointer', fontWeight: 'bold' },
  list: { flex: 1, padding: '10px', overflowY: 'auto' },
  listItem: { padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '5px', transition: '0.2s', fontSize: '15px' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' },
  chatHeader: { padding: '20px', borderBottom: '1px solid #334155', margin: 0 },
  messagesContainer: { flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' },
  messageRow: { display: 'flex', width: '100%' },
  bubble: { maxWidth: '60%', padding: '10px 15px', borderRadius: '12px', color: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  messageUser: { fontSize: '12px', color: '#94a3b8', marginBottom: '4px', fontWeight: 'bold' },
  deleteBtn: { position: 'absolute', top: '-10px', right: '-10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontSize: '12px', lineHeight: '1' },
  inputArea: { padding: '20px', display: 'flex', gap: '10px', borderTop: '1px solid #334155', backgroundColor: '#1e293b' },
  userNameInput: { width: '120px', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', outline: 'none' },
  messageInput: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', outline: 'none' },
  sendButton: { backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }
};

export default App;
