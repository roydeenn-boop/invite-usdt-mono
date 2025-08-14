
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function Home(){
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [status, setStatus] = useState('');
  const [txid, setTxid] = useState('');
  const [amount, setAmount] = useState('');
  const [addr, setAddr] = useState('');
  const [data, setData] = useState(null);

  const call = async (path, method='GET', body) => {
    const res = await fetch(API+path, { method, headers: { 'Content-Type': 'application/json', ...(token?{Authorization:'Bearer '+token}:{}) }, body: body?JSON.stringify(body):undefined });
    const json = await res.json(); if (!res.ok) throw new Error(json.error||'error'); return json;
  }

  return <div style={{maxWidth:720, margin:'40px auto', fontFamily:'sans-serif'}}>
    <h1>MVP: Invite-only + USDT TRC20</h1>

    {!token && <div style={{display:'grid', gap:8, padding:12, border:'1px solid #ddd', borderRadius:12}}>
      <h3>Регистрация по приглашению</h3>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <input placeholder="invite code (e.g. TEST-INVITE-123)" value={invite} onChange={e=>setInvite(e.target.value)} />
      <button onClick={async ()=>{ try{ const r=await call('/auth/register','POST',{email,password,invite}); setToken(r.token); setStatus('ok'); }catch(e){ setStatus(e.message) } }}>Зарегистрироваться</button>
      <h3>Вход</h3>
      <button onClick={async ()=>{ try{ const r=await call('/auth/login','POST',{email,password}); setToken(r.token); setStatus('ok'); }catch(e){ setStatus(e.message) } }}>Войти</button>
      <div>{status}</div>
    </div>}

    {token && <div style={{display:'grid', gap:8, padding:12, border:'1px solid #ddd', borderRadius:12, marginTop:16}}>
      <h3>Кабинет</h3>
      <button onClick={async ()=>{ const r = await call('/me'); setData(r.user) }}>Мой профиль</button>
      <div><pre>{JSON.stringify(data,null,2)}</pre></div>
      <h4>Пополнение (USDT TRC20): отправь на горячий кошелек, затем укажи txid</h4>
      <input placeholder="txid" value={txid} onChange={e=>setTxid(e.target.value)} />
      <input placeholder="amount (USDT)" value={amount} onChange={e=>setAmount(e.target.value)} />
      <button onClick={async ()=>{ try{ const r=await call('/deposit','POST',{txid,amount:Number(amount)}); setStatus('deposit saved'); }catch(e){ setStatus(e.message) } }}>Отправить на проверку</button>

      <h4>Заявка на вывод</h4>
      <input placeholder="TRON address (T...)" value={addr} onChange={e=>setAddr(e.target.value)} />
      <input placeholder="amount (USDT)" value={amount} onChange={e=>setAmount(e.target.value)} />
      <button onClick={async ()=>{ try{ const r=await call('/withdraw','POST',{toAddress:addr,amount:Number(amount)}); setStatus('withdrawal requested'); }catch(e){ setStatus(e.message) } }}>Создать заявку</button>

      <button onClick={()=>{ setToken(''); setData(null)}}>Выйти</button>
      <div>{status}</div>
    </div>}

    <div style={{marginTop:24, fontSize:12, opacity:.7}}>Админка и крон описаны в README. Это демонстрация MVP.</div>
  </div>
}
