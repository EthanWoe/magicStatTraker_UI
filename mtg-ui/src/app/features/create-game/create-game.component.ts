import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player, PlayerService } from '../../services/player.service';
import { Deck, DeckService } from '../../services/deck.service';
import { MatchRecord, MatchService } from '../../services/match.service';
import { forkJoin, Observable, of, switchMap } from 'rxjs';

type ResultType = 'win' | 'loss' | 'tie' | '';
type GameFormat = 'casual' | 'cedh';

interface GameSlot {
  playerIndex: number | null;
  deckIndex: number | null;
  result: ResultType;
}

@Component({
  selector: 'app-create-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './create-game.component.html',
  styleUrls: ['./create-game.component.scss']
})
export class CreateGameComponent implements OnInit {
  title = 'Create Game';

  private playerService = inject(PlayerService);
  private deckService = inject(DeckService);
  private matchService = inject(MatchService);

  players = signal<Player[]>([]);
  decks = signal<Deck[]>([]);
  matches = signal<MatchRecord[]>([]);
  pendingAutoDeckBySlot = signal<Map<number, string>>(new Map());

  isLoadingPlayers = signal(false);
  isLoadingDecks = signal(false);
  playerErrorMessage = signal<string | null>(null);
  deckErrorMessage = signal<string | null>(null);
  submitErrorMessage = signal<string | null>(null);
  submitSuccessMessage = signal<string | null>(null);
  isSubmitting = signal(false);

  slots = signal<GameSlot[]>(this.buildEmptySlots());

  gameFormat = signal<GameFormat>('cedh');

  duplicatePlayers = computed(() => {
    const selected = this.slots()
      .map((slot) => slot.playerIndex)
      .filter((value): value is number => value !== null);
    return new Set(selected).size !== selected.length;
  });

  isComplete = computed(() =>
    this.slots().every((slot) => slot.playerIndex !== null && slot.deckIndex !== null && slot.result !== '')
  );

  canCreate = computed(() => this.isComplete() && !this.duplicatePlayers());
  favoriteDeckMaps = computed(() => this.buildFavoriteDeckMaps(this.matches()));

  ngOnInit(): void {
    this.loadPlayers();
    this.loadDecks();
    this.loadMatches();
  }

  loadPlayers(): void {
    this.isLoadingPlayers.set(true);
    this.playerErrorMessage.set(null);

    this.playerService.getAll().subscribe({
      next: (data) => {
        this.players.set(data ?? []);
        this.isLoadingPlayers.set(false);
        this.applyPendingAutoDecks();
      },
      error: () => {
        this.isLoadingPlayers.set(false);
        this.playerErrorMessage.set('Failed to load players. Check the API.');
      }
    });
  }

  loadDecks(): void {
    this.isLoadingDecks.set(true);
    this.deckErrorMessage.set(null);

    this.deckService.getAll().subscribe({
      next: (data) => {
        this.decks.set(data ?? []);
        this.isLoadingDecks.set(false);
        this.applyPendingAutoDecks();
      },
      error: () => {
        this.isLoadingDecks.set(false);
        this.deckErrorMessage.set('Failed to load decks. Check the API.');
      }
    });
  }

  loadMatches(): void {
    this.matchService.getAll().subscribe({
      next: (data) => {
        this.matches.set(data ?? []);
        this.applyPendingAutoDecks();
      },
      error: () => {
        this.matches.set([]);
      }
    });
  }

  updatePlayer(slotIndex: number, value: string): void {
    const playerIndex = value === '' ? null : Number(value);
    this.updateSlot(slotIndex, { playerIndex });

    if (playerIndex === null) {
      return;
    }

    this.applyAutoDeckForSlot(slotIndex);
  }

  updateDeck(slotIndex: number, value: string): void {
    const deckIndex = value === '' ? null : Number(value);
    this.updateSlot(slotIndex, { deckIndex });
  }

  updateResult(slotIndex: number, value: string): void {
    const result = value as ResultType;
    if (result === 'tie') {
      this.applyResultToAll('tie');
      return;
    }

    if (result === 'win') {
      this.applyWinLoss(slotIndex);
      return;
    }

    this.updateSlot(slotIndex, { result });
  }

  createGame(): void {
    if (this.isSubmitting() || !this.canCreate()) {
      return;
    }

    this.submitErrorMessage.set(null);
    this.submitSuccessMessage.set(null);
    this.isSubmitting.set(true);

    const payload = this.buildMatchPayload();

    this.matchService.create(payload).subscribe({
      next: () => {
        this.updateStatsForMatch().subscribe({
          next: () => {
            this.isSubmitting.set(false);
            this.submitSuccessMessage.set('Game saved and stats updated.');
            this.loadPlayers();
            this.loadDecks();
          },
          error: () => {
            this.isSubmitting.set(false);
            this.submitErrorMessage.set('Match saved, but failed to update stats.');
          }
        });
      },
      error: () => {
        this.isSubmitting.set(false);
        this.submitErrorMessage.set('Failed to save match. Check the API.');
      }
    });
  }

  private applyResultToAll(result: ResultType): void {
    const updated: GameSlot[] = this.slots().map((slot) => ({ ...slot, result }));
    this.slots.set(updated);
  }

  private resetForm(): void {
    this.slots.set(this.buildEmptySlots());
  }

  private buildEmptySlots(): GameSlot[] {
    return [
      { playerIndex: null, deckIndex: null, result: '' },
      { playerIndex: null, deckIndex: null, result: '' },
      { playerIndex: null, deckIndex: null, result: '' },
      { playerIndex: null, deckIndex: null, result: '' }
    ];
  }

  private applyWinLoss(winnerIndex: number): void {
    const updated: GameSlot[] = this.slots().map((slot, index) => ({
      ...slot,
      result: index === winnerIndex ? ('win' as ResultType) : ('loss' as ResultType)
    }));
    this.slots.set(updated);
  }

  private updateSlot(slotIndex: number, patch: Partial<GameSlot>): void {
    const updated = this.slots().map((slot, index) =>
      index === slotIndex ? { ...slot, ...patch } : slot
    );
    this.slots.set(updated);
  }

  private applyAutoDeckForSlot(slotIndex: number): void {
    const slot = this.slots()[slotIndex];
    if (!slot || slot.playerIndex === null) {
      return;
    }

    const player = this.players()[slot.playerIndex];
    const playerId = this.getPlayerId(player);
    const playerName = this.playerLabel(player, '');
    const maps = this.favoriteDeckMaps();
    const favoriteDeckName =
      (playerId !== undefined ? maps.byId.get(playerId) : undefined) ??
      (playerName ? maps.byName.get(playerName.toLowerCase()) : undefined);
    if (!favoriteDeckName) {
      return;
    }

    const favoriteKey = this.normalizeDeckKey(favoriteDeckName);
    const deckIndex = this.decks().findIndex(
      (deck) => this.normalizeDeckKey(this.deckLabel(deck, '')) === favoriteKey
    );
    if (deckIndex >= 0) {
      this.updateSlot(slotIndex, { deckIndex });
      const pending = new Map(this.pendingAutoDeckBySlot());
      pending.delete(slotIndex);
      this.pendingAutoDeckBySlot.set(pending);
      return;
    }

    const pending = new Map(this.pendingAutoDeckBySlot());
    pending.set(slotIndex, favoriteDeckName);
    this.pendingAutoDeckBySlot.set(pending);
  }

  private applyPendingAutoDecks(): void {
    if (this.pendingAutoDeckBySlot().size === 0) {
      return;
    }
    this.pendingAutoDeckBySlot().forEach((_deckName, slotIndex) => {
      this.applyAutoDeckForSlot(slotIndex);
    });
  }

  private buildFavoriteDeckMaps(matches: MatchRecord[]): FavoriteDeckMaps {
    const countsByName = new Map<string, Map<string, number>>();
    const countsById = new Map<number, Map<string, number>>();

    const bumpName = (playerName: string | undefined, deckName: string | undefined) => {
      if (!playerName || !deckName) {
        return;
      }
      const nameKey = playerName.trim().toLowerCase();
      const deckKey = this.normalizeDeckKey(deckName);
      if (!nameKey || !deckKey) {
        return;
      }
      const deckMap = countsByName.get(nameKey) ?? new Map<string, number>();
      deckMap.set(deckKey, (deckMap.get(deckKey) ?? 0) + 1);
      countsByName.set(nameKey, deckMap);
    };

    const bumpId = (playerId: number | undefined, deckName: string | undefined) => {
      if (playerId === undefined || !deckName) {
        return;
      }
      const deckKey = this.normalizeDeckKey(deckName);
      if (!deckKey) {
        return;
      }
      const deckMap = countsById.get(playerId) ?? new Map<string, number>();
      deckMap.set(deckKey, (deckMap.get(deckKey) ?? 0) + 1);
      countsById.set(playerId, deckMap);
    };

    matches.forEach((match) => {
      const record = match as Record<string, unknown>;

      bumpId(match.playerID, match.deckName);
      if (!match.playerID) {
        bumpName(match.winnerName, match.deckName);
      }

      bumpName(record['opponentOne'] as string | undefined, record['opponentOneDeck'] as string | undefined);
      bumpName(record['opponentTwo'] as string | undefined, record['opponentTwoDeck'] as string | undefined);
      bumpName(record['opponentThree'] as string | undefined, record['opponentThreeDeck'] as string | undefined);
    });

    const favoritesByName = new Map<string, string>();
    countsByName.forEach((deckMap, playerKey) => {
      let bestDeck = '';
      let bestCount = -1;
      deckMap.forEach((count, deckName) => {
        if (count > bestCount) {
          bestCount = count;
          bestDeck = deckName;
        }
      });
      if (bestDeck) {
        favoritesByName.set(playerKey, bestDeck);
      }
    });

    const favoritesById = new Map<number, string>();
    countsById.forEach((deckMap, playerKey) => {
      let bestDeck = '';
      let bestCount = -1;
      deckMap.forEach((count, deckName) => {
        if (count > bestCount) {
          bestCount = count;
          bestDeck = deckName;
        }
      });
      if (bestDeck) {
        favoritesById.set(playerKey, bestDeck);
      }
    });

    return { byId: favoritesById, byName: favoritesByName };
  }

  private normalizeDeckKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  playerLabel(player: Player, fallback: string): string {
    const candidate =
      (player as Record<string, unknown>)['name'] ??
      (player as Record<string, unknown>)['playerName'] ??
      (player as Record<string, unknown>)['username'] ??
      (player as Record<string, unknown>)['id'] ??
      fallback;
    return String(candidate);
  }

  deckLabel(deck: Deck, fallback: string): string {
    const candidate =
      (deck as Record<string, unknown>)['name'] ??
      (deck as Record<string, unknown>)['deckName'] ??
      (deck as Record<string, unknown>)['title'] ??
      (deck as Record<string, unknown>)['id'] ??
      fallback;
    return String(candidate);
  }

  createPayload(): unknown {
    return {
      format: this.gameFormat(),
      seats: this.slots().map((slot, index) => ({
        seat: index + 1,
        player: slot.playerIndex !== null ? this.players()[slot.playerIndex] : null,
        deck: slot.deckIndex !== null ? this.decks()[slot.deckIndex] : null,
        result: slot.result
      }))
    };
  }

  private buildMatchPayload(): MatchRecord {
    const slots = this.slots();
    const winnerIndex = slots.findIndex((slot) => slot.result === 'win');
    const tie = slots.every((slot) => slot.result === 'tie');
    const primaryIndex = winnerIndex >= 0 ? winnerIndex : 0;
    const primarySlot = slots[primaryIndex];
    const primaryPlayer = primarySlot?.playerIndex !== null
      ? this.players()[primarySlot.playerIndex]
      : null;
    const primaryDeck = primarySlot?.deckIndex !== null
      ? this.decks()[primarySlot.deckIndex]
      : null;

    const opponents = slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ index }) => index !== primaryIndex)
      .map(({ slot }) => ({
        name: slot.playerIndex !== null
          ? this.playerLabel(this.players()[slot.playerIndex], 'Unknown')
          : 'Unknown',
        deck: slot.deckIndex !== null
          ? this.deckLabel(this.decks()[slot.deckIndex], 'Unknown')
          : 'Unknown'
      }));

    return {
      playerID: this.getPlayerId(primaryPlayer),
      deckName: primaryDeck ? this.deckLabel(primaryDeck, 'Unknown') : 'Unknown',
      winnerName: tie
        ? 'Tie'
        : primaryPlayer
          ? this.playerLabel(primaryPlayer, 'Unknown')
          : 'Unknown',
      format: this.gameFormat() === 'cedh' ? 'CEDH' : 'CASUAL',
      playerWin: !tie && winnerIndex >= 0,
      opponentOne: opponents[0]?.name ?? 'Unknown',
      opponentOneDeck: opponents[0]?.deck ?? 'Unknown',
      opponentTwo: opponents[1]?.name ?? 'Unknown',
      opponentTwoDeck: opponents[1]?.deck ?? 'Unknown',
      opponentThree: opponents[2]?.name ?? 'Unknown',
      opponentThreeDeck: opponents[2]?.deck ?? 'Unknown',
      result: tie ? 'TIE' : 'WIN',
      playedAt: new Date().toISOString()
    } as MatchRecord;
  }

  private getPlayerId(player: Player | null): number | undefined {
    if (!player) {
      return undefined;
    }

    const record = player as Record<string, unknown>;
    const candidate = record['playerID'] ?? record['playerId'] ?? record['id'];
    if (typeof candidate === 'number') {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim() !== '' && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }

    return undefined;
  }

  private updateStatsForMatch(): Observable<unknown> {
    const slots = this.slots();
    const isCasual = this.gameFormat() === 'casual';

    const playerDeltaMap = new Map<number, StatDelta>();
    const deckDeltaMap = new Map<string, StatDelta>();

    slots.forEach((slot) => {
      const delta = this.buildDelta(slot.result, isCasual);
      const deckDelta = this.buildLossDelta(slot.result, isCasual);

      if (slot.playerIndex !== null) {
        const player = this.players()[slot.playerIndex];
        const playerId = this.getPlayerId(player);
        if (playerId !== undefined) {
          const existing = playerDeltaMap.get(playerId);
          playerDeltaMap.set(playerId, existing ? this.mergeDelta(existing, delta) : { ...delta });
        }
      }

      if (slot.deckIndex !== null) {
        const deck = this.decks()[slot.deckIndex];
        const deckName = this.getDeckNameForUpdate(deck);
        if (deckName) {
          const existing = deckDeltaMap.get(deckName);
          deckDeltaMap.set(deckName, existing ? this.mergeDelta(existing, deckDelta) : { ...deckDelta });
        }
      }
    });

    if (playerDeltaMap.size === 0 && deckDeltaMap.size === 0) {
      return of(null);
    }

    return forkJoin([
      this.playerService.getAll(),
      this.deckService.getAll()
    ]).pipe(
      switchMap(([players, decks]) => {
        const playerRequests = Array.from(playerDeltaMap.entries()).map(([playerId, delta]) => {
          const player = (players ?? []).find((item) => this.getPlayerId(item) === playerId);
          if (!player) {
            return of(null);
          }
          const payload = this.buildPlayerUpdatePayload(player, playerId, delta);
          return this.playerService.update(playerId, payload);
        });

        const deckRequests = Array.from(deckDeltaMap.entries()).map(([deckName, delta]) => {
          const deck = (decks ?? []).find((item) => {
            const candidate = this.getDeckNameForUpdate(item);
            return candidate ? candidate.toLowerCase() === deckName.toLowerCase() : false;
          });
          if (!deck) {
            return of(null);
          }
          const payload = this.buildDeckUpdatePayload(deck, deckName, delta);
          return this.deckService.update(deckName, payload);
        });

        if (playerRequests.length === 0 && deckRequests.length === 0) {
          return of(null);
        }

        return forkJoin([...playerRequests, ...deckRequests]);
      })
    );
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

  private buildLossDelta(result: ResultType, isCasual: boolean): StatDelta {
    const delta: StatDelta = { wins: 0, losses: 0, ties: 0, casualWins: 0, casualLosses: 0 };
    if (result === 'loss') {
      delta.losses = 1;
      if (isCasual) {
        delta.casualLosses = 1;
      }
    }
    return delta;
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
      wins: wins + delta.wins,
      losses: losses + delta.losses,
      ties: ties + delta.ties,
      casualWins: casualWins + delta.casualWins,
      casualLosses: casualLosses + delta.casualLosses
    } as Player;
  }

  private buildDeckUpdatePayload(deck: Deck, deckName: string, delta: StatDelta): Deck {
    const record = deck as Record<string, unknown>;
    const ownerId =
      record['playerID'] ?? record['PlayerID'] ?? record['playerId'] ?? record['ownerId'] ?? 0;

    const wins = this.coerceNumber(record, ['wins', 'Wins', 'winCount', 'totalWins', 'win_total']);
    const losses = this.coerceNumber(record, ['losses', 'Losses', 'lossCount', 'totalLosses', 'loss_total']);
    const ties = this.coerceNumber(record, ['ties', 'Ties', 'tieCount', 'totalTies']);
    const casualWins = this.coerceNumber(record, ['casualWins', 'CasualWins']);
    const casualLosses = this.coerceNumber(record, ['casualLosses', 'CasualLosses']);

    return {
      deckName,
      playerID: typeof ownerId === 'number' ? ownerId : Number(ownerId) || 0,
      wins: wins + delta.wins,
      losses: losses + delta.losses,
      ties: ties + delta.ties,
      casualWins: casualWins + delta.casualWins,
      casualLosses: casualLosses + delta.casualLosses
    } as Deck;
  }

  private getDeckNameForUpdate(deck: Deck): string | null {
    const record = deck as Record<string, unknown>;
    const candidate =
      record['DeckName'] ?? record['deckName'] ?? record['name'] ?? record['title'];
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

interface StatDelta {
  wins: number;
  losses: number;
  ties: number;
  casualWins: number;
  casualLosses: number;
}

interface FavoriteDeckMaps {
  byId: Map<number, string>;
  byName: Map<string, string>;
}
