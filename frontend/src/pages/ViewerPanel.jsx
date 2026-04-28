import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import AdBlock from '../components/AdBlock';

export default function ViewerPanel() {
  const { id } = useParams();
  
  // Dados do Sorteio
  const [channel, setChannel] = useState('');
  const [title, setTitle] = useState('Sorteio');
  const [minNum, setMinNum] = useState(1);
  const [maxNum, setMaxNum] = useState(50);
  const [entries, setEntries] = useState({});
  const [itemImage, setItemImage] = useState('');
  const [targetAudience, setTargetAudience] = useState('all');
  const [subMultiplier, setSubMultiplier] = useState(2);
  const [subList, setSubList] = useState([]);
  
  // Chat
  const [chatLogs, setChatLogs] = useState([]);
  
  // Roleta e Modal
  const [showModal, setShowModal] = useState(false);
  const [winner, setWinner] = useState(null);
  const [caseItems, setCaseItems] = useState([]);
  const [trackOffset, setTrackOffset] = useState('0px');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const isModalOpenRef = useRef(false);
  const wsTwitch = useRef(null);
  const chatEndRef = useRef(null);
  const videoRef = useRef(null); // Ref para o vídeo de fundo

  // Scroll automático do chat
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs]);

  useEffect(() => {
    isModalOpenRef.current = showModal;
  }, [showModal]);

  const parseSeguro = (v, d) => (v && v !== 'null') ? (typeof v === 'string' ? JSON.parse(v) : v) : d;

  // CONEXÃO COM O BACKEND (Para dados do sorteio)
  useEffect(() => {
    const socket = io('http://localhost:3001');
    socket.emit('join_raffle', id);

    const updateUI = (data) => {
      if (data.channel) setChannel(data.channel);
      setTitle(data.title || 'Sorteio');
      setMinNum(data.minNum || data.min_num || 1);
      setMaxNum(data.maxNum || data.max_num || 50);
      setItemImage(data.itemImage || data.item_image || '');
      setTargetAudience(data.targetAudience || data.target_audience || 'all');
      setSubMultiplier(data.subMultiplier || data.sub_multiplier || 2);
      
      const ent = parseSeguro(data.entries, {});
      setEntries(ent);
      const sl = parseSeguro(data.subList || data.sub_list, []);
      setSubList(sl);
      
      const win = parseSeguro(data.winner, null);
      if (win && !isModalOpenRef.current) {
        triggerRoulette(ent, win);
      } else if (!win) {
        setShowModal(false);
        setWinner(null);
      }
    };

    fetch(`http://localhost:3001/api/raffles/${id}`).then(r => r.json()).then(updateUI);
    socket.on('viewer_update', updateUI);
    return () => socket.disconnect();
  }, [id]);

  // CONEXÃO COM A TWITCH (Para exibir o Chat ao vivo)
  useEffect(() => {
    if (!channel) return;

    wsTwitch.current = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    wsTwitch.current.onopen = () => {
      wsTwitch.current.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      wsTwitch.current.send('PASS oauth:justintvfanmade'); // Login anônimo
      wsTwitch.current.send(`NICK justinfan${Math.floor(Math.random() * 99999)}`);
      wsTwitch.current.send(`JOIN #${channel.toLowerCase()}`);
    };

    wsTwitch.current.onmessage = (e) => {
      const raw = e.data;
      if (raw.includes('PING')) return wsTwitch.current.send('PONG :tmi.twitch.tv');
      
      const lines = raw.split('\r\n');
      lines.forEach((line) => {
        if (!line.includes('PRIVMSG')) return;
        const match = line.match(/^(?:@([^ ]+) )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
        if (!match) return;
        
        const user = match[2];
        const text = match[3].trim();
        
        setChatLogs((prev) => {
          const newLogs = [...prev, { id: Math.random().toString(), user, text }];
          return newLogs.length > 100 ? newLogs.slice(newLogs.length - 100) : newLogs;
        });
      });
    };

    return () => {
      if (wsTwitch.current) wsTwitch.current.close();
    };
  }, [channel]);

  const triggerRoulette = (ent, win) => {
    isModalOpenRef.current = true;
    const p = Object.keys(ent).map(n => ({ num: parseInt(n, 10), user: ent[n] }));
    
    // Aumentado para 120 para aguentar 13 segundos girando
    const track = Array.from({length: 120}, () => p[Math.floor(Math.random()*p.length)]);
    track[100] = win;
    
    setCaseItems(track); setWinner(win); setShowModal(true); setShowResult(false); setIsTransitioning(false); setIsSpinning(false);
    
    setTimeout(() => { 
      setIsTransitioning(true); 
      setIsSpinning(true);
      setTrackOffset(`calc(50% - ${100 * 141 + 70}px)`); 

      // Dá o Play no Caramelo
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(e => console.log("Autoplay bloqueado pelo navegador", e));
      }
    }, 50);

    // Revela o resultado exatamente aos 13s
    setTimeout(() => { setIsSpinning(false); setShowResult(true); }, 13000);
  };

  const minParsed = parseInt(minNum, 10) || 1, maxParsed = parseInt(maxNum, 10) || 50;
  const segurasContagem = typeof entries === 'object' && entries !== null ? entries : {};
  const totalNumbers = maxParsed - minParsed + 1;
  const takenCount = Object.keys(segurasContagem).length;
  const gridArray = Array.from({ length: totalNumbers > 0 ? totalNumbers : 0 }, (_, i) => minParsed + i);

  return (
    <div className="layout-container">
      <aside className="ad-sidebar"><AdBlock slot="ADS_ESQUERDA" /></aside>

      <div className="app-content">
        <header style={{ justifyContent: 'center' }}>
          <div className="logo"><span className="logo-text">ACOMPANHANDO SORTEIO AO VIVO</span></div>
        </header>

        <main style={{ maxWidth: '1400px', margin: '0 auto' }}>
          
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
            <div className="panel-header">💬 Chat ao Vivo</div>
            <div id="chatLog">
              {chatLogs.map((msg) => (
                <div key={msg.id} className="chat-msg">
                  <span className="user">@{msg.user}</span>
                  <span className="text">{msg.text}</span>
                </div>
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
            
            {/* VÍDEO DO SORTEIO NA ABERTURA AQUI TAMBÉM */}
            <video ref={videoRef} className="modal-video" src="/caramelo.mp4"  playsInline={true} />

            <div className="case-header">🎁 Abrindo caixa...</div>
            <div className="case-container">
              {/* O TEMPO DE ANIMAÇÃO 13s */}
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}