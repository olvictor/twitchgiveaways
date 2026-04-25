import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';

export default function ViewerPanel() {
  const { id } = useParams();

  // --- ESTADOS ---
  const [minNum, setMinNum] = useState(1);
  const [maxNum, setMaxNum] = useState(50);
  const [entries, setEntries] = useState({});
  const [itemImage, setItemImage] = useState('');
  
  // Estados da Roleta
  const [showModal, setShowModal] = useState(false);
  const [winner, setWinner] = useState(null);
  const [caseItems, setCaseItems] = useState([]);
  const [trackOffset, setTrackOffset] = useState('0px');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const isModalOpenRef = useRef(false);
  
  useEffect(() => {
    isModalOpenRef.current = showModal;
  }, [showModal]);

  useEffect(() => {
    const socket = io('http://localhost:3001');
    socket.emit('join_raffle', id);

    fetch(`http://localhost:3001/api/raffles/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          if (data.min_num) setMinNum(data.min_num);
          if (data.max_num) setMaxNum(data.max_num);
          if (data.item_image) setItemImage(data.item_image);
          if (data.entries) setEntries(data.entries);
          
          if (data.winner && !isModalOpenRef.current) {
            triggerRoulette(data.entries, data.winner);
          }
        }
      })
      .catch(err => console.error("Erro ao buscar dados do espectador", err));

    socket.on('viewer_update', (data) => {
      if (data.minNum !== undefined) setMinNum(data.minNum);
      if (data.maxNum !== undefined) setMaxNum(data.maxNum);
      if (data.itemImage !== undefined) setItemImage(data.itemImage);
      if (data.entries) setEntries(data.entries);

      if (data.winner && !isModalOpenRef.current) {
        triggerRoulette(data.entries, data.winner);
      } 
      else if (!data.winner && Object.keys(data.entries || {}).length === 0) {
        setShowModal(false);
        setWinner(null);
      }
    });

    return () => socket.disconnect();
  }, [id]);

  // --- LÓGICA DA ROLETA CS:GO ---
  const triggerRoulette = (currentEntries, chosenWinner) => {
    const takenKeys = Object.keys(currentEntries);
    const participants = takenKeys.map(num => ({ num: parseInt(num, 10), user: currentEntries[num] }));
    
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
      
      // CÁLCULO ATUALIZADO AQUI (141px largura total + 70px centro)
      const offsetCalc = `calc(50% - ${stopIndex * 141 + 70}px)`;
      setTrackOffset(offsetCalc);
    }, 50);

    setTimeout(() => {
      setShowResult(true);
    }, 4200);
  };

  // --- VARIÁVEIS DA TELA ---
  const minParsed = parseInt(minNum, 10) || 1;
  const maxParsed = parseInt(maxNum, 10) || 50;
  const totalNumbers = maxParsed - minParsed + 1;
  const takenCount = Object.keys(entries).length;
  const freeCount = totalNumbers - takenCount;
  const gridArray = Array.from({ length: totalNumbers > 0 ? totalNumbers : 0 }, (_, i) => minParsed + i);

  return (
    <>
      <header style={{ justifyContent: 'center' }}>
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="var(--tertiary)">
            <path d="M4.3 3L3 6.6v14h5V23h3.1l2.5-2.5h3.8l5-5V3H4.3zm15.3 13l-3.1 3h-4.6L9.4 21.5V19H5.5V5h14.1v11z" />
            <path d="M15.5 8h1.8v5h-1.8zm-4.7 0h1.8v5h-1.8z" />
          </svg>
          <span className="logo-text">ACOMPANHANDO SORTEIO AO VIVO</span>
        </div>
      </header>

      <main style={{ gridTemplateColumns: '1fr', maxWidth: '900px', margin: '0 auto', paddingTop: '20px' }}>
        
        <div className="panel panel-grid">
          <div className="panel-header">
            🎯 Números do Sorteio
            <span className="badge">{takenCount} escolhidos</span>
          </div>
          <div className="grid-body">

            {itemImage && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e0e0e0' }}>
                <div style={{ color: 'var(--paragraph)', fontSize: '12px', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Prêmio em Jogo</div>
                <img 
                  src={itemImage} 
                  alt="Prêmio do Sorteio" 
                  style={{ width: '150px', height: '150px', objectFit: 'contain' }} 
                  onError={(e) => e.target.style.display = 'none'}
                />
              </div>
            )}

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
                  <div key={num} className={cellClass}>
                    <div className="num-value">{num}</div>
                    <div className="num-user">{isTaken ? `@${entries[num]}` : 'livre'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* MODAL VENCEDOR CS:GO - Somente Leitura */}
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
              
              <button className="btn btn-primary" onClick={() => setShowModal(false)} style={{ width: 'auto', padding: '12px 30px', margin: '0 auto' }}>
                FECHAR
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}