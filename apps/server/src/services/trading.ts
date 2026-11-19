/** Demo trading accounts and the trade journal (the evidence that you trade a plan). */
import type { Db } from '../db/database.js';
import { HttpError } from './game.js';

export interface TradeIn {
  accountId: number;
  symbol: string;
  side: 'buy' | 'sell';
  lots: number;
  entry: number;
  sl?: number | null;
  tp?: number | null;
  riskPercent?: number | null;
  mode?: 'replay' | 'live';
  setup?: string;
  emotion?: string;
  notes?: string;
  openedAt: string;
}

export class Trading {
  constructor(private db: Db) {}

  private ownAccount(pid: number, accountId: number) {
    const a = this.db.get<{ id: number; balance: number }>('SELECT id, balance FROM trading_accounts WHERE id = ? AND player_id = ?', [accountId, pid]);
    if (!a) throw new HttpError(404, 'Account not found');
    return a;
  }

  accounts(pid: number) {
    return this.db.all('SELECT * FROM trading_accounts WHERE player_id = ? ORDER BY id', [pid]);
  }

  resetAccount(pid: number, accountId: number) {
    this.ownAccount(pid, accountId);
    this.db.tx(() => {
      this.db.run('DELETE FROM trades WHERE account_id = ?', [accountId]);
      this.db.run('UPDATE trading_accounts SET balance = start_balance WHERE id = ?', [accountId]);
    });
  }

  trades(pid: number, accountId: number) {
    this.ownAccount(pid, accountId);
    return this.db.all('SELECT * FROM trades WHERE account_id = ? ORDER BY opened_at DESC, id DESC LIMIT 500', [accountId]);
  }

  open(pid: number, t: TradeIn) {
    this.ownAccount(pid, t.accountId);
    const { lastId } = this.db.run(
      `INSERT INTO trades (account_id, symbol, side, lots, entry, sl, tp, status, risk_percent, mode, setup, emotion, notes, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
      [t.accountId, t.symbol, t.side, t.lots, t.entry, t.sl ?? null, t.tp ?? null, t.riskPercent ?? null, t.mode ?? 'replay', t.setup ?? null, t.emotion ?? null, t.notes ?? null, t.openedAt],
    );
    return this.db.get('SELECT * FROM trades WHERE id = ?', [lastId]);
  }

  close(pid: number, tradeId: number, exit: number, pnl: number, reason: 'tp' | 'sl' | 'manual' | 'stopout', closedAt: string) {
    const tr = this.db.get<{ account_id: number; status: string }>('SELECT t.account_id, t.status FROM trades t JOIN trading_accounts a ON a.id = t.account_id WHERE t.id = ? AND a.player_id = ?', [tradeId, pid]);
    if (!tr) throw new HttpError(404, 'Trade not found');
    if (tr.status === 'closed') throw new HttpError(409, 'Trade already closed');
    return this.db.tx(() => {
      this.db.run("UPDATE trades SET status = 'closed', exit_price = ?, pnl = ?, close_reason = ?, closed_at = ? WHERE id = ?", [exit, pnl, reason, closedAt, tradeId]);
      this.db.run('UPDATE trading_accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?', [pnl, tr.account_id]);
      return this.db.get('SELECT * FROM trades WHERE id = ?', [tradeId]);
    });
  }

  journal(pid: number, tradeId: number, patch: { setup?: string; emotion?: string; notes?: string }) {
    const tr = this.db.get('SELECT t.id FROM trades t JOIN trading_accounts a ON a.id = t.account_id WHERE t.id = ? AND a.player_id = ?', [tradeId, pid]);
    if (!tr) throw new HttpError(404, 'Trade not found');
    this.db.run('UPDATE trades SET setup = COALESCE(?, setup), emotion = COALESCE(?, emotion), notes = COALESCE(?, notes) WHERE id = ?', [patch.setup ?? null, patch.emotion ?? null, patch.notes ?? null, tradeId]);
  }

  stats(pid: number, accountId: number) {
    this.ownAccount(pid, accountId);
    return this.db.get(
      `SELECT COUNT(*) AS trades,
              SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
              ROUND(SUM(pnl), 2) AS net,
              ROUND(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END), 2) AS gross_win,
              ROUND(-SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END), 2) AS gross_loss,
              SUM(CASE WHEN sl IS NOT NULL AND COALESCE(risk_percent, 100) <= 2.05 THEN 1 ELSE 0 END) AS disciplined
       FROM trades WHERE account_id = ? AND status = 'closed'`,
      [accountId],
    );
  }
}
