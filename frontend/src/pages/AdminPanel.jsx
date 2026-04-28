import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import AdBlock from '../components/AdBlock';

export default function AdminPanel() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [isOwner, setIsOwner] = useState(false);
  const [channel, setChannel] = useState('');
  const [title, setTitle] = useState('Novo Sorteio');
  const [minNum, setMinNum] = useState(1);
  const [maxNum, setMaxNum] = useState(50);
  const [command, setCommand] = useState('!numero');
  
  const [itemImage, setItemImage] = useState(''); 
  
  const [targetAudience, setTargetAudience] = useState('all'); 
  const [subMultiplier, setSubMultiplier] = useState(2);
  const [subList, setSubList] = useState([]);

  const [connected, setConnected] = useState(false);
  const [entries, setEntries] = useState({});
  const [chatLogs, setChatLogs] = useState([]);
  
  const [showModal, setShowModal] = useState(false);
  const [winner, setWinner] = useState(null);
  const [caseItems, setCaseItems] = useState([]);
  const [trackOffset, setTrackOffset] = useState('0px');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false); 
  const [showResult, setShowResult] = useState(false);

  const wsTwitch = useRef(null);
  const socketBackend = useRef(null);
  const chatEndRef = useRef(null);
  const entriesRef = useRef({}); 
  const subListRef = useRef([]);
  const videoRef = useRef(null); 

  const linkPublico = `${window.location.origin}/sorteio/${id}`;

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs]);

  const parseSeguro = (valor, valorPadrao) => {
    if (!valor || valor === 'null') return valorPadrao;
    if (typeof valor === 'string') {
      try { return JSON.parse(valor); } catch (e) { return valorPadrao; }
    }
    return valor;
  };

  useEffect(() => {
    if (!id || id === 'undefined' || id === 'null') { navigate('/'); return; }
    const savedToken = localStorage.getItem('twitch_token');
    if (!savedToken) { alert("Você precisa logar!"); navigate('/'); return; }
    
    let loggedUser;
    try {
      const payloadBase64 = savedToken.split('.')[1];
      loggedUser = JSON.parse(atob(payloadBase64));
    } catch (e) { navigate('/'); return; }

    socketBackend.current = io('http://localhost:3001');
    socketBackend.current.emit('join_raffle', id);

    fetch(`http://localhost:3001/api/raffles/${id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && !data.error) {
          if (data.channel !== loggedUser.username) { alert("Acesso Negado!"); navigate('/'); return; }
          setIsOwner(true);
          setChannel(data.channel);
          
          if (data.title) setTitle(data.title);
          if (data.min_num) setMinNum(data.min_num);
          if (data.max_num) setMaxNum(data.max_num);
          if (data.command) setCommand(data.command);
          if (data.item_image) setItemImage(data.item_image);
          if (data.target_audience) setTargetAudience(data.target_audience);
          if (data.sub_multiplier) setSubMultiplier(data.sub_multiplier);
          
          const entradasSeguras = parseSeguro(data.entries, {});
          entriesRef.current = entradasSeguras; 
          setEntries(entradasSeguras); 
          
          const subsSeguros = parseSeguro(data.sub_list, []);
          subListRef.current = subsSeguros; 
          setSubList(subsSeguros); 
          
          const vencedorSeguro = parseSeguro(data.winner, null);
          setWinner(vencedorSeguro); 
          if (vencedorSeguro) setShowResult(true); 
        }
      });

    return () => {
      if (wsTwitch.current) wsTwitch.current.close();
      if (socketBackend.current) socketBackend.current.disconnect();
    };
  }, [id, navigate]);

  const broadcastUpdate = (updatedEntries = entriesRef.current, updatedWinner = winner, updatedSubList = subListRef.current) => {
    if (socketBackend.current) {
      socketBackend.current.emit('admin_update', {
        id, channel, title, minNum, maxNum, command, itemImage, entries: updatedEntries, winner: updatedWinner,
        targetAudience, subMultiplier, subList: updatedSubList
      });
    }
  };

  useEffect(() => {
    if (isOwner) {
      const timer = setTimeout(() => broadcastUpdate(), 500);
      return () => clearTimeout(timer);
    }
  }, [title, minNum, maxNum, command, itemImage, targetAudience, subMultiplier, isOwner]);

  const toggleConnect = () => connected ? disconnect() : connect();

  const connect = () => {
    const channelName = channel.trim().toLowerCase();
    if (!channelName) return;
    entriesRef.current = {}; setEntries({}); setChatLogs([]); subListRef.current = []; setSubList([]);
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
      if (raw.includes('PING')) return wsTwitch.current.send('PONG :tmi.twitch.tv');
      parseMessage(raw);
    };
    wsTwitch.current.onclose = () => setConnected(false);
  };

  const disconnect = () => {
    if (wsTwitch.current) { wsTwitch.current.close(); wsTwitch.current = null; }
    setConnected(false);
  };

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const parseMessage = (raw) => {
    const lines = raw.split('\r\n');
    lines.forEach((line) => {
      if (!line.includes('PRIVMSG')) return;
      
      const match = line.match(/^(?:@([^ ]+) )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
      if (!match) return;

      const tags = match[1] || '';
      const username = match[2];
      const message = match[3].trim();

      const isSub = tags.includes('subscriber=1') || tags.includes('badges=broadcaster') || tags.includes('badges=vip');

      const regex = new RegExp(`^${escapeRegex(command)}\\s+(\\d+)$`, 'i');
      const numMatch = message.match(regex);
      
      if (numMatch) {
        registerNumber(username, parseInt(numMatch[1], 10), isSub);
      } else {
        addChat(username, message, false);
      }
    });
  };

  const registerNumber = (username, number, isSub = false) => {
    const currentEntries = entriesRef.current;
    const min = parseInt(minNum, 10) || 1, max = parseInt(maxNum, 10) || 50;

    if (targetAudience === 'subs' && !isSub) return addChat(username, `tentou ${number} ❌ (Apenas Subs)`, false);
    if (number < min || number > max) return addChat(username, `tentou ${number} (fora do intervalo)`, false);
    
    const alreadyTakenByUser = Object.entries(currentEntries).find(([, u]) => u.toLowerCase() === username.toLowerCase());
    if (alreadyTakenByUser) return addChat(username, `já escolheu ${alreadyTakenByUser[0]}`, false);
    if (currentEntries[number]) return addChat(username, `tentou ${number}, mas já foi escolhido`, false);

    entriesRef.current = { ...currentEntries, [number]: username };
    setEntries(entriesRef.current);
    
    if (isSub && !subListRef.current.includes(username)) {
      subListRef.current = [...subListRef.current, username];
      setSubList(subListRef.current);
    }

    addChat(username, `escolheu o número ${number} ✓ ${isSub ? '🌟 (SUB)' : ''}`, true);
    broadcastUpdate();
  };

  const addChat = (user, text, highlight) => {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setChatLogs((prev) => [...prev, { id: Math.random().toString(), user, text, highlight, time }]);
  };

  const simulateChat = () => {
    const min = parseInt(minNum, 10) || 1, max = parseInt(maxNum, 10) || 50;
    const available = [];
    for (let i = min; i <= max; i++) if (!entriesRef.current[i]) available.push(i);
    if (available.length === 0) return alert("Sorteio cheio!");
    
    const randomNum = available[Math.floor(Math.random() * available.length)];
    const fakeNames = ["gaules", "ninja", "alanzoka", "falleN", "coldzera", "yoda", "mch", "liminha"];
    const randomUser = fakeNames[Math.floor(Math.random() * fakeNames.length)] + Math.floor(Math.random() * 999);
    const fakeSubStatus = Math.random() > 0.5; 
    
    registerNumber(randomUser, randomNum, fakeSubStatus);
  };

  const drawWinner = () => {
    const seguras = typeof entries === 'object' && entries !== null ? entries : {};
    const takenKeys = Object.keys(seguras);
    if (takenKeys.length === 0) return;
    
    const participants = takenKeys.map(num => ({ num: parseInt(num, 10), user: seguras[num] }));
    const drawPool = [];

    participants.forEach(p => {
      const isUserSub = subList.includes(p.user);
      let tickets = 1;
      if (targetAudience === 'sub_bonus' && isUserSub) {
        tickets = parseInt(subMultiplier, 10) || 2;
      }
      for (let i = 0; i < tickets; i++) drawPool.push(p); 
    });

    const winnerIdx = Math.floor(Math.random() * drawPool.length);
    const chosenWinner = drawPool[winnerIdx];
    
    const trackLength = 120, stopIndex = 100;   
    const newTrack = [];
    for (let i = 0; i < trackLength; i++) {
      if (i === stopIndex) newTrack.push(chosenWinner);
      else newTrack.push(participants[Math.floor(Math.random() * participants.length)]);
    }

    setCaseItems(newTrack);
    setWinner(chosenWinner);
    setShowModal(true);
    setShowResult(false);
    setIsTransitioning(false);
    setIsSpinning(false);
    setTrackOffset('0px');
    
    setTimeout(() => {
      setIsTransitioning(true); setIsSpinning(true); 
      const offsetCalc = `calc(50% - ${stopIndex * 141 + 70}px)`;
      setTrackOffset(offsetCalc);
      broadcastUpdate(entriesRef.current, chosenWinner);

      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
    }, 50);

    setTimeout(() => { setIsSpinning(false); setShowResult(true); }, 13000);
  };

  const resetRaffle = () => {
    if (!window.confirm('Tem certeza? Todos os números serão limpos.')) return;
    entriesRef.current = {}; setEntries({}); subListRef.current = []; setSubList([]);
    setShowModal(false); setWinner(null); setShowResult(false); setChatLogs([]);
    broadcastUpdate({}, null, []);
  };

  if (!isOwner) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}><h2 style={{ color: 'var(--headline)' }}>Verificando credenciais...</h2></div>;

  const minParsed = parseInt(minNum, 10) || 1, maxParsed = parseInt(maxNum, 10) || 50;
  
  const segurasContagem = typeof entries === 'object' && entries !== null ? entries : {};
  const totalNumbers = maxParsed - minParsed + 1;
  const takenCount = Object.keys(segurasContagem).length;
  
  const gridArray = Array.from({ length: totalNumbers > 0 ? totalNumbers : 0 }, (_, i) => minParsed + i);

  // CSS dinâmico para o Select (Fica cinza se estiver conectado)
  const selectStyle = {
    width: '100%', 
    padding: '14px', 
    backgroundColor: connected ? '#f5f5f5' : 'var(--secondary)', 
    border: '1px solid #dcdcdc', 
    borderRadius: '8px', 
    color: connected ? '#9ca3af' : 'var(--headline)', 
    fontWeight: '600', 
    fontFamily: 'Inter', 
    outline: 'none',
    cursor: connected ? 'not-allowed' : 'pointer',
    appearance: 'auto'
  };

  return (
    <div className="layout-container">
      <aside className="ad-sidebar"><AdBlock slot="ADS_ESQUERDA" /></aside>

      <div className="app-content">
        <header>
          <div className="logo"><span className="logo-text">TWITCH SORTEIO ADMIN</span></div>
          <div className={`status-pill ${connected ? 'connected' : ''}`}>
            <div className="status-dot"></div><span>{connected ? `#${channel}` : 'Desconectado'}</span>
          </div>
        </header>

        <main>
          <div className="panel full-width-panel" style={{ padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><strong style={{ color: 'var(--headline)' }}>Link Público: </strong><a href={linkPublico} target="_blank" rel="noreferrer" style={{ color: 'var(--paragraph)' }}>{linkPublico}</a></div>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: '12px' }} onClick={() => navigator.clipboard.writeText(linkPublico)}>COPIAR LINK</button>
          </div>

          <div className="panel panel-config">
            <div className="panel-header">⚙ Configuração</div>
            <div className="config-body">
              <div><label>Título</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              
              <div className="divider" style={{ margin: '5px 0' }}></div>
              <div>
                <label style={{ color: 'var(--highlight)' }}>👑 Quem pode participar?</label>
                <select 
                  value={targetAudience} 
                  onChange={(e) => setTargetAudience(e.target.value)} 
                  style={selectStyle}
                  disabled={connected} // TRAVADO DURANTE O CHAT
                >
                  <option value="all">Todos (Livres)</option>
                  <option value="subs">Somente Inscritos (Subs)</option>
                  <option value="sub_bonus">Bônus Multiplicador para Subs</option>
                </select>
              </div>

              {targetAudience === 'sub_bonus' && (
                <div style={{ backgroundColor: '#fff0e6', padding: '15px', borderRadius: '8px', border: '1px solid #ffb17a' }}>
                  <label style={{ color: '#b1561c', marginBottom: '8px' }}>🚀 Multiplicador de Chances (Subs)</label>
                  <input type="number" min="2" max="100" value={subMultiplier} onChange={(e) => setSubMultiplier(e.target.value)} placeholder="Ex: 3" disabled={connected} />
                  <div style={{ fontSize: '11px', color: '#b1561c', marginTop: '8px', fontWeight: '500' }}>Subs terão seu número multiplicado na urna de sorteio.</div>
                </div>
              )}
              <div className="divider" style={{ margin: '5px 0' }}></div>

              <div>
                <label>Link da Imagem do Prêmio (Opcional)</label>
                <input 
                  type="text" 
                  placeholder="https://exemplo.com/imagem.png"
                  value={itemImage} 
                  onChange={(e) => setItemImage(e.target.value)} 
                  disabled={connected} // TRAVADO DURANTE O CHAT
                />
              </div>

              <div className="input-row">
                <div><label>Mín</label><input type="number" value={minNum} onChange={(e) => setMinNum(e.target.value)} disabled={connected} /></div>
                <div><label>Máx</label><input type="number" value={maxNum} onChange={(e) => setMaxNum(e.target.value)} disabled={connected} /></div>
              </div>
              <div><label>Comando</label><input type="text" value={command} onChange={(e) => setCommand(e.target.value)} /></div>
              
              <button className={`btn ${connected ? 'btn-danger' : 'btn-primary'}`} onClick={toggleConnect}>{connected ? '■ DESCONECTAR' : '▶ CONECTAR'}</button>
              <div className="divider"></div>
              <button className="btn" onClick={simulateChat} style={{ backgroundColor: '#e5e7eb', color: '#374151' }}>🤖 SIMULAR</button>
              <div className="divider"></div>
              
              <button className="btn btn-success" onClick={drawWinner} disabled={takenCount === 0} style={{ backgroundColor: '#10b981', color: 'white' }}>🎲 SORTEAR</button>
              <button className="btn btn-danger" onClick={resetRaffle}>↺ RESETAR</button>
            </div>
          </div>

          <div className="panel panel-grid">
            {itemImage && (
              <div style={{ width: '100%', padding: '25px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'center', boxSizing: 'border-box' }}>
                <img src={itemImage} alt="Prêmio" style={{ maxHeight: '220px', maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))' }} />
              </div>
            )}

            <div className="panel-header">🎯 Números do Sorteio <span className="badge">{takenCount} escolhidos</span></div>
            <div className="grid-body">
              {targetAudience === 'subs' && <div style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '10px', borderRadius: '8px', textAlign: 'center', fontWeight: '700', fontSize: '13px', marginBottom: '10px' }}>🔒 ESTE SORTEIO É EXCLUSIVO PARA INSCRITOS (SUBS)</div>}
              {targetAudience === 'sub_bonus' && <div style={{ backgroundColor: '#fce7f3', color: '#be185d', padding: '10px', borderRadius: '8px', textAlign: 'center', fontWeight: '700', fontSize: '13px', marginBottom: '10px' }}>🎁 SUBS TÊM {subMultiplier}X MAIS CHANCES DE GANHAR!</div>}

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '38px', fontFamily: 'Bebas Neue', color: 'var(--headline)', letterSpacing: '1px' }}>{title}</h2>
              </div>

              <div id="numbersGrid">
                {gridArray.map((num) => {
                  const isTaken = !!entries[num], isWinner = winner?.num === num;
                  const userSubBadge = isTaken && subList.includes(entries[num]) ? '🌟 ' : '';
                  return (
                    <div key={num} className={`num-cell ${isTaken ? 'taken' : ''} ${isWinner && showResult ? 'winner' : ''}`}>
                      <div className="num-value">{num}</div><div className="num-user">{isTaken ? `${userSubBadge}@${entries[num]}` : 'livre'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="panel panel-chat">
            <div className="panel-header">💬 Chat ao Vivo <span className="badge">{chatLogs.length} msgs</span></div>
            <div id="chatLog">
              {chatLogs.map((msg) => (
                <div key={msg.id} className={`chat-msg ${msg.highlight ? 'highlight' : ''}`}><span className="user">@{msg.user}</span><span className="text">{msg.text}</span></div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

        </main>
      </div>
      <aside className="ad-sidebar"><AdBlock slot="ADS_DIREITA" /></aside>

      {showModal && (
        <div id="winnerModal">
          <div className="winner-card">
            
            <video ref={videoRef} className="modal-video" src="/caramelo.mp4" playsInline={true} />

            <div className="case-header">🎁 Abrindo caixa...</div>
            <div className="case-container">
              <div className={`case-track ${showResult ? 'finished' : ''}`} style={{ transform: `translateX(${trackOffset})`, transition: isTransitioning ? 'transform 13s cubic-bezier(0.1, 0, 0.1, 1)' : 'none' }}>
                {caseItems.map((item, i) => (
                  <div key={i} className={`case-item ${showResult && i === 100 ? 'winner-item' : ''}`}>{item.num}<span>@{item.user}</span></div>
                ))}
              </div>
              <div className={`case-pointer ${isSpinning ? 'ticking' : ''}`}></div>
            </div>
            {showResult && (
              <div className="winner-result">
                <div className="winner-crown">👑</div>
                <div className="winner-number">{winner?.num}</div>
                <div className="winner-name">@{winner?.user}</div>
                <button className="btn btn-primary" onClick={() => setShowModal(false)} style={{ width: 'auto', padding: '12px 30px' }}>FECHAR</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}