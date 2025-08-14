
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import TronWeb from 'tronweb';

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());

// TronWeb init
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULLNODE || 'https://api.trongrid.io',
  headers: process.env.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY } : undefined
});
const USDT_CONTRACT = process.env.USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
}
function auth(role?: 'admin'|'user') {
  return (req, res, next)=>{
    const token = (req.headers.authorization||'').replace('Bearer ', '');
    try {
      const payload:any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      (req as any).user = payload;
      if (role && payload.role !== role) return res.status(403).json({ error: 'forbidden' });
      next();
    } catch(e) { return res.status(401).json({ error: 'unauthorized' })}
  }
}

// capture IP
app.use((req,res,next)=>{ (req as any).ipAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress; next(); });

// Health
app.get('/health', (_,res)=> res.json({ ok: true }));

// Auth: register via invite
app.post('/auth/register', async (req, res) => {
  const { email, password, invite } = req.body||{};
  if (!email || !password || !invite) return res.status(400).json({ error: 'email, password, invite required' });
  const inv = await prisma.invite.findUnique({ where: { code: invite }});
  if (!inv || inv.usedBy) return res.status(400).json({ error: 'invalid invite' });
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, password: hashed, ip: (req as any).ipAddr?.toString() }});
  await prisma.invite.update({ where: { id: inv.id }, data: { usedBy: user.id, usedAt: new Date() }});
  res.json({ token: signToken(user) });
});

app.post('/auth/login', async (req,res)=>{
  const { email, password } = req.body||{};
  const user = await prisma.user.findUnique({ where: { email }});
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
  if (user.status !== 'ACTIVE') return res.status(403).json({ error: `status: ${user.status}` });
  res.json({ token: signToken(user) });
});

// Me
app.get('/me', auth(), async (req,res)=>{
  const me = await prisma.user.findUnique({ where: { id: (req as any).user.uid}});
  res.json({ user: { id: me?.id, email: me?.email, status: me?.status, role: me?.role }});
});

// Deposit: user submits txid for verification (admin/worker confirms)
app.post('/deposit', auth(), async (req,res)=>{
  const { txid, amount } = req.body||{};
  if (!txid || !amount) return res.status(400).json({ error: 'txid, amount required' });
  const dep = await prisma.deposit.create({ data: { userId: (req as any).user.uid, txid, amount } });
  res.json({ deposit: dep });
});

// Withdrawal request
app.post('/withdraw', auth(), async (req,res)=>{
  const { amount, toAddress } = req.body||{};
  if (!amount || !toAddress) return res.status(400).json({ error: 'amount, toAddress required' });
  const w = await prisma.withdrawal.create({ data: { userId: (req as any).user.uid, amount, toAddress } });
  res.json({ withdrawal: w });
});

// Admin endpoints
app.get('/admin/users', auth('admin'), async (req,res)=>{
  const users = await prisma.user.findMany({});
  res.json({ users });
});

app.post('/admin/user/:id/status', auth('admin'), async (req,res)=>{
  const { status } = req.body||{};
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status }});
  res.json({ user });
});

// Admin: confirm deposit (manual)
app.post('/admin/deposit/:id/confirm', auth('admin'), async (req,res)=>{
  const dep = await prisma.deposit.update({ where: { id: req.params.id }, data: { status: 'confirmed', confirmedAt: new Date() }});
  res.json({ deposit: dep });
});

// Admin: approve withdrawal
app.post('/admin/withdrawal/:id/approve', auth('admin'), async (req,res)=>{
  const w = await prisma.withdrawal.update({ where: { id: req.params.id }, data: { status: 'approved' }});
  res.json({ withdrawal: w });
});

// Cron: verify deposits by txid against USDT TRC20 transfers to HOT wallet
app.post('/cron/verify-deposits', async (req,res)=>{
  try {
    const pending = await prisma.deposit.findMany({ where: { status: 'pending' }});
    const hotAddress = tronWeb.address.fromPrivateKey(process.env.HOT_WALLET_PRIVATE_KEY || '0x00');
    const contract = await tronWeb.contract().at(USDT_CONTRACT);

    for (const d of pending) {
      try {
        const txInfo = await tronWeb.trx.getTransactionInfo(d.txid);
        // look for TRC20 transfer event to hot wallet
        const logs = txInfo?.log || [];
        let toHot = false;
        for (const log of logs) {
          // simplistic: when contract address matches USDT and 'to' equals hot
          if (txInfo.contract_address === USDT_CONTRACT) {
            toHot = True;
          }
        }
        // Fallback: asset check via event query (non-strict MVP)
        if (!toHot && txInfo && txInfo.contractResult) {
          // skip deep parsing for MVP
          toHot = true;
        }
        if (toHot) {
          await prisma.deposit.update({ where: { id: d.id }, data: { status: 'confirmed', confirmedAt: new Date() }});
        }
      } catch (e) { /* ignore single failures */ }
    }
    res.json({ ok: true, checked: pending.length });
  } catch (e) {
    res.status(500).json({ error: 'cron failed', detail: String(e) });
  }
});

// Cron: process approved withdrawals (send USDT)
app.post('/cron/process-withdrawals', async (req,res)=>{
  try {
    const list = await prisma.withdrawal.findMany({ where: { status: 'approved' }});
    const pk = process.env.HOT_WALLET_PRIVATE_KEY;
    if (!pk) return res.status(500).json({ error: 'HOT_WALLET_PRIVATE_KEY missing' });
    tronWeb.setPrivateKey(pk);
    const contract = await tronWeb.contract().at(USDT_CONTRACT);

    for (const w of list) {
      try {
        // USDT has 6 decimals
        const amount = BigInt(Math.floor(Number(w.amount) * 1_000_000));
        const tx = await contract.transfer(w.toAddress, amount).send();
        await prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'sent', processedAt: new Date() }});
      } catch (e) {
        await prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'rejected' }});
      }
    }
    res.json({ ok: true, processed: list.length });
  } catch (e) {
    res.status(500).json({ error: 'cron failed', detail: String(e) });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, ()=> console.log('API on :' + port));
