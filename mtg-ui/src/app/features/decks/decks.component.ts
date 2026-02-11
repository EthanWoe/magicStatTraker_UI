import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Deck, DeckService } from '../../services/deck.service';

type FormatFilter = 'all' | 'casual' | 'cedh';

@Component({
  selector: 'app-decks',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './decks.component.html',
  styleUrls: ['./decks.component.scss']
})
export class DecksComponent implements OnInit {
  title = 'Decks';

  private deckService = inject(DeckService);

  decks = signal<Deck[]>([]);
  readonly formatOptions: FormatFilter[] = ['all', 'casual', 'cedh'];
  formatFilter = signal<FormatFilter>('all');
  isLoadingDecks = signal(false);
  deckErrorMessage = signal<string | null>(null);
  deletingDeckId = signal<number | null>(null);
  showAddForm = signal(false);
  newDeckName = signal('');
  selectedDeleteKey = signal('');
  showDeleteSelect = signal(false);
  isCreatingDeck = signal(false);
  createDeckErrorMessage = signal<string | null>(null);
  createDeckSuccessMessage = signal<string | null>(null);

  filteredDecks = computed(() =>
    [...this.decks()].sort(
      (a, b) => this.getWinPercentageValue(b) - this.getWinPercentageValue(a)
    )
  );

  ngOnInit(): void {
    this.loadDecks();
  }

  loadDecks(): void {
    this.isLoadingDecks.set(true);
    this.deckErrorMessage.set(null);

    this.deckService.getAll().subscribe({
      next: (data) => {
        this.decks.set(data ?? []);
        this.isLoadingDecks.set(false);
      },
      error: () => {
        this.isLoadingDecks.set(false);
        this.deckErrorMessage.set('Failed to load decks. Check the API.');
      }
    });
  }

  toggleAddDeck(): void {
    this.showAddForm.set(!this.showAddForm());
    this.createDeckErrorMessage.set(null);
    this.createDeckSuccessMessage.set(null);
  }

  handleDeleteClick(): void {
    if (!this.showDeleteSelect()) {
      this.showDeleteSelect.set(true);
      return;
    }

    this.deleteSelectedDeck();
  }

  deleteSelectedDeck(): void {
    const selectedKey = this.selectedDeleteKey().trim();
    if (!selectedKey) {
      this.deckErrorMessage.set('Select a deck to delete.');
      return;
    }

    const deck = this.decks().find((item) => String(this.getDeckDeleteKey(item)) === selectedKey);
    if (!deck) {
      this.deckErrorMessage.set('Unable to delete deck: selection not found.');
      return;
    }

    const deleteKey = this.getDeckDeleteKey(deck);
    if (deleteKey === undefined) {
      this.deckErrorMessage.set('Unable to delete deck: missing deck id or name.');
      return;
    }

    const deckName = this.getDeckName(deck);
    if (!window.confirm(`Delete "${deckName}"? This cannot be undone.`)) {
      return;
    }

    this.deckErrorMessage.set(null);
    this.deletingDeckId.set(typeof deleteKey === 'number' ? deleteKey : null);

    this.deckService.delete(deleteKey).subscribe({
      next: () => {
        this.decks.set(this.decks().filter((item) => String(this.getDeckDeleteKey(item)) !== selectedKey));
        this.deletingDeckId.set(null);
        this.selectedDeleteKey.set('');
        this.showDeleteSelect.set(false);
      },
      error: () => {
        this.deletingDeckId.set(null);
        this.deckErrorMessage.set('Failed to delete deck. Check the API.');
      }
    });
  }

  submitDeck(): void {
    const name = this.newDeckName().trim();
    if (!name) {
      this.createDeckErrorMessage.set('Deck name is required.');
      return;
    }

    this.createDeckErrorMessage.set(null);
    this.createDeckSuccessMessage.set(null);
    this.isCreatingDeck.set(true);

    const payload: Deck = {
      deckName: name,
      wins: 0,
      losses: 0,
      ties: 0,
      casualWins: 0,
      casualLosses: 0
    };

    this.deckService.create(payload).subscribe({
      next: (created) => {
        this.decks.set([created, ...this.decks()]);
        this.isCreatingDeck.set(false);
        this.createDeckSuccessMessage.set('Deck created.');
        this.resetDeckForm();
        this.showAddForm.set(false);
      },
      error: () => {
        this.isCreatingDeck.set(false);
        this.createDeckErrorMessage.set('Failed to create deck. Check the API.');
      }
    });
  }


  getDeckName(deck: Deck): string {
    const record = deck as Record<string, unknown>;
    const candidate =
      record['name'] ??
      record['deckName'] ??
      record['title'] ??
      record['displayName'] ??
      record['id'];
    return candidate ? String(candidate) : 'Unknown Deck';
  }

  getWins(deck: Deck): number {
    return this.coerceNumber(deck, ['wins', 'winCount', 'totalWins', 'win_total']);
  }

  getLosses(deck: Deck): number {
    return this.coerceNumber(deck, ['losses', 'lossCount', 'totalLosses', 'loss_total']);
  }

  getWinPercentage(deck: Deck): string {
    return `${this.getWinPercentageValue(deck).toFixed(1)}%`;
  }

  getFormatLabel(format: FormatFilter): string {
    return format === 'cedh' ? 'cEDH' : format.charAt(0).toUpperCase() + format.slice(1);
  }

  getDeckId(deck: Deck): number | undefined {
    const record = deck as Record<string, unknown>;
    const candidate =
      record['deckID'] ??
      record['deckId'] ??
      record['deck_id'] ??
      record['id'];

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim() !== '' && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }

    return undefined;
  }

  private resetDeckForm(): void {
    this.newDeckName.set('');
  }

  getDeckDeleteKey(deck: Deck): number | string | undefined {
    const deckId = this.getDeckId(deck);
    if (deckId !== undefined) {
      return deckId;
    }

    const record = deck as Record<string, unknown>;
    const nameCandidate =
      record['deckName'] ??
      record['DeckName'] ??
      record['name'] ??
      record['title'];

    if (typeof nameCandidate === 'string' && nameCandidate.trim() !== '') {
      return nameCandidate.trim();
    }

    return undefined;
  }

  getDeckDeleteKeyString(deck: Deck): string {
    const key = this.getDeckDeleteKey(deck);
    return key === undefined ? '' : String(key);
  }

  private getFormat(deck: Deck): 'casual' | 'cedh' | 'unknown' {
    const record = deck as Record<string, unknown>;
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

  private coerceNumber(deck: Deck, keys: string[]): number {
    const record = deck as Record<string, unknown>;
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

  private getWinPercentageValue(deck: Deck): number {
    const record = deck as Record<string, unknown>;
    const direct = record['winPercentage'] ?? record['winPct'] ?? record['win_percent'];
    if (typeof direct === 'number' && Number.isFinite(direct)) {
      return direct;
    }

    const wins = this.getWins(deck);
    const losses = this.getLosses(deck);
    const total = wins + losses;
    if (!total) {
      return 0;
    }

    return (wins / total) * 100;
  }

}
