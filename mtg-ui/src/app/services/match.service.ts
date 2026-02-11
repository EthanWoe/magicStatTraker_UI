import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MatchRecord {
  matchID?: number;
  matchId?: number;
  id?: number;
  playerID?: number;
  deckName?: string;
  winnerName?: string;
  format?: string;
  playerWin?: boolean;
  opponentOne?: string;
  opponentOneDeck?: string;
  opponentTwo?: string;
  opponentTwoDeck?: string;
  opponentThree?: string;
  opponentThreeDeck?: string;
  result?: string;
  playedAt?: string;
  seats?: Array<Record<string, unknown>>;
}

@Injectable({
  providedIn: 'root'
})
export class MatchService {
  private http = inject(HttpClient);
  private readonly baseUrl = '/api/match';

  getAll(): Observable<MatchRecord[]> {
    return this.http.get<MatchRecord[]>(this.baseUrl, {
      headers: { 'Accept': 'application/json' }
    });
  }

  create(payload: MatchRecord): Observable<MatchRecord> {
    return this.http.post<MatchRecord>(this.baseUrl, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  delete(matchId: number | string): Observable<void> {
    const matchKey = encodeURIComponent(String(matchId));
    return this.http.delete<void>(`${this.baseUrl}/${matchKey}`, {
      headers: { 'Accept': 'application/json' }
    });
  }
}
