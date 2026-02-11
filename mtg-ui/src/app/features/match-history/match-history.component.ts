import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatchRecord, MatchService } from '../../services/match.service';
import { Player, PlayerService } from '../../services/player.service';
import { Deck, DeckService } from '../../services/deck.service';
import { forkJoin, Observable, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-match-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match-history.component.html',
  styleUrls: ['./match-history.component.scss']
})
export class MatchHistoryComponent implements OnInit {
  title = 'Match History';

  private matchService = inject(MatchService);
  private playerService = inject(PlayerService);
  private deckService = inject(DeckService);

  matches = signal<MatchRecord[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  deletingMatchKey = signal<string | null>(null);

  sortedMatches = computed(() =>
    [...this.matches()].sort((a, b) => this.getMatchTime(b) - this.getMatchTime(a))
  );

  ngOnInit(): void {
    this.loadMatches();
  }

  loadMatches(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.matchService.getAll().subscribe({
      next: (data) => {
        this.matches.set(data ?? []);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to load match history. Check the API.');
      }
    });
  }

  deleteMatch(match: MatchRecord): void {
    const matchKey = this.getMatchKeyString(match);
    if (!matchKey) {
      this.errorMessage.set('Unable to delete match: missing match id.');
      return;
    }

    if (!window.confirm('Delete this match and roll back stats? This cannot be undone.')) {
      return;
    }

    this.errorMessage.set(null);
    this.deletingMatchKey.set(matchKey);

    this.matchService.delete(matchKey).pipe(
      switchMap(() => this.rollbackStats(match))
    ).subscribe({
      next: () => {
        this.matches.set(this.matches().filter((item) => this.getMatchKeyString(item) !== matchKey));
        this.deletingMatchKey.set(null);
      },
      error: () => {
        this.deletingMatchKey.set(null);
        this.errorMessage.set('Failed to delete match or roll back stats.');
      }
    });
  }

  formatDate(value?: string): string {
    if (!value) {
      return '—';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString();
  }

  private getMatchTime(match: MatchRecord): number {
    const value = match.playedAt;
    if (!value) {
      return 0;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  getMatchKeyString(match: MatchRecord): string {
    const candidate =
      (match as Record<string, unknown>)['matchID'] ??
      (match as Record<string, unknown>)['matchId'] ??
      (match as Record<string, unknown>)['id'];

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }

    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }

    return '';
  }

  getMatchSeatRows(match: MatchRecord): Array<{ player: string; deck: string }> {
    const seats = this.getMatchSeats(match);
    if (seats.length > 0) {
      return seats.map((seat) => ({
        player: this.getSeatPlayerLabel(seat),
        deck: this.getSeatDeckLabel(seat)
      }));
    }

    if (match.playerID || match.deckName) {
      return [{
        player: match.playerID ? String(match.playerID) : '—',
        deck: match.deckName ? String(match.deckName) : '—'
      }];
    }

    return [];
  }

  getPrimaryDisplay(match: MatchRecord): { player: string; deck: string } {
    const player = match.playerID ? String(match.playerID) : (match.winnerName ?? '—');
    const deck = match.deckName ? String(match.deckName) : '—';
    return { player, deck };
  }

  getOpponentDisplays(match: MatchRecord): Array<{ player: string; deck: string }> {
    const record = match as Record<string, unknown>;
    const opponents: Array<{ player: string; deck: string }> = [];

    const addOpponent = (nameKey: string, deckKey: string) => {
      const name = record[nameKey];
      if (name) {
        opponents.push({
          player: String(name),
          deck: record[deckKey] ? String(record[deckKey]) : '—'
        });
      }
    };

    addOpponent('opponentOne', 'opponentOneDeck');
    addOpponent('opponentTwo', 'opponentTwoDeck');
    addOpponent('opponentThree', 'opponentThreeDeck');

    return opponents;
  }

  getOpponentDisplay(match: MatchRecord, index: number): { player: string; deck: string } {
    const record = match as Record<string, unknown>;
    const keys = [
      { name: 'opponentOne', deck: 'opponentOneDeck' },
      { name: 'opponentTwo', deck: 'opponentTwoDeck' },
      { name: 'opponentThree', deck: 'opponentThreeDeck' }
    ];
    const selected = keys[index - 1];
    if (!selected) {
      return { player: '—', deck: '—' };
    }

    const player = record[selected.name] ? String(record[selected.name]) : '—';
    const deck = record[selected.deck] ? String(record[selected.deck]) : '—';
    return { player, deck };
  }

  private rollbackStats(match: MatchRecord): Observable<unknown> {
    const seats = this.getMatchSeats(match);
    if (seats.length === 0) {
      return of(null);
    }

    return forkJoin([
      this.playerService.getAll(),
      this.deckService.getAll()
    ]).pipe(
      switchMap(([players, decks]) => {
        const playerMap = new Map<number, StatDelta>();
        const nameMap = new Map<string, StatDelta>();
        const deckMap = new Map<string, StatDelta>();

        seats.forEach((seat) => {
          const result = this.resolveSeatResult(seat, match);
          if (!result) {
            return;
          }

          const format = this.readSeatField(seat, ['format', 'Format']) ?? match.format;
          const isCasual = this.isCasualFormat(format);
          const delta = this.invertDelta(this.buildDelta(result, isCasual));

          const playerId = this.getSeatPlayerId(seat);
          if (playerId !== undefined) {
            const existing = playerMap.get(playerId);
            playerMap.set(playerId, existing ? this.mergeDelta(existing, delta) : { ...delta });
          } else {
            const playerName = this.getSeatPlayerName(seat);
            if (playerName) {
              const key = playerName.toLowerCase();
              const existing = nameMap.get(key);
              nameMap.set(key, existing ? this.mergeDelta(existing, delta) : { ...delta });
            }
          }

          const deckName = this.getSeatDeckName(seat);
          if (deckName) {
            const existing = deckMap.get(deckName);
            deckMap.set(deckName, existing ? this.mergeDelta(existing, delta) : { ...delta });
          }
        });

        const playerRequests = Array.from(playerMap.entries()).map(([playerId, delta]) => {
          const player = this.findPlayerById(players ?? [], playerId);
          if (!player) {
            return of(null);
          }
          const payload = this.buildPlayerUpdatePayload(player, playerId, delta);
          return this.playerService.update(playerId, payload);
        });

        const nameRequests = Array.from(nameMap.entries()).map(([playerName, delta]) => {
          const player = this.findPlayerByName(players ?? [], playerName);
          if (!player) {
            return of(null);
          }
          const playerId = this.getPlayerId(player);
          if (playerId === undefined) {
            return of(null);
          }
          const payload = this.buildPlayerUpdatePayload(player, playerId, delta);
          return this.playerService.update(playerId, payload);
        });

        const deckRequests = Array.from(deckMap.entries()).map(([deckName, delta]) => {
          const deck = this.findDeckByName(decks ?? [], deckName);
          if (!deck) {
            return of(null);
          }
          const payload = this.buildDeckUpdatePayload(deck, deckName, delta);
          return this.deckService.update(deckName, payload);
        });

        if (playerRequests.length === 0 && nameRequests.length === 0 && deckRequests.length === 0) {
          return of(null);
        }

        return forkJoin([...playerRequests, ...nameRequests, ...deckRequests]);
      })
    );
  }

  private getMatchSeats(match: MatchRecord): Array<Record<string, unknown>> {
    const record = match as Record<string, unknown>;
    const seats = record['seats'];
    if (Array.isArray(seats)) {
      return seats as Array<Record<string, unknown>>;
    }

    const synthesized: Array<Record<string, unknown>> = [];
    const normalizedResult = this.normalizeResult(match.result);

    if (match.playerID || match.deckName || match.winnerName) {
      synthesized.push({
        playerID: match.playerID,
        deckName: match.deckName,
        playerName: match.winnerName,
        result: normalizedResult ?? (match.playerWin ? 'win' : 'loss'),
        format: match.format
      });
    }

    const opponentOne = record['opponentOne'];
    const opponentTwo = record['opponentTwo'];
    const opponentThree = record['opponentThree'];

    if (opponentOne) {
      synthesized.push({
        playerName: opponentOne,
        deckName: record['opponentOneDeck'],
        result: this.resolveOpponentResult(String(opponentOne), match),
        format: match.format
      });
    }

    if (opponentTwo) {
      synthesized.push({
        playerName: opponentTwo,
        deckName: record['opponentTwoDeck'],
        result: this.resolveOpponentResult(String(opponentTwo), match),
        format: match.format
      });
    }

    if (opponentThree) {
      synthesized.push({
        playerName: opponentThree,
        deckName: record['opponentThreeDeck'],
        result: this.resolveOpponentResult(String(opponentThree), match),
        format: match.format
      });
    }

    return synthesized;
  }

  private getSeatPlayerId(seat: Record<string, unknown>): number | undefined {
    const candidate =
      seat['playerID'] ??
      seat['playerId'] ??
      seat['player_id'] ??
      seat['id'];

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim() !== '' && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }

    return undefined;
  }

  private getSeatDeckName(seat: Record<string, unknown>): string | null {
    const candidate =
      seat['deckName'] ??
      seat['DeckName'] ??
      seat['name'] ??
      seat['title'];
    return candidate ? String(candidate) : null;
  }

  private getSeatPlayerLabel(seat: Record<string, unknown>): string {
    const candidate = this.readSeatField(seat, ['playerName', 'name', 'username', 'player', 'playerID', 'playerId']);
    return candidate ? String(candidate) : '—';
  }

  private getSeatPlayerName(seat: Record<string, unknown>): string | null {
    const candidate = this.readSeatField(seat, ['playerName', 'name', 'username', 'player']);
    return candidate ? String(candidate) : null;
  }

  private getSeatDeckLabel(seat: Record<string, unknown>): string {
    const candidate = this.readSeatField(seat, ['deckName', 'DeckName', 'deck', 'name', 'title', 'opponentOneDeck', 'opponentTwoDeck', 'opponentThreeDeck']);
    return candidate ? String(candidate) : '—';
  }

  private readSeatField(seat: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = seat[key];
      if (typeof value === 'string' && value.trim() !== '') {
        return value;
      }
    }
    return undefined;
  }

  private readSeatBool(seat: Record<string, unknown>, keys: string[]): boolean | undefined {
    for (const key of keys) {
      const value = seat[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        if (value.toLowerCase() === 'true') {
          return true;
        }
        if (value.toLowerCase() === 'false') {
          return false;
        }
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (value === 1) {
          return true;
        }
        if (value === 0) {
          return false;
        }
      }
    }
    return undefined;
  }

  private normalizeResult(value?: string): ResultType | null {
    if (!value) {
      return null;
    }

    const normalized = value.toLowerCase();
    if (normalized.includes('tie')) {
      return 'tie';
    }

    if (normalized.includes('win')) {
      return 'win';
    }

    if (normalized.includes('loss')) {
      return 'loss';
    }

    return null;
  }

  private resolveSeatResult(seat: Record<string, unknown>, match: MatchRecord): ResultType | null {
    const direct = this.normalizeResult(
      this.readSeatField(seat, ['result', 'Result', 'outcome', 'outcomeType', 'resultType', 'status'])
    );
    if (direct) {
      return direct;
    }

    const tieFlag = this.readSeatBool(seat, ['tie', 'isTie']);
    if (tieFlag) {
      return 'tie';
    }

    const winFlag = this.readSeatBool(seat, ['playerWin', 'isWinner', 'winner', 'won', 'win']);
    if (winFlag !== undefined) {
      return winFlag ? 'win' : 'loss';
    }

    const matchResult = this.normalizeResult(match.result);
    if (matchResult === 'tie') {
      return 'tie';
    }

    const seatPlayerId = this.getSeatPlayerId(seat);
    if (seatPlayerId !== undefined && match.playerID !== undefined) {
      if (seatPlayerId === match.playerID && typeof match.playerWin === 'boolean') {
        return match.playerWin ? 'win' : 'loss';
      }
    }

    const seatName = this.readSeatField(seat, ['playerName', 'name', 'username', 'player']);
    if (seatName && match.winnerName) {
      if (seatName.trim().toLowerCase() === match.winnerName.trim().toLowerCase()) {
        return 'win';
      }
      if (matchResult === 'win') {
        return 'loss';
      }
    }

    return null;
  }

  private resolveOpponentResult(opponentName: string, match: MatchRecord): ResultType | null {
    const matchResult = this.normalizeResult(match.result);
    if (matchResult === 'tie') {
      return 'tie';
    }

    if (match.winnerName && opponentName.trim().toLowerCase() === match.winnerName.trim().toLowerCase()) {
      return 'win';
    }

    if (matchResult === 'win' || matchResult === 'loss') {
      return 'loss';
    }

    return null;
  }

  private isCasualFormat(value?: string): boolean {
    if (!value) {
      return false;
    }
    return value.toLowerCase().includes('casual');
  }

  private buildDelta(result: ResultType, isCasual: boolean): StatDelta {
    const delta: StatDelta = { wins: 0, losses: 0, ties: 0, casualWins: 0, casualLosses: 0 };

    if (result === 'tie') {
      delta.ties = 1;
      return delta;
    }

    if (result === 'win') {
      delta.wins = 1;
      if (isCasual) {
        delta.casualWins = 1;
      }
      return delta;
    }

    if (result === 'loss') {
      delta.losses = 1;
      if (isCasual) {
        delta.casualLosses = 1;
      }
    }

    return delta;
  }

  private invertDelta(delta: StatDelta): StatDelta {
    return {
      wins: -delta.wins,
      losses: -delta.losses,
      ties: -delta.ties,
      casualWins: -delta.casualWins,
      casualLosses: -delta.casualLosses
    };
  }

  private mergeDelta(base: StatDelta, add: StatDelta): StatDelta {
    return {
      wins: base.wins + add.wins,
      losses: base.losses + add.losses,
      ties: base.ties + add.ties,
      casualWins: base.casualWins + add.casualWins,
      casualLosses: base.casualLosses + add.casualLosses
    };
  }

  private findPlayerById(players: Player[], playerId: number): Player | undefined {
    return players.find((player) => this.getPlayerId(player) === playerId);
  }

  private findPlayerByName(players: Player[], playerName: string): Player | undefined {
    const normalized = playerName.toLowerCase();
    return players.find((player) => {
      const record = player as Record<string, unknown>;
      const candidate =
        record['playerName'] ?? record['PlayerName'] ?? record['name'] ?? record['username'];
      return candidate ? String(candidate).toLowerCase() === normalized : false;
    });
  }

  private findDeckByName(decks: Deck[], deckName: string): Deck | undefined {
    const normalized = deckName.toLowerCase();
    return decks.find((deck) => {
      const candidate = this.getDeckNameForUpdate(deck);
      return candidate ? candidate.toLowerCase() === normalized : false;
    });
  }

  private getPlayerId(player: Player): number | undefined {
    const record = player as Record<string, unknown>;
    const candidate = record['playerID'] ?? record['playerId'] ?? record['id'];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim() !== '' && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }

    return undefined;
  }

  private buildPlayerUpdatePayload(player: Player, playerId: number, delta: StatDelta): Player {
    const record = player as Record<string, unknown>;
    const playerName =
      record['playerName'] ?? record['PlayerName'] ?? record['name'] ?? record['username'] ?? 'Unknown';

    const wins = this.coerceNumber(record, ['wins', 'Wins', 'winCount', 'totalWins', 'win_total']);
    const losses = this.coerceNumber(record, ['losses', 'Losses', 'lossCount', 'totalLosses', 'loss_total']);
    const ties = this.coerceNumber(record, ['ties', 'Ties', 'tieCount', 'totalTies']);
    const casualWins = this.coerceNumber(record, ['casualWins', 'CasualWins']);
    const casualLosses = this.coerceNumber(record, ['casualLosses', 'CasualLosses']);

    return {
      playerId,
      playerName: String(playerName),
      wins: Math.max(0, wins + delta.wins),
      losses: Math.max(0, losses + delta.losses),
      ties: Math.max(0, ties + delta.ties),
      casualWins: Math.max(0, casualWins + delta.casualWins),
      casualLosses: Math.max(0, casualLosses + delta.casualLosses)
    } as Player;
  }

  private buildDeckUpdatePayload(deck: Deck, deckName: string, delta: StatDelta): Deck {
    const record = deck as Record<string, unknown>;
    const ownerId = record['playerID'] ?? record['PlayerID'] ?? record['playerId'] ?? record['ownerId'] ?? 0;

    const wins = this.coerceNumber(record, ['wins', 'Wins', 'winCount', 'totalWins', 'win_total']);
    const losses = this.coerceNumber(record, ['losses', 'Losses', 'lossCount', 'totalLosses', 'loss_total']);
    const ties = this.coerceNumber(record, ['ties', 'Ties', 'tieCount', 'totalTies']);
    const casualWins = this.coerceNumber(record, ['casualWins', 'CasualWins']);
    const casualLosses = this.coerceNumber(record, ['casualLosses', 'CasualLosses']);

    return {
      deckName,
      playerID: typeof ownerId === 'number' ? ownerId : Number(ownerId) || 0,
      wins: Math.max(0, wins + delta.wins),
      losses: Math.max(0, losses + delta.losses),
      ties: Math.max(0, ties + delta.ties),
      casualWins: Math.max(0, casualWins + delta.casualWins),
      casualLosses: Math.max(0, casualLosses + delta.casualLosses)
    } as Deck;
  }

  private getDeckNameForUpdate(deck: Deck): string | null {
    const record = deck as Record<string, unknown>;
    const candidate = record['DeckName'] ?? record['deckName'] ?? record['name'] ?? record['title'];
    return candidate ? String(candidate) : null;
  }

  private coerceNumber(record: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return 0;
  }
}

type ResultType = 'win' | 'loss' | 'tie';

interface StatDelta {
  wins: number;
  losses: number;
  ties: number;
  casualWins: number;
  casualLosses: number;
}
