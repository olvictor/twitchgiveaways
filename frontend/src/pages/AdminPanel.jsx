import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

export default function AdminPanel() {
  const { id } = useParams();
  const navigate = useNavigate();

  // --- ESTADOS ---
  const [isOwner, setIsOwner] = useState(false);
  const [channel, setChannel] = useState('');
  
  const [title, setTitle] = useState('Novo Sorteio');
  
  const [minNum, setMinNum] = useState(1);
  const [maxNum, setMaxNum] = useState(50);
  const [command, setCommand] = useState('!numero');
  
  const [itemImage, setItemImage] = useState(''); 
  const [tempImage, setTempImage] = useState('');
  const [imageLocked, setImageLocked] = useState(false);
  const [imageFeedback, setImageFeedback] = useState('');

  const [connected, setConnected] = useState(false);
  const [entries, setEntries] = useState({});
  const [chatLogs, setChatLogs] = useState([]);
  
  const [showModal, setShowModal] = useState(false);
  const [winner, setWinner] = useState(null);
  const [caseItems, setCaseItems] = useState([]);
  const [trackOffset, setTrackOffset] = useState('0px');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const wsTwitch = useRef(null);
  const socketBackend = useRef(null);
  const chatEndRef = useRef(null);
  const entriesRef = useRef({}); 

  const linkPublico = `${window.location.origin}/sorteio/${id}`;

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatLogs]);

  useEffect(() => {
    if (!id || id === 'undefined' || id === 'null') {
      navigate('/');
      return;
    }

    const savedToken = localStorage.getItem('twitch_token');
    
    if (!savedToken) {
      alert("Você precisa fazer login na Twitch para acessar este painel!");
      navigate('/');
      return;
    }

    let loggedUser;
    try {
      const payloadBase64 = savedToken.split('.')[1];
      loggedUser = JSON.parse(atob(payloadBase64));
    } catch (e) {
      localStorage.removeItem('twitch_token');
      navigate('/');
      return;
    }

    socketBackend.current = io('http://localhost:3001');
    socketBackend.current.emit('join_raffle', id);

    fetch(`http://localhost:3001/api/raffles/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Falha na resposta do servidor');
        return res.json();
      })
      .then(data => {
        if (data && !data.error) {
          if (data.channel !== loggedUser.username) {
            alert("Acesso Negado! Você não é o dono deste sorteio.");
            navigate('/');
            return;
          }

          setIsOwner(true);
          setChannel(data.channel);
          
          if (data.title) setTitle(data.title);
          if (data.min_num) setMinNum(data.min_num);
          if (data.max_num) setMaxNum(data.max_num);
          if (data.command) setCommand(data.command);
          
          if (data.item_image) {
            setItemImage(data.item_image);
            setTempImage(data.item_image);
            setImageLocked(true);
          }
          
          if (data.entries) {
            entriesRef.current = data.entries;
            setEntries(data.entries);
          }

          // CORREÇÃO: Restaura o vencedor e garante que a célula dele brilhe
          if (data.winner) {
            setWinner(data.winner);
            setShowResult(true);
          }

        } else {
          alert("Sorteio não encontrado no banco de dados!");
          navigate('/');
        }
      })
      .catch(err => {
        console.error("Erro fatal ao buscar dados iniciais", err);
        alert("Erro de conexão. O sorteio pode não existir mais.");
        navigate('/');
      });

    return () => {
      if (wsTwitch.current) wsTwitch.current.close();
      if (socketBackend.current) socketBackend.current.disconnect();
    };
  }, [id, navigate]);

  const broadcastUpdate = (updatedEntries = entriesRef.current, updatedWinner = winner) => {
    if (socketBackend.current) {
      socketBackend.current.emit('admin_update', {
        id,
        channel,
        title,
        minNum,
        maxNum,
        command,
        itemImage,
        entries: updatedEntries,
        winner: updatedWinner
      });
    }
  };

  useEffect(() => {
    if (isOwner) {
      const timer = setTimeout(() => {
        broadcastUpdate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [title, minNum, maxNum, command, itemImage, isOwner]);

  const handleSaveImage = () => {
    if (tempImage.trim()) {
      setItemImage(tempImage.trim());
      setImageLocked(true);
      setImageFeedback('✓ Imagem salva com sucesso!');
      
      setTimeout(() => setImageFeedback(''), 4000);
    }
  };

  const toggleConnect = () => {
    if (connected) disconnect();
    else connect();
  };

  const connect = () => {
    const channelName = channel.trim().toLowerCase();
    if (!channelName) return;

    entriesRef.current = {};
    setEntries({});
    setChatLogs([]);
    broadcastUpdate({});

    wsTwitch.current = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    wsTwitch.current.onopen = () => {
      wsTwitch.current.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      wsTwitch.current.send('PASS oauth:justintvfanmade');
      wsTwitch.current.send(`NICK justinfan${Math.floor(Math.random() * 99999)}`);
      wsTwitch.current.send(`JOIN #${channelName}`);
      setConnected(true);
    };

    wsTwitch.current.onmessage = (e) => {
      const raw = e.data;
      if (raw.includes('PING')) {
        wsTwitch.current.send('PONG :tmi.twitch.tv');
        return;
      }
      parseMessage(raw);
    };

    wsTwitch.current.onclose = () => setConnected(false);
    wsTwitch.current.onerror = () => {
      alert('Erro de conexão com a Twitch!');
      setConnected(false);
    };
  };

  const disconnect = () => {
    if (wsTwitch.current) {
      wsTwitch.current.close();
      wsTwitch.current = null;
    }
    setConnected(false);
  };

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const parseMessage = (raw) => {
    const lines = raw.split('\r\n');
    lines.forEach((line) => {
      if (!line.includes('PRIVMSG')) return;

      const match = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
      if (!match) return;

      const username = match[1];
      const message = match[2].trim();

      const regex = new RegExp(`^${escapeRegex(command)}\\s+(\\d+)$`, 'i');
      const numMatch = message.match(regex);

      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        registerNumber(username, num);
      } else {
        addChat(username, message, false);
      }
    });
  };

  const registerNumber = (username, number) => {
    const currentEntries = entriesRef.current;
    const min = parseInt(minNum, 10) || 1;
    const max = parseInt(maxNum, 10) || 50;

    if (number < min || number > max) {
      addChat(username, `tentou ${number} (fora do intervalo)`, false);
      return;
    }

    const alreadyTakenByUser = Object.entries(currentEntries).find(
      ([, u]) => u.toLowerCase() === username.toLowerCase()
    );

    if (alreadyTakenByUser) {
      addChat(username, `já escolheu o número ${alreadyTakenByUser[0]}`, false);
      return;
    }

    if (currentEntries[number]) {
      addChat(username, `tentou ${number}, mas já foi escolhido`, false);
      return;
    }

    entriesRef.current = { ...currentEntries, [number]: username };
    setEntries(entriesRef.current);
    addChat(username, `escolheu o número ${number} ✓`, true);
    broadcastUpdate();
  };

  const addChat = (user, text, highlight) => {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setChatLogs((prev) => [...prev, { id: Math.random().toString(), user, text, highlight, time }]);
  };

  const simulateChat = () => {
    const min = parseInt(minNum, 10) || 1;
    const max = parseInt(maxNum, 10) || 50;
    const available = [];
    
    for (let i = min; i <= max; i++) {
      if (!entriesRef.current[i]) available.push(i);
    }
    
    if (available.length === 0) {
      alert("Todos os números já foram escolhidos!");
      return;
    }
    
    const randomNum = available[Math.floor(Math.random() * available.length)];
    const fakeNames = ["gaules", "ninja", "alanzoka", "falleN", "coldzera", "yoda", "mch", "liminha"];
    const randomUser = fakeNames[Math.floor(Math.random() * fakeNames.length)] + Math.floor(Math.random() * 999);
    
    registerNumber(randomUser, randomNum);
  };

  const drawWinner = () => {
    const takenKeys = Object.keys(entries);
    if (takenKeys.length === 0) return;

    const participants = takenKeys.map(num => ({ num: parseInt(num, 10), user: entries[num] }));
    const winnerIdx = Math.floor(Math.random() * participants.length);
    const chosenWinner = participants[winnerIdx];

    const trackLength = 80; 
    const stopIndex = 65;   
    const newTrack = [];

    for (let i = 0; i < trackLength; i++) {
      if (i === stopIndex) {
        newTrack.push(chosenWinner);
      } else {
        const randomItem = participants[Math.floor(Math.random() * participants.length)];
        newTrack.push(randomItem);
      }
    }

    setCaseItems(newTrack);
    setWinner(chosenWinner);
    setShowModal(true);
    setShowResult(false);
    
    setIsTransitioning(false);
    setTrackOffset('0px');

    setTimeout(() => {
      setIsTransitioning(true);
      const offsetCalc = `calc(50% - ${stopIndex * 141 + 70}px)`;
      setTrackOffset(offsetCalc);
      
      broadcastUpdate(entriesRef.current, chosenWinner);
    }, 50);

    setTimeout(() => {
      setShowResult(true);
    }, 4200);
  };

  const closeWinner = () => {
    setShowModal(false);
    // CORREÇÃO: Removido o setWinner(null) para que a tela não "esqueça" o vencedor após fechar o modal.
  };

  const resetRaffle = () => {
    if (!window.confirm('Tem certeza? Todos os números e o vencedor atual serão liberados.')) return;
    entriesRef.current = {};
    setEntries({});
    setShowModal(false);
    setWinner(null);
    setShowResult(false);
    setChatLogs([]);
    broadcastUpdate({}, null); // Transmite o reset (sem vencedor) para o backend
  };

  if (!isOwner) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: 'var(--headline)', fontFamily: 'Inter', fontWeight: 600 }}>Verificando credenciais...</h2>
      </div>
    );
  }

  const minParsed = parseInt(minNum, 10) || 1;
  const maxParsed = parseInt(maxNum, 10) || 50;
  const totalNumbers = maxParsed - minParsed + 1;
  const takenCount = Object.keys(entries).length;
  const freeCount = totalNumbers - takenCount;
  const gridArray = Array.from({ length: totalNumbers > 0 ? totalNumbers : 0 }, (_, i) => minParsed + i);

  return (
    <>
      <header>
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="var(--tertiary)">
            <path d="M4.3 3L3 6.6v14h5V23h3.1l2.5-2.5h3.8l5-5V3H4.3zm15.3 13l-3.1 3h-4.6L9.4 21.5V19H5.5V5h14.1v11z" />
            <path d="M15.5 8h1.8v5h-1.8zm-4.7 0h1.8v5h-1.8z" />
          </svg>
          <span className="logo-text">TWITCH SORTEIO ADMIN</span>
        </div>
        <div className={`status-pill ${connected ? 'connected' : ''}`}>
          <div className="status-dot"></div>
          <span>{connected ? `#${channel}` : 'Desconectado'}</span>
        </div>
      </header>

      <main>
        <div className="panel" style={{ gridColumn: '1 / -1', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ color: 'var(--headline)', marginRight: '10px' }}>Link para Espectadores: </strong>
            <a href={linkPublico} target="_blank" rel="noreferrer" style={{ color: 'var(--paragraph)' }}>{linkPublico}</a>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: '12px' }} onClick={() => navigator.clipboard.writeText(linkPublico)}>
            COPIAR LINK
          </button>
        </div>

        <div className="panel panel-config">
          <div className="panel-header">⚙ Configuração</div>
          <div className="config-body">
            
            <div>
              <label>Título do Sorteio</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                disabled={!!winner} 
                title={winner ? "O sorteio já foi encerrado. Não é possível alterar o título." : ""}
                placeholder="Ex: Sorteio de Fim de Ano"
              />
            </div>

            <div>
              <label>Canal da Twitch</label>
              <input type="text" value={channel} disabled={true} />
            </div>

            <div>
              <label>URL da Imagem do Prêmio (Opcional)</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  placeholder="https://exemplo.com/imagem.png"
                  value={tempImage} 
                  onChange={(e) => setTempImage(e.target.value)} 
                  disabled={imageLocked || connected || takenCount > 0} 
                  title={imageLocked ? "A imagem já foi definida para este sorteio" : ""}
                />
                {!imageLocked && (
                  <button 
                    className="btn btn-success" 
                    style={{ width: 'auto', padding: '0 20px' }}
                    onClick={handleSaveImage}
                    disabled={!tempImage.trim() || connected || takenCount > 0}
                  >
                    SALVAR
                  </button>
                )}
              </div>
              
              {imageFeedback && <div style={{ color: '#0369a1', fontSize: '12px', marginTop: '5px', fontWeight: 'bold' }}>{imageFeedback}</div>}
              {imageLocked && !imageFeedback && <div style={{ color: 'var(--paragraph)', fontSize: '12px', marginTop: '5px' }}>🔒 Imagem do prêmio bloqueada.</div>}
            </div>

            <div className="input-row">
              <div>
                <label>Número Mínimo</label>
                <input 
                  type="number" 
                  value={minNum} 
                  onChange={(e) => setMinNum(e.target.value)} 
                  disabled={connected || takenCount > 0} 
                />
              </div>
              <div>
                <label>Número Máximo</label>
                <input 
                  type="number" 
                  value={maxNum} 
                  onChange={(e) => setMaxNum(e.target.value)} 
                  disabled={connected || takenCount > 0} 
                />
              </div>
            </div>

            <div>
              <label>Comando de Escolha</label>
              <input 
                type="text" 
                value={command} 
                onChange={(e) => setCommand(e.target.value)} 
                disabled={connected || takenCount > 0} 
              />
            </div>

            <button className={`btn ${connected ? 'btn-danger' : 'btn-primary'}`} onClick={toggleConnect} disabled={!!winner}>
              {connected ? '■ DESCONECTAR' : '▶ CONECTAR AO CHAT'}
            </button>

            <div className="divider"></div>

            <button className="btn" onClick={simulateChat} disabled={!!winner} style={{ backgroundColor: '#e5e7eb', color: '#374151' }}>
              🤖 SIMULAR ESPECTADOR
            </button>

            <div className="divider"></div>

            {/* CORREÇÃO: O botão Sortear é desabilitado caso já exista um ganhador */}
            <button className="btn btn-success" onClick={drawWinner} disabled={takenCount === 0 || !!winner} style={{ backgroundColor: '#10b981', color: 'white' }}>
              🎲 SORTEAR VENCEDOR
            </button>
            <button className="btn btn-danger" onClick={resetRaffle}>
              ↺ RESETAR SORTEIO
            </button>
          </div>
        </div>

        <div className="panel panel-grid">
          <div className="panel-header">
            🎯 Números do Sorteio
            <span className="badge">{takenCount} escolhidos</span>
          </div>
          <div className="grid-body">
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e0e0e0' }}>
              <h2 style={{ fontSize: '32px', fontFamily: 'Bebas Neue', color: 'var(--headline)', marginBottom: itemImage ? '15px' : '0', letterSpacing: '1px' }}>
                {title}
              </h2>

              {itemImage && (
                <img 
                  src={itemImage} 
                  alt="Prêmio" 
                  style={{ width: '150px', height: '150px', objectFit: 'contain' }} 
                  onError={(e) => e.target.style.display = 'none'} 
                />
              )}
            </div>

            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-value">{totalNumbers > 0 ? totalNumbers : 0}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{takenCount}</div>
                <div className="stat-label">Escolhidos</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{freeCount > 0 ? freeCount : 0}</div>
                <div className="stat-label">Livres</div>
              </div>
            </div>

            <div id="numbersGrid">
              {gridArray.map((num) => {
                const isTaken = !!entries[num];
                const isWinner = winner?.num === num;
                const cellClass = `num-cell ${isTaken ? 'taken' : ''} ${isWinner && showResult ? 'winner' : ''}`;

                return (
                  <div key={num} className={cellClass} title={isTaken ? `@${entries[num]}` : ''}>
                    <div className="num-value">{num}</div>
                    <div className="num-user">{isTaken ? `@${entries[num]}` : 'livre'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel panel-chat">
          <div className="panel-header">
            💬 Chat ao Vivo
            <span className="badge">{chatLogs.length} msgs</span>
          </div>
          <div id="chatLog">
            {chatLogs.map((msg) => (
              <div key={msg.id} className={`chat-msg ${msg.highlight ? 'highlight' : ''}`}>
                <span className="user">@{msg.user}</span>
                <span className="text">{msg.text}</span>
                <span className="timestamp">{msg.time}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      </main>

      {/* MODAL VENCEDOR CS:GO */}
      {showModal && (
        <div id="winnerModal">
          <div className="winner-card csgo-style">
            
            <div className="case-header">🎁 Abrindo caixa...</div>

            {itemImage && (
              <div style={{ marginBottom: '25px' }}>
                <img 
                  src={itemImage} 
                  alt="Prêmio" 
                  style={{ width: '130px', height: '130px', objectFit: 'contain' }} 
                  onError={(e) => e.target.style.display = 'none'} 
                />
              </div>
            )}

            <div className="case-container">
              <div 
                className="case-track" 
                style={{ 
                  transform: `translateX(${trackOffset})`,
                  transition: isTransitioning ? 'transform 4s cubic-bezier(0.1, 0.7, 0.1, 1)' : 'none'
                }}
              >
                {caseItems.map((item, i) => (
                  <div key={i} className="case-item">
                    {item.num}
                    <span>@{item.user}</span>
                  </div>
                ))}
              </div>
              <div className="case-pointer"></div>
            </div>

            <div className="winner-result" style={{ display: showResult ? 'block' : 'none' }}>
              <div className="winner-crown">👑</div>
              <div className="winner-label" style={{ fontWeight: '600', color: 'var(--paragraph)', marginBottom: '10px' }}>Vencedor do Sorteio</div>
              <div className="winner-number">{winner?.num}</div>
              <div className="winner-name">@{winner?.user}</div>
              <div className="winner-sub" style={{ fontSize: '14px', color: 'var(--paragraph)', marginBottom: '20px' }}>Número escolhido por @{winner?.user}</div>
              
              <button className="btn btn-primary" onClick={closeWinner} style={{ width: 'auto', padding: '12px 30px', margin: '0 auto' }}>
                FECHAR
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}