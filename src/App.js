import React, { useState, useEffect } from 'react';
import { HubConnectionBuilder } from '@microsoft/signalr';

function App() {
  const [connection, setConnection] = useState(null);
  const [chat, setChat] = useState([]);
  const [user, setUser] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('Genel');
  const [activeTab, setActiveTab] = useState('rooms');
  const [activeUsers, setActiveUsers] = useState([]);

  // 1. SignalR Bağlantısını Başlat
  useEffect(() => {
    const newConnection = new HubConnectionBuilder()
      .withUrl("https://chatbackend20260722112055-ephrhjg2g0ffbvd4.eastus-01.azurewebsites.net/chatHub")
      .withAutomaticReconnect()
      .build();

    setConnection(newConnection);
  }, []);

  // 2. Dinleyicileri Ekle ve Bağlantıyı Çalıştır
  useEffect(() => {
    if (connection) {

      // DİNLEYİCİLERİ BAĞLANTI BAŞLAMADAN ÖNCE TANIMLIYORUZ (Sinyal kaçırmamak için)
      
      // Grup mesajı geldiğinde
      connection.on('ReceiveGroupMessage', (room, receivedUser, receivedMessage) => {
        setChat(prev => [...prev, { room, user: receivedUser, message: receivedMessage, isPrivate: false }]);
      });

      // Özel mesaj geldiğinde
      connection.on('ReceivePrivateMessage', (senderId, receivedUser, receivedMessage) => {
        setChat(prev => [...prev, { room: senderId, user: receivedUser, message: receivedMessage, isPrivate: true }]);
      });

      // O anki tüm kullanıcı listesi geldiğinde
      connection.on('UserList', (users) => {
        const myId = connection.connectionId;
        // Kendimizi listeden çıkarıp kalan aktif kişileri gösteriyoruz
        const filteredUsers = users.filter(u => u !== myId);
        setActiveUsers(filteredUsers);
      });

      // Yeni biri katıldığında
      connection.on('UserJoined', (newConnectionId) => {
        const myId = connection.connectionId;
        if (newConnectionId !== myId) {
          setActiveUsers(prev => {
            if (!prev.includes(newConnectionId)) {
              return [...prev, newConnectionId];
            }
            return prev;
          });
        }
      });

      // Biri ayrıldığında
      connection.on('UserLeft', (disconnectedId) => {
        setActiveUsers(prev => prev.filter(u => u !== disconnectedId));
        setTarget(currentTarget => currentTarget === disconnectedId ? 'Genel' : currentTarget);
      });

      // BAĞLANTIYI BAŞLAT
      connection.start()
        .then(() => {
          console.log('SignalR Bağlantısı Başarıyla Kuruldu!');

          // Bağlantı kurulduktan sonra odalara katıl
          connection.invoke("JoinRoom", "Genel").catch(err => console.error(err));
          connection.invoke("JoinRoom", "Yazılım").catch(err => console.error(err));
        })
        .catch(error => console.error('Bağlantı hatası: ', error));

      const handleUnload = () => {
        if (connection) {
          connection.stop();
        }
      };

      window.addEventListener("beforeunload", handleUnload);

      return () => {
        window.removeEventListener("beforeunload", handleUnload);
        connection.off('ReceiveGroupMessage');
        connection.off('ReceivePrivateMessage');
        connection.off('UserList');
        connection.off('UserJoined');
        connection.off('UserLeft');
      };
    }
  }, [connection]);

  // Kanal Değiştiğinde Odaya Katılma İsteği Gönder
  const handleSelectTarget = async (selectedTarget) => {
    setTarget(selectedTarget);
    if (connection && connection.state === "Connected") {
      if (selectedTarget === "Genel" || selectedTarget === "Yazılım") {
        try {
          await connection.invoke("JoinRoom", selectedTarget);
        } catch (e) {
          console.error("Odaya katılırken hata oluştu: ", e);
        }
      }
    }
  };

  // Mesaj Gönderme Metodu
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
          await connection.invoke("SendPrivateMessage", target, user, message);
        }
        setMessage(''); 
      } catch (e) {
        console.error("Mesaj gönderim hatası: ", e);
      }
    } else {
      alert("Bağlantı henüz hazır değil!");
    }
  };

  return (
    <div style={styles.container}>
      {/* SOL PANEL */}
      <div style={styles.sidebar}>
        <h2 style={styles.sidebarTitle}>💬 Staj Chat</h2>
        
        <div style={styles.tabContainer}>
          <button 
            style={{...styles.tabBtn, borderBottom: activeTab === 'rooms' ? '2px solid #6366f1' : 'none'}}
            onClick={() => setActiveTab('rooms')}
          >
            Kanallar
          </button>
          <button 
            style={{...styles.tabBtn, borderBottom: activeTab === 'users' ? '2px solid #6366f1' : 'none'}}
            onClick={() => setActiveTab('users')}
          >
            Kişiler ({activeUsers.length})
          </button>
        </div>

        {activeTab === 'rooms' ? (
          <div style={styles.list}>
            {['Genel', 'Yazılım'].map(room => (
              <div 
                key={room} 
                style={{...styles.listItem, backgroundColor: target === room ? '#3730a3' : 'transparent'}}
                onClick={() => handleSelectTarget(room)}
              >
                # {room}
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.list}>
            {activeUsers.length === 0 ? (
              <p style={{color: '#94a3b8', fontSize: '12px', padding: '10px'}}>Aktif başka kullanıcı yok</p>
            ) : (
              activeUsers.map(uId => (
                <div 
                  key={uId} 
                  style={{...styles.listItem, backgroundColor: target === uId ? '#3730a3' : 'transparent'}}
                  onClick={() => handleSelectTarget(uId)}
                >
                  👤 {uId.substring(0, 6)}... (Özel)
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* SAĞ PANEL */}
      <div style={styles.chatArea}>
        <div style={styles.chatHeader}>
          <h3>
            Aktif Sohbet: <span style={{color: '#818cf8'}}>
              {target === 'Genel' || target === 'Yazılım' ? `#${target}` : `👤 Özel (${target.substring(0, 6)}...)`}
            </span>
          </h3>
        </div>

        <div style={styles.messagesContainer}>
          {chat
            .filter(msg => {
              if (target === "Genel" || target === "Yazılım") {
                return msg.room === target && !msg.isPrivate;
              } else {
                return msg.isPrivate && msg.room === target;
              }
            })
            .map((msg, index) => {
              const isMe = msg.user === user;
              return (
                <div key={index} style={{...styles.messageRow, justifyContent: isMe ? 'flex-end' : 'flex-start'}}>
                  <div style={{...styles.bubble, backgroundColor: isMe ? '#4f46e5' : '#334155'}}>
                    <div style={styles.messageUser}>
                      {msg.user} {msg.isPrivate && <span style={{color: '#f87171'}}>(Özel)</span>}
                    </div>
                    <div>{msg.message}</div>
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
            onChange={(e) => setUser(e.target.value)} 
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
  inputArea: { padding: '20px', display: 'flex', gap: '10px', borderTop: '1px solid #334155', backgroundColor: '#1e293b' },
  userNameInput: { width: '120px', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', outline: 'none' },
  messageInput: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', outline: 'none' },
  sendButton: { backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }
};

export default App;