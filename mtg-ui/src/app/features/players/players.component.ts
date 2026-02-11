import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player, PlayerService } from '../../services/player.service';
import { MatchRecord, MatchService } from '../../services/match.service';

type FormatFilter = 'all' | 'casual' | 'cedh';

@Component({
  selector: 'app-players',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './players.component.html',
  styleUrls: ['./players.component.scss']
})
export class PlayersComponent implements OnInit {
  title = 'Players';

  private playerService = inject(PlayerService);
  private matchService = inject(MatchService);

  players = signal<Player[]>([]);
  matches = signal<MatchRecord[]>([]);
  readonly formatOptions: FormatFilter[] = ['all', 'casual', 'cedh'];
  formatFilter = signal<FormatFilter>('all');
  isLoadingPlayers = signal(false);
  playerErrorMessage = signal<string | null>(null);
  showAddForm = signal(false);
  newPlayerName = signal('');
  isCreatingPlayer = signal(false);
  createPlayerErrorMessage = signal<string | null>(null);
  createPlayerSuccessMessage = signal<string | null>(null);
  showDeleteSelect = signal(false);
  selectedDeleteKey = signal('');
  deletingPlayerId = signal<number | null>(null);

  filteredPlayers = computed(() =>
    [...this.players()].sort(
      (a, b) => this.getWinPercentageValue(b) - this.getWinPercentageValue(a)
    )
  );

  favoriteDeckByKey = computed(() => this.buildFavoriteDeckMap(this.matches()));

  ngOnInit(): void {
    this.loadPlayers();
    this.loadMatches();
  }

  loadPlayers(): void {
    this.isLoadingPlayers.set(true);
    this.playerErrorMessage.set(null);

    this.playerService.getAll().subscribe({
      next: (data) => {
        this.players.set(data ?? []);
        this.isLoadingPlayers.set(false);
      },
      error: () => {
        this.isLoadingPlayers.set(false);
        this.playerErrorMessage.set('Failed to load players. Check the API.');
      }
    });
  }

  loadMatches(): void {
    this.matchService.getAll().subscribe({
      next: (data) => {
        this.matches.set(data ?? []);
      },
      error: () => {
        this.matches.set([]);
      }
    });
  }

  toggleAddPlayer(): void {
    this.showAddForm.set(!this.showAddForm());
    this.createPlayerErrorMessage.set(null);
    this.createPlayerSuccessMessage.set(null);
  }

  submitPlayer(): void {
    const name = this.newPlayerName().trim();
    if (!name) {
      this.createPlayerErrorMessage.set('Player name is required.');
      return;
    }

    this.createPlayerErrorMessage.set(null);
    this.createPlayerSuccessMessage.set(null);
    this.isCreatingPlayer.set(true);

    const payload: Player = {
      playerName: name,
      wins: 0,
      losses: 0,
      ties: 0,
      casualWins: 0,
      casualLosses: 0
    };

    this.playerService.create(payload).subscribe({
      next: (created) => {
        this.players.set([created, ...this.players()]);
        this.isCreatingPlayer.set(false);
        this.createPlayerSuccessMessage.set('Player created.');
        this.resetPlayerForm();
        this.showAddForm.set(false);
      },
      error: () => {
        this.isCreatingPlayer.set(false);
        this.createPlayerErrorMessage.set('Failed to create player. Check the API.');
      }
    });
  }

  handleDeleteClick(): void {
    if (!this.showDeleteSelect()) {
      this.showDeleteSelect.set(true);
      return;
    }

    this.deleteSelectedPlayer();
  }

  deleteSelectedPlayer(): void {
    const selectedKey = this.selectedDeleteKey().trim();
    if (!selectedKey) {
      this.playerErrorMessage.set('Select a player to delete.');
      return;
    }

    const player = this.players().find((item) => String(this.getPlayerDeleteKey(item)) === selectedKey);
    if (!player) {
      this.playerErrorMessage.set('Unable to delete player: selection not found.');
      return;
    }

    const deleteKey = this.getPlayerDeleteKey(player);
    if (deleteKey === undefined) {
      this.playerErrorMessage.set('Unable to delete player: missing player id or name.');
      return;
    }

    const playerName = this.getPlayerName(player);
    if (!window.confirm(`Delete "${playerName}"? This cannot be undone.`)) {
      return;
    }

    this.playerErrorMessage.set(null);
    this.deletingPlayerId.set(typeof deleteKey === 'number' ? deleteKey : null);

    this.playerService.delete(deleteKey).subscribe({
      next: () => {
        this.players.set(this.players().filter((item) => String(this.getPlayerDeleteKey(item)) !== selectedKey));
        this.deletingPlayerId.set(null);
        this.selectedDeleteKey.set('');
        this.showDeleteSelect.set(false);
      },
      error: () => {
        this.deletingPlayerId.set(null);
        this.playerErrorMessage.set('Failed to delete player. Check the API.');
      }
    });
  }

  getPlayerName(player: Player): string {
    const record = player as Record<string, unknown>;
    const candidate =
      record['name'] ??
      record['playerName'] ??
      record['username'] ??
      record['displayName'] ??
      record['id'];
    return candidate ? String(candidate) : 'Unknown Player';
  }

  getWins(player: Player): number {
    return this.coerceNumber(player, ['wins', 'winCount', 'totalWins', 'win_total']);
  }

  getLosses(player: Player): number {
    return this.coerceNumber(player, ['losses', 'lossCount', 'totalLosses', 'loss_total']);
  }

  getWinPercentage(player: Player): string {
    return `${this.getWinPercentageValue(player).toFixed(1)}%`;
  }

  getFavoriteDeck(player: Player): string {
    const idKey = this.getPlayerIdKey(player);
    const nameKey = this.getPlayerNameKey(player);

    if (idKey) {
      const favoriteById = this.favoriteDeckByKey().get(idKey);
      if (favoriteById) {
        return favoriteById;
      }
    }

    if (nameKey) {
      const favoriteByName = this.favoriteDeckByKey().get(nameKey);
      if (favoriteByName) {
        return favoriteByName;
      }
    }

    return '—';
  }

  getFormatLabel(format: FormatFilter): string {
    return format === 'cedh' ? 'cEDH' : format.charAt(0).toUpperCase() + format.slice(1);
  }

  getPlayerId(player: Player): number | undefined {
    const record = player as Record<string, unknown>;
    const candidate =
      record['playerID'] ??
      record['playerId'] ??
      record['player_id'] ??
      record['id'];

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim() !== '' && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }

    return undefined;
  }

  getPlayerDeleteKey(player: Player): number | string | undefined {
    const playerId = this.getPlayerId(player);
    if (playerId !== undefined) {
      return playerId;
    }

    const record = player as Record<string, unknown>;
    const nameCandidate =
      record['playerName'] ??
      record['PlayerName'] ??
      record['name'] ??
      record['username'];

    if (typeof nameCandidate === 'string' && nameCandidate.trim() !== '') {
      return nameCandidate.trim();
    }

    return undefined;
  }

  getPlayerDeleteKeyString(player: Player): string {
    const key = this.getPlayerDeleteKey(player);
    return key === undefined ? '' : String(key);
  }

  private getFormat(player: Player): 'casual' | 'cedh' | 'unknown' {
    const record = player as Record<string, unknown>;
    const candidate =
      record['format'] ??
      record['gameType'] ??
      record['mode'] ??
      record['type'] ??
      record['playStyle'];

    if (typeof candidate !== 'string') {
      return 'unknown';
    }

    const normalized = candidate.toLowerCase();
    if (normalized.includes('cedh')) {
      return 'cedh';
    }

    if (normalized.includes('casual')) {
      return 'casual';
    }

    return 'unknown';
  }

  private buildFavoriteDeckMap(matches: MatchRecord[]): Map<string, string> {
    const counts = new Map<string, Map<string, number>>();

    const bump = (playerKey: string, deckName: string | undefined) => {
      if (!deckName) {
        return;
      }
      const deckKey = deckName.trim();
      if (!deckKey) {
        return;
      }
      const deckMap = counts.get(playerKey) ?? new Map<string, number>();
      deckMap.set(deckKey, (deckMap.get(deckKey) ?? 0) + 1);
      counts.set(playerKey, deckMap);
    };

    matches.forEach((match) => {
      if (match.playerID !== undefined) {
        bump(`id:${match.playerID}`, match.deckName);
      }

      const record = match as Record<string, unknown>;
      const opponentPairs = [
        { name: record['opponentOne'], deck: record['opponentOneDeck'] },
        { name: record['opponentTwo'], deck: record['opponentTwoDeck'] },
        { name: record['opponentThree'], deck: record['opponentThreeDeck'] }
      ];

      opponentPairs.forEach((pair) => {
        if (pair.name) {
          bump(`name:${String(pair.name)}`, pair.deck ? String(pair.deck) : undefined);
        }
      });
    });

    const favorites = new Map<string, string>();
    counts.forEach((deckMap, playerKey) => {
      let bestDeck = '';
      let bestCount = -1;
      deckMap.forEach((count, deckName) => {
        if (count > bestCount) {
          bestCount = count;
          bestDeck = deckName;
        }
      });
      if (bestDeck) {
        favorites.set(playerKey, bestDeck);
      }
    });

    return favorites;
  }

  private getPlayerIdKey(player: Player): string | null {
    const record = player as Record<string, unknown>;
    const candidateId = record['playerID'] ?? record['playerId'] ?? record['id'];
    if (typeof candidateId === 'number' && Number.isFinite(candidateId)) {
      return `id:${candidateId}`;
    }

    if (typeof candidateId === 'string' && candidateId.trim() !== '' && !Number.isNaN(Number(candidateId))) {
      return `id:${Number(candidateId)}`;
    }

    return null;
  }

  private getPlayerNameKey(player: Player): string | null {
    const record = player as Record<string, unknown>;
    const name = record['playerName'] ?? record['PlayerName'] ?? record['name'] ?? record['username'];
    if (typeof name === 'string' && name.trim() !== '') {
      return `name:${name.trim()}`;
    }

    return null;
  }

  private coerceNumber(player: Player, keys: string[]): number {
    const record = player as Record<string, unknown>;
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

  private getWinPercentageValue(player: Player): number {
    const record = player as Record<string, unknown>;
    const direct = record['winPercentage'] ?? record['winPct'] ?? record['win_percent'];
    if (typeof direct === 'number' && Number.isFinite(direct)) {
      return direct;
    }

    const wins = this.getWins(player);
    const losses = this.getLosses(player);
    const total = wins + losses;
    if (!total) {
      return 0;
    }

    return (wins / total) * 100;
  }

  private resetPlayerForm(): void {
    this.newPlayerName.set('');
  }

}
