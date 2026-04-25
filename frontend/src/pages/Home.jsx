import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [myRaffles, setMyRaffles] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenUrl = params.get('token');

    if (tokenUrl) {
      localStorage.setItem('twitch_token', tokenUrl);
      window.history.replaceState({}, document.title, "/");
    }

    const savedToken = localStorage.getItem('twitch_token');
    
    if (savedToken) {
      try {
        const payloadBase64 = savedToken.split('.')[1];
        const decodedPayload = JSON.parse(atob(payloadBase64));
        setUser(decodedPayload);
        fetchMyRaffles(savedToken);
      } catch (e) {
        localStorage.removeItem('twitch_token');
      }
    }
  }, [location]);

  const fetchMyRaffles = async (token) => {
    try {
      const response = await fetch('http://localhost:3001/api/raffles/user/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMyRaffles(data);
      }
    } catch (error) {
      console.error("Erro ao carregar sorteios:", error);
    }
  };

  const loginComTwitch = () => {
    window.location.href = 'http://localhost:3001/api/auth/twitch';
  };

  const logout = () => {
    localStorage.removeItem('twitch_token');
    setUser(null);
    setMyRaffles([]);
  };

  const criarSorteio = async () => {
    const token = localStorage.getItem('twitch_token');
    if (!token) return alert("Você precisa estar logado!");

    try {
      const novoId = uuidv4();
      
      const response = await fetch('http://localhost:3001/api/raffles', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ id: novoId }),
      });

      if (!response.ok) {
        alert("O servidor backend recusou a criação!");
        return; 
      }

      navigate(`/admin/${novoId}`);
    } catch (error) {
      alert("Erro! Backend offline.");
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '40px 20px' }}>
      
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: '64px', letterSpacing: '2px', color: 'var(--headline)' }}>
          TWITCH SORTEIOS
        </h1>
        <p style={{ fontWeight: '500', color: 'var(--paragraph)', marginTop: '10px', fontSize: '16px' }}>Gerencie seus sorteios interativos</p>
      </div>
      
      {!user ? (
        <button className="btn btn-primary" onClick={loginComTwitch} style={{ width: '300px', padding: '16px', fontSize: '15px' }}>
          <svg style={{ width: '22px' }} viewBox="0 0 24 24" fill="#fff">
            <path d="M4.3 3L3 6.6v14h5V23h3.1l2.5-2.5h3.8l5-5V3H4.3zm15.3 13l-3.1 3h-4.6L9.4 21.5V19H5.5V5h14.1v11z" />
            <path d="M15.5 8h1.8v5h-1.8zm-4.7 0h1.8v5h-1.8z" />
          </svg>
          LOGAR COM A TWITCH
        </button>
      ) : (
        <div style={{ width: '100%', maxWidth: '650px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          <div className="panel" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '25px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <img src={user.profile_image} alt="Avatar" style={{ width: '55px', borderRadius: '50%', border: '2px solid #e0e0e0' }} />
              <div>
                <div style={{ fontSize: '13px', color: 'var(--paragraph)', fontWeight: '500' }}>Bem-vindo de volta,</div>
                <div style={{ fontWeight: '700', fontSize: '19px', color: 'var(--headline)' }}>{user.display_name}</div>
                <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--paragraph)', cursor: 'pointer', fontSize: '12px', padding: 0, textDecoration: 'underline', marginTop: '6px', fontWeight: '500' }}>
                  Sair (Logout)
                </button>
              </div>
            </div>

            <button className="btn btn-primary" onClick={criarSorteio} style={{ width: 'auto', padding: '14px 28px' }}>
              ➕ NOVO SORTEIO
            </button>
          </div>

          <div className="panel">
            <div className="panel-header">
              📊 Seus Sorteios
              <span className="badge">{myRaffles.length} criados</span>
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '25px' }}>
              {myRaffles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--paragraph)', fontWeight: '600' }}>
                  Você ainda não criou nenhum sorteio.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {myRaffles.map((raffle) => {
                    const isFinished = raffle.winner != null;
                    const dataCriacao = new Date(raffle.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

                    return (
                      <div key={raffle.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px', backgroundColor: 'var(--secondary)', borderRadius: '10px', border: '1px solid #e0e0e0' }}>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                          {raffle.item_image ? (
                            <img src={raffle.item_image} alt="Prêmio" style={{ width: '42px', height: '42px', objectFit: 'contain', border: '1px solid #e0e0e0', borderRadius: '6px' }} onError={(e) => e.target.style.display = 'none'} />
                          ) : (
                            <div style={{ width: '42px', height: '42px', border: '1px solid #e0e0e0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', backgroundColor: '#f9fafb' }}>🎁</div>
                          )}
                          
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--headline)', fontSize: '15px', marginBottom: '4px' }}>
                              {raffle.title || 'Novo Sorteio'}
                            </div>
                            
                            <div style={{ fontSize: '12px', color: 'var(--paragraph)', marginBottom: isFinished ? '4px' : '0' }}>
                              Criado em: {dataCriacao}
                            </div>
                            
                            {/* ATUALIZADO: Cor verde moderna para combinar com o design suave */}
                            {isFinished && raffle.winner && (
                              <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '700' }}>
                                👑 Vencedor: @{raffle.winner.user} (Nº {raffle.winner.num})
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          {isFinished ? (
                            <span style={{ backgroundColor: '#fecdd3', color: '#be123c', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
                              ENCERRADO
                            </span>
                          ) : (
                            <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
                              ATIVO
                            </span>
                          )}

                          <button 
                            className="btn btn-success" 
                            style={{ width: 'auto', padding: '8px 16px', fontSize: '13px' }}
                            onClick={() => navigate(`/admin/${raffle.id}`)}
                          >
                            ACESSAR
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}