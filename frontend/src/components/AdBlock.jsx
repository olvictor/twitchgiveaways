import React, { useEffect } from 'react';

export default function AdBlock({ client = "ca-pub-SEU_CODIGO_AQUI", slot = "1234567890" }) {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("Erro ao carregar AdSense:", e);
    }
  }, []);

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      minHeight: '600px', 
      backgroundColor: 'var(--secondary)', 
      border: '1px solid #e0e0e0', 
      borderRadius: '12px', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      flexDirection: 'column',
      overflow: 'hidden',
      display: 'none'
    }}>
      <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
        Publicidade
      </span>
      
      {/* Container oficial do Google AdSense */}
      <ins className="adsbygoogle"
           style={{ display: 'block', width: '100%', height: '100%' }}
           data-ad-client={client}
           data-ad-slot={slot}
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  );
}