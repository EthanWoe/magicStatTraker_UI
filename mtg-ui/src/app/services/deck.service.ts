import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type Deck = Record<string, unknown>;

@Injectable({
  providedIn: 'root'
})
export class DeckService {
  private http = inject(HttpClient);
  private readonly baseUrl = '/api';

  getAll(): Observable<Deck[]> {
    return this.http.get<Deck[]>(`${this.baseUrl}/deck`, {
      headers: { 'Accept': 'application/json' }
    });
  }

  getById(deckID: number): Observable<Deck> {
    return this.http.get<Deck>(`${this.baseUrl}/deck/${deckID}`, {
      headers: { 'Accept': 'application/json' }
    });
  }

  create(payload: Deck): Observable<Deck> {
    return this.http.post<Deck>(`${this.baseUrl}/deck`, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  update(deckID: number | string, payload: Deck): Observable<Deck> {
    const deckKey = encodeURIComponent(String(deckID));
    return this.http.put<Deck>(`${this.baseUrl}/deck/${deckKey}`, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  delete(deckID: number | string): Observable<void> {
    const deckKey = encodeURIComponent(String(deckID));
    return this.http.delete<void>(`${this.baseUrl}/deck/${deckKey}`, {
      headers: { 'Accept': 'application/json' }
    });
  }
}
